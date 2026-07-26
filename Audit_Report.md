# ENTERPRISE PORTAL AUDIT REPORT

**Product:** Nexus Support Portal (`nexus-support-portal@0.1.0`)  
**Repository:** `nexus_support_V2 - kopia`  
**Audit date:** 2026-07-24  
**Assumed scale:** 50,000+ enterprise users  
**Review board posture:** Independent Architecture & Design Review — defect-first, non-encouraging  

**Scope reviewed:** UI/UX, IA, navigation, accessibility, architecture, security, performance, components, design-system compliance, production readiness.

**Primary evidence:**
- `package.json` (self-describes as “prototype”)
- `src/components/nexus/NexusPortal.tsx` (~42,905 lines; ~1.6 MB)
- `src/app/globals.css` (~14,173 lines)
- `src/app/layout.tsx`, `src/app/api/**` (23 route handlers)
- `src/lib/rbac.ts`, `src/lib/auth/**`, `src/components/auth/**`
- Scania Tegel `@scania/tegel@^1.59.1`
- Installed but largely unwired: TanStack Query/Table, React Hook Form, Zod

---

# Executive Summary

Nexus Support is a **dense Scania-branded governance/support SPA** with real integration surface area (Jira, GitLab, Microsoft Graph, SMTP, AI) and a credible industrial visual language (Tegel + Scania navy). It is **not** a production-ready enterprise portal for 50k users.

The product fails Fortune-500 readiness on three non-negotiable gates:

1. **Authorization is theater.** Roles are selected in the UI and passed as `?role=admin` / body fields. Server routes largely trust the client. This is disqualifying for SAP/IBM/Microsoft security review.
2. **Secrets live in the browser.** Integration tokens are persisted to `localStorage` (`nexus-integration-secrets-v1`). Any XSS becomes a credential breach.
3. **Architecture is a god object.** One client file owns UI, RBAC, integrations, admin, charts, and forms (~43k LOC). Maintainability, testability, and release risk are unacceptable at enterprise scale.

Visual maturity is above a typical hackathon demo because Tegel and Scania tokens create brand coherence. Structural maturity remains **Internal Tool / Startup MVP**. Auth code exists (`AuthProvider`, `AuthGate`, MSAL, ALB OIDC) but is **not mounted** in `layout.tsx`. There is **no `/login` route** despite redirects to it. TanStack Query/Table and RHF/Zod are installed and unused—signaling unfinished platformization.

**Verdict:** Do not ship to 50k users. Treat as a domain prototype with strong Scania chrome and weak enterprise foundations. Security and architecture remediation must precede visual polish.

---

# Overall Score

| Category | Score (1–10) | Target | Gap |
|---|---:|---:|---:|
| Visual Design | 6.0 | 8.5 | −2.5 |
| UX | 5.0 | 8.5 | −3.5 |
| UI | 5.5 | 8.5 | −3.0 |
| Navigation | 5.5 | 8.5 | −3.0 |
| Information Architecture | 4.5 | 8.5 | −4.0 |
| Accessibility | 5.0 | 9.0 | −4.0 |
| Performance | 3.5 | 8.5 | −5.0 |
| Architecture | 3.0 | 9.0 | −6.0 |
| Security | 2.0 | 9.5 | −7.5 |
| Maintainability | 2.5 | 8.5 | −6.0 |
| Scalability | 3.0 | 9.0 | −6.0 |
| Code Quality | 3.5 | 8.5 | −5.0 |
| Enterprise Feeling | 5.5 | 9.0 | −3.5 |
| Modern Feeling | 5.0 | 8.5 | −3.5 |
| Production Readiness | **2.5** | **9.0** | **−6.5** |
| **Weighted overall** | **4.1 / 10** | **8.8** | **−4.7** |

Security, architecture, and production readiness dominate the weighted score. Cosmetic improvements cannot raise production readiness without those gates.

---

# Maturity Level

**Chosen level (ONLY ONE): Internal Tool**

| Candidate | Why rejected / accepted |
|---|---|
| Prototype | Too much real domain surface (admin, Jira, escalations, workflows). |
| Proof of Concept | Exceeds PoC feature breadth. |
| **Internal Tool** | **Selected.** Usable by a known team with trusted network assumptions; auth optional; role switching for demo; SQLite; secrets in browser; package.json says prototype. |
| Startup MVP | Would require working auth gate, URL IA, and non-spoofable RBAC. |
| Scale-up Product | Fails multi-tenant ops, observability, CI test depth. |
| Enterprise Product | Fails security, a11y rigor, IA deep-linking, server authz. |
| World Class Enterprise Product | Not remotely applicable. |

