# Production Readiness Report

Scope: `nexus_support_V2 - kopia`

Verification completed:
- `npm run typecheck` passed.
- `npm run build` passed.
- Code review of auth, API routes, attachment storage, and configuration handling.

## Executive Verdict

**NO**

The application is not ready for an internal enterprise production pilot because server-side authorization is still incomplete. Authenticated users can reach role-sensitive APIs, but the server does not derive an authoritative application role from the Cognito session. In addition, the app does not set baseline security headers.

## Scores

| Section | Score | Status |
| --- | ---: | --- |
| Infrastructure | 8/10 | Pass with caveats |
| Application | 4/10 | Fail |
| Security | 3/10 | Fail |
| Performance | 7/10 | Pass with caveats |
| Reliability | 6/10 | Pass with caveats |

## Findings

### 1. Critical: Server-side RBAC is still not enforced

**Severity:** Critical  
**Impact:** A low-privilege authenticated user can request a higher `role` value and receive visibility they should not have. Admin configuration also has no server-side admin check.

**Evidence:**
- `src/app/api/tickets/route.ts:111-140` reads `role` directly from the query string and uses it to filter comments and audit entries.
- `src/app/api/notifications/route.ts:12-22` does the same for notification visibility.
- `src/app/api/config/route.ts:74-123` exposes `GET` and `PUT` with no authorization check beyond basic request shape validation.

**Why this matters:**  
The Cognito session establishes identity, but the server does not derive or verify an application role from that identity. Because the `role` value is browser-controlled, the server cannot trust it for visibility decisions. This is a direct authorization bypass for role-scoped data.

**Required fix:**  
Resolve the user’s application role server-side from the authenticated identity and enforce it on every role-sensitive route. Do not accept `role` from the browser for authorization.

### 2. High: No baseline security headers are configured

**Severity:** High  
**Impact:** The app lacks defense-in-depth protections against clickjacking, content injection, referrer leakage, and related browser-side abuse.

**Evidence:**
- `next.config.ts:3-17` only defines rewrites and build settings.
- `middleware.ts:32-56` only performs auth redirect handling; it does not add response security headers.
- Repo search found no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy` configuration.

**Required fix:**  
Add production security headers at the edge or through Next.js response headers.

### 3. Medium: Attachment upload still buffers the full file in memory

**Severity:** Medium  
**Impact:** The upload path reads the full attachment into memory before sending to S3, which increases ECS memory pressure under concurrent uploads.

**Evidence:**
- `src/app/api/attachments/upload/route.ts:130-153` loads the entire file via `await fileEntry.arrayBuffer()` and then `Buffer.from(...)`.
- The upload limit is `100 MB` (`src/lib/attachment-storage.ts`), so the process can hold large in-memory payloads at peak.

**Required fix:**  
Stream large uploads to S3 instead of buffering the entire body in memory.

## Positive Verification

- Attachments are stored in S3 with Aurora holding metadata only.
- Ticket persistence uses the database abstraction and the Aurora path hydrates attachment download URLs from metadata.
- The app builds successfully after the middleware hardening change.

## Section Notes

### Infrastructure

Score: **8/10**

What is in place:
- Aurora connection handling is present in `src/lib/platform-secrets.ts`.
- S3 attachment storage is implemented in `src/lib/attachment-storage.ts`.
- Terraform validation passed in the infrastructure repo during the last deployment cycle.

Main caveat:
- Secret rotation support is not visible in application code; secrets are read from environment or injected JSON at process start.

### Application

Score: **4/10**

What is in place:
- Ticket, config, and attachment flows are implemented.
- `npm run build` completed successfully.

Main blocker:
- Authorization is not enforced server-side for role-sensitive data and admin configuration.

### Security

Score: **3/10**

Main blockers:
- Server-side RBAC trust boundary is broken.
- No baseline security headers are configured.

### Performance

Score: **7/10**

What is acceptable:
- Build output is clean.
- The app is structurally ready for ECS deployment.

Main caveat:
- Large attachment uploads are still memory-buffered.

### Reliability

Score: **6/10**

What is acceptable:
- Build and typecheck pass.
- S3-backed attachment persistence is wired into the app.

Main caveat:
- The code does not demonstrate explicit application-level fallback for transient Cognito, Aurora, or S3 unavailability beyond normal request failure handling.

