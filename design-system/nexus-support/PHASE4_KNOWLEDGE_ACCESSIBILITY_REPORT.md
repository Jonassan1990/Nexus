# Epic 4 — Knowledge Accessibility Report

**Date:** 2026-07-28  
**Target:** WCAG 2.2 AA  
**Status:** Complete — awaiting review

---

## Implemented

| Concern | Implementation |
| --- | --- |
| Structure | `DetailsTemplate` page header; landmark aside for sidebar; `article` for reader |
| Tree | `role="tree"` / `treeitem` / `group`; `aria-selected` |
| Search | `role="search"` on explorer filters; labeled `SearchBox` |
| Results | `role="listbox"`; arrow/enter via Workspace keyboard helper; `aria-live` result count |
| Focus | Buttons use `:focus-visible` styles; no focus traps in browse/read |
| Touch | `.nx-touch` on tree, results, related, versions |
| Status | Text + `StatusBadge` (not color alone) |
| Forms | Editor fields have `aria-label` / visible labels |
| Motion | No decorative motion; respects existing reduced-motion tokens |

---

## Screen reader notes

- Reader exposes article label from title
- Version buttons use `aria-current` for active version
- Review states spelled in text (`changes requested`)

---

## Gaps / follow-ups

| Gap | Severity | Plan |
| --- | --- | --- |
| Tree expand/collapse not yet toggleable (always expanded) | Medium | Add `aria-expanded` toggling when folder collapse ships |
| Result row vs listbox option roles | Low | Promote rows to `option` + `aria-activedescendant` |
| Save/approve actions disabled placeholders | Low | Enable with announcements when persistence lands |
| Contrast audit in dark density variants | Medium | Visual QA pass against token pairs |

---

## Explicit non-regressions

- Did not alter Work Management / Dashboard keyboard contracts
- Did not remove TopBar / sidebar shell a11y from Phase 2