---

# Enterprise Readiness

**Not ready.** Blocking gates:

| Gate | Status | Evidence |
|---|---|---|
| Enforced authentication | FAIL | `AuthProvider`/`AuthGate` unused in `layout.tsx`; no `/login` page |
| Server-side authorization | FAIL | Client `role` query/body trusted on tickets/database |
| Secret management | FAIL | Jira/GitLab/SMTP tokens in `localStorage` |
| Security headers | FAIL | `next.config.ts` has no CSP/HSTS/frame-ancestors |
| Horizontal scale data plane | FAIL | Local SQLite (`node:sqlite`), not enterprise HA store |
| Module code-split | FAIL | Entire portal is one client tree |
| Automated regression suite | FAIL | One Playwright a11y smoke; no unit/integration tests |
| Auditability of privileged actions | PARTIAL | Audit UI exists; server authz for audit trail incomplete |
| i18n completeness | FAIL | Shell en/sv; most admin/Jira/escalation copy hard-coded EN |
| Dark mode / forced-colors | FAIL | `colorScheme: "light"` only |
| Unauthenticated wallboard | FAIL | `/tv` reads DB with no auth |

Would this belong to IBM / Microsoft / SAP / Stripe / Vercel / Atlassian / Amazon / Google / Volvo / Scania **as a shipped product**?

| Company | Belongs? | Why |
|---|---|---|
| Scania (brand chrome) | **Partially** | Tegel + Scania Sans + navy is correct. Product governance is not. |
| Volvo / industrial OEM portal | No | Would require Entra SSO, server RBAC, SOC2-grade secret handling. |
| IBM | No | Carbon apps do not ship client-trusted admin APIs or 43k-LOC god components. |
| Microsoft | No | Fluent + Entra patterns require wired MSAL, Conditional Access, Graph least-privilege. |
| SAP Fiori | No | Fiori Launchpad expects intents/semantic objects, not in-memory module switches. |
| Stripe | No | Stripe-grade clarity, form validation, and API auth discipline absent. |
| Vercel | No | App Router used as SPA shell; no route-level architecture. |
| Atlassian | No | Ticket density without URL state, filters-as-query, or table virtualization. |
| Amazon | No | Fails operational excellence (observability, blast-radius isolation). |
| Google | No | Material density/motion/a11y rigor not met. |

**Closest honest label:** Scania-skinned **internal governance console**, not a Fortune-500 portal.

---

# UI Review

## What works
- Scania Tegel header/sidebar create immediate OEM credibility (vs generic shadcn purple demos).
- Dense dashboard aesthetic matches `MASTER.md` Density 8/10 intent.
- Sharp radius (`--radius: 0`) is consistent with industrial brand—not startup soft-UI.

## What fails

### 1. Brand lockup instability
Header brand recently mixed text-image, icon crop, and clipping. Header height 56px cannot host oversized marks.

**Reference:** Apple HIG — Layout & Visual Design (respect safe margins); Fluent — App bar density.  
**Recommendation:** Fixed brand slot: 32px icon + 16–18px title; never exceed `topbar-height − 12px`.

### 2. Custom CSS sprawl without token discipline
~14k lines of hand CSS with Tegel tokens mixed with one-off selectors. `MASTER.md` still contains non-Scania button examples (`#0369a1`, `border-radius: 8px`) that conflict with shipped chrome.

**Reference:** IBM Carbon token architecture; Fluent design tokens.  
**Recommendation:** Three-layer tokens (primitive → semantic → component). Delete conflicting MASTER examples or regenerate from Tegel.

### 3. Tables are HTML grids, not enterprise data grids
TanStack Table is installed and unused. Ticket/admin tables use `min-width: 1280px` + horizontal scroll.

**Reference:** Carbon Data Table; Fluent Data Grid; Atlassian Table.  
**Recommendation:** Virtualized TanStack Table with sticky headers, column visibility, density modes, keyboard nav.

### 4. Charts are CSS decoration
Pie/bar via CSS gradients. No Chart.js/Recharts, no data labels accessibility beyond `role="img"`.

**Reference:** Carbon Charts; Material charts a11y.  
**Recommendation:** Accessible chart library + data table fallback for every visualization (Fiori pattern).

### 5. Light-only
`viewport.colorScheme: "light"`, `body.tds-mode-light`. No dark theme, no high-contrast path beyond partial focus styles.

