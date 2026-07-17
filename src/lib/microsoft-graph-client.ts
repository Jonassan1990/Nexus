import { acquireGraphMeetingAccessToken, getActiveMsalAccount } from "@/lib/auth/msal-instance";
import { getAccountEmail } from "@/lib/auth/msal-config";

const graphBaseUrl = "https://graph.microsoft.com/v1.0";
const defaultTimeZone = "Europe/Stockholm";

type GraphEventAttendee = {
  emailAddress: {
    address: string;
    name: string;
  };
  type: "required";
};

type GraphErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    innerError?: unknown;
  };
};

type GraphEventResponse = {
  id?: string;
  subject?: string;
  webLink?: string;
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: string;
  onlineMeetingUrl?: string;
  onlineMeeting?: {
    joinUrl?: string;
  } | null;
};

export type CreateOutlookMeetingInput = {
  title: string;
  attendees: string[];
  startDateTime: string;
  endDateTime: string;
  description?: string;
  createTeamsMeeting: boolean;
  relatedTicketId?: string;
  escalationPriority?: string;
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

export async function getGraphToken(): Promise<string> {
  try {
    return await acquireGraphMeetingAccessToken();
  } catch (error) {
    throw new MicrosoftGraphClientError(
      error instanceof Error ? error.message : "Failed to acquire a Microsoft Graph access token."
    );
  }
}

export function getSignedInGraphUser(): { displayName: string; email: string } | null {
  const account = getActiveMsalAccount();

  if (!account) {
    return null;
  }

  return {
    displayName: account.name?.trim() || account.username || "Signed-in user",
    email: getAccountEmail(account)
  };
}

function normalizeDateTimeValue(value: string): string {
  const trimmedValue = value.trim();

  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmedValue) ? `${trimmedValue}:00` : trimmedValue;
}

function buildMeetingBody(input: CreateOutlookMeetingInput): string {
  return [
    input.description?.trim() ?? "",
    input.relatedTicketId?.trim() ? `Related ticket ID: ${input.relatedTicketId.trim()}` : "",
    input.escalationPriority?.trim() ? `Escalation priority: ${input.escalationPriority.trim()}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildGraphAttendees(attendees: string[]): GraphEventAttendee[] {
  return attendees.map((email) => ({
    emailAddress: {
      address: email,
      name: email
    },
    type: "required"
  }));
}

function getGraphErrorDetails(body: GraphErrorResponse | null): string[] {
  return [
    body?.error?.code ? `Graph code: ${body.error.code}` : "",
    body?.error?.message ?? ""
  ].filter(Boolean);
}

async function readGraphJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

async function fetchGraphEvent(accessToken: string, eventId: string): Promise<GraphEventResponse> {
  const response = await fetch(
    `${graphBaseUrl}/me/events/${encodeURIComponent(eventId)}?$select=id,subject,webLink,isOnlineMeeting,onlineMeetingProvider,onlineMeeting`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        Prefer: `outlook.timezone="${defaultTimeZone}"`
      }
    }
  );
  const body = await readGraphJson<GraphEventResponse | GraphErrorResponse>(response);

  if (!response.ok) {
    throw new MicrosoftGraphClientError(
      `Microsoft Graph returned HTTP ${response.status} while reading the created event.`,
      getGraphErrorDetails(body as GraphErrorResponse | null)
    );
  }

  return body as GraphEventResponse;
}

export async function createOutlookMeeting(input: CreateOutlookMeetingInput): Promise<CreateOutlookMeetingResult> {
  const accessToken = await getGraphToken();
  const signedInUser = getSignedInGraphUser();
  const bodyContent = buildMeetingBody(input);
  const graphPayload = {
    subject: input.title.trim(),
    start: {
      dateTime: normalizeDateTimeValue(input.startDateTime),
      timeZone: defaultTimeZone
    },
    end: {
      dateTime: normalizeDateTimeValue(input.endDateTime),
      timeZone: defaultTimeZone
    },
    attendees: buildGraphAttendees(input.attendees),
    allowNewTimeProposals: true,
    ...(bodyContent
      ? {
          body: {
            contentType: "Text",
            content: bodyContent
          }
        }
      : {}),
    ...(input.createTeamsMeeting
      ? {
          isOnlineMeeting: true,
          onlineMeetingProvider: "teamsForBusiness"
        }
      : {})
  };
  const response = await fetch(`${graphBaseUrl}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: `outlook.timezone="${defaultTimeZone}"`
    },
    body: JSON.stringify(graphPayload)
  });
  const body = await readGraphJson<GraphEventResponse | GraphErrorResponse>(response);

  if (!response.ok) {
    throw new MicrosoftGraphClientError(
      `Microsoft Graph returned HTTP ${response.status} while creating the Outlook event.`,
      getGraphErrorDetails(body as GraphErrorResponse | null)
    );
  }

  const createdEvent = body as GraphEventResponse;

  if (!createdEvent.id) {
    throw new MicrosoftGraphClientError("Microsoft Graph created an event response without an event ID.");
  }

  const eventWithOnlineMeeting =
    !input.createTeamsMeeting || createdEvent.onlineMeeting?.joinUrl
      ? createdEvent
      : await fetchGraphEvent(accessToken, createdEvent.id);
  const joinUrl = eventWithOnlineMeeting.onlineMeeting?.joinUrl ?? eventWithOnlineMeeting.onlineMeetingUrl ?? "";

  return {
    eventId: eventWithOnlineMeeting.id ?? createdEvent.id,
    subject: eventWithOnlineMeeting.subject ?? createdEvent.subject ?? input.title.trim(),
    webLink: eventWithOnlineMeeting.webLink ?? createdEvent.webLink ?? "",
    joinUrl,
    isOnlineMeeting: Boolean(eventWithOnlineMeeting.isOnlineMeeting ?? createdEvent.isOnlineMeeting),
    onlineMeetingProvider:
      eventWithOnlineMeeting.onlineMeetingProvider ?? createdEvent.onlineMeetingProvider ?? "",
    organizerEmail: signedInUser?.email ?? ""
  };
}
