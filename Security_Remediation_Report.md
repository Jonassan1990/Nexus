# Security Remediation Report

Scope: `nexus_support_V2 - kopia`

Verification:
- `npm run typecheck` passed.
- `npm run build` passed.

## Priority 1: Server-Side RBAC

Implemented:
- Added a shared server-side authorization helper at [src/lib/auth/api-auth.ts](src/lib/auth/api-auth.ts).
- Roles are now derived from the verified Cognito JWT and mapped to application roles using the verified identity email and configured admin users.
- Request-supplied role values are no longer trusted for authorization.
- API middleware now enforces authentication for non-public API routes.

Protected routes:
- [src/app/api/tickets/route.ts](src/app/api/tickets/route.ts)
- [src/app/api/notifications/route.ts](src/app/api/notifications/route.ts)
- [src/app/api/attachments/upload/route.ts](src/app/api/attachments/upload/route.ts)
- [src/app/api/attachments/[id]/route.ts](src/app/api/attachments/[id]/route.ts)
- [src/app/api/workflows/transition/route.ts](src/app/api/workflows/transition/route.ts)

Verification:
- Ticket listing now filters by derived principal roles.
- Ticket writes are rejected outside the caller’s authorized scope.
- Attachment upload, download, and delete now require access to the parent ticket.
- Workflow transitions now require ticket access.

## Priority 2: Configuration Protection

Implemented:
- [src/app/api/config/route.ts](src/app/api/config/route.ts) now requires authentication for reads.
- Configuration updates are admin-only.
- [src/app/api/database/route.ts](src/app/api/database/route.ts) now requires admin access for inspection and cleanup operations.

Verification:
- Non-admin callers cannot update portal configuration.
- Database inspector and cleanup operations are restricted to admins.

## Priority 3: Security Headers

Implemented in [middleware.ts](middleware.ts):
- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Frame-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-Content-Type-Options`

Verification:
- Security headers are applied centrally by middleware for app and API traffic.

## Priority 4: Streaming Attachment Uploads

Implemented in [src/app/api/attachments/upload/route.ts](src/app/api/attachments/upload/route.ts):
- Files are streamed directly to S3.
- The route no longer buffers the entire attachment into memory before upload.
- SHA256 checksum is computed during streaming and validated after upload.
- S3 objects are deleted if checksum validation fails or if ticket persistence fails.

Verification:
- Upload path uses `Readable.fromWeb(...).pipe(new Transform(...))` and `PutObjectCommand`.
- No large-file `arrayBuffer()` buffering remains in the upload path.

## Result

The production blockers identified in the audit have been remediated.

