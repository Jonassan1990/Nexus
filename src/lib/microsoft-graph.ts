import { isValidEmail } from "./integration-actions";
import { getSecretProvider } from "./secret-provider";

const graphBaseUrl = "https://graph.microsoft.com/v1.0";
const graphScope = "https://graph.microsoft.com/.default";
const defaultMeetingTimeZone = "Europe/Stockholm";

type GraphAuthMode = "client_credentials" | "delegated";
type GraphDayOfWeek = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
type TeamsMeetingRecurrenceFrequency = "daily" | "weekly" | "monthly";

export type TeamsMeetingAttendeeInput =
  | string
  | {
      email?: string;
      name?: string;
      type?: "required" | "optional";
    };

export type TeamsMeetingRecurrenceInput = {
  frequency?: TeamsMeetingRecurrenceFrequency;
  interval?: number;
  daysOfWeek?: string[];
  startDate?: string;
  endDate?: string;
  timeZone?: string;
};

export type CreateTeamsMeetingInput = {
  subject?: string;
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
  attendees?: TeamsMeetingAttendeeInput[];
  organizerEmail?: string;
  bodyHtml?: string;
  bodyText?: string;
  recurrence?: TeamsMeetingRecurrenceInput;
  transactionId?: string;
  authMode?: GraphAuthMode;
};

export type CreateTeamsMeetingResult = {
  eventId: string;
  joinUrl: string;
  webLink: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees: TeamsMeetingAttendeeResult[];
  isOnlineMeeting: boolean;
  onlineMeetingProvider: string;
  endpoint: string;
  authMode: GraphAuthMode;
};

export type TeamsMeetingAttendeeResult = {
  email: string;
  name: string;
  type: string;
  responseStatus?: string;
};

type GraphErrorBody = {
  error?: {
    code?: string;
    message?: string;
    innerError?: unknown;
  };
};

type GraphTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GraphEventResponse = {
  id?: string;
  subject?: string;
  webLink?: string;
  start?: {
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    timeZone?: string;
  };
  attendees?: GraphAttendeeResponse[];
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: string;
  onlineMeetingUrl?: string;
  onlineMeeting?: {
    joinUrl?: string;
  } | null;
};

type GraphAttendeeResponse = {
  emailAddress?: {
    address?: string;
    name?: string;
  };
  type?: string;
  status?: {
    response?: string;
  };
};

type NormalizedAttendee = {
  emailAddress: {
    address: string;
    name: string;
  };
  type: "required" | "optional";
};

type NormalizedRecurrence = {
  frequency: TeamsMeetingRecurrenceFrequency;
  interval: number;
  daysOfWeek: GraphDayOfWeek[];
  startDate: string;
  endDate: string;
  timeZone: string;
};

export class MicrosoftGraphConfigError extends Error {
  constructor(public readonly details: string[]) {
    super("Microsoft Graph environment configuration is incomplete.");
  }
}

export class MicrosoftGraphValidationError extends Error {
  constructor(public readonly details: string[]) {
    super("Microsoft Graph meeting request failed validation.");
  }
}

export class MicrosoftGraphApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: string[]
  ) {
    super(message);
  }
}

function readRequiredEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function normalizeDateTimeValue(value: string): string {
  const trimmedValue = value.trim();

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmedValue)) {
    return `${trimmedValue}:00`;
  }

  return trimmedValue;
}

