import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { isValidEmail, type SmtpActionConfig } from "@/lib/integration-actions";

export const runtime = "nodejs";

type SendTestEmailPayload = {
  config?: SmtpActionConfig;
  message?: {
    to?: string;
    subject?: string;
    body?: string;
  };
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details
      }
    },
    { status }
  );
}

function validatePayload(payload: SendTestEmailPayload): string[] {
  const errors: string[] = [];
  const config = payload.config;
  const message = payload.message;

  if (!config) {
    return ["SMTP configuration is required."];
  }

  if (!config.enabled) {
    errors.push("Outbound email delivery must be enabled before sending a test email.");
  }

  if (!config.host.trim()) {
    errors.push("SMTP host is required.");
  }

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push("SMTP port must be between 1 and 65535.");
  }

  if (!config.fromEmail.trim() || !isValidEmail(config.fromEmail.trim())) {
    errors.push("A valid sender email address is required.");
  }

  if (!message?.to?.trim() || !isValidEmail(message.to.trim())) {
    errors.push("A valid test recipient email address is required.");
  }

  if (!message?.subject?.trim()) {
    errors.push("Test email subject is required.");
  }

  if (!message?.body?.trim()) {
    errors.push("Test email body is required.");
  }

  const hasUsername = Boolean(config.username?.trim());
  const hasPassword = Boolean(config.password?.trim());

  if (hasUsername !== hasPassword) {
    errors.push("SMTP username and password must be provided together, or both left empty for relay/no-auth SMTP.");
  }

  return errors;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as SendTestEmailPayload | null;

  if (!payload) {
    return errorResponse("invalid_json", "Request body must be valid JSON.");
  }

  const errors = validatePayload(payload);

  if (errors.length > 0) {
    return errorResponse("validation_failed", "SMTP test email request failed validation.", errors);
  }

  const config = payload.config as SmtpActionConfig;
  const message = payload.message as Required<NonNullable<SendTestEmailPayload["message"]>>;
  const auth =
    config.username?.trim() && config.password?.trim()
      ? {
          user: config.username.trim(),
          pass: config.password
        }
      : undefined;

  const transporter = nodemailer.createTransport({
    host: config.host.trim(),
    port: config.port,
    secure: config.security === "sslTls",
    requireTLS: config.security === "starttls",
    ignoreTLS: config.security === "none",
    auth,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: {
      minVersion: "TLSv1.2"
    }
  });

  console.info(
    JSON.stringify({
      event: "smtp_test_email_attempt",
      host: config.host,
      port: config.port,
      security: config.security,
      authConfigured: Boolean(auth)
    })
  );

  try {
    const result = await transporter.sendMail({
      from: {
        name: config.fromName.trim() || "Nexus-support portal",
        address: config.fromEmail.trim()
      },
      to: message.to.trim(),
      subject: message.subject.trim(),
      text: message.body.trim()
    });

    console.info(
      JSON.stringify({
        event: "smtp_test_email_success",
        host: config.host,
        accepted: result.accepted.length,
        rejected: result.rejected.length
      })
    );

    return NextResponse.json({
      data: {
        status: result.rejected.length > 0 ? "partial" : "sent",
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
        response: result.response
      }
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown SMTP send failure.";

    console.error(
      JSON.stringify({
        event: "smtp_test_email_failed",
        host: config.host,
        message: messageText
      })
    );

    return errorResponse("smtp_send_failed", "SMTP server rejected or failed the test email.", [messageText], 502);
  }
}