**Reference:** Fluent theme provider; Material dynamic color; Apple Dark Mode.  
**Recommendation:** Ship light + dark + high-contrast using Tegel modes if available; do not invent a second palette.

### 6. Visual hierarchy noise
Header packs search, locale, persona, notifications, Scania mark. Mobile collapses poorly relative to module count (15).

**Reference:** Linear / Notion — ruthless chrome reduction; Carbon header guidance.  
**Recommendation:** Promote global search; demote locale; bind persona to authenticated identity (remove demo switcher in prod).

---

# UX Review

## Information Architecture failure
Modules are an in-memory `activeModule` switch inside one SPA. No URL per module (except opportunistic ticket deep-links). Browser back, shareable links, and analytics funnels break.

**Reference:** SAP Fiori Launchpad (semantic objects/intents); Atlassian URL-state filters; Next.js App Router conventions.  
**Recommendation:** Routes like `/tickets`, `/tickets/[key]`, `/approvals`, `/admin/...` with search params for filters.

## Role-as-UX vs role-as-security
Persona dropdown teaches users that identity is a costume. Docs admit visualization-only switching—then APIs still accept role params. Users will believe they are “admin.”

**Reference:** Microsoft Entra / Fluent identity patterns; IBM security UX.  
**Recommendation:** Remove persona switcher in production builds. Show authenticated claims. Impersonation only as audited admin feature.

## Cognitive load
15 modules spanning requester → architecture → IT security → admin. Carbon Side Nav guidance: progressive disclosure; Fiori: role-based Launchpad tiles, not one infinite rail.

**Recommendation:** Role home + max 7 primary nav items; overflow to “More” / Launchpad groups.

## Forms
New ticket modal is sophisticated domain-wise (cascading product/PRU/site) but built on manual `useState`, not RHF+Zod. Error recovery, field-level a11y, and schema reuse across API/UI are weak.

**Reference:** Stripe Checkout form discipline; Carbon forms; RHF+Zod industry standard.  
**Recommendation:** Schema-first forms; shared Zod schemas between `/api/tickets` and UI.

## Empty / loading / error states
Sonner toasts exist. Loading/empty coverage is uneven across admin/integrations. No systematic skeleton language.

**Reference:** Carbon skeleton; Fluent shimmer; Notion progressive loading.  
**Recommendation:** Standardize `Loading`, `Empty`, `Error`, `Forbidden` primitives per module.

## Search
Header ticket search is useful but not a global command palette. Atlassian/Linear users expect `⌘K` across tickets, people, modules.

**Recommendation:** Command palette with recent, tickets, navigation intents.

---

# Accessibility Review

**WCAG 2.2 AA posture: Partial / fragile**

| Area | Finding | Severity |
|---|---|---|
| Skip link | Present in layout | Good |
| Playwright axe | One home smoke (`tests/a11y/home.spec.ts`) | Insufficient |
| Focus management | Modals/drawers ad hoc | High |
| Keyboard tables | Dense grids, horizontal scroll | High |
| Contrast | Muted `#6b7a90` needs audit on soft fills | Medium |
| Live regions | Inconsistent for async integration failures | Medium |
| Motion | `prefers-reduced-motion` present | Good |
| Auth screens | Unused; not in real path | N/A |
| Name/role/value | Mixed native + Tegel web components | Medium |

**Reference:** WCAG 2.2; Carbon a11y; Fluent accessibility; Apple VoiceOver guidelines.

**Recommendation:** axe CI on every critical journey; focus traps via Radix Dialog semantics (or Tegel modal contracts); ensure every icon button has accessible name; provide table “card” linearization already started at ≤980px—extend to all data views.

---

# Architecture Review

## Current shape
```
Next.js 16 App Router
  └─ page.tsx → NexusPortal (client god object)
       ├─ 15 modules (functions in same file)
       ├─ imperative fetch → /api/*
       ├─ SQLite via local-database.ts
       └─ optional integrations (Jira/GitLab/Graph/SMTP/AI)
```

## Critical defects

1. **God component / god CSS** — violates every maintainability standard (IBM Garage, Microsoft Azure Application Architecture Guide).
2. **Fake App Router usage** — one page; providers wrap SPA; no segment boundaries.
3. **QueryProvider without queries** — dead abstraction tax.
4. **Docs vs code** — architecture docs describe outbox/Postgres services; runtime is monolith + SQLite + partial outbox scripts.
5. **Duplicated integration call sites** — token-missing / error messaging repeated.

