import "server-only";

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

type SecretJson = Record<string, unknown>;

type CachedSecret = {
  value: string;
  expiresAt: number;
};

const defaultCacheTtlMs = 5 * 60 * 1000;

function trimEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

function safeJsonParse(value: string): SecretJson {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SecretJson) : {};
  } catch {
    return {};
  }
}

function isSecretsManagerReference(value: string): boolean {
  return value.startsWith("arn:aws:secretsmanager:") || value.startsWith("secret:");
}

function readSecretJsonValue(secretJson: SecretJson, ...keys: string[]): string {
  for (const key of keys) {
    const candidate = secretJson[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

class SecretProvider {
  private readonly secretsManagerClient = new SecretsManagerClient({});
  private readonly cache = new Map<string, CachedSecret>();

  private getCachedValue(cacheKey: string): string {
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      return "";
    }

    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      return "";
    }

    return cached.value;
  }

  private cacheValue(cacheKey: string, value: string, ttlMs = defaultCacheTtlMs): void {
    if (!value) {
      this.cache.delete(cacheKey);
      return;
    }

    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  private readEnv(name: string): string {
    return trimEnv(process.env[name]);
  }

  private async fetchSecretsManagerSecret(secretId: string): Promise<string> {
    const response = await this.secretsManagerClient.send(
      new GetSecretValueCommand({
        SecretId: secretId
      })
    );

    const secretString = trimEnv(response.SecretString);

    if (secretString) {
      return secretString;
    }

    if (response.SecretBinary) {
      return Buffer.from(response.SecretBinary).toString("utf8").trim();
    }

    return "";
  }

  async getSecretValue(envName: string, fallbackEnvNames: string[] = []): Promise<string> {
    const cacheKey = [envName, ...fallbackEnvNames].join("|");
    const cached = this.getCachedValue(cacheKey);

    if (cached) {
      return cached;
    }

    const candidates = [envName, ...fallbackEnvNames]
      .map((name) => this.readEnv(name))
      .filter(Boolean);

    for (const candidate of candidates) {
      if (!isSecretsManagerReference(candidate)) {
        this.cacheValue(cacheKey, candidate);
        return candidate;
      }

      const secretValue = trimEnv(await this.fetchSecretsManagerSecret(candidate));

      if (secretValue) {
        this.cacheValue(cacheKey, secretValue);
        return secretValue;
      }
    }

    return "";
  }

  async getSecretJson(envName: string): Promise<SecretJson> {
    const raw = await this.getSecretValue(envName);

    if (!raw) {
      return {};
    }

    const parsed = safeJsonParse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  getAuroraConnectionConfig(): {
    host: string;
    username: string;
    password: string;
    databaseName: string;
    port: number;
  } {
    const secretJson = safeJsonParse(this.readEnv("AURORA_MASTER_SECRET_JSON"));
    const host = this.readEnv("AURORA_HOST") || readSecretJsonValue(secretJson, "host", "hostname", "endpoint");
    const username =
      this.readEnv("AURORA_USERNAME") || readSecretJsonValue(secretJson, "username", "user");
    const password = this.readEnv("AURORA_PASSWORD") || readSecretJsonValue(secretJson, "password");
    const databaseName =
      this.readEnv("AURORA_DATABASE_NAME") ||
      readSecretJsonValue(secretJson, "dbname", "database", "dbName") ||
      "nexus_support_portal";
    const portValue = this.readEnv("AURORA_PORT") || readSecretJsonValue(secretJson, "port");
    const parsedPort = Number(portValue || 5432);

    return {
      host,
      username,
      password,
      databaseName,
      port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5432
    };
  }

  hasAuroraConnectionConfig(): boolean {
    const config = this.getAuroraConnectionConfig();
    return Boolean(config.host && config.username);
  }

  getJiraPlatformCredentials(): { username: string; token: string } {
    return {
      username: this.readEnv("JIRA_USERNAME") || this.readEnv("JIRA_EMAIL"),
      token: this.readEnv("JIRA_TOKEN") || this.readEnv("JIRA_API_TOKEN")
    };
  }

  getOpenAiPlatformApiKey(): string {
    return this.readEnv("OPENAI_API_KEY");
  }

  getGitLabPlatformToken(): string {
    return this.readEnv("GITLAB_TOKEN") || this.readEnv("GITLAB_ACCESS_TOKEN");
  }

  getSmtpPlatformCredentials(): {
    username: string;
    password: string;
    host: string;
    port: number;
    security: "none" | "starttls" | "sslTls";
    fromName: string;
    fromEmail: string;
  } {
    const host = this.readEnv("SMTP_HOST");
    const port = Number(this.readEnv("SMTP_PORT") || 587);
    const securityRaw = this.readEnv("SMTP_SECURITY").toLowerCase();
    const security: "none" | "starttls" | "sslTls" =
      securityRaw === "ssl" || securityRaw === "ssltls"
        ? "sslTls"
        : securityRaw === "none"
          ? "none"
          : "starttls";

    return {
      username: this.readEnv("SMTP_USERNAME"),
      password: this.readEnv("SMTP_PASSWORD"),
      host,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      security,
      fromName: this.readEnv("SMTP_FROM_NAME") || "Nexus-support portal",
      fromEmail: this.readEnv("SMTP_FROM_EMAIL") || "noreply@scania.com"
    };
  }

  getEntraPlatformConfig(): {
    clientId: string;
    tenantId: string;
    redirectUri: string;
  } {
    return {
      clientId:
        this.readEnv("NEXT_PUBLIC_MICROSOFT_GRAPH_CLIENT_ID") ||
        this.readEnv("NEXT_PUBLIC_MICROSOFT_CLIENT_ID"),
      tenantId:
        this.readEnv("NEXT_PUBLIC_MICROSOFT_GRAPH_TENANT_ID") ||
        this.readEnv("NEXT_PUBLIC_MICROSOFT_TENANT_ID"),
      redirectUri: this.readEnv("NEXT_PUBLIC_MICROSOFT_GRAPH_REDIRECT_URI")
    };
  }

  getMicrosoftGraphClientCredentials(): {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    organizerEmail: string;
  } {
    return {
      tenantId: this.readEnv("TENANT_ID"),
      clientId: this.readEnv("CLIENT_ID"),
      clientSecret: this.readEnv("CLIENT_SECRET"),
      organizerEmail: this.readEnv("GRAPH_ORGANIZER_EMAIL")
    };
  }

  getGraphOrganizerEmail(): string {
    return this.readEnv("GRAPH_ORGANIZER_EMAIL");
  }
}

const secretProvider = new SecretProvider();

export function getSecretProvider(): SecretProvider {
  return secretProvider;
}

