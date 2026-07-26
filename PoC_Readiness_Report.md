# PoC Readiness Report

**Product:** Nexus Support Portal  
**Date:** 2026-07-24  
**Goal:** Safe, stable, and reliable enough for PoC demonstration and user testing — **not** production readiness.  
**Source audit:** `Audit_Report.md`

---

## Classification rubric

A finding is **Critical for PoC** only if it:

- Can expose secrets or credentials  
- Allows privilege escalation  
- Can cause data corruption or data loss  
- Makes the application unusable  
- Prevents core user journeys  
- Causes crashes  
- Prevents testers from evaluating the intended functionality  

Everything else is deferred.

---

## Finding classification (from enterprise audit)

| Finding | Category | Why | Proposed fix | Est. time | Risk if unfixed | Action |
|---|---|---|---|---|---|---|
| Integration secrets in `localStorage` (Jira/GitLab/SMTP/OpenAI) | **1. Critical for PoC** | Shared demo PCs and long-lived browser storage expose real credentials | Move to session-scoped store; scrub legacy `localStorage` | 1–2 h | Credential leak during PoC | **Fixed** |
| `/api/database` trusts client `role=admin` | **1. Critical for PoC** | Remote caller can inspect DB / wipe tickets by spoofing role | Gate tools to localhost or `NEXUS_ENABLE_LOCAL_TEST_TOOLS` | 1 h | Privilege escalation + data wipe | **Fixed** |
| `PUT /api/tickets` with `tickets: []` wipes all data | **1. Critical for PoC** | Unauthenticated replace-all enables trivial data loss | Reject empty replace unless `confirmEmptyReplace: true` | 30–45 min | PoC dataset destroyed | **Fixed** |
| AuthProvider / AuthGate unwired; no `/login` | 2. Important after PoC | PoC intentionally uses persona switching for role demos | Wire Entra after PoC | 2–4 d | Open network access (accepted for controlled PoC) | Deferred |
| Client `role` on ticket **reads** (`?role=`) | 2. Important after PoC | Needed so testers can evaluate role-filtered views | Keep for PoC; replace with session claims later | — | Testers can view “admin” filtered data | Deferred (intentional) |
| Unauthenticated `/tv` wallboard | 2. Important after PoC | Useful demo surface; LAN leak is not a core-journey blocker | AuthZ / allowlist after PoC | 0.5–1 d | KPI/ticket summary visible on LAN | Deferred |
| Missing security headers (CSP/HSTS) | 3. Production-only | Hardening, not PoC demo blocker | Add in `next.config.ts` later | 0.5 d | Higher XSS impact if exploited | Deferred |
| `NexusPortal.tsx` god file (~43k LOC) | 3. Production-only | Maintainability; does not block testing | Split after PoC | weeks | Slower future changes | Deferred |
| SPA without URL modules | 2. Important after PoC | Shareable deep links help testing but core journeys work | App Router segments later | days | Harder to share exact screens | Deferred |
| Unused TanStack Query/Table/RHF | 3. Production-only | Platform debt | Adopt later | days–weeks | Inconsistent patterns | Deferred |
| Non-virtualized tables / perf | 2. Important after PoC | Only critical if lists make UI unusable; not observed as blocker | Virtualize if PoC data volume grows | days | Jank with huge datasets | Deferred |
| Light-only theme / design polish / logo | 3. Production-only | Visual; not safety/usability for PoC | Polish later | hours–days | Brand perception only | Deferred |
| Incomplete i18n | 2. Important after PoC | Shell has en/sv; deep admin copy EN | Expand after PoC | days | Mixed language UX | Deferred |
| CSS-only charts | 3. Production-only | Reports still evaluable | Chart lib later | days | Limited chart a11y | Deferred |
| Single a11y smoke test | 2. Important after PoC | Expand coverage after PoC | More Playwright journeys | days | Missed a11y bugs | Deferred |
| SQLite as store | 2. Important after PoC | Fine for PoC; not HA | Managed SQL later | days | Single-node durability | Deferred |
| Persona switcher | 2. Important after PoC | **Required** for PoC role evaluation | Remove only in production builds later | — | Identity is demo-only (documented) | Deferred (intentional) |
| Open `PUT /api/config` | 2. Important after PoC | Can corrupt config without auth; full fix needs identity | Session auth after PoC | days | Config tampering on open network | Deferred — remaining risk |
| Open `POST /api/tickets` / non-empty `PUT` | 2. Important after PoC | Required for PoC ticket persistence without auth | Session auth after PoC | days | Ticket injection/overwrite on open network | Deferred — remaining risk |
| Browser sessionStorage still holds tokens | 2. Important after PoC | Better than localStorage; still XSS-readable | Server vault after PoC | days | XSS in-session can still read tokens | Deferred — remaining risk |
| AI route accepts client-supplied API key | 2. Important after PoC | Prefer `OPENAI_API_KEY` env for demos | Enforce server key only later | hours | Key may transit in request body | Deferred |
| MASTER.md / design-system conflicts | 3. Production-only | Docs hygiene | Clean later | hours | Brand drift | Deferred |
| Dead AuthGate → `/login` if mounted later | 2. Important after PoC | Not in live path today | Add `/login` when auth is wired | hours | Future footgun | Deferred |