## Target architecture (production)
```
App Router segments per domain
  /tickets, /approvals, /admin, /integrations, /tv (authZ gated)
Server Components for read models where possible
TanStack Query for client mutations/cache
Zod contracts shared UI↔API
Postgres (or managed SQL) + outbox worker
Auth middleware (Entra / ALB OIDC) on every route
Policy engine (RBAC/ABAC) server-side
Module folders with colocated components/tests
```

**Reference:** Next.js App Router best practices; Microsoft Cloud Application Architecture; Stripe API versioning discipline.

---

# Security Review

## Critical findings

### SEC-01 — Client-trusted RBAC (Critical)
APIs accept `role` from query/body (`/api/tickets`, `/api/database`). Attacker sets `role=admin`.

**Impact:** Full data exfiltration / mutation as admin.  
**Reference:** OWASP A01 Broken Access Control; Microsoft Identity Zero Trust.  
**Fix:** Derive role from validated session/JWT claims only. Never accept client role for authorization.

### SEC-02 — Browser-stored integration secrets (Critical)
`localStorage` key `nexus-integration-secrets-v1` holds Jira/GitLab/SMTP credentials.

**Impact:** XSS → credential theft; shared machine leakage.  
**Reference:** OWASP A02 Cryptographic Failures / Sensitive Data Exposure; Stripe secret handling.  
**Fix:** Server-side secret store (Key Vault / Secrets Manager); browser never sees long-lived tokens.

### SEC-03 — Auth not enforced in shell (Critical)
`AuthProvider`/`AuthGate` not in `layout.tsx`. No `/login` page. Portal opens without sign-in.

**Impact:** Unauthenticated access to governance workflows (depending on network placement).  
**Fix:** Mount auth gate; implement `/login`; fail closed.

### SEC-04 — Unauthenticated `/tv` (High)
TV dashboard reads SQLite with no auth.

**Impact:** Sensitive KPI/ticket leakage on shared networks.  
**Fix:** AuthZ + network allowlist + read-only service identity.

### SEC-05 — Missing security headers (High)
No CSP, HSTS, X-Frame-Options/frame-ancestors, Referrer-Policy in `next.config.ts`.

**Reference:** OWASP Secure Headers; Microsoft SDL.  
**Fix:** Next `headers()` with strict CSP compatible with Tegel.

### SEC-06 — MSAL sessionStorage + broad Graph scopes risk (Medium)
Delegated Graph for meetings is fine if scoped; ensure least privilege and token lifetime monitoring.

### SEC-07 — AI endpoint with server API key (Medium)
`OPENAI_API_KEY` server-side is correct pattern **if** route is authenticated and rate-limited. Verify both.

### SEC-08 — Admin DB inspector (High)
Database API reachable with spoofed role — catastrophic with SEC-01.

**Production rule:** No raw DB browser in internet-facing builds without break-glass controls.

---

# Performance Review

| Risk | Evidence | Impact at 50k users |
|---|---|---|
| Mega client JS | 43k-line client component + Tegel | Slow TTI, high memory on low-end laptops |
| Mega CSS | 14k-line globals to all pages | Parse cost; poor caching granularity |
| No module code-split | All modules in one graph | Users pay for admin/Jira code on dashboard |
| Full ticket list in client state | Tickets loaded broadly | Does not scale; need pagination/virtualization |
| Re-render blast radius | Shell state drives all derived UI | Interaction jank |
| Unused deps | Query/Table/RHF still installed | Bundle/noise |

**Reference:** Vercel performance guidance; Carbon performance; Linear virtualization norms.

**Targets:** LCP < 2.5s on mid laptop; INP < 200ms; ticket list virtualized; route-level splitting.

---

# Component Review

| Current | Verdict | Prefer | Why | Reference |
|---|---|---|---|---|
| Scania Tegel buttons/header | **Keep** | Tegel | Brand-mandated; do not replace with shadcn primary | Scania DS |
| Custom tables | Replace | TanStack Table + Tegel styles | Sorting, a11y, virtualization | Carbon / Fluent grids |
| Imperative fetch | Replace | TanStack Query | Cache, retry, dedupe, mutation lifecycle | Modern enterprise FE |
| Manual form state | Replace | RHF + Zod | Validation parity UI/API | Stripe / Carbon forms |
| CSS pie/bar | Replace | Accessible chart lib + table fallback | Legibility, a11y | Carbon Charts |
| Custom dialogs | Evaluate | Tegel modal or Radix Dialog | Focus trap, ESC, aria | WAI-ARIA |
| Icons | Keep TegelIcon | — | Consistency over Lucide unless gap | Brand |
| Toasts (Sonner) | Keep | — | Adequate | — |
| shadcn/ui wholesale | **Do not** | — | Conflicts with Tegel/Scania; creates dual systems | Design system integrity |
| Tailwind | Optional later | Only if tokenized to Tegel | Avoid utility chaos atop 14k CSS | Fluent/Carbon token first |
| Framer Motion | Use sparingly | — | Density 8/10 + Motion 3/10 in MASTER | Apple HIG restraint |