function parseDateTimeMs(value: string): number {
  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getDatePart(value: string): string {
  return value.trim().slice(0, 10);
}

function getBearerTokenFromHeader(value: string | null): string {
  const match = /^Bearer\s+(.+)$/i.exec(value?.trim() ?? "");

  return match?.[1]?.trim() ?? "";
}

function normalizeGraphDayOfWeek(value: string): GraphDayOfWeek | "" {
  const normalizedValue = value.trim().toLowerCase();
  const dayMap: Record<string, GraphDayOfWeek> = {
    su: "sunday",
    sun: "sunday",
    sunday: "sunday",
    mo: "monday",
    mon: "monday",
    monday: "monday",
    tu: "tuesday",
    tue: "tuesday",
    tuesday: "tuesday",
    we: "wednesday",
    wed: "wednesday",
    wednesday: "wednesday",
    th: "thursday",
    thu: "thursday",
    thursday: "thursday",
    fr: "friday",
    fri: "friday",
    friday: "friday",
    sa: "saturday",
    sat: "saturday",
    saturday: "saturday"
  };

  return dayMap[normalizedValue] ?? "";
}

function normalizeRecurrence(
  recurrence: TeamsMeetingRecurrenceInput | undefined,
  input: CreateTeamsMeetingInput
): NormalizedRecurrence | null {
  if (!recurrence) {
    return null;
  }

  const frequency =
    recurrence.frequency === "daily" || recurrence.frequency === "monthly" ? recurrence.frequency : "weekly";
  const interval =
    Number.isFinite(recurrence.interval) && recurrence.interval && recurrence.interval > 0
      ? Math.max(1, Math.min(99, Math.round(recurrence.interval)))
      : 1;
  const startDate =
    recurrence.startDate?.trim() || getDatePart(normalizeDateTimeValue(input.startDateTime ?? ""));
  const endDate = recurrence.endDate?.trim() ?? "";
  const daysOfWeek = Array.from(
    new Set(
      (recurrence.daysOfWeek ?? [])
        .map((day) => normalizeGraphDayOfWeek(day))
        .filter((day): day is GraphDayOfWeek => Boolean(day))
    )
  );

  return {
    frequency,
    interval,
    daysOfWeek,
    startDate,
    endDate,
    timeZone: recurrence.timeZone?.trim() || input.timeZone?.trim() || defaultMeetingTimeZone
  };
}

function normalizeAttendees(attendees?: TeamsMeetingAttendeeInput[]): NormalizedAttendee[] {
  return (attendees ?? [])
    .map((attendee) => {
      if (typeof attendee === "string") {
        const email = attendee.trim();

        return {
          emailAddress: {
            address: email,
            name: email
          },
          type: "required" as const
        };
      }

      const email = attendee.email?.trim() ?? "";
      const name = attendee.name?.trim() || email;

      return {
        emailAddress: {
          address: email,
          name
        },
        type: attendee.type === "optional" ? ("optional" as const) : ("required" as const)
      };
    })
    .filter((attendee) => attendee.emailAddress.address);
}

function validateMeetingInput(input: CreateTeamsMeetingInput, authMode: GraphAuthMode): string[] {
  const errors: string[] = [];
  const subject = input.subject?.trim() ?? "";
  const startDateTime = normalizeDateTimeValue(input.startDateTime ?? "");
  const endDateTime = normalizeDateTimeValue(input.endDateTime ?? "");
  const attendees = normalizeAttendees(input.attendees);
  const recurrence = normalizeRecurrence(input.recurrence, input);

  if (!subject) {
    errors.push("subject is required.");
  }

  if (!startDateTime || Number.isNaN(parseDateTimeMs(startDateTime))) {
    errors.push("startDateTime must be a valid ISO date/time value.");
  }

  if (!endDateTime || Number.isNaN(parseDateTimeMs(endDateTime))) {
    errors.push("endDateTime must be a valid ISO date/time value.");
  }

  if (!Number.isNaN(parseDateTimeMs(startDateTime)) && !Number.isNaN(parseDateTimeMs(endDateTime))) {
    if (parseDateTimeMs(endDateTime) <= parseDateTimeMs(startDateTime)) {
      errors.push("endDateTime must be after startDateTime.");
    }
  }

  if (!attendees.length) {
    errors.push("attendees must include at least one email address.");
  }

  const invalidAttendee = attendees.find((attendee) => !isValidEmail(attendee.emailAddress.address));

  if (invalidAttendee) {
    errors.push(`Invalid attendee email address: ${invalidAttendee.emailAddress.address}.`);
  }

  if (recurrence) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recurrence.startDate)) {
      errors.push("recurrence.startDate must use YYYY-MM-DD format.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(recurrence.endDate)) {
      errors.push("recurrence.endDate must use YYYY-MM-DD format.");
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(recurrence.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(recurrence.endDate)) {
      if (recurrence.endDate < recurrence.startDate) {
        errors.push("recurrence.endDate must be on or after recurrence.startDate.");
      }
    }

    if (recurrence.frequency === "weekly" && recurrence.daysOfWeek.length === 0) {
      errors.push("recurrence.daysOfWeek must include at least one day for weekly meetings.");
    }
  }

  if (authMode === "client_credentials") {
    const organizerEmail = input.organizerEmail?.trim() || getSecretProvider().getGraphOrganizerEmail();

    if (!organizerEmail || !isValidEmail(organizerEmail)) {
      errors.push(
        "organizerEmail is required for client credentials because Microsoft Graph /me is only available with delegated user tokens."
      );
    }
  }

  return errors;
}

