# Epic 4 — Knowledge Migration Strategy

**Date:** 2026-07-28  
**Status:** Complete — awaiting review

---

## Starting point

Knowledge did **not** exist as a module. Migration is **greenfield adoption**, not a rewrite of an old Knowledge UI.

Related surfaces that stay as-is until later waves:

- Ticket `AttachmentPanel` / `AttachmentLibraryPanel`
- Clarification threads (not Knowledge articles)
- Work Management patterns (untouched)

---

## Waves

### Wave 0 — Platform (this epic) ✅

- Types, catalog seed, search, DS patterns, CSS
- `knowledge` nav module + i18n
- `KnowledgeExperience` consumer
- Product docs (IA, blueprints, rulebook)

### Wave 1 — Persistence

- Replace `buildKnowledgeCatalog` with API / DB
- Real save draft / submit review / publish
- Attachment upload storage for articles

### Wave 2 — Workspace depth

- `SavedViews` scope `knowledge`
- `RecentItems` / pins for article ids
- Deep links: `module=knowledge&articleId=`

### Wave 3 — AI assist

- Populate `aiSlot` with grounded suggestions using `aiContext`
- Cite article version + attachments; no free-form hallucination UI

### Wave 4 — Cross-links from work

- “Related knowledge” on WorkItem details (consume Knowledge patterns; do not fork)
- Suggest runbooks from ticket product/site

---

## Rollback

- Remove `knowledge` nav item and module branch
- Feature folder + `knowledge.css` / patterns are isolated — no Work Management coupling

---

## Compatibility rules

- Do not move ticket attachments into Knowledge without an explicit product decision
- Do not embed Knowledge chrome inside Dashboard or Ticket list
