# Epic 4 — Knowledge Performance Notes

**Date:** 2026-07-28

---

## Wins

- Seed catalog is small and memoized in `KnowledgeExperience`
- Search is linear over in-memory articles (fine for hundreds; not thousands)
- No chart libraries or heavy markdown parsers — lightweight `KnowledgeProse`
- CSS grids avoid fixed heights / nested scroll traps where possible
- Result window is the filtered set itself (seed size ≈ 6)

---

## Watch items

| Item | Risk | Guidance |
| --- | --- | --- |
| Full-body haystack includes article body | Grows with long SOPs | Consider title/summary/tag index + optional body search later |
| Always-expanded tree | DOM size with large catalogs | Collapse categories by default above N nodes |
| Triple column on desktop | Paint cost negligible | Keep inspector sections lazy-mount when catalog is large |
| Future AI slot | Network / streaming | Load assist async; never block first paint of reader |

---

## Guidance

Prefer ranked search + category facets over loading every article body into the explorer DOM. Reader mounts one article body at a time.
