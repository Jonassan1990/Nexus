# Phase 1 Migration Report — Design Foundation Completion

**Date:** 2026-07-28  
**Scope:** Foundation only — no Dashboard / Tickets / Modules redesign  
**Repo:** `Nexus-Portal-support`

---

## Summary

Phase 1 completes the design foundation: zero hardcoded colours outside token definitions, semantic radius tokens everywhere, shared layout primitives, standardised page structure, and an extended utility layer.

---

## 1. Hardcoded colours

| Before | After |
| --- | --- |
| 186 hex in `globals.css` | **0** |
| 24 `rgb()` / `rgba()` in `globals.css` | **0** |
| 1 hex in email HTML (`NexusPortal.tsx`) | Replaced with `emailColorValues.textPrimary` from `src/lib/theme/primitiveValues.ts` (mirrors `--primitive-slate-950`) |

**Allowed hex locations (token definitions only):**

- `src/styles/tokens.css` — CSS primitives
- `src/lib/theme/primitiveValues.ts` — email / non-CSS mirror

All former literals now map to semantic or primitive tokens (`--primitive-white`, `--surface-subtle`, `--chrome-marker`, `color-mix(... var(--primary) ...)`, etc.).

---

## 2. Border radius

| Before | After |
| --- | --- |
| `999px` / `99px` (pills) | `var(--radius-pill)` (= **0**, Scania square) |
| `3px` / `4px` / `2px` | `var(--radius)` (= **0**) |
| `50%` geometric circles | `var(--radius-circle)` (avatars / rings only) |
| Raw `0` | `var(--radius)` |

`inherit` retained where intentional (child inherits parent token).

---

## 3. Layout primitives

Created: `src/design-system/layout/index.tsx` + `src/styles/layout.css`

| Primitive | Role |
| --- | --- |
| `Page` | Module page shell |
| `PageHeader` | Title / description / actions (composes `.module-header`) |
| `Toolbar` | Filter / action row |
| `Content` | Primary content region |
| `Section` | One-job section with optional header |
| `Panel` | Bordered surface (composes `.panel`) |
| `SidebarSection` | Secondary sidebar block |
| `Stack` | Vertical 8px-grid stack |
| `Cluster` | Horizontal wrapping cluster |

---

## 4. Standard page structure

Shell now follows:

```
main.workspace-main
  └─ Page
       ├─ PageHeader (via ModuleHeader)
       └─ Content
            └─ module body (unchanged feature markup)
```

`ModuleHeader` composes `PageHeader`. Empty / access panels use `WorkspacePanel` → `Panel`.

---

## 5. Utility layer

Extended in `utilities.css` + `layout.css`:

- Spacing / padding helpers (`nx-pad-*`, stack/cluster gaps)
- Alignment (`nx-align-*`, `nx-justify-*`, cluster align variants)
- Vertical rhythm (`nx-rhythm*`)
- Responsive spacing (mobile / tablet breakpoints)
- Density subtree overrides (`.nx-density-compact` / `.nx-density-relaxed`)
- Reduced motion (Phase 0, retained)

---

## 6. Component consistency migrations

| Component | Change |
| --- | --- |
| `ModuleHeader` | Uses `PageHeader` |
| `PanelPrimitives` | Adds `WorkspacePanel`; surfaces use `Panel` |
| Empty panels (tickets / clarifications / escalations) | `WorkspacePanel` |
| `AccessRestrictedPanel` | `WorkspacePanel` |
| Portal shell | `Page` + `Content` wrappers |

**Not migrated (intentional — Phase 2+):** individual Dashboard / Ticket / Admin panel trees still use legacy `.panel` classnames. They remain visually valid (`Panel` also emits `.panel`). No feature redesign.

---

## 7. Responsive verification

| Breakpoint | Behaviour |
| --- | --- |
| Desktop (≥1200) | Existing workspace padding; page gap `--space-stack-lg` |
| Tablet (768–1199) | Page/content gap tightens to `--space-stack-md` |
| Mobile (≤767) | Header/section actions full-width; stack gaps compact |

Existing mobile rules in `globals.css` unchanged.

---

## 8. Accessibility verification

| Check | Status |
| --- | --- |
| Skip link + `main#main-content` focus target | Preserved |
| `PageHeader` uses semantic `h1` | Yes |
| `Toolbar` `role="toolbar"` | Yes |
| `EmptyState` `role="status"` | Preserved |
| Focus ring token | Unchanged (`--focus-ring`) |
| `prefers-reduced-motion` | Utilities |
| Touch target token `--touch-target` 44px | Preserved |
| No `translateY` hover | Preserved |

---

## 9. Quality gate

| Criterion | Result |
| --- | --- |
| No hardcoded colours outside token defs | **Yes** |
| No decorative radius | **Yes** (all tokenised; pill = 0) |
| Shared layout primitives exist | **Yes** |
| Shared page structure exists | **Yes** |
| Utility layer complete | **Yes** |
| No business logic changed | **Yes** |
| Dashboard / Tickets / Modules not redesigned | **Yes** |

---

## Remaining debt (Phase 2+)

1. Incrementally replace remaining raw `<section className="panel …">` in feature modules with `<Panel>` / `<Section>`.
2. Adopt `Toolbar` on ticket filters / admin toolbars.
3. Continue density wiring for compact enterprise views.
4. Optional: extract more repeated panel headers to `PanelHeader` + `Section`.

---

## Files touched (Phase 1)

- `src/styles/tokens.css`
- `src/styles/utilities.css`
- `src/styles/layout.css` *(new)*
- `src/app/globals.css`
- `src/design-system/layout/index.tsx` *(new)*
- `src/lib/theme/primitiveValues.ts` *(new)*
- `src/components/nexus/ModuleHeader.tsx`
- `src/components/nexus/PanelPrimitives.tsx`
- `src/components/nexus/NexusPortal.tsx` (shell + empty panels only)
- `design-system/nexus-support/PHASE1_MIGRATION_REPORT.md` *(this file)*
