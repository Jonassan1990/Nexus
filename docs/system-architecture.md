# Nexus-support portal System Architecture

## Assumptions

- Official Scania Tegel package tokens are not present in this repository, so the
  implementation uses Tegel-inspired CSS variables that should be mapped to
  official tokens when available.
- Entra ID, Jira, email, Teams, local database, and object storage integrations
  are represented as architecture boundaries in this prototype. No external SDK
  methods are invented or called.
- PostgreSQL-compatible DDL is provided for local PostgreSQL and Aurora
  PostgreSQL targets.

## Frontend

- Next.js App Router with React and TypeScript.
- Responsive app shell with desktop multi-column layouts, tablet stacking,
  mobile-friendly controls, and a dedicated `/tv` wallboard.
- Components read typed configuration from domain data and API route shapes:
  ticket types, workflows, roles, SLA policies, Jira metadata, visibility
  levels, attachment relations, and master data remain configurable.
- Visibility is modeled in UI and API responses. Backend filtering must remain
  authoritative in production.

## Backend Modules

- Ticket service: ticket lifecycle, dynamic fields, comments, attachment
  relations, participant access, and status transitions.
- Workflow service: templates, gates, parallel approvals, optional approvals,
  delegation, clarification loops, SLA timers, and re-review flows.
- Clarification service: structured questions, threaded responses, attachments,
  reopen logic, and contextual timeline rendering.
- Escalation service: SLA, technical, business, and management escalation
  branches with mitigation and decision history.
- Jira integration service: metadata loading, draft review, developer
  estimation, release approval, create/update sync, comments, attachments,
  assignee, sprint, status, and resolution sync.
- Notification service: in-app and email first, Teams integration as a future
  delivery adapter.
- Audit service: immutable append-only activity log for changes, approvals,
  escalations, participant changes, Jira sync events, and visibility decisions.
- Admin service: products, PRUs, sites, ticket types, workflows, roles,
  permissions, SLA policies, Jira mappings, notification templates, and
  escalation matrices.

## Event-Driven Design

Recommended initial shape:

- API request validates command and writes transactional state change.
- Same transaction appends an audit event and an outbox event.
- Background worker drains the outbox and sends notifications or Jira sync jobs.
- Jira sync results append audit records and update sync state.

This keeps the local database authoritative while allowing future migration to
queue-backed workers or microservices.

## Security

- Use Entra ID for authentication.
- Enforce RBAC and ticket-scoped participant permissions in backend services.
- Treat frontend role switching in this prototype as a visualization only.
- Apply visibility filters before returning comments, audit entries, Jira data,
  and attachment metadata.
- Store attachments with checksum, content type, size, relation type, uploader,
  and storage provider metadata. Keep object keys opaque.
- Log structured security events for participant grants, expiry, and access
  denials.

## Observability

- Use structured logs with correlation IDs for every command and workflow event.
- Track metrics for approval latency, SLA timer state, Jira sync failures,
  notification delivery, clarification reopen rate, and escalation age.
- Capture audit logs as business-compliance history, not as application logs.

## Storage Strategy

- Start with PostgreSQL and local file/object metadata.
- Keep attachment metadata independent from physical storage.
- Use `storage_provider`, `bucket_name`, `object_key`, `local_path`, `checksum`,
  and `content_type` fields so migration to S3 or compatible object storage is a
  metadata/configuration change rather than a schema redesign.

## Jira Integration Boundary

Nexus-support portal is the governance layer. Jira is the execution layer.

Before Jira creation:

- Load project, board, sprint, component, fix version, priority, and assignee
  metadata from Jira.
- Keep a Jira draft inside Nexus-support portal.
- Run architecture, developer estimation, and release gates.
- Create Jira only after governance approval.

After Jira creation:

- Sync status, comments, attachments, assignee, sprint, fix version, and
  resolution back to Nexus-support portal.
- Preserve portal audit history as the authoritative governance trace.