---

## Critical issues fixed

### 1. Integration secrets no longer persist in `localStorage`
- **Why critical:** Jira/GitLab/SMTP/OpenAI credentials were written to `localStorage` (`nexus-integration-secrets-v1`), surviving browser restarts on shared PoC machines.
- **Fix:** Added `src/lib/poc-secrets-store.ts` — session storage only; migrates then deletes legacy localStorage. Wired through `NexusPortal.tsx` and `msal-config.ts`. Updated admin hints.
- **Files:** `src/lib/poc-secrets-store.ts`, `src/lib/auth/msal-config.ts`, `src/components/nexus/NexusPortal.tsx`

### 2. Database inspector no longer trust-client-role alone
- **Why critical:** Any caller could send `role=admin` and list tables, run SQL (read-only helper), or wipe tickets.
- **Fix:** All `/api/database` methods now require **localhost** or `NEXUS_ENABLE_LOCAL_TEST_TOOLS=true`, in addition to admin role. UI visibility aligned (no longer opens tools just because `NODE_ENV !== production`).
- **Files:** `src/app/api/database/route.ts`, `src/components/nexus/NexusPortal.tsx`, `.env.example`

### 3. Empty ticket replace blocked
- **Why critical:** `PUT /api/tickets` with `tickets: []` called `replaceTickets`, which `DELETE`s all tickets — trivial remote data loss.
- **Fix:** If DB has tickets and body is empty, return `409` unless `confirmEmptyReplace: true`.
- **Files:** `src/app/api/tickets/route.ts`

`npm run typecheck` passes after these changes.

---

## Critical issues intentionally deferred

None remaining that meet the **Critical for PoC** bar **and** can be fixed without production-grade auth/architecture work.

Open ticket/config mutation APIs without authentication remain **Important after PoC**: fixing them properly requires identity, which would change the PoC demo model (persona switching). Empty-wipe and DB inspector — the highest-impact abuse paths — are mitigated.

---

## Remaining risks (accepted for PoC)

1. **No enforced login** — anyone who can reach the host can use the portal and switch personas.  
   **Mitigation:** Run PoC on a controlled network / VPN / access-restricted host.

2. **Ticket create/update and config save remain unauthenticated** — a network peer can overwrite non-empty ticket sets or admin config.  
   **Mitigation:** Controlled network; avoid exposing the PoC URL publicly.

3. **Secrets in `sessionStorage`** — still readable by XSS in the same tab session; cleared when the session ends. Prefer server env (`OPENAI_API_KEY`) when possible.

4. **`/tv` is open** — wallboard data visible without auth.

5. **Role query param still affects visibility filtering** — intentional for PoC role demos; not a server authorization model.

6. **Architecture / performance / a11y / i18n debt** — does not block core PoC journeys at current scope.

---

## PoC operator checklist

- [ ] Host PoC on localhost or a private/VPN endpoint — not the public internet.  
- [ ] Do **not** set `NEXUS_ENABLE_LOCAL_TEST_TOOLS` on shared remote PoC URLs unless DB admin tooling is required.  
- [ ] Prefer server env for OpenAI (`OPENAI_API_KEY`); re-enter Jira/GitLab/SMTP tokens per browser session.  
- [ ] Confirm legacy `localStorage` secret key is gone after first load (automatic scrub).  
- [ ] Smoke-test: open portal → switch persona → create/view ticket → open integrations (if in scope).  
- [ ] Confirm database inspector works on localhost and is blocked on remote host without the opt-in flag.

---

## Recommendation

### **Ready with known risks**

The PoC is **safe enough for controlled demonstration and user testing** after the three critical fixes above.

It is **not** ready for public internet exposure or production. Known risks (open shell, open ticket/config writes, session-stored tokens, open `/tv`) must be accepted and managed operationally (network control, short-lived demo credentials, no real production secrets).

| Status | Meaning |
|---|---|
| Ready for PoC | All Critical-for-PoC items fixed; no material residual demo risk |
| **Ready with known risks** | **← Current** — Critical abuse paths mitigated; residual open-API / no-auth risks require controlled hosting |
| Not ready | Critical blockers remain |

---

## What was explicitly not done

Per instructions — no architecture refactoring, no god-file split, no design-system/UI polish, no performance work, no production auth rollout, no shadcn migration.
