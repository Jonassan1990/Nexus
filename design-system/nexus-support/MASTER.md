# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Nexus Support  
**Phase:** Epic 4 — Knowledge Experience platform (complete; awaiting review)  
**Category:** Enterprise B2B support portal

> **Brand override:** This product ships on **Scania Tegel**. Prefer `pages/shell.md` and `TOKENS.md`.
> Canonical tokens: `src/styles/tokens.css`. Utilities: `src/styles/utilities.css`.
> Keep Scania Sans + Scania navy `#041e42`. Radius = `0`. No indigo/violet/purple.
> **Product behaviour:** [`PRODUCT_RULEBOOK.md`](./PRODUCT_RULEBOOK.md) (Phase 1.75).
> **Shell:** [`PHASE2_ARCHITECTURE_REPORT.md`](./PHASE2_ARCHITECTURE_REPORT.md).
> **Command Center:** [`PHASE3_ARCHITECTURE_REPORT.md`](./PHASE3_ARCHITECTURE_REPORT.md).
> **Workspace platform:** [`PHASE3_5_ARCHITECTURE_REPORT.md`](./PHASE3_5_ARCHITECTURE_REPORT.md).
> **Work Management:** [`PHASE4_ARCHITECTURE_REPORT.md`](./PHASE4_ARCHITECTURE_REPORT.md) · [`PHASE4_COMPONENT_INVENTORY.md`](./PHASE4_COMPONENT_INVENTORY.md).
> **Knowledge:** [`PHASE4_KNOWLEDGE_ARCHITECTURE_REPORT.md`](./PHASE4_KNOWLEDGE_ARCHITECTURE_REPORT.md) · [`PHASE4_KNOWLEDGE_COMPONENT_INVENTORY.md`](./PHASE4_KNOWLEDGE_COMPONENT_INVENTORY.md).

---

## Global Rules

### Color

Use semantic tokens only. Never hardcode hex in components.

| Role | Token |
| --- | --- |
| App canvas | `--background` |
| Panels | `--surface` / `--surface-elevated` / `--surface-muted` / `--surface-hover` |
| Text | `--text-primary` / `--text-secondary` / `--text-muted` / `--text-inverse` |
| Borders | `--border-default` / `--border-muted` / `--border-strong` |
| Actions | `--primary` / `--primary-hover` / `--primary-soft` / `--on-primary` |
| Status | `--success` / `--warning` / `--danger` / `--info` (+ soft) |
| Tickets | `--ticket-open` … `--ticket-closed` |
| Charts | `--chart-1` … `--chart-5` / `--chart-muted` |

Legacy aliases (`--bg`, `--accent`, `--text`, `--border`) exist only for migration.

### Typography

Scania Sans (body) · Scania Sans Headline (display).  
Utilities: `.nx-display-xl` → `.nx-mono`. Weights: 400 / 500 / 700 only.

### Spacing

8px grid via `--space-unit`. Scale `--space-1`…`--space-16`.  
Density: `data-density="compact|comfortable|relaxed"` on `<html>`.

### Motion

`--motion-fast` 150ms · `--motion-base` 200ms · `--motion-slow` 250ms.  
No `translateY` hover. Respect `prefers-reduced-motion`.

### Elevation

Panels: `--elevation-none` (borders define structure).  
Overlays only: `--elevation-popover` / `--elevation-modal` / `--elevation-sticky`.

### Radius

All structural chrome: `border-radius: var(--radius)` (= 0).

### Icons

`--icon-sm` 16 · `--icon-md` 20 · `--icon-lg` 24 · `--icon-xl` 32.

---

## Anti-Patterns (Do NOT Use)

- Decorative gradients / page washes
- Glassmorphism / backdrop blur chrome
- Purple / violet / indigo / pink accents
- Floating card shadows on content panels
- Hover `translateY` lifts
- Hardcoded hex in TSX (charts use `--chart-*`)
- Invented spacing or type outside the token scale
- Rounded marketing CTAs (`border-radius: 8px+` on chrome)

---

## Component direction (Phase 0+)

Prefer existing portal classes (`.primary-button`, `.panel`, `.module-header`).  
New UI must compose semantic tokens + `.nx-*` utilities. Do not invent parallel button/card systems in docs.
