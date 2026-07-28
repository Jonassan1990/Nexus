# Phase 3 — Accessibility Report

**Date:** 2026-07-28

---

## Improvements

| Topic | Change |
| --- | --- |
| Structure | Each block is a labelled `Section` with `h2` |
| Critical alerts | `role="alert"` banner when count > 0 |
| Lists | Semantic lists / buttons for row activation |
| Metrics | `role="list"` grid; interactive `MetricCard` buttons |
| Queues | Focusable destination controls with visible focus |
| Tables | `ReportSection` uses `DataTable` with column headers |
| Empty states | Per-section status messaging |
| Motion / height | No fixed panel heights; responsive grids |

---

## Keyboard

- Tab reaches every interactive row, queue, metric, and report action  
- Enter / Space activate `DataTable` interactive rows (when used) and buttons  
- Focus rings use semantic `--focus-ring` tokens  

---

## Residual limits

- Critical alert list and banner both surface the same count (intentional redundancy for AT users scanning alerts)  
- Full live region announcements on data refresh are not added in this phase
