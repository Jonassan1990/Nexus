import "server-only";

import { getSecretProvider } from "./secret-provider";

export function getAuroraConnectionConfig(): {
  host: string;
  username: string;
  password: string;
  databaseName: string;
  port: number;
} {
  return getSecretProvider().getAuroraConnectionConfig();
}

export function hasAuroraConnectionConfig(): boolean {
  return getSecretProvider().hasAuroraConnectionConfig();
}

export function getJiraPlatformCredentials(): { username: string; token: string } {
  return getSecretProvider().getJiraPlatformCredentials();
}

export function isJiraPlatformConfigured(): boolean {
  const credentials = getJiraPlatformCredentials();

  return Boolean(credentials.token);
}

export function getOpenAiPlatformApiKey(): string {
  return getSecretProvider().getOpenAiPlatformApiKey();
}

export function isOpenAiPlatformConfigured(): boolean {
  return Boolean(getOpenAiPlatformApiKey());
}

export function getGitLabPlatformToken(): string {
  return getSecretProvider().getGitLabPlatformToken();
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
  return getSecretProvider().getSmtpPlatformCredentials();
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
  return getSecretProvider().getEntraPlatformConfig();
}

export function isEntraPlatformConfigured(): boolean {
  const config = getEntraPlatformConfig();

  return Boolean(config.clientId && config.tenantId);
}