**Hard rule for this product:** Prefer **Tegel + Scania** over shadcn aesthetics. Use headless primitives (Radix/TanStack/RHF/Zod) underneath Tegel styling—not a second visual system.

---

# Design System Compliance

| System | Compliance | Notes |
|---|---|---|
| Scania Tegel | Medium–High visually / Low structurally | Packages used; not fully leveraged; custom CSS fights components |
| IBM Carbon | Low | No Carbon; missing structured data table, notifications, tearsheet patterns |
| Microsoft Fluent | Low–Medium | Entra intent present but unwired; density ok; identity UX wrong |
| SAP Fiori | Low | No Launchpad intents; no object page template rigor |
| Material 3 | Low | Not applicable; don’t force |
| Apple HIG | Low–Medium | Clipping/brand margins recently failed HIG layout basics |
| Atlassian | Low | Ticket UX lacks URL filters, Jira-parity keyboard |
| Stripe | Low | Form/API clarity not Stripe-grade |
| Vercel | Low | Marketing polish absent (ok); App Router misuse not ok |
| Linear | Low | Speed/keyboard-first absent |
| Notion | Low | Calm empty states / blocks model absent |

`MASTER.md` brand override correctly forbids indigo/Plus Jakarta—but still contains conflicting sample button CSS. **Governance of the design system docs themselves is broken.**

---

# Competitor Comparison

| Dimension | Nexus today | Enterprise bar (Carbon/Fluent/Fiori/Atlassian) |
|---|---|---|
| Identity | Optional / demo personas | Mandatory SSO + claims |
| Nav | 15-item rail | Role Launchpad / progressive nav |
| Tickets | Custom list + drawer | URL addressable issue view |
| Tables | Static HTML | Virtualized, column config |
| Admin | In-SPA mega panel | Separated admin app or gated segment |
| Theming | Light only | Light/dark + high contrast |
| Docs fidelity | Ahead of code | Code matches ADR |

---

# Enterprise Gap Analysis

## vs IBM Carbon
- **Strengths:** Dense data UI intent; industrial seriousness.
- **Weaknesses:** No Carbon data table/tearsheet/notification system rigor.
- **Missing:** Structured side nav groups, batch actions, skeleton patterns, token linting.

## vs Microsoft Fluent + Entra
- **Strengths:** MSAL code exists; Graph meeting feature directionally correct.
- **Weaknesses:** Auth unwired; persona switcher antithetical to Entra identity.
- **Missing:** Conditional Access awareness, MSAL React patterns, Fluent toolbar density consistency.

## vs SAP Fiori
- **Strengths:** Role concepts exist in code.
- **Weaknesses:** No intent-based navigation; object pages inconsistent.
- **Missing:** Launchpad, edit/display parity, message strip standards, enterprise form templates.

## vs Stripe
- **Strengths:** Real payment-adjacent? N/A. Form complexity exists.
- **Weaknesses:** Validation and API error contracts inconsistent.
- **Missing:** Schema-driven forms, impeccable empty/error copy, audit-friendly API shapes.

## vs Vercel / modern Next
- **Strengths:** Next 16 + React 19.
- **Weaknesses:** SPA-in-disguise.
- **Missing:** Segment auth, streaming where useful, ISR/route caching strategy, edge middleware.

## vs Linear / Notion
- **Strengths:** Operational density.
- **Weaknesses:** Keyboard-first and calm IA missing.
- **Missing:** ⌘K, issue deep links as first-class, optimistic UI discipline.

## vs Atlassian
- **Strengths:** Jira integration ambition.
- **Weaknesses:** Second-class issue UX vs Jira itself.
- **Missing:** Filter URLs, saved views, permission scheme alignment with Jira.

## vs Material / Apple
- Not primary brand systems for Scania—use only for a11y/layout lessons (touch targets, clipping, motion).

---

# Top 20 Improvements

