/**
 * Knowledge Experience Platform — domain model (Epic 4)
 * Knowledge is an operational tool, not a documentation brochure.
 * Do not bake Ticket / WorkItem UI into this layer.
 */

import type { Tone } from "@/design-system/shared";

export type KnowledgeArticleStatus =
  | "draft"
  | "in_review"
  | "published"
  | "deprecated"
  | (string & {});

export type KnowledgeArticleKind =
  | "runbook"
  | "sop"
  | "faq"
  | "howto"
  | "policy"
  | "reference"
  | (string & {});

export type KnowledgePermissionAction =
  | "read"
  | "edit"
  | "review"
  | "publish"
  | "manage_attachments"
  | (string & {});

export type KnowledgeCategory = {
  id: string;
  label: string;
  parentId?: string;
  description?: string;
  articleCount?: number;
};

export type KnowledgeAttachment = {
  id: string;
  fileName: string;
  mimeType?: string;
  sizeLabel?: string;
  uploadedBy?: string;
  uploadedAt?: string;
};

export type KnowledgeVersion = {
  id: string;
  version: string;
  summary?: string;
  author: string;
  createdAt: string;
  status: KnowledgeArticleStatus;
};

export type KnowledgeTimelineEvent = {
  id: string;
  title: string;
  detail?: string;
  actor?: string;
  at?: string;
  tone?: Tone;
};

export type KnowledgeReviewItem = {
  id: string;
  label: string;
  detail?: string;
  state: "pending" | "approved" | "changes_requested" | "blocked";
  reviewer?: string;
  dueAt?: string;
};

export type KnowledgeRelatedRef = {
  id: string;
  title: string;
  kind?: KnowledgeArticleKind;
  status?: KnowledgeArticleStatus;
  categoryLabel?: string;
};

export type KnowledgeAuthor = {
  id?: string;
  name: string;
  role?: string;
};

export type KnowledgeArticle = {
  id: string;
  key: string;
  title: string;
  summary?: string;
  body: string;
  kind: KnowledgeArticleKind;
  status: KnowledgeArticleStatus;
  categoryId: string;
  categoryLabel: string;
  tags?: string[];
  owner?: KnowledgeAuthor;
  reviewers?: KnowledgeAuthor[];
  product?: string;
  module?: string;
  site?: string;
  updatedAt?: string;
  publishedAt?: string;
  version: string;
  versions: KnowledgeVersion[];
  timeline: KnowledgeTimelineEvent[];
  attachments: KnowledgeAttachment[];
  relatedIds: string[];
  reviews: KnowledgeReviewItem[];
  /** Permission flags resolved by the consumer for the current actor. */
  permissions: Partial<Record<KnowledgePermissionAction, boolean>>;
  /** Reserved for future AI assist payloads / citations. */
  aiContext?: {
    suggestedQueries?: string[];
    lastIndexedAt?: string;
  };
};

export type KnowledgeTreeNode = {
  id: string;
  label: string;
  kind: "category" | "article";
  parentId?: string;
  children?: KnowledgeTreeNode[];
  articleId?: string;
  status?: KnowledgeArticleStatus;
  count?: number;
};

export type KnowledgeFacetOption = {
  value: string;
  label: string;
};

export type KnowledgeFacet = {
  id: string;
  label: string;
  value: string;
  options: KnowledgeFacetOption[];
  onChange: (value: string) => void;
};

export type KnowledgeViewMode = "explore" | "read" | "edit" | "review";
