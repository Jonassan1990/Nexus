# Phase 2 — Accessibility Report

**Date:** 2026-07-28  
**Scope:** Shell keyboard, focus, and semantics

---

## Audit — gaps addressed

| Gap | Fix |
| --- | --- |
| No focus move after module change | `focusMainContent()` → `#main-content` (`tabIndex={-1}`) |
| Mobile drawer not modal | `role="dialog"` + `aria-modal="true"` when open |
| Closed drawer still in a11y tree | `aria-hidden` + `tabIndex={-1}` on controls when mobile viewport and closed |
| Notification badge under-counted | Sum attention + unread; aria-label names both |
| Popovers Escape without focus restore | Focus returns to notification / profile trigger |
| Tabs without `aria-controls` | Needs attention / Notifications panels wired |
| Inert Application switcher | Removed; replaced with labelled command palette control |
| Mobile search missing | Dedicated search control + combobox listbox |
| Menu button state unclear | `aria-expanded` + open/close labels |
| Mobile drawer lost navy contrast | Restored `--side-rail-bg` (Scania chrome) |

---

## Keyboard model

| Chord / key | Behaviour |
| --- | --- |
| `Ctrl/Cmd+K` | Toggle command palette |
| `Esc` | Close palette, drawer, search lists, or popovers (with focus restore) |
| Arrow keys | Ticket search + palette list navigation |
| Enter | Activate highlighted search / palette item |
| Tab | Standard document order; closed mobile drawer excluded |

---

## Remaining known limits (accepted for Phase 2)

- Full focus **trap** inside the mobile drawer is not implemented (focus moves to first nav item; Escape closes). Can harden in a later a11y pass.
- `TdsHeaderHamburger` does not expose `aria-expanded` the same way as the native mobile button.
- Command palette does not yet trap Tab inside the dialog (Esc / scrim close).

---

## Conformance stance

Shell targets WCAG 2.2 AA practices for chrome: name, role, value; visible focus; keyboard operability; no information by colour alone for attention badges (counts + labels).
