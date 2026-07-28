import { NextRequest, NextResponse } from "next/server";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { requireAdminPrincipal } from "@/lib/auth/api-auth";
import { isValidEmail, type SmtpActionConfig } from "@/lib/integration-actions";
import {
  buildScaniaSesSendEmailInput,
  createScaniaSesClient,
  getScaniaSesIdentity,
  normalizeSmtpSenderForScania
} from "@/lib/scania-ses";

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

  if (!message?.to?.trim() || !isValidEmail(message.to.trim())) {
    errors.push("A valid test recipient email address is required.");
  }

  if (!message?.subject?.trim()) {
    errors.push("Test email subject is required.");
  }

  if (!message?.body?.trim()) {
    errors.push("Test email body is required.");
  }

  return errors;
}

export async function POST(request: NextRequest) {
  const principal = await requireAdminPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const payload = (await request.json().catch(() => null)) as SendTestEmailPayload | null;

  if (!payload) {
    return errorResponse("invalid_json", "Request body must be valid JSON.");
  }

  const errors = validatePayload(payload);

  if (errors.length > 0) {
    return errorResponse("validation_failed", "SMTP test email request failed validation.", errors);
  }

  const message = payload.message as Required<NonNullable<SendTestEmailPayload["message"]>>;
  const sender = normalizeSmtpSenderForScania();
  const identity = getScaniaSesIdentity();
  const sesClient = createScaniaSesClient();

  console.info(
    JSON.stringify({
      event: "smtp_test_email_attempt",
      region: identity.region,
      fromEmail: sender.fromEmail,
      sourceArn: identity.sourceArn,
      recipientCount: 1
    })
  );

  try {
    const result = await sesClient.send(
      new SendEmailCommand(
        buildScaniaSesSendEmailInput({
          toAddresses: [message.to.trim()],
          subject: message.subject.trim(),
          textBody: message.body.trim()
        })
      )
    );

    console.info(
      JSON.stringify({
        event: "smtp_test_email_success",
        messageId: result.MessageId ?? "",
        status: "sent"
      })
    );

    return NextResponse.json({
      data: {
        status: "sent",
        messageId: result.MessageId ?? "",
        accepted: [message.to.trim()],
        rejected: [],
        response: "Sent through AWS SES.",
        region: identity.region,
        sender: sender.fromEmail,
        sourceArn: identity.sourceArn
      }
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown SMTP send failure.";

    console.error(
      JSON.stringify({
        event: "smtp_test_email_failed",
        message: messageText
      })
    );

    return errorResponse(
      "smtp_send_failed",
      "SMTP server rejected or failed the test email.",
      [messageText],
      502
    );
  }
}
