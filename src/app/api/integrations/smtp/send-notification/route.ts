import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { isValidEmail, type SmtpActionConfig } from "@/lib/integration-actions";
import {
  claimNotificationDelivery,
  enqueueOutboxJob,
  markNotificationDeliveryFailed,
  markNotificationDeliverySent
} from "@/lib/database";
import { getSmtpPlatformCredentials } from "@/lib/platform-secrets";

export const runtime = "nodejs";

type EmailRecipient = {
  email?: string;
  name?: string;
};

type SendNotificationEmailPayload = {
  config?: SmtpActionConfig;
  idempotencyKey?: string;
  message?: {
    to?: EmailRecipient[];
    subject?: string;
    body?: string;
    htmlBody?: string;
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

  if (payload.idempotencyKey !== undefined) {
    const idempotencyKey = payload.idempotencyKey.trim();

    if (!idempotencyKey) {
      errors.push("Notification idempotency key cannot be empty when provided.");
    }

    if (idempotencyKey.length > 512) {
      errors.push("Notification idempotency key must be 512 characters or fewer.");
    }
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
  const idempotencyKey = payload.idempotencyKey?.trim() || "";

  // When enabled, persist to outbox for AWS/local workers instead of sending inline.
  if (process.env.NEXUS_OUTBOX_EMAIL === "1") {
    const job = await enqueueOutboxJob({
      type: "email_notification",
      payload: {
        idempotencyKey: idempotencyKey || undefined,
        config: {
          enabled: config.enabled,
          host: config.host,
          port: config.port,
          security: config.security,
          fromName: config.fromName,
          fromEmail: config.fromEmail
        },
        message: {
          to: message.to,
          subject: message.subject,
          body: message.body,
          htmlBody: message.htmlBody
        }
      }
    });

    return NextResponse.json(
      {
        data: {
          status: "queued",
          outboxJobId: job.id
        }
      },
      { status: 202 }
    );
  }

  if (idempotencyKey) {
    let deliveryClaim: Awaited<ReturnType<typeof claimNotificationDelivery>>;

    try {
      deliveryClaim = await claimNotificationDelivery(idempotencyKey, recipients.length);
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unknown notification delivery claim failure.";

      console.error(
        JSON.stringify({
          event: "smtp_notification_email_claim_failed",
          idempotencyKey,
          message: messageText
        })
      );

      return errorResponse(
        "notification_delivery_claim_failed",
        "Could not reserve notification delivery before sending email.",
        [messageText],
        500
      );
    }

    if (deliveryClaim.status === "duplicate") {
      console.info(
        JSON.stringify({
          event: "smtp_notification_email_duplicate",
          idempotencyKey,
          deliveryStatus: deliveryClaim.deliveryStatus,
          recipientCount: recipients.length
        })
      );

      return NextResponse.json({
        data: {
          status: "duplicate",
          deduplicated: true,
          deliveryStatus: deliveryClaim.deliveryStatus,
          messageId: deliveryClaim.messageId,
          accepted: [],
          rejected: [],
          response:
            deliveryClaim.response ??
            `Notification delivery already ${deliveryClaim.deliveryStatus === "sent" ? "sent" : "in progress"}.`,
          updatedAt: deliveryClaim.updatedAt
        }
      });
    }
  }

  const platformCredentials = getSmtpPlatformCredentials();
  const auth =
    platformCredentials.username && platformCredentials.password
      ? {
          user: platformCredentials.username,
          pass: platformCredentials.password
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
        name: config.fromName.trim() || "Nexus-support portal",
        address: config.fromEmail.trim()
      },
      to: recipients,
      subject: message.subject.trim(),
      text: message.body.trim(),
      html: message.htmlBody?.trim() || undefined
    });

    if (idempotencyKey) {
      try {
        await markNotificationDeliverySent(idempotencyKey, {
          messageId: result.messageId,
          acceptedCount: result.accepted.length,
          rejectedCount: result.rejected.length,
          response: result.response
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "smtp_notification_delivery_mark_sent_failed",
            idempotencyKey,
            message: error instanceof Error ? error.message : "Unknown delivery mark-sent failure."
          })
        );
      }
    }

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

    if (idempotencyKey) {
      try {
        await markNotificationDeliveryFailed(idempotencyKey, messageText);
      } catch (markError) {
        console.error(
          JSON.stringify({
            event: "smtp_notification_delivery_mark_failed_failed",
            idempotencyKey,
            message: markError instanceof Error ? markError.message : "Unknown delivery mark-failed failure."
          })
        );
      }
    }

    console.error(
      JSON.stringify({
        event: "smtp_notification_email_failed",
        host: config.host,
        message: messageText
      })
    );

    return errorResponse(
      "smtp_send_failed",
      "SMTP server rejected or failed the notification email.",
      [messageText],
      502
    );
  }
}
