import { NextRequest, NextResponse } from "next/server";
import { requireApiPrincipal } from "@/lib/auth/api-auth";
import {
  generateAiChatText,
  generateEscalationMeetingSeriesText,
  generateJiraFieldText,
  generateReleaseNoteText,
  reviewTicketRequirementFulfillment,
  validateAiActionConfig,
  type AiActionConfig,
  type AiChatMessage
} from "@/lib/ai-integration";

export const runtime = "nodejs";

type AiGenerateTextPayload = {
  config?: AiActionConfig;
  mode?: "chat" | "jira_field" | "release_note" | "requirement_review" | "escalation_meeting_series";
  prompt?: string;
  messages?: AiChatMessage[];
  context?: Record<string, unknown>;
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

function isChatMessage(value: unknown): value is AiChatMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<AiChatMessage>;

  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    candidate.content.trim().length > 0
  );
}

export async function POST(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const payload = (await request.json().catch(() => null)) as AiGenerateTextPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include AI configuration.");
  }

  const config = payload.config;
  const mode = payload.mode ?? "chat";
  const errors = validateAiActionConfig(config);

  if (
    mode !== "chat" &&
    mode !== "jira_field" &&
    mode !== "release_note" &&
    mode !== "requirement_review" &&
    mode !== "escalation_meeting_series"
  ) {
    errors.push(
      "AI generation mode must be chat, jira_field, release_note, requirement_review, or escalation_meeting_series."
    );
  }

  if (mode === "chat" && !payload.prompt?.trim()) {
    errors.push("Prompt is required for AI chat generation.");
  }

  if (
    mode === "jira_field" &&
    (!payload.context || typeof payload.context !== "object" || Array.isArray(payload.context))
  ) {
    errors.push("Jira field generation requires a context object.");
  }

  if (
    mode === "release_note" &&
    (!payload.context || typeof payload.context !== "object" || Array.isArray(payload.context))
  ) {
    errors.push("Release note generation requires a context object.");
  }

  if (
    mode === "requirement_review" &&
    (!payload.context || typeof payload.context !== "object" || Array.isArray(payload.context))
  ) {
    errors.push("Requirement review requires a context object.");
  }

  if (
    mode === "escalation_meeting_series" &&
    (!payload.context || typeof payload.context !== "object" || Array.isArray(payload.context))
  ) {
    errors.push("Escalation meeting series generation requires a context object.");
  }

  if (Array.isArray(payload.messages) && !payload.messages.every(isChatMessage)) {
    errors.push("Chat messages must include role user or assistant and non-empty content.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "AI generation request failed validation.", errors);
  }

  console.info(
    JSON.stringify({
      event: "ai_text_generation_attempt",
      mode,
      provider: config.provider,
      model: config.model
    })
  );

  try {
    if (mode === "jira_field") {
      const result = await generateJiraFieldText(config, payload.context ?? {});

      console.info(
        JSON.stringify({
          event: "ai_jira_field_generation_success",
          model: result.model,
          responseId: result.id
        })
      );

      return NextResponse.json({
        data: {
          mode,
          model: result.model,
          responseId: result.id,
          jiraText: result.jiraText,
          usage: result.usage
        }
      });
    }

    if (mode === "release_note") {
      const result = await generateReleaseNoteText(config, payload.context ?? {});

      console.info(
        JSON.stringify({
          event: "ai_release_note_generation_success",
          model: result.model,
          responseId: result.id
        })
      );

      return NextResponse.json({
        data: {
          mode,
          model: result.model,
          responseId: result.id,
          releaseNoteText: result.releaseNoteText,
          usage: result.usage
        }
      });
    }

    if (mode === "requirement_review") {
      const result = await reviewTicketRequirementFulfillment(config, payload.context ?? {});

      console.info(
        JSON.stringify({
          event: "ai_requirement_review_success",
          model: result.model,
          responseId: result.id
        })
      );

      return NextResponse.json({
        data: {
          mode,
          model: result.model,
          responseId: result.id,
          requirementReview: result.requirementReview,
          usage: result.usage
        }
      });
    }

    if (mode === "escalation_meeting_series") {
      const result = await generateEscalationMeetingSeriesText(config, payload.context ?? {});

      console.info(
        JSON.stringify({
          event: "ai_escalation_meeting_series_generation_success",
          model: result.model,
          responseId: result.id
        })
      );

      return NextResponse.json({
        data: {
          mode,
          model: result.model,
          responseId: result.id,
          meetingSeriesText: result.meetingSeriesText,
          usage: result.usage
        }
      });
    }

    const result = await generateAiChatText(config, payload.messages ?? [], payload.prompt ?? "");

    console.info(
      JSON.stringify({
        event: "ai_chat_generation_success",
        model: result.model,
        responseId: result.id
      })
    );

    return NextResponse.json({
      data: {
        mode,
        model: result.model,
        responseId: result.id,
        text: result.text,
        usage: result.usage
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI generation failure.";

    console.error(
      JSON.stringify({
        event: "ai_text_generation_exception",
        mode,
        model: config.model,
        message
      })
    );

    return errorResponse("ai_request_failed", "Could not complete AI generation request.", [message], 502);
  }
}
