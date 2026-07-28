# Phase 3 — Performance Notes

**Date:** 2026-07-28

---

## Wins

- Removed CSS conic-gradient donut and multiple percentage-width bar tracks from the hot Dashboard path.  
- Capped list windows (continue 5, assigned 8, alerts 8, activity 8, releases 5) to bound DOM size.  
- Presentational sections are light — no chart libraries.

## Costs / watch items

- `DashboardOverview` still derives approvals, clarifications, release grouping, and Jira importance filters on each render (same class of work as before).  
- `useReleasePlanVersionDateLookup` still may call Jira sync metadata when enabled — unchanged cost, now only feeding the Reports table.  
- Prefer memoizing heavy derivations in a later pass if profiling shows Command Center as a bottleneck under large ticket sets.

## Guidance

Do not reintroduce decorative chart DOM for “visual interest.” Prefer tables and counts.
