# Microsoft Graph Teams Meeting API

Backend route:

```text
POST /api/integrations/microsoft-graph/teams-meeting
```

## Environment

Required for client credentials:

```bash
CLIENT_ID="<entra-application-client-id>"
TENANT_ID="<entra-tenant-id>"
CLIENT_SECRET="<entra-client-secret>"
GRAPH_ORGANIZER_EMAIL="organizer@company.com"
```

`GRAPH_ORGANIZER_EMAIL` can be omitted when each request provides `organizerEmail`.

Required Microsoft Graph application permission:

```text
Calendars.ReadWrite
```

Grant admin consent for the application permission. For least privilege, limit mailbox access with an Exchange application access policy when this is used in production.

## Request Body

```json
{
  "subject": "Team Meeting",
  "startDateTime": "2026-06-20T10:00:00",
  "endDateTime": "2026-06-20T11:00:00",
  "timeZone": "Europe/Stockholm",
  "organizerEmail": "organizer@company.com",
  "attendees": ["user@example.com"]
}
```

Attendees can also include names:

```json
{
  "attendees": [
    {
      "email": "user@example.com",
      "name": "User",
      "type": "required"
    }
  ]
}
```

Recurring meeting series can include `recurrence`:

```json
{
  "subject": "Escalation follow-up",
  "startDateTime": "2026-06-15T14:40:00",
  "endDateTime": "2026-06-15T15:00:00",
  "timeZone": "Europe/Stockholm",
  "organizerEmail": "organizer@company.com",
  "attendees": ["user@example.com"],
  "recurrence": {
    "frequency": "daily",
    "interval": 1,
    "startDate": "2026-06-15",
    "endDate": "2026-06-18",
    "timeZone": "Europe/Stockholm"
  }
}
```

Weekly series should include `daysOfWeek`, for example:

```json
{
  "recurrence": {
    "frequency": "weekly",
    "interval": 1,
    "daysOfWeek": ["monday", "wednesday"],
    "startDate": "2026-06-15",
    "endDate": "2026-06-30",
    "timeZone": "Europe/Stockholm"
  }
}
```

## Client Credentials Example

Client credentials cannot use `/me` in Microsoft Graph because there is no signed-in user. The API creates the event in `/users/{organizerEmail}/calendar/events`.

```bash
curl -X POST "http://localhost:3000/api/integrations/microsoft-graph/teams-meeting" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Team Meeting",
    "startDateTime": "2026-06-20T10:00:00",
    "endDateTime": "2026-06-20T11:00:00",
    "timeZone": "Europe/Stockholm",
    "organizerEmail": "organizer@company.com",
    "attendees": [
      { "email": "user@example.com", "name": "User" }
    ]
  }'
```

Smoke-test payload using app-only client credentials:

```bash
curl -X POST "http://localhost:3000/api/integrations/microsoft-graph/teams-meeting" \
  -H "Content-Type: application/json" \
  -d '{
    "authMode": "client_credentials",
    "organizerEmail": "organizer@company.com",
    "subject": "Graph API smoke test",
    "startDateTime": "2026-06-18T09:00:00",
    "endDateTime": "2026-06-18T09:30:00",
    "timeZone": "W. Europe Standard Time",
    "attendees": ["test-user@company.com"]
  }'
```

## Delegated `/me` Example

Delegated mode uses the caller's access token and calls `/me/calendar/events`.

```bash
curl -X POST "http://localhost:3000/api/integrations/microsoft-graph/teams-meeting" \
  -H "Authorization: Bearer <delegated-access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "authMode": "delegated",
    "subject": "Team Meeting",
    "startDateTime": "2026-06-20T10:00:00",
    "endDateTime": "2026-06-20T11:00:00",
    "timeZone": "Europe/Stockholm",
    "attendees": ["user@example.com"]
  }'
```

The delegated token must include `Calendars.ReadWrite`.

## Successful Response

```json
{
  "data": {
    "eventId": "AAMk...",
    "subject": "Team Meeting",
    "start": {
      "dateTime": "2026-06-20T10:00:00.0000000",
      "timeZone": "Europe/Stockholm"
    },
    "end": {
      "dateTime": "2026-06-20T11:00:00.0000000",
      "timeZone": "Europe/Stockholm"
    },
    "joinUrl": "https://teams.microsoft.com/l/meetup-join/...",
    "attendees": [
      {
        "email": "user@example.com",
        "name": "User",
        "type": "required",
        "responseStatus": "none"
      }
    ],
    "webLink": "https://outlook.office365.com/...",
    "isOnlineMeeting": true,
    "onlineMeetingProvider": "teamsForBusiness",
    "authMode": "client_credentials"
  }
}
```