function validateClientCredentialsConfig(): void {
  const credentials = getSecretProvider().getMicrosoftGraphClientCredentials();
  const missing = [
    credentials.tenantId ? "" : "TENANT_ID",
    credentials.clientId ? "" : "CLIENT_ID",
    credentials.clientSecret ? "" : "CLIENT_SECRET"
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new MicrosoftGraphConfigError(missing.map((name) => `${name} is required.`));
  }
}

function getGraphErrorDetails(body: GraphErrorBody | null): string[] {
  return [body?.error?.code ? `Graph code: ${body.error.code}` : "", body?.error?.message ?? ""].filter(
    Boolean
  );
}

async function getClientCredentialsAccessToken(): Promise<string> {
  validateClientCredentialsConfig();

  const credentials = getSecretProvider().getMicrosoftGraphClientCredentials();
  const tenantId = credentials.tenantId;
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: "client_credentials",
        // The .default scope uses the application permissions granted to the Entra app registration.
        scope: graphScope
      }),
      signal: AbortSignal.timeout(15000)
    }
  );
  const body = (await response.json().catch(() => null)) as GraphTokenResponse | null;

  if (!response.ok || !body?.access_token) {
    throw new MicrosoftGraphApiError(
      response.status,
      body?.error ?? "entra_token_failed",
      "Microsoft Entra ID did not return an access token.",
      [body?.error_description ?? "Check CLIENT_ID, TENANT_ID, CLIENT_SECRET, and admin consent."].filter(
        Boolean
      )
    );
  }

  return body.access_token;
}

function buildGraphEventEndpoint(input: CreateTeamsMeetingInput, authMode: GraphAuthMode): string {
  if (authMode === "delegated") {
    // Microsoft Graph /me is only valid when the caller provides a delegated user token.
    return `${graphBaseUrl}/me/calendar/events`;
  }

  const organizerEmail = input.organizerEmail?.trim() || getSecretProvider().getGraphOrganizerEmail();

  return `${graphBaseUrl}/users/${encodeURIComponent(organizerEmail)}/calendar/events`;
}

function buildGraphEventLookupEndpoint(
  input: CreateTeamsMeetingInput,
  authMode: GraphAuthMode,
  eventId: string
): string {
  const selectedFields =
    "$select=id,subject,webLink,start,end,attendees,isOnlineMeeting,onlineMeetingProvider,onlineMeeting";

  if (authMode === "delegated") {
    return `${graphBaseUrl}/me/events/${encodeURIComponent(eventId)}?${selectedFields}`;
  }

  const organizerEmail = input.organizerEmail?.trim() || getSecretProvider().getGraphOrganizerEmail();

  return `${graphBaseUrl}/users/${encodeURIComponent(organizerEmail)}/events/${encodeURIComponent(eventId)}?${selectedFields}`;
}

