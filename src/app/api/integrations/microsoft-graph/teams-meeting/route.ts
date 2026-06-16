import { NextRequest, NextResponse } from "next/server";
import {
  createTeamsCalendarEvent,
  MicrosoftGraphApiError,
  MicrosoftGraphConfigError,
  MicrosoftGraphValidationError,
  type CreateTeamsMeetingInput
} from "@/lib/microsoft-graph";

export const runtime = "nodejs";

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

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as CreateTeamsMeetingInput | null;

  if (!payload) {
    return errorResponse("invalid_json", "Request body must be valid JSON.");
  }

  // Log request metadata only; subjects, tokens, and attendee emails are intentionally omitted.
  console.info(
    JSON.stringify({
      event: "graph_teams_meeting_create_attempt",
      authMode: payload.authMode ?? "auto",
      attendeeCount: payload.attendees?.length ?? 0,
      organizerProvided: Boolean(payload.organizerEmail?.trim())
    })
  );

  try {
    // Delegated callers pass Authorization: Bearer <token>; otherwise app-only client credentials are used.
    const result = await createTeamsCalendarEvent(payload, request.headers.get("authorization"));

    console.info(
      JSON.stringify({
        event: "graph_teams_meeting_create_success",
        eventId: result.eventId,
        authMode: result.authMode,
        isOnlineMeeting: result.isOnlineMeeting
      })
    );

    return NextResponse.json(
      {
        data: {
          eventId: result.eventId,
          joinUrl: result.joinUrl,
          webLink: result.webLink,
          subject: result.subject,
          isOnlineMeeting: result.isOnlineMeeting,
          onlineMeetingProvider: result.onlineMeetingProvider,
          authMode: result.authMode
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof MicrosoftGraphValidationError) {
      return errorResponse("validation_failed", error.message, error.details, 400);
    }

    if (error instanceof MicrosoftGraphConfigError) {
      return errorResponse("graph_config_missing", error.message, error.details, 500);
    }

    if (error instanceof MicrosoftGraphApiError) {
      console.error(
        JSON.stringify({
          event: "graph_teams_meeting_create_failed",
          status: error.status,
          code: error.code,
          message: error.message
        })
      );

      return errorResponse(error.code, error.message, error.details, error.status || 502);
    }

    const message = error instanceof Error ? error.message : "Unknown Microsoft Graph request failure.";

    console.error(
      JSON.stringify({
        event: "graph_teams_meeting_create_exception",
        message
      })
    );

    return errorResponse("graph_request_failed", "Could not create Microsoft Teams meeting.", [message], 502);
  }
}
