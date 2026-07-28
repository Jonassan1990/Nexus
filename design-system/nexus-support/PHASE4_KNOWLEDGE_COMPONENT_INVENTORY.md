# Epic 4 — Knowledge Component Inventory

**Date:** 2026-07-28

---

## Knowledge platform

| Component | Package | File |
| --- | --- | --- |
| Knowledge types | `@/features/knowledge` | `types.ts` |
| `buildKnowledgeCatalog` / tree | `@/features/knowledge` | `catalog.ts` |
| `searchKnowledgeArticles` | `@/features/knowledge` | `search.ts` |
| `KnowledgeExperience` | `@/features/knowledge` | `KnowledgeExperience.tsx` |
| `KnowledgeExplorer` | `@/design-system` | `patterns/knowledge.tsx` |
| `KnowledgeReader` | `@/design-system` | `patterns/knowledge.tsx` |
| `KnowledgeEditor` | `@/design-system` | `patterns/knowledge.tsx` |
| `KnowledgeSidebar` | `@/design-system` | `patterns/knowledge.tsx` |
| `KnowledgeTree` | `@/design-system` | `patterns/knowledge.tsx` |
| `RelatedArticles` | `@/design-system` | `patterns/knowledge.tsx` |
| `ArticleTimeline` | `@/design-system` | `patterns/knowledge.tsx` |
| `ArticleAttachments` | `@/design-system` | `patterns/knowledge.tsx` |
| `ArticleMetadata` | `@/design-system` | `patterns/knowledge.tsx` |
| `ReviewPanel` | `@/design-system` | `patterns/knowledge.tsx` |
| `VersionHistory` | `@/design-system` | `patterns/knowledge.tsx` |
| `KnowledgeWorkspaceLayout` | `@/design-system` | `patterns/knowledge.tsx` |
| `KnowledgeArticleResultRow` | `@/design-system` | `patterns/knowledge.tsx` |
| `KnowledgeProse` | `@/design-system` | `patterns/knowledge.tsx` |

Styles: `src/styles/knowledge.css`  
Template: `DetailsTemplate`

---

## Portal consumer

| Surface | Uses |
| --- | --- |
| `activeModule === "knowledge"` | `KnowledgeExperience` |
| Nav + i18n | `knowledge` module key |

---

## Still external (intentionally)

- Ticket attachment library
- WorkItem* patterns
- Command Center sections
- CMS / publish API