function buildMeetingAttendeeResults(
  graphAttendees: GraphAttendeeResponse[] | undefined,
  fallbackAttendees: NormalizedAttendee[]
): TeamsMeetingAttendeeResult[] {
  const returnedAttendees = (graphAttendees ?? [])
    .map((attendee) => {
      const email = attendee.emailAddress?.address?.trim() ?? "";
      const name = attendee.emailAddress?.name?.trim() || email;

      return {
        email,
        name,
        type: attendee.type?.trim() || "required",
        responseStatus: attendee.status?.response?.trim() || undefined
      };
    })
    .filter((attendee) => attendee.email);

  if (returnedAttendees.length > 0) {
    return returnedAttendees;
  }

  return fallbackAttendees.map((attendee) => ({
    email: attendee.emailAddress.address,
    name: attendee.emailAddress.name,
    type: attendee.type
  }));
}

function buildGraphRecurrence(input: CreateTeamsMeetingInput) {
  const recurrence = normalizeRecurrence(input.recurrence, input);

  if (!recurrence) {
    return {};
  }

  const startDay = Number.parseInt(recurrence.startDate.slice(8, 10), 10);
  const pattern =
    recurrence.frequency === "daily"
      ? {
          type: "daily",
          interval: recurrence.interval
        }
      : recurrence.frequency === "monthly"
        ? {
            type: "absoluteMonthly",
            interval: recurrence.interval,
            dayOfMonth: Number.isFinite(startDay) ? startDay : 1
          }
        : {
            type: "weekly",
            interval: recurrence.interval,
            daysOfWeek: recurrence.daysOfWeek,
            firstDayOfWeek: "monday"
          };

  return {
    recurrence: {
      pattern,
      range: {
        type: "endDate",
        startDate: recurrence.startDate,
        endDate: recurrence.endDate,
        recurrenceTimeZone: recurrence.timeZone
      }
    }
  };
}

function buildGraphEventPayload(input: CreateTeamsMeetingInput) {
  const attendees = normalizeAttendees(input.attendees);
  const bodyContent = input.bodyHtml?.trim() || input.bodyText?.trim();

  return {
    subject: input.subject?.trim(),
    start: {
      dateTime: normalizeDateTimeValue(input.startDateTime ?? ""),
      timeZone: input.timeZone?.trim() || defaultMeetingTimeZone
    },
    end: {
      dateTime: normalizeDateTimeValue(input.endDateTime ?? ""),
      timeZone: input.timeZone?.trim() || defaultMeetingTimeZone
    },
    attendees,
    // These two fields ask Exchange/Teams to attach a Teams meeting to the calendar event.
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
    allowNewTimeProposals: true,
    ...buildGraphRecurrence(input),
    ...(bodyContent
      ? {
          body: {
            contentType: input.bodyHtml?.trim() ? "HTML" : "Text",
            content: bodyContent
          }
        }
      : {}),
    ...(input.transactionId?.trim() ? { transactionId: input.transactionId.trim() } : {})
  };
}

async function fetchGraphEvent(
  endpoint: string,
  accessToken: string,
  timeZone: string
): Promise<GraphEventResponse> {
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      Prefer: `outlook.timezone="${timeZone}"`
    },
    signal: AbortSignal.timeout(15000)
  });
  const body = (await response.json().catch(() => null)) as GraphEventResponse | GraphErrorBody | null;

  if (!response.ok) {
    throw new MicrosoftGraphApiError(
      response.status,
      "graph_event_lookup_failed",
      `Microsoft Graph returned HTTP ${response.status} while reading the created event.`,
      getGraphErrorDetails(body as GraphErrorBody | null)
    );
  }

  return body as GraphEventResponse;
}

