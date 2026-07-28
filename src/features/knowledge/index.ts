/**
 * Knowledge Experience Platform — public API (Epic 4)
 */

export type {
  KnowledgeArticle,
  KnowledgeArticleKind,
  KnowledgeArticleStatus,
  KnowledgeAttachment,
  KnowledgeAuthor,
  KnowledgeCategory,
  KnowledgeFacet,
  KnowledgeFacetOption,
  KnowledgePermissionAction,
  KnowledgeRelatedRef,
  KnowledgeReviewItem,
  KnowledgeTimelineEvent,
  KnowledgeTreeNode,
  KnowledgeVersion,
  KnowledgeViewMode
} from "./types";

export {
  getKnowledgeSearchHaystack,
  articleMatchesKnowledgeQuery,
  searchKnowledgeArticles,
  type KnowledgeSearchable,
  type KnowledgeSearchMatch
} from "./search";

export {
  KNOWLEDGE_CATEGORIES,
  buildKnowledgeCatalog,
  buildKnowledgeTree
} from "./catalog";

export { KnowledgeExperience, type KnowledgeExperienceProps } from "./KnowledgeExperience";
