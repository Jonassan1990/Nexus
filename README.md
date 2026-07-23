# Nexus-support portal

Modern enterprise governance and support portal prototype built with Next.js,
React, and TypeScript.

The UI uses Tegel-inspired design tokens that are ready to map to official
Scania Tegel values when those package tokens are available in the environment.
Business configuration lives in typed data structures and API-shaped modules so
ticket types, workflows, PRUs, products, sites, roles, SLA policies, and Jira
mappings are not hardcoded in presentational components.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

The portal opens directly — no sign-in screen. Select your persona from the header profile menu.
This is suitable for local demonstrations only. Before exposing the portal outside a trusted
network, configure an organisation-managed identity provider, enforce server-side authorisation,
and move integration credentials out of browser storage.

Tickets and admin configuration persist to a local SQLite database at
`db/nexus-local.sqlite` by default. Set `NEXUS_LOCAL_DB_PATH` to use a different
local database file. The generated SQLite files are intentionally ignored by git.

## Useful routes

- `/` - Nexus-support portal operational workspace
- `/tv` - SLA and escalation wallboard view
- `/api/tickets` - ticket list API shape
- `/api/workflows` - workflow template API shape
- `/api/notifications` - notification API shape
- `/api/health` - unauthenticated liveness endpoint for load balancers

## Quality checks

```powershell
npm run lint
npm run typecheck
npm run build
```

`npm run ci` runs the same checks in sequence. Formatting is configured through Prettier:
use `npm run format:check` in CI or `npm run format` to apply the configured style.

## Deployment prerequisites

- Node.js 20.9 or newer (Node 22 is used in CI)
- Persistent storage for SQLite, or a production database migration before horizontal scaling
- A deployment value for `NEXUS_APP_URL`
- Managed secrets for Microsoft Graph, Jira, GitLab, SMTP, and AI integrations
- Organisation identity provider and server-side authorisation before public deployment

## Architecture artifacts

- `docs/system-architecture.md`
- `db/schema.sql`
