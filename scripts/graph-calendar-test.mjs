import dotenv from "dotenv";

dotenv.config({ quiet: true });

const tenantId = process.env.TENANT_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const mailbox =
  process.env.GRAPH_CALENDAR_MAILBOX ||
  process.env.GRAPH_ORGANIZER_EMAIL ||
  "nexusportal@scania.com";

const graphBaseUrl = "https://graph.microsoft.com/v1.0";

function requireEnv(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error("Missing required environment variable: " + name);
  }
}

function parseJsonOrText(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function formatGraphError(status, body) {
  const graphError = body && body.error ? body.error : {};
  const innerError = graphError.innerError || {};

  return {
    status: status,
    code: graphError.code || "UnknownError",
    message: graphError.message || JSON.stringify(body),
    requestId: innerError["request-id"] || innerError.requestId,
    clientRequestId: innerError["client-request-id"],
    date: innerError.date
  };
}

function logAccessFailure(error) {
  if (error.status === 403) {
    console.error("\n403 AccessDenied");
    console.error("Check these items:");
    console.error("- Calendars.ReadWrite is granted as an Application permission");
    console.error("- Admin consent has been granted for the application");
    console.error("- Any Exchange application access policy allows this mailbox");
    console.error("- The target mailbox exists and is reachable through Graph");
  }

  if (
    error.code === "Authorization_RequestDenied" ||
    error.code === "ErrorAccessDenied" ||
    /insufficient|privilege|permission|access denied/i.test(error.message || "")
  ) {
    console.error("\nInsufficient privileges detected.");
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = parseJsonOrText(text);

  if (!response.ok) {
    const error = formatGraphError(response.status, body);
    logAccessFailure(error);
    throw error;
  }

  return body;
}

async function getAccessToken() {
  const tokenEndpoint =
    "https://login.microsoftonline.com/" +
    encodeURIComponent(tenantId) +
    "/oauth2/v2.0/token";

  const form = new URLSearchParams();
  form.append("client_id", clientId);
  form.append("client_secret", clientSecret);
  form.append("scope", "https://graph.microsoft.com/.default");
  form.append("grant_type", "client_credentials");

  console.log("\nTOKEN REQUEST");
  console.log("POST " + tokenEndpoint);
  console.log("Content-Type: application/x-www-form-urlencoded");
  console.log("Body: client_id=<hidden>&client_secret=<hidden>&scope=https://graph.microsoft.com/.default&grant_type=client_credentials");

  const tokenResponse = await requestJson(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });

  if (!tokenResponse || !tokenResponse.access_token) {
    throw new Error("Token response did not include access_token.");
  }

  return tokenResponse.access_token;
}

async function readEvents(accessToken) {
  const url =
    graphBaseUrl +
    "/users/" +
    encodeURIComponent(mailbox) +
    "/events?$top=10&$orderby=start/dateTime";

  console.log("\nREAD EVENTS REQUEST");
  console.log("GET " + url);
  console.log("Authorization: Bearer <access_token>");
  console.log("Accept: application/json");

  const result = await requestJson(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + accessToken,
      Accept: "application/json"
    }
  });

  const events = result && result.value ? result.value : [];

  console.log("\nREAD EVENTS RESPONSE");
  console.log("Events returned: " + events.length);

  events.forEach(function (event) {
    console.log({
      id: event.id,
      subject: event.subject,
      start: event.start,
      end: event.end
    });
  });

  return result;
}

async function createTestEvent(accessToken) {
  const start = new Date(Date.now() + 10 * 60 * 1000);
  const end = new Date(Date.now() + 30 * 60 * 1000);

  const url =
    graphBaseUrl + "/users/" + encodeURIComponent(mailbox) + "/events";

  const payload = {
    subject: "Test Event from Nexus Portal",
    start: {
      dateTime: start.toISOString(),
      timeZone: "UTC"
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: "UTC"
    }
  };

  console.log("\nCREATE EVENT REQUEST");
  console.log("POST " + url);
  console.log("Authorization: Bearer <access_token>");
  console.log("Content-Type: application/json");
  console.log("Accept: application/json");
  console.log("Body:");
  console.log(JSON.stringify(payload, null, 2));

  const created = await requestJson(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  console.log("\nCREATE EVENT RESPONSE");
  console.log({
    id: created.id,
    subject: created.subject,
    webLink: created.webLink,
    start: created.start,
    end: created.end
  });

  return created;
}

async function main() {
  try {
    requireEnv("TENANT_ID", tenantId);
    requireEnv("CLIENT_ID", clientId);
    requireEnv("CLIENT_SECRET", clientSecret);

    console.log("Target mailbox: " + mailbox);

    const accessToken = await getAccessToken();
    await readEvents(accessToken);
    const createdEvent = await createTestEvent(accessToken);

    console.log("\nSUCCESS");
    console.log("Read access works: Graph returned the events endpoint successfully.");
    console.log("Write access works: Graph created an event with id " + createdEvent.id);
  } catch (error) {
    console.error("\nFAILED");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(JSON.stringify(error, null, 2));
    }
    process.exitCode = 1;
  }
}

main();
