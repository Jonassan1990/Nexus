import { NextRequest, NextResponse } from "next/server";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { requireAdminPrincipal } from "@/lib/auth/api-auth";
import { isValidEmail, type SmtpActionConfig } from "@/lib/integration-actions";
import {
  claimNotificationDelivery,
  enqueueOutboxJob,
  markNotificationDeliveryFailed,
  markNotificationDeliverySent
} from "@/lib/database";
import {
  buildScaniaSesSendEmailInput,
  createScaniaSesClient,
  getScaniaSesIdentity,
  normalizeSmtpSenderForScania
} from "@/lib/scania-ses";

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
  const principal = await requireAdminPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

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
  const sender = normalizeSmtpSenderForScania();
  const identity = getScaniaSesIdentity();
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
          fromName: sender.fromName,
          fromEmail: sender.fromEmail
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

  const sesClient = createScaniaSesClient();

  console.info(
    JSON.stringify({
      event: "smtp_notification_email_attempt",
      recipientCount: recipients.length,
      region: identity.region,
      fromEmail: sender.fromEmail,
      sourceArn: identity.sourceArn
    })
  );

  try {
    const result = await sesClient.send(
      new SendEmailCommand(
        buildScaniaSesSendEmailInput({
          toAddresses: recipients.map((recipient) => recipient.address),
          subject: message.subject.trim(),
          textBody: message.body.trim(),
          htmlBody: message.htmlBody?.trim() || undefined
        })
      )
    );

    if (idempotencyKey) {
      try {
        await markNotificationDeliverySent(idempotencyKey, {
          messageId: result.MessageId,
          acceptedCount: recipients.length,
          rejectedCount: 0,
          response: "Sent through AWS SES."
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
        messageId: result.MessageId ?? "",
        accepted: recipients.length,
        rejected: 0
      })
    );

    return NextResponse.json({
      data: {
        status: "sent",
        messageId: result.MessageId ?? "",
        accepted: recipients.map((recipient) => recipient.address),
        rejected: [],
        response: "Sent through AWS SES.",
        region: identity.region,
        sender: sender.fromEmail,
        sourceArn: identity.sourceArn
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