| # | Title | Severity | Priority | Effort | Business Impact | UX Impact |
|---|---|---|---|---|---|---|
| 1 | Enforce server-side authZ from session claims | Critical | P0 | L | Prevents admin spoofing / data breach | Trust in roles |
| 2 | Remove secrets from localStorage; use vault | Critical | P0 | L | Stops credential theft via XSS | Cleaner admin UX |
| 3 | Wire AuthProvider/AuthGate; add `/login` | Critical | P0 | M | Mandatory access control | Clear signed-in state |
| 4 | Split `NexusPortal.tsx` into domain modules | High | P0 | XL | Enables teams to ship safely | Faster iteration |
| 5 | URL-based IA (`/tickets`, `/approvals`, …) | High | P1 | L | Shareable work; analytics | Back/forward works |
| 6 | Paginate + virtualize ticket tables (TanStack) | High | P1 | M | Scale to large queues | Snappy lists |
| 7 | Adopt TanStack Query for all server state | High | P1 | M | Fewer race bugs | Consistent loading |
| 8 | RHF + Zod on all mutating forms/APIs | High | P1 | M | Fewer bad tickets | Inline errors |
| 9 | Security headers + CSP | High | P0 | S | Hardens XSS/clickjacking | Invisible |
| 10 | AuthZ-gate `/tv` and DB inspector | High | P0 | S | Stops silent data leak | Ops-only access |
| 11 | Remove prod persona switcher | High | P1 | S | Ends identity confusion | Real user chrome |
| 12 | Expand a11y CI beyond one page | High | P1 | M | Legal/compliance risk down | Keyboard parity |
| 13 | Complete sv/en i18n for admin & integrations | Medium | P2 | L | Nordic enterprise requirement | Local trust |
| 14 | Accessible charts + table fallbacks | Medium | P2 | M | Decision quality | Readable reports |
| 15 | Command palette (⌘K) | Medium | P2 | M | Power-user speed | Linear-like feel |
| 16 | Standard Empty/Loading/Error/Forbidden | Medium | P2 | M | Support cost down | Clarity |
| 17 | Route-level code splitting | Medium | P1 | M | Perf for 50k clients | Faster first paint |
| 18 | Replace SQLite with managed SQL for prod | High | P1 | L | HA/backup/compliance | Reliability |
| 19 | Design token cleanup; fix MASTER conflicts | Medium | P2 | S | Brand governance | Consistency |
| 20 | Observability (OpenTelemetry + audit sink) | High | P1 | L | Ops readiness | Faster incident UX |

---

# Roadmap

## Quick Wins (1 day) — highest ROI first
1. Mount `AuthProvider` + `AuthGate` in `layout.tsx`; create `/login`.
2. Reject client `role` on `/api/database` and `/api/tickets` (temporary: bind to session or disable admin APIs).
3. Add security headers in `next.config.ts`.
4. Lock `/tv` behind auth or network check.
5. Cap header logo at 32px; prevent clipping (brand trust).

**Files:** `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/api/tickets/route.ts`, `src/app/api/database/route.ts`, `next.config.ts`, `src/app/tv/page.tsx`, `src/app/globals.css`

## Small Improvements (1 week)
1. Remove/hide persona switcher when `NODE_ENV=production`.
2. Move integration secrets server-side (even if env-only initially); delete localStorage secret writes.
3. Introduce TanStack Query for tickets + config.
4. Extract `TopBar`, `Dashboard`, `TicketList` from god file (first vertical slices).
5. Playwright journeys: login, create ticket, forbidden module.

## Medium Improvements (1 month)
1. App Router module routes + filter search params.
2. TanStack Table on tickets/admin.
3. RHF+Zod ticket create/edit + shared API schemas.
4. CSS modularization / token lint.
5. i18n coverage for high-traffic modules.
6. Chart library + data table fallback.

## Major Improvements (3 months)
1. Full god-file decomposition + package boundaries.
2. Managed database + hardened outbox workers.
3. Policy engine (RBAC/ABAC) with audit log sink.
4. Performance budget CI (bundle + Lighthouse).
5. Dark/high-contrast themes via Tegel.
6. Admin as separate route segment with stronger controls.

## Long-term Vision
Scania-grade **enterprise governance OS**: Entra-native identity, Fiori-like intent navigation, Carbon-grade data density, Stripe-grade form/API correctness, Vercel-grade delivery—without abandoning Tegel.

---

# Production Checklist

