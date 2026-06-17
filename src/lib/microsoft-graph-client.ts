import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type Configuration
} from "@azure/msal-browser";

const graphBaseUrl = "https://graph.microsoft.com/v1.0";
const defaultTimeZone = "Europe/Stockholm";
const graphScopes = ["User.Read", "Calendars.ReadWrite", "OnlineMeetings.ReadWrite"];
const localIntegrationSecretsStorageKey = "nexus-integration-secrets-v1";

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
};

class MicrosoftGraphClientError extends Error {
  constructor(
    message: string,
    public readonly details: string[] = []
  ) {
    super(message);
  }
}

let graphClient: PublicClientApplication | null = null;
let graphClientInit: Promise<PublicClientApplication> | null = null;
let graphClientConfigKey = "";

function readLocalEntraConfig(): { clientId: string; tenantId: string; redirectUri: string } {
  if (typeof window === "undefined") {
    return { clientId: "", tenantId: "", redirectUri: "" };
  }

  try {
    const savedSecrets = window.localStorage.getItem(localIntegrationSecretsStorageKey);
    const parsedSecrets = savedSecrets ? JSON.parse(savedSecrets) as {
      entraClientId?: string;
      entraTenantId?: string;
      entraRedirectUri?: string;
    } : {};

    return {
      clientId: parsedSecrets.entraClientId?.trim() ?? "",
      tenantId: parsedSecrets.entraTenantId?.trim() ?? "",
      redirectUri: parsedSecrets.entraRedirectUri?.trim() ?? ""
    };
  } catch {
    return { clientId: "", tenantId: "", redirectUri: "" };
  }
}

function getMicrosoftGraphConfig(): { clientId: string; tenantId: string; redirectUri: string } {
  const localConfig = readLocalEntraConfig();
  const envClientId = (
    process.env.NEXT_PUBLIC_MICROSOFT_GRAPH_CLIENT_ID ??
    process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ??
    ""
  ).trim();
  const envTenantId = (
    process.env.NEXT_PUBLIC_MICROSOFT_GRAPH_TENANT_ID ??
    process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID ??
    ""
  ).trim();
  const clientId = localConfig.clientId || envClientId;
  const tenantId = localConfig.tenantId || envTenantId;
  const redirectUri =
    localConfig.redirectUri ||
    (process.env.NEXT_PUBLIC_MICROSOFT_GRAPH_REDIRECT_URI ?? "").trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const missing = [
    clientId ? "" : "NEXT_PUBLIC_MICROSOFT_GRAPH_CLIENT_ID",
    tenantId ? "" : "NEXT_PUBLIC_MICROSOFT_GRAPH_TENANT_ID"
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new MicrosoftGraphClientError(
      "Microsoft Graph sign-in is not configured.",
      missing.map((name) => `${name} is required.`)
    );
  }

  return { clientId, tenantId, redirectUri };
}

async function getMsalClient(): Promise<PublicClientApplication> {
  if (typeof window === "undefined") {
    throw new MicrosoftGraphClientError("Microsoft Graph sign-in is only available in the browser.");
  }

  const { clientId, tenantId, redirectUri } = getMicrosoftGraphConfig();
  const nextConfigKey = [clientId, tenantId, redirectUri].join("|");

  if (graphClientConfigKey && graphClientConfigKey !== nextConfigKey) {
    graphClient = null;
    graphClientInit = null;
  }

  if (graphClient) {
    return graphClient;
  }

  if (!graphClientInit) {
    graphClientInit = (async () => {
      const configuration: Configuration = {
        auth: {
          clientId,
          authority: `https://login.microsoftonline.com/${tenantId}`,
          redirectUri
        },
        cache: {
          cacheLocation: "sessionStorage"
        }
      };
      const client = new PublicClientApplication(configuration);

      await client.initialize();
      graphClient = client;
      graphClientConfigKey = nextConfigKey;

      return client;
    })();
  }

  return graphClientInit;
}

function selectGraphAccount(accounts: AccountInfo[]): AccountInfo | null {
  if (accounts.length === 0) {
    return null;
  }

  return accounts[0];
}

export async function getGraphToken(): Promise<string> {
  const client = await getMsalClient();
  const activeAccount = client.getActiveAccount() ?? selectGraphAccount(client.getAllAccounts());

  if (!activeAccount) {
    const loginResult = await client.loginPopup({ scopes: graphScopes });

    client.setActiveAccount(loginResult.account);

    if (!loginResult.accessToken) {
      throw new MicrosoftGraphClientError("Microsoft Graph sign-in did not return an access token.");
    }

    return loginResult.accessToken;
  }

  try {
    const silentResult = await client.acquireTokenSilent({
      account: activeAccount,
      scopes: graphScopes
    });

    client.setActiveAccount(silentResult.account);

    if (!silentResult.accessToken) {
      throw new MicrosoftGraphClientError("Microsoft Graph silent token acquisition did not return an access token.");
    }

    return silentResult.accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) {
      throw error;
    }

    const popupResult = await client.acquireTokenPopup({
      account: activeAccount,
      scopes: graphScopes
    });

    client.setActiveAccount(popupResult.account);

    if (!popupResult.accessToken) {
      throw new MicrosoftGraphClientError("Microsoft Graph token popup did not return an access token.");
    }

    return popupResult.accessToken;
  }
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
      eventWithOnlineMeeting.onlineMeetingProvider ?? createdEvent.onlineMeetingProvider ?? ""
  };
}
