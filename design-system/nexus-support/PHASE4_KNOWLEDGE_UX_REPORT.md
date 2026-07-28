# Epic 4 — Knowledge UX Report

**Date:** 2026-07-28  
**Status:** Complete — awaiting review

---

## Job to be done

Operators must **find the right runbook/SOP in seconds**, read without distraction, and see ownership, status, and version trust signals before acting.

---

## Experience map

```
Sidebar Knowledge
  → Explore (tree + search + results)
  → Read (prose + inspector)
  → Edit (authors / governance)
  → Review (in_review articles)
```

---

## UX goals → design responses

| Goal | Response |
| --- | --- |
| Fast scanning | Result rows: key, title, summary, status; live result count |
| Minimal clicks | Tree or result → read in one click; related articles one click |
| Keyboard friendly | Result listbox + Workspace `handleListNavigationKeyDown` |
| Clear ownership | `ArticleMetadata` owner / product / site |
| Clear status | Status badges + version history + timeline |
| Clear priorities | Operational kinds (runbook/SOP) and review panel for blockers |
| Mobile | Grids collapse to single column under 960px; touch targets on tree/results |

---

## Reading experience

- Max-width prose (`72ch`), calm hero, no decorative chrome
- Body rendered as structured headings / lists / paragraphs
- Inspector stacks metadata, related, attachments, timeline, versions, review

---

## Distraction control

- No KPI strips, charts, or marketing cards
- AI region is optional and labeled as future-ready — not a second product
- Edit/review modes keep the same inspector language as read

---

## Empty / filter states

- No match → explicit “filters / category” empty copy
- No selection → select-an-article empty state
- Review empty when not in review

---

## Out of scope

- Ticket workspace UX changes
- Command Center hierarchy changes