- [ ] Authentication enforced on all pages/APIs
- [ ] Authorization from server claims only
- [ ] No secrets in browser storage
- [ ] CSP/HSTS/frame-ancestors set
- [ ] `/tv` and DB tools gated
- [ ] Postgres (or approved HA store) for prod
- [ ] Backups + restore drill documented
- [ ] Paging/virtualization on primary queues
- [ ] Error tracking (e.g., App Insights/Sentry)
- [ ] Structured logging + correlation IDs
- [ ] Rate limits on AI/SMTP/Jira proxy routes
- [ ] Dependency vulnerability scanning in CI
- [ ] Threat model reviewed
- [ ] Pen test scheduled
- [ ] WCAG 2.2 AA evidence pack
- [ ] i18n sign-off (en/sv)
- [ ] Runbook + on-call
- [ ] Feature flags for risky admin tools
- [ ] Load test at expected concurrency
- [ ] Data retention / GDPR deletion path

---

# Enterprise Readiness Checklist

- [ ] SSO (Entra) mandatory
- [ ] SCIM/group → role mapping
- [ ] Segregation of duties (maker/checker) enforced server-side
- [ ] Immutable audit trail for approvals
- [ ] Environment separation (dev/test/prod secrets)
- [ ] Break-glass admin procedure
- [ ] SLA monitoring with real alerting (not only UI board)
- [ ] Integration credentials rotated via vault
- [ ] Multi-region or documented RPO/RTO
- [ ] Accessibility VPAT/ACR
- [ ] Brand/design system governance (Tegel-only)
- [ ] Code ownership per domain module
- [ ] Test pyramid (unit/integration/e2e) in CI
- [ ] DRI for security incidents

**Current checklist completion: ~10–15%.**

---

# Redesign Mode — Major Issues

## Issue A — Navigation & IA
**IBM Carbon:** Side nav with categories + overflow; avoid >7 primary items.  
**Microsoft Fluent:** Hub + spokeless tools via App Bar + NavigationView hierarchical groups.  
**Stripe:** Ruthlessly few top-level items; deep links everywhere.  
**Best approach for Nexus:** Role-based home + grouped Tegel side nav + App Router URLs. Keep Scania chrome; steal Carbon grouping + Stripe deep-linking.

**Wireframe (desktop):**
```
[ Tegel Header: Logo | Global Search | Locale | User ]
[ Nav groups ][ Module canvas                    ]
[ - Work     ][ Title + primary action           ]
[ - Govern   ][ Filters (URL synced)             ]
[ - Admin    ][ Main view / table / object page  ]
```

**Spacing:** 8-pt grid; header 56px; nav expanded 272px / collapsed 56px (already close).  
**Typography:** Scania Sans Headline for page titles 20–24px; body 14px; meta 12px.  
**Motion:** 150–200ms opacity/translate only; respect reduced motion.  
**Components:** Tegel nav + TanStack Table + Sonner; Radix Dialog only if Tegel modal lacks focus trap.

## Issue B — Identity
**IBM:** No demo role switcher in prod.  
**Microsoft:** MSAL + account picker; roles from App Roles/Groups.  
**Stripe:** Single clear signed-in actor.  
**Best:** Wire Entra; show name/email/roles from claims; audited impersonation only.

## Issue C — Data density tables
**IBM Carbon Data Table** patterns win for enterprise.  
**Implementation:** TanStack Table + Tegel tags/buttons; sticky header; row actions in menu; bulk actions bar.

---

# Implementation Plan (exact files)

| Workstream | Files / actions |
|---|---|
| Auth wiring | `src/app/layout.tsx`, add `src/app/login/page.tsx`, use `AuthProvider.tsx`, `AuthGate.tsx` |
| API authZ | `src/app/api/tickets/route.ts`, `src/app/api/database/route.ts`, `src/app/api/**`, `src/lib/auth/*` |
| Secrets | Remove writes in `NexusPortal.tsx` (~localStorage secrets); server vault module under `src/lib/secrets/` |
| Split UI | Extract from `NexusPortal.tsx` → `src/components/nexus/{dashboard,tickets,admin,integrations,escalations}/` |
| CSS | Split `globals.css` → `styles/{tokens,shell,tickets,admin}.css` or CSS modules |
| Data | Wire `QueryProvider` usage; ticket hooks in `src/lib/queries/` |
| Forms | `src/lib/schemas/ticket.ts` (Zod) + RHF forms |
| Headers | `next.config.ts` `headers()` |
| TV lock | `src/app/tv/page.tsx` + middleware |
| Tests | Expand `tests/` beyond `tests/a11y/home.spec.ts` |

**Do not** introduce a parallel shadcn visual theme. Headless libraries only.

