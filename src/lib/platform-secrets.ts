type SecretJson = Record<string, unknown>;

function readEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

function parseSecretJson(): SecretJson {
  const raw = readEnv(process.env.AURORA_MASTER_SECRET_JSON);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SecretJson) : {};
  } catch {
    return {};
  }
}

function readSecretString(...keys: string[]): string {
  const secretJson = parseSecretJson();

  for (const key of keys) {
    const candidate = secretJson[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

export function getAuroraConnectionConfig(): {
  host: string;
  username: string;
  password: string;
  databaseName: string;
  port: number;
} {
  const host =
    readEnv(process.env.AURORA_HOST) ||
    readSecretString("host", "hostname", "endpoint");
  const username = readEnv(process.env.AURORA_USERNAME) || readSecretString("username", "user");
  const password = readEnv(process.env.AURORA_PASSWORD) || readSecretString("password");
  const databaseName =
    readEnv(process.env.AURORA_DATABASE_NAME) ||
    readSecretString("dbname", "database", "dbName") ||
    "nexus_support_portal";
  const portValue = readEnv(process.env.AURORA_PORT) || readSecretString("port");
  const parsedPort = Number(portValue || 5432);

  return {
    host,
    username,
    password,
    databaseName,
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5432
  };
}

export function getJiraPlatformCredentials(): { username: string; token: string } {
  return {
    username: readEnv(process.env.JIRA_USERNAME) || readEnv(process.env.JIRA_EMAIL),
    token: readEnv(process.env.JIRA_TOKEN) || readEnv(process.env.JIRA_API_TOKEN)
  };
}

export function isJiraPlatformConfigured(): boolean {
  const credentials = getJiraPlatformCredentials();

  return Boolean(credentials.token);
}

export function getOpenAiPlatformApiKey(): string {
  return readEnv(process.env.OPENAI_API_KEY);
}

export function isOpenAiPlatformConfigured(): boolean {
  return Boolean(getOpenAiPlatformApiKey());
}

export function getGitLabPlatformToken(): string {
  return readEnv(process.env.GITLAB_TOKEN) || readEnv(process.env.GITLAB_ACCESS_TOKEN);
}

export function isGitLabPlatformConfigured(): boolean {
  return Boolean(getGitLabPlatformToken());
}

export function getSmtpPlatformCredentials(): {
  username: string;
  password: string;
  host: string;
  port: number;
  security: "none" | "starttls" | "sslTls";
  fromName: string;
  fromEmail: string;
} {
  const host = readEnv(process.env.SMTP_HOST);
  const port = Number(readEnv(process.env.SMTP_PORT) || 587);
  const securityRaw = readEnv(process.env.SMTP_SECURITY).toLowerCase();
  const security: "none" | "starttls" | "sslTls" =
    securityRaw === "ssl" || securityRaw === "ssltls" ? "sslTls" : securityRaw === "none" ? "none" : "starttls";

  return {
    username: readEnv(process.env.SMTP_USERNAME),
    password: readEnv(process.env.SMTP_PASSWORD),
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    security,
    fromName: readEnv(process.env.SMTP_FROM_NAME) || "Nexus-support portal",
    fromEmail: readEnv(process.env.SMTP_FROM_EMAIL) || "noreply@scania.com"
  };
}

export function isSmtpPlatformConfigured(): boolean {
  const credentials = getSmtpPlatformCredentials();

  return Boolean(credentials.host && credentials.fromEmail);
}

export function getEntraPlatformConfig(): {
  clientId: string;
  tenantId: string;
  redirectUri: string;
} {
  return {
    clientId:
      readEnv(process.env.NEXT_PUBLIC_MICROSOFT_GRAPH_CLIENT_ID) ||
      readEnv(process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID),
    tenantId:
      readEnv(process.env.NEXT_PUBLIC_MICROSOFT_GRAPH_TENANT_ID) ||
      readEnv(process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID),
    redirectUri: readEnv(process.env.NEXT_PUBLIC_MICROSOFT_GRAPH_REDIRECT_URI)
  };
}

export function isEntraPlatformConfigured(): boolean {
  const config = getEntraPlatformConfig();

  return Boolean(config.clientId && config.tenantId);
}
