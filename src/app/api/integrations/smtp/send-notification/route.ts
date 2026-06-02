import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { isValidEmail, type SmtpActionConfig } from "@/lib/integration-actions";

export const runtime = "nodejs";

type EmailRecipient = {
  email?: string;
  name?: string;
};

type SendNotificationEmailPayload = {
  config?: SmtpActionConfig;
  message?: {
    to?: EmailRecipient[];
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

function validatePayload(payload: SendNotificationEmailPayload): string[] {
  const errors: string[] = [];
  const config = payload.config;
  const message = payload.message;

  if (!config) {
    return ["SMTP configuration is required."];
  }

  if (!config.enabled) {
    errors.push("Outbound email delivery must be enabled before sending notification email.");
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

  const recipients = message?.to ?? [];

  if (!recipients.length) {
    errors.push("At least one notification recipient is required.");
  }

  for (const recipient of recipients) {
    if (!recipient.email?.trim() || !isValidEmail(recipient.email.trim())) {
      errors.push(`Invalid notification recipient email: ${recipient.email ?? "missing"}.`);
    }
  }

  if (!message?.subject?.trim()) {
    errors.push("Notification email subject is required.");
  }

  if (!message?.body?.trim()) {
    errors.push("Notification email body is required.");
  }

  const hasUsername = Boolean(config.username?.trim());
  const hasPassword = Boolean(config.password?.trim());

  if (hasUsername !== hasPassword) {
    errors.push("SMTP username and password must be provided together, or both left empty for relay/no-auth SMTP.");
  }

  return errors;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as SendNotificationEmailPayload | null;

  if (!payload) {
    return errorResponse("invalid_json", "Request body must be valid JSON.");
  }

  const errors = validatePayload(payload);

  if (errors.length > 0) {
    return errorResponse("validation_failed", "SMTP notification request failed validation.", errors);
  }

  const config = payload.config as SmtpActionConfig;
  const message = payload.message as Required<NonNullable<SendNotificationEmailPayload["message"]>>;
  const recipients = message.to
    .map((recipient) => ({
      name: recipient.name?.trim() || recipient.email?.trim() || "Recipient",
      address: recipient.email?.trim() ?? ""
    }))
    .filter((recipient) => recipient.address);
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
      event: "smtp_notification_email_attempt",
      host: config.host,
      port: config.port,
      recipientCount: recipients.length,
      authConfigured: Boolean(auth)
    })
  );

  try {
    const result = await transporter.sendMail({
      from: {
        name: config.fromName.trim() || "NEXUS Portal",
        address: config.fromEmail.trim()
      },
      to: recipients,
      subject: message.subject.trim(),
      text: message.body.trim()
    });

    console.info(
      JSON.stringify({
        event: "smtp_notification_email_success",
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
        event: "smtp_notification_email_failed",
        host: config.host,
        message: messageText
      })
    );

    return errorResponse("smtp_send_failed", "SMTP server rejected or failed the notification email.", [messageText], 502);
  }
}