---

# Final Verdict

**Nexus Support is a capable Scania-skinned internal governance console trapped inside a prototype architecture.**

It looks more “enterprise” than most startup MVPs because Tegel and navy chrome do real brand work. It fails enterprise production because identity, authorization, secret handling, and modularity are not production-grade. `package.json` already admits “prototype”—the codebase agrees.

**Ship decision:** **No** for 50,000 users.  
**Pilot decision:** Conditional yes on a closed network **only after** P0 security fixes (auth gate, server authZ, secret removal, `/tv` lock, headers).  
**Investment decision:** Yes—domain richness is valuable—if leadership funds a 1–3 month platformization program before feature expansion.

---

# Appendix A — Score Summary Table

| Category | Current Score | Target Score | Estimated Time to Target |
|---|---:|---:|---|
| Visual Design | 6.0 | 8.5 | 3–4 weeks |
| UX | 5.0 | 8.5 | 6–8 weeks |
| UI | 5.5 | 8.5 | 4–6 weeks |
| Navigation | 5.5 | 8.5 | 3–5 weeks |
| Information Architecture | 4.5 | 8.5 | 6–8 weeks |
| Accessibility | 5.0 | 9.0 | 6–10 weeks |
| Performance | 3.5 | 8.5 | 6–8 weeks |
| Architecture | 3.0 | 9.0 | 8–12 weeks |
| Security | 2.0 | 9.5 | 4–6 weeks (P0 in 1–2 weeks) |
| Maintainability | 2.5 | 8.5 | 8–12 weeks |
| Scalability | 3.0 | 9.0 | 8–12 weeks |
| Code Quality | 3.5 | 8.5 | 8–12 weeks |
| Enterprise Feeling | 5.5 | 9.0 | 8–10 weeks |
| Modern Feeling | 5.0 | 8.5 | 4–6 weeks |
| Production Readiness | 2.5 | 9.0 | 10–14 weeks |
| **Overall** | **4.1** | **8.8** | **~1 quarter focused** |

---

# Appendix B — Issue Register (condensed)

| Issue | Severity | Priority | Effort | Business Impact | UX Impact |
|---|---|---|---|---|---|
| Client-trusted RBAC | Critical | P0 | L | Breach / fraud | False trust |
| Secrets in localStorage | Critical | P0 | L | Credential theft | Admin friction later |
| Auth unwired / no login | Critical | P0 | M | Unauthorized use | No session clarity |
| Unauthenticated `/tv` | High | P0 | S | Data leak | N/A |
| No security headers | High | P0 | S | XSS/clickjack | Invisible |
| God file 43k LOC | High | P0 | XL | Delivery risk | Slow fixes |
| SPA without URLs | High | P1 | L | Collaboration loss | Broken back/share |
| Unused Query/Table/RHF | Medium | P1 | M | Wasted platform | Inconsistent patterns |
| Non-virtualized tables | High | P1 | M | Perf collapse | Jank |
| CSS 14k monolith | Medium | P2 | L | Style regressions | Inconsistency |
| Light-only theme | Medium | P2 | M | Exclusion | Preference ignore |
| Incomplete i18n | Medium | P2 | L | Nordic market risk | Mixed language UI |
| CSS-only charts | Medium | P2 | M | Bad decisions | Low legibility |
| Single a11y test | High | P1 | M | Compliance gap | Keyboard gaps |
| SQLite as prod store | High | P1 | L | Durability risk | Outages |
| Persona switcher in prod path | High | P1 | S | Audit failure | Identity confusion |
| MASTER.md token conflicts | Low | P3 | S | Brand drift | Minor |
| Logo clipping in header | Low | P3 | S | Brand polish | Perceived quality |
| Dead AuthGate redirect target | High | P0 | S | Broken auth UX | Dead-end |
| No unit tests | High | P1 | L | Regression risk | Quality feel |

---

# Appendix C — What IBM, Microsoft, and Stripe Reject First

**If reviewed today, they reject first:**

1. **Microsoft:** Unwired Entra + client-supplied `role=admin` on APIs — identity and authorization theater.  
2. **IBM:** 43k-line god component + client-trusted access control — not an enterprise architecture.  
3. **Stripe:** Secrets in `localStorage` and forms/API validation without schema contracts — unacceptable handling of sensitive credentials and state.

Everything else (charts, dark mode, command palette) is noise until those three are fixed.

---

*End of report. Generated for internal architecture review. Not a certification of WCAG, SOC2, or ISO compliance.*
