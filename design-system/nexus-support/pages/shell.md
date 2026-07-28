# Shell / Portal chrome overrides

These rules **override** `MASTER.md` for the Nexus-support portal UI.

## Brand constraints (non-negotiable)

- Keep **Scania Tegel** visual language: Scania Sans / Scania Sans Headline, square corners (`border-radius: 0`), Scania blue `#041e42`.
- Do **not** switch to Plus Jakarta Sans, indigo/violet CTAs, pill buttons, or purple glows.
- Chrome (header + side nav) stays **navy**; workspace stays **light cool grey**.

## Design tokens (source of truth)

Canonical files:

- `src/styles/tokens.css` — semantic colors, domain ticket colors, spacing, type, motion, elevation, icons
- `src/styles/utilities.css` — `.nx-*` typography and layout utilities
- `@/design-system` — primitives, patterns, templates

**Product behaviour (Phase 1.75):** [`../PRODUCT_RULEBOOK.md`](../PRODUCT_RULEBOOK.md)

Use semantic names (`--background`, `--surface`, `--text-primary`, `--primary`, `--ticket-open`, …).
Legacy aliases (`--bg`, `--accent`, `--text`, …) exist only for migration.

## Look & feel — Enterprise Minimalism

- Calm flat surfaces. Borders define structure; shadows are structural only (popover/modal).
- No page washes, glassmorphism, floating cards, or decorative gradients.
- No hover `translateY`. Prefer border / background / focus-ring changes.
- Motion 150–250ms. Respect `prefers-reduced-motion`.
- Density via `data-density` on `<html>`: `compact` | `comfortable` | `relaxed`.
- Tables: navy header row, zebra optional, soft hover via `--surface-hover`.
- Status/role color from domain tokens — never purple/violet/indigo/pink.

## Workspace shell (Phase 2)

Shell ownership: TopBar + Sidebar + `#main-content` workspace. Preferences (pin / favourite / recent) and Ctrl/Cmd+K command palette live under `src/features/workspace/`. See `PHASE2_ARCHITECTURE_REPORT.md`.

## Typography

Use utilities only: `.nx-display-xl`, `.nx-display`, `.nx-h1`–`.nx-h3`, `.nx-title`, `.nx-body-lg`, `.nx-body`, `.nx-small`, `.nx-caption`, `.nx-label`, `.nx-mono`.

Weights: 400 / 500 / 700 only.

## Anti-patterns

- AI purple / pink / indigo accents
- Glassmorphism / backdrop blur chrome
- Soft neumorphism
- Pill explosion (`border-radius: 999px` clusters)
- Card hover lifts
- Hardcoded hex in TSX (charts must use `--chart-*` or domain tokens)
- Invented spacing or font sizes outside the token scale
- Mixed light/dark within a single panel
- Bypassing `@/design-system` for new UI (use primitives / patterns / templates)
