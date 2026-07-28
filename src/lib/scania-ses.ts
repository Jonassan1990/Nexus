import "server-only";

import { SESClient, type SendEmailCommandInput } from "@aws-sdk/client-ses";
import type { AdminConfig, SmtpConfig } from "./admin-config";

export type ScaniaSesEnvironment = "dev-uat" | "production";

export type ScaniaSesIdentity = {
  region: "eu-west-1";
  environment: ScaniaSesEnvironment;
  senderEmail: string;
  sourceArn: string;
};

const sesRegion: ScaniaSesIdentity["region"] = "eu-west-1";
const devUatIdentity: Omit<ScaniaSesIdentity, "environment" | "region"> = {
  senderEmail: "noreply@devsemail.com",
  sourceArn: "arn:aws:ses:eu-west-1:263287127811:identity/noreply@devsemail.com"
};
const productionIdentity: Omit<ScaniaSesIdentity, "environment" | "region"> = {
  senderEmail: "noreply@ext.scania.com",
  sourceArn: "arn:aws:ses:eu-west-1:413664835569:identity/noreply@ext.scania.com"
};

function readTrimmedEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

function inferEnvironmentFromAppUrl(): ScaniaSesEnvironment {
  const appUrl = readTrimmedEnv("NEXUS_APP_URL") || readTrimmedEnv("NEXT_PUBLIC_NEXUS_APP_URL");

  if (!appUrl) {
    return "dev-uat";
  }

  try {
    const host = new URL(appUrl).hostname.toLowerCase();

    if (host.endsWith("ext.scania.com")) {
      return "production";
    }

    if (host.endsWith("scania.com") && !host.includes("cloudfront.net")) {
      return "production";
    }
  } catch {
    return "dev-uat";
  }

  return "dev-uat";
}

export function resolveScaniaSesEnvironment(): ScaniaSesEnvironment {
  const explicit = readTrimmedEnv("NEXUS_SES_ENVIRONMENT").toLowerCase();

  if (explicit === "production" || explicit === "prod") {
    return "production";
  }

  if (explicit === "dev" || explicit === "dev-uat" || explicit === "uat" || explicit === "nonprod") {
    return "dev-uat";
  }

  return inferEnvironmentFromAppUrl();
}

export function getScaniaSesIdentity(): ScaniaSesIdentity {
  const environment = resolveScaniaSesEnvironment();
  const baseIdentity = environment === "production" ? productionIdentity : devUatIdentity;

  return {
    region: sesRegion,
    environment,
    senderEmail: baseIdentity.senderEmail,
    sourceArn: baseIdentity.sourceArn
  };
}

export function createScaniaSesClient(): SESClient {
  return new SESClient({ region: sesRegion });
}

export function normalizeSmtpSenderForScania(): Pick<SmtpConfig, "fromName" | "fromEmail"> {
  const identity = getScaniaSesIdentity();

  return {
    fromName: "Nexus-support portal",
    fromEmail: identity.senderEmail
  };
}

export function normalizeAdminConfigForScaniaSes(config: AdminConfig): AdminConfig {
  const sender = normalizeSmtpSenderForScania();

  return {
    ...config,
    integrations: {
      ...config.integrations,
      smtp: {
        ...config.integrations.smtp,
        ...sender
      }
    }
  };
}

export function buildScaniaSesSendEmailInput(params: {
  toAddresses: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  replyToAddresses?: string[];
}): SendEmailCommandInput {
  const identity = getScaniaSesIdentity();

  return {
    Source: identity.senderEmail,
    SourceArn: identity.sourceArn,
    Destination: {
      ToAddresses: params.toAddresses
    },
    Message: {
      Subject: {
        Data: params.subject,
        Charset: "UTF-8"
      },
      Body: {
        Text: {
          Data: params.textBody,
          Charset: "UTF-8"
        },
        ...(params.htmlBody
          ? {
              Html: {
                Data: params.htmlBody,
                Charset: "UTF-8"
              }
            }
          : {})
      }
    },
    ReplyToAddresses: params.replyToAddresses ?? [identity.senderEmail]
  };
}
