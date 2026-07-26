import { createPublicKey, verify } from "node:crypto";

type JwtParts = {
  headerB64: string;
  payloadB64: string;
  signatureB64: string;
};

type AlbJwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type AlbJwtPayload = Record<string, unknown>;

type VerifiedJwt = {
  payload: AlbJwtPayload;
  header: AlbJwtHeader;
};

type PublicKeyCacheEntry = {
  pem: string;
  fetchedAtMs: number;
};

const publicKeyCache = new Map<string, PublicKeyCacheEntry>();
const publicKeyTtlMs = 6 * 60 * 60 * 1000;

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function parseJwtParts(jwt: string): JwtParts {
  const parts = jwt.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid JWT format.");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error("Invalid JWT format.");
  }

  return { headerB64, payloadB64, signatureB64 };
}

function parseJsonBuffer<T>(value: Buffer): T {
  try {
    return JSON.parse(value.toString("utf8")) as T;
  } catch {
    throw new Error("JWT contains invalid JSON.");
  }
}

function getAwsRegion(): string {
  const region = (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "").trim();

  if (!region) {
    throw new Error("AWS region is not configured (AWS_REGION).");
  }

  return region;
}

async function fetchAlbPublicKeyPem(kid: string): Promise<string> {
  const region = getAwsRegion();
  const url = `https://public-keys.auth.elb.${region}.amazonaws.com/${encodeURIComponent(kid)}`;

  const response = await fetch(url, { cache: "no-store" });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Failed to fetch ALB public key (status ${response.status}).`);
  }

  const pem = body.trim();

  if (!pem.startsWith("-----BEGIN PUBLIC KEY-----")) {
    throw new Error("Unexpected ALB public key format.");
  }

  return pem;
}

async function getAlbPublicKeyPem(kid: string): Promise<string> {
  const cached = publicKeyCache.get(kid);
  const now = Date.now();

  if (cached && now - cached.fetchedAtMs < publicKeyTtlMs) {
    return cached.pem;
  }

  const pem = await fetchAlbPublicKeyPem(kid);
  publicKeyCache.set(kid, { pem, fetchedAtMs: now });
  return pem;
}

export async function verifyAlbOidcJwt(jwt: string): Promise<VerifiedJwt> {
  const { headerB64, payloadB64, signatureB64 } = parseJwtParts(jwt);

  const header = parseJsonBuffer<AlbJwtHeader>(base64UrlToBuffer(headerB64));

  if ((header.alg || "").toUpperCase() !== "RS256") {
    throw new Error("Unsupported JWT algorithm.");
  }

  const kid = (header.kid || "").trim();
  if (!kid) {
    throw new Error("JWT kid header is missing.");
  }

  const pem = await getAlbPublicKeyPem(kid);
  const key = createPublicKey(pem);

  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "utf8");
  const signature = base64UrlToBuffer(signatureB64);
  const ok = verify("RSA-SHA256", signingInput, key, signature);

  if (!ok) {
    throw new Error("JWT signature verification failed.");
  }

  const payload = parseJsonBuffer<AlbJwtPayload>(base64UrlToBuffer(payloadB64));

  return { header, payload };
}

export function getClaimString(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

