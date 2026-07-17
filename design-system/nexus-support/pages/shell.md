# Shell / Portal chrome overrides

These rules **override** `MASTER.md` for the Nexus-support portal UI.

## Brand constraints (non-negotiable)

- Keep **Scania Tegel** visual language: Scania Sans / Scania Sans Headline, square corners (`border-radius: 0`), Scania blue `#041e42`.
- Do **not** switch to Plus Jakarta Sans, indigo/violet CTAs, pill buttons, or purple glows.
- Chrome (header + side nav) stays **navy**; workspace stays **light cool grey**.

## Look & feel

- Attractive enterprise: soft depth, navy accent bars, clear hierarchy.
- Soft page wash + light card shadows (`--shadow-sm` / `--shadow-md`).
- Module headers with subtle navy tint; KPI cards with top accent + bold display numbers.
- Tables: navy header row, zebra rows, soft hover highlight.
- No floating/bouncy hover lifts; use border/shadow/background changes instead.
- Subtle motion only; respect `prefers-reduced-motion`.

## Anti-patterns

- AI purple / pink gradients
- Glassmorphism blobs
- Soft neumorphism
- Card hover `translateY` gimmicks
- Mixed light/dark within a single panel
