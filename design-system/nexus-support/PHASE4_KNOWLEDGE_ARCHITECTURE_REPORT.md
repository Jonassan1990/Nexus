# Epic 4 — Knowledge Architecture Report

**Date:** 2026-07-28  
**Scope:** Knowledge Experience Platform  
**Status:** Complete — awaiting review

---

## Verdict

Knowledge is now an **operational tool**, not a documentation page. Reusable Knowledge patterns live in the Design System; catalog/search/workflow live under `@/features/knowledge`. Work Management and Command Center were **not** redesigned.

---

## Audit summary (pre-state)

| Area | Finding |
| --- | --- |
| Navigation | No `knowledge` module existed in sidebar / IA |
| Reading | No dedicated reader; closest was Attachments library + ticket panels |
| Search | Only ticket WorkspaceSearch |
| Categories | None for knowledge; attachment tree is ticket-file hierarchy |
| Attachments | Ticket `AttachmentLibraryPanel` / `AttachmentPanel` only |
| Related articles | None |
| Lifecycle | None for articles |
| Permissions | Role gates on modules only |
| Version history | None |
| User workflow | Operators relied on tribal knowledge / ticket threads |

---

## Model

```
KnowledgeArticle
  ← catalog seed (replace with API later)
  ← permissions resolved by consumer (role → canWrite)
```

Statuses: `draft` · `in_review` · `published` · `deprecated`  
Kinds: `runbook` · `sop` · `howto` · `faq` · `policy` · `reference`

---

## Layers

| Layer | Path | Responsibility |
| --- | --- | --- |
| Types | `src/features/knowledge/types.ts` | Article contracts |
| Catalog | `catalog.ts` | Seed + tree builder |
| Search | `search.ts` | Haystack using WorkspaceSearch `normalizeWorkspaceQuery` |
| Experience | `KnowledgeExperience.tsx` | Explore / read / edit / review workflow |
| Patterns | `src/design-system/patterns/knowledge.tsx` | Presentational shells |
| Styles | `src/styles/knowledge.css` | Token-based layout |
| Barrel | `@/features/knowledge` + `@/design-system` | Public API |
| Consumer | `NexusPortal` `activeModule === "knowledge"` | Thin wiring |

---

## Reusable experiences delivered

| Component | Role |
| --- | --- |
| `KnowledgeExplorer` | Search + facets + results |
| `KnowledgeReader` | Typography-first reading surface + AI slot |
| `KnowledgeEditor` | Edit shell + AI slot |
| `KnowledgeSidebar` | Browse chrome |
| `KnowledgeTree` | Category / article tree |
| `RelatedArticles` | Cross-links |
| `ArticleTimeline` | Lifecycle events |
| `ArticleAttachments` | Linked files |
| `ArticleMetadata` | Ownership / status / tags |
| `ReviewPanel` | Review checklist |
| `VersionHistory` | Version list |
| `KnowledgeWorkspaceLayout` | Browse / inspect / triple grid |

---

## Platform dependencies

- Design System primitives / layout / `DetailsTemplate`
- Product Rulebook Knowledge blueprint
- Workspace Services (`normalizeWorkspaceQuery`, `handleListNavigationKeyDown`)
- Semantic tokens only (`knowledge.css`)

---

## Explicit non-goals

- Redesigning Work Management / Tickets / Dashboard
- Persisted CMS backend / real publish pipeline
- Full AI chat product (slots reserved only)
- Migrating ticket attachments into Knowledge