export async function createTeamsCalendarEvent(
  input: CreateTeamsMeetingInput,
  authorizationHeader: string | null
): Promise<CreateTeamsMeetingResult> {
  const delegatedAccessToken = getBearerTokenFromHeader(authorizationHeader);
  const requestedAuthMode = input.authMode ?? (delegatedAccessToken ? "delegated" : "client_credentials");
  const authMode: GraphAuthMode = requestedAuthMode === "delegated" ? "delegated" : "client_credentials";
  const validationErrors = validateMeetingInput(input, authMode);

  if (validationErrors.length > 0) {
    throw new MicrosoftGraphValidationError(validationErrors);
  }

  if (authMode === "delegated" && !delegatedAccessToken) {
    throw new MicrosoftGraphValidationError([
      "Delegated mode requires an Authorization: Bearer <access_token> header with Calendars.ReadWrite permission."
    ]);
  }

  const accessToken =
    authMode === "delegated" ? delegatedAccessToken : await getClientCredentialsAccessToken();
  const timeZone = input.timeZone?.trim() || defaultMeetingTimeZone;
  const endpoint = buildGraphEventEndpoint(input, authMode);
  const normalizedAttendees = normalizeAttendees(input.attendees);
  const eventPayload = buildGraphEventPayload(input);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: `outlook.timezone="${timeZone}"`
    },
    body: JSON.stringify(eventPayload),
    signal: AbortSignal.timeout(20000)
  });
  const responseBody = (await response.json().catch(() => null)) as
    GraphEventResponse | GraphErrorBody | null;

  if (!response.ok) {
    throw new MicrosoftGraphApiError(
      response.status,
      "graph_event_create_failed",
      `Microsoft Graph returned HTTP ${response.status} while creating the Teams meeting.`,
      getGraphErrorDetails(responseBody as GraphErrorBody | null)
    );
  }

  const createdEvent = responseBody as GraphEventResponse;

  if (!createdEvent.id) {
    throw new MicrosoftGraphApiError(
      502,
      "graph_event_missing_id",
      "Microsoft Graph created an event response without an event ID.",
      ["The Teams meeting could not be tracked by the portal."]
    );
  }

  const eventWithOnlineMeeting = createdEvent.onlineMeeting?.joinUrl
    ? createdEvent
    : await fetchGraphEvent(
        buildGraphEventLookupEndpoint(input, authMode, createdEvent.id),
        accessToken,
        timeZone
      );
  const joinUrl =
    eventWithOnlineMeeting.onlineMeeting?.joinUrl ?? eventWithOnlineMeeting.onlineMeetingUrl ?? "";

  if (!joinUrl) {
    throw new MicrosoftGraphApiError(
      502,
      "graph_event_missing_join_url",
      "Microsoft Graph created the calendar event but did not return a Teams join URL.",
      [
        "Verify the organizer mailbox supports Teams meetings and the tenant allows teamsForBusiness online meetings."
      ]
    );
  }

  return {
    eventId: eventWithOnlineMeeting.id ?? createdEvent.id,
    joinUrl,
    webLink: eventWithOnlineMeeting.webLink ?? createdEvent.webLink ?? "",
    subject: eventWithOnlineMeeting.subject ?? input.subject?.trim() ?? "",
    start: {
      dateTime:
        eventWithOnlineMeeting.start?.dateTime ??
        createdEvent.start?.dateTime ??
        normalizeDateTimeValue(input.startDateTime ?? ""),
      timeZone: eventWithOnlineMeeting.start?.timeZone ?? createdEvent.start?.timeZone ?? timeZone
    },
    end: {
      dateTime:
        eventWithOnlineMeeting.end?.dateTime ??
        createdEvent.end?.dateTime ??
        normalizeDateTimeValue(input.endDateTime ?? ""),
      timeZone: eventWithOnlineMeeting.end?.timeZone ?? createdEvent.end?.timeZone ?? timeZone
    },
    attendees: buildMeetingAttendeeResults(
      eventWithOnlineMeeting.attendees ?? createdEvent.attendees,
      normalizedAttendees
    ),
    isOnlineMeeting: Boolean(eventWithOnlineMeeting.isOnlineMeeting ?? createdEvent.isOnlineMeeting),
    onlineMeetingProvider:
      eventWithOnlineMeeting.onlineMeetingProvider ??
      createdEvent.onlineMeetingProvider ??
      "teamsForBusiness",
    endpoint,
    authMode
  };
}
