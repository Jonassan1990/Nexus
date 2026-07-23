export type CreateOutlookMeetingInput = {
  title: string;
  attendees: string[];
  startDateTime: string;
  endDateTime: string;
  description?: string;
  createTeamsMeeting: boolean;
  relatedTicketId?: string;
  escalationPriority?: string;
  organizerEmail?: string;
};

export type CreateOutlookMeetingResult = {
  eventId: string;
  subject: string;
  webLink: string;
  joinUrl: string;
  isOnlineMeeting: boolean;
  onlineMeetingProvider: string;
  organizerEmail: string;
};

class MicrosoftGraphClientError extends Error {
  constructor(
    message: string,
    public readonly details: string[] = []
  ) {
    super(message);
  }
}

function normalizeDateTimeValue(value: string): string {
  const trimmedValue = value.trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmedValue) ? `${trimmedValue}:00` : trimmedValue;
}

export async function createOutlookMeeting(
  input: CreateOutlookMeetingInput
): Promise<CreateOutlookMeetingResult> {
  const response = await fetch("/api/integrations/microsoft-graph/teams-meeting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: input.title.trim(),
      startDateTime: normalizeDateTimeValue(input.startDateTime),
      endDateTime: normalizeDateTimeValue(input.endDateTime),
      attendees: input.attendees,
      body: [
        input.description?.trim() ?? "",
        input.relatedTicketId?.trim() ? `Related ticket ID: ${input.relatedTicketId.trim()}` : "",
        input.escalationPriority?.trim() ? `Escalation priority: ${input.escalationPriority.trim()}` : ""
      ]
        .filter(Boolean)
        .join("\n\n"),
      isOnlineMeeting: input.createTeamsMeeting,
      organizerEmail: input.organizerEmail?.trim() || undefined,
      authMode: "app"
    })
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: {
      eventId: string;
      subject: string;
      webLink?: string;
      joinUrl?: string;
      isOnlineMeeting?: boolean;
      onlineMeetingProvider?: string;
    };
    error?: { message?: string; details?: string[] };
  } | null;

  if (!response.ok || !payload?.data) {
    throw new MicrosoftGraphClientError(
      payload?.error?.message ?? "Could not create Microsoft Teams meeting.",
      payload?.error?.details ?? []
    );
  }

  return {
    eventId: payload.data.eventId,
    subject: payload.data.subject,
    webLink: payload.data.webLink ?? "",
    joinUrl: payload.data.joinUrl ?? "",
    isOnlineMeeting: Boolean(payload.data.isOnlineMeeting),
    onlineMeetingProvider: payload.data.onlineMeetingProvider ?? "",
    organizerEmail: input.organizerEmail?.trim() ?? ""
  };
}
