type CognitoConfig = {
  domain: string;
  clientId: string;
  userPoolId: string;
  region: string;
  identityProvider: string;
};

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

function readTrimmedEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getCognitoConfig(): CognitoConfig {
  const domain = readTrimmedEnv("NEXT_PUBLIC_COGNITO_DOMAIN");
  const clientId = readTrimmedEnv("NEXT_PUBLIC_COGNITO_CLIENT_ID");
  const userPoolId = readTrimmedEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID");
  const region = readTrimmedEnv("NEXT_PUBLIC_COGNITO_REGION") || readTrimmedEnv("AWS_REGION") || "eu-north-1";
  const identityProvider = readTrimmedEnv("NEXT_PUBLIC_COGNITO_IDP_NAME") || "EntraID";

  if (!domain) {
    throw new Error("NEXT_PUBLIC_COGNITO_DOMAIN is not configured.");
  }

  if (!clientId) {
    throw new Error("NEXT_PUBLIC_COGNITO_CLIENT_ID is not configured.");
  }

  if (!userPoolId) {
    throw new Error("NEXT_PUBLIC_COGNITO_USER_POOL_ID is not configured.");
  }

  return {
    domain,
    clientId,
    userPoolId,
    region,
    identityProvider
  };
}

export function getPublicAppUrl(): string {
  const appUrl = readTrimmedEnv("NEXT_PUBLIC_NEXUS_APP_URL");

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_NEXUS_APP_URL is not configured.");
  }

  return appUrl.replace(/\/+$/, "");
}

export function getCognitoIssuer(config = getCognitoConfig()): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

export function getCognitoJwksUrl(config = getCognitoConfig()): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}/.well-known/jwks.json`;
}

export function buildCognitoAuthorizeUrl(
  config: CognitoConfig,
  options: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }
): string {
  const url = new URL(`https://${config.domain}/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("identity_provider", config.identityProvider);
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function buildCognitoLogoutUrl(config: CognitoConfig, logoutUri: string): string {
  const url = new URL(`https://${config.domain}/logout`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("logout_uri", logoutUri);
  return url.toString();
}

export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) {
    return "/";
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  return trimmed;
}

export function buildCallbackUrl(): string {
  return new URL("/api/auth/callback", getPublicAppUrl()).toString();
}

export function buildLogoutRedirectUrl(): string {
  return new URL("/", getPublicAppUrl()).toString();
}

export async function exchangeCognitoCodeForTokens(options: {
  config: CognitoConfig;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const response = await fetch(`https://${options.config.domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: options.config.clientId,
      code: options.code,
      redirect_uri: options.redirectUri,
      code_verifier: options.codeVerifier
    }).toString()
  });

  const payload = (await response.json().catch(() => null)) as TokenResponse | null;

  if (!response.ok) {
    const message = typeof payload?.access_token === "string" ? "Unexpected token response." : "";
    throw new Error(`Cognito token exchange failed with HTTP ${response.status}. ${message}`.trim());
  }

  if (!payload?.id_token) {
    throw new Error("Cognito token exchange did not return an ID token.");
  }

  return payload;
}

export type { CognitoConfig, TokenResponse };
