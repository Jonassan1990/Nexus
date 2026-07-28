# State Catalogue — Nexus Support Portal

**Phase:** 1.75  
**DS primitives:** `LoadingState`, `Skeleton`, `EmptyState`, `ErrorState`, `Alert`, `StatusBadge`, `MetricCard`  
**Related:** [Product Rulebook](../PRODUCT_RULEBOOK.md)

---

## 1. Purpose

Standardise how the product communicates **loading**, **empty**, **error**, **success**, **KPI**, and **chart** states so every module feels predictable.

---

## 2. Loading rules

| Situation | Pattern | Primitive |
| --- | --- | --- |
| First paint of a known layout | Preserve chrome; skeleton body | `Skeleton` |
| Short inline wait (button) | Disable control + label “Working…” | Button state |
| Unknown structure / auth gate | Centered status region | `LoadingState` |
| Table refresh | Keep header/filters; skeleton rows | `Skeleton` in `DataTable` area |
| Chart refresh | Skeleton block same aspect ratio | `Skeleton` variant `block` |

### Rules
1. Set `aria-busy="true"` on the region being updated.  
2. Prefer `aria-live="polite"` for completed loads; avoid assertive unless failure.  
3. Respect `prefers-reduced-motion` (no shimmer animation).  
4. Do not block the whole shell for a single panel load.  
5. Timeouts fall through to **Error** with retry when recoverable.

---

## 3. Empty state rules

| Situation | Copy intent | Actions |
| --- | --- | --- |
| Module has zero entities | Explain + how to create/start | Primary create when allowed |
| Filters exclude all rows | “No matches” + clear filters | Clear filters control |
| Role cannot see module | Access restricted | Point to sidebar / allowed work |
| Dependent data missing (e.g. no Jira products) | Explain dependency | Link to settings if permitted |

### Rules
1. Use `EmptyState` (title required, body recommended, actions optional).  
2. Never show a raw empty table with no explanation.  
3. Icons are optional; do not use illustrative decoration that competes with copy.  
4. Empty is `role="status"`, not `alert`.

---

## 4. Error state rules

| Severity | Pattern | Role |
| --- | --- | --- |
| Blocking page failure | `ErrorState` in Content | `alert` |
| Recoverable panel failure | `Alert` tone danger + Retry | `alert` |
| Field validation | Inline field error + optional summary | — |
| Background sync failure | `Alert` or toast; keep last good data | `status` or `alert` if urgent |

### Rules
1. Say what failed and what the user can do next.  
2. Do not expose stack traces or secrets.  
3. Retry must be keyboard accessible.  
4. Destructive failures (data loss risk) use explicit wording.

---

## 5. Success / confirmation

- Inline success: `Alert` tone success, dismissible when appropriate.  
- Form save: keep user in context; confirm near `ActionBar`.  
- Toasts (if used): short, non-modal, not the only record of a critical outcome.

---

## 6. KPI rules

1. **One KPI = one question** (e.g. “Open breaches”, not mixed metaphors).  
2. Use `MetricCard` / `Stat`; tone via semantic tokens (`danger` for breaches, etc.).  
3. Prefer absolute counts; rates need an explicit denominator in hint text.  
4. Clickable KPIs must navigate to a List/Report that proves the number.  
5. Cap density: if more than ~8 KPIs, group into sections—do not create a sticker sheet.  
6. Loading KPIs use compact skeletons; never flash `0` unless zero is confirmed.

---

## 7. Chart rules

1. Colours only from `--chart-1`…`--chart-5`, `--chart-muted`, or domain `--ticket-*`.  
2. Title states the question the chart answers.  
3. Provide a table or list alternative (`DataTable` or textual summary).  
4. Empty chart series → Empty state, not an empty canvas.  
5. Tooltips/legends must remain readable on mobile (or fall back to table).  
6. No decorative gradients or 3D effects.

---

## 8. Status & badge rules

1. Ticket lifecycle uses domain classes / `StatusBadge` with `ticketStatus`.  
2. System status uses tone: success / warning / danger / info / neutral.  
3. Do not invent purple/pink/indigo statuses.  
4. Badges are informational; do not rely on colour alone—include text.

---

## 9. Filter & search result states

| State | Presentation |
| --- | --- |
| Default | Full dataset per role scope |
| Filtered | Active chips visible; count of results when known |
| No matches | Empty state with clear-filters action |
| Search active | Query visible in SearchBox; escapable / clearable |

---

## 10. Accessibility state rules

| Requirement | Rule |
| --- | --- |
| Focus | Visible `focus-ring` on all interactive controls |
| Keyboard | Tables, tabs, filters, dialogs fully operable |
| Live regions | Polite for loads; alert for errors |
| Contrast | WCAG AA via semantic tokens (including dark theme) |
| Motion | Honour reduced motion |
| Targets | ≥44px touch where controls are primary actions |
| Headings | Single `h1` per page via PageHeader; sections use `h2` |

---

## 11. State × Blueprint matrix

| Blueprint | Loading | Empty | Error |
| --- | --- | --- | --- |
| Dashboard | Skeleton KPIs + panels | Empty sections independently | Panel-level Alert |
| List | Skeleton rows | EmptyState in table panel | Alert above table |
| Details | Skeleton sections | Entity-not-found Empty/Error | Alert + back to list |
| CRUD | Disable submit | N/A | Field + summary ErrorState |
| Settings | Skeleton forms | Empty config section | Alert per section |
| Wizard | Step-level busy | N/A | Step ErrorState |
| Report | Skeleton chart+table | EmptyState after filters | Alert + retry |
