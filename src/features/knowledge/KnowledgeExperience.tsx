"use client";

import { useMemo, useState } from "react";
import {
  DetailsTemplate,
  EmptyState,
  KnowledgeArticleResultRow,
  KnowledgeExplorer,
  KnowledgeEditor,
  KnowledgeProse,
  KnowledgeReader,
  KnowledgeSidebar,
  KnowledgeTree,
  KnowledgeWorkspaceLayout,
  ArticleAttachments,
  ArticleMetadata,
  ArticleTimeline,
  RelatedArticles,
  ReviewPanel,
  StatusBadge,
  VersionHistory,
  Cluster,
  Stack
} from "@/design-system";
import { handleListNavigationKeyDown } from "@/features/workspace";
import {
  buildKnowledgeCatalog,
  buildKnowledgeTree,
  KNOWLEDGE_CATEGORIES
} from "./catalog";
import { articleMatchesKnowledgeQuery, searchKnowledgeArticles } from "./search";
import type {
  KnowledgeArticle,
  KnowledgeFacet,
  KnowledgeTreeNode,
  KnowledgeViewMode
} from "./types";

export type KnowledgeExperienceProps = {
  canWrite?: boolean;
  initialArticleId?: string;
  onRememberArticle?: (articleId: string) => void;
};

function statusTone(status: string) {
  switch (status) {
    case "published":
      return "success" as const;
    case "in_review":
      return "warning" as const;
    case "deprecated":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

/**
 * Operational Knowledge Experience — explore → read → edit/review.
 * Presentational shells come from the Design System; this owns workflow state.
 */
export function KnowledgeExperience({
  canWrite = false,
  initialArticleId,
  onRememberArticle
}: KnowledgeExperienceProps) {
  const catalog = useMemo(() => buildKnowledgeCatalog(canWrite), [canWrite]);
  const tree = useMemo(() => buildKnowledgeTree(KNOWLEDGE_CATEGORIES, catalog), [catalog]);

  const [mode, setMode] = useState<KnowledgeViewMode>(initialArticleId ? "read" : "explore");
  const [selectedId, setSelectedId] = useState<string | undefined>(initialArticleId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();

  const selected = catalog.find((article) => article.id === selectedId);

  const filtered = useMemo(() => {
    const ranked = searchKnowledgeArticles(catalog, query, catalog.length).map((match) => match.item);

    return ranked.filter((article) => {
      if (selectedCategoryId) {
        const inCategory = article.categoryId === selectedCategoryId;
        const inChild = KNOWLEDGE_CATEGORIES.some(
          (item) => item.id === article.categoryId && item.parentId === selectedCategoryId
        );
        if (!inCategory && !inChild) {
          return false;
        }
      }
      if (kindFilter !== "all" && article.kind !== kindFilter) {
        return false;
      }
      if (statusFilter !== "all" && article.status !== statusFilter) {
        return false;
      }
      return articleMatchesKnowledgeQuery(article, query);
    });
  }, [catalog, kindFilter, query, selectedCategoryId, statusFilter]);

  const related = useMemo(() => {
    if (!selected) {
      return [];
    }
    const byId = new Map(catalog.map((article) => [article.id, article]));
    return selected.relatedIds
      .map((id) => byId.get(id))
      .filter((article): article is KnowledgeArticle => Boolean(article))
      .map((article) => ({
        id: article.id,
        title: article.title,
        kind: article.kind,
        status: article.status,
        categoryLabel: article.categoryLabel
      }));
  }, [catalog, selected]);

  const facets: KnowledgeFacet[] = [
    {
      id: "kind",
      label: "Kind",
      value: kindFilter,
      onChange: setKindFilter,
      options: [
        { value: "all", label: "All kinds" },
        { value: "runbook", label: "Runbook" },
        { value: "sop", label: "SOP" },
        { value: "howto", label: "How-to" },
        { value: "faq", label: "FAQ" },
        { value: "policy", label: "Policy" },
        { value: "reference", label: "Reference" }
      ]
    },
    {
      id: "status",
      label: "Status",
      value: statusFilter,
      onChange: setStatusFilter,
      options: [
        { value: "all", label: "All statuses" },
        { value: "published", label: "Published" },
        { value: "in_review", label: "In review" },
        { value: "draft", label: "Draft" },
        { value: "deprecated", label: "Deprecated" }
      ]
    }
  ];

  function openArticle(id: string, nextMode: KnowledgeViewMode = "read") {
    const article = catalog.find((item) => item.id === id);
    if (!article) {
      return;
    }
    setSelectedId(id);
    setSelectedCategoryId(article.categoryId);
    setMode(nextMode);
    setSelectedVersionId(article.versions[article.versions.length - 1]?.id);
    setDraftTitle(article.title);
    setDraftSummary(article.summary ?? "");
    setDraftBody(article.body);
    onRememberArticle?.(id);
  }

  function onTreeSelect(node: KnowledgeTreeNode) {
    if (node.kind === "article" && node.articleId) {
      openArticle(node.articleId);
      return;
    }
    setSelectedCategoryId(node.id);
    setSelectedId(undefined);
    setMode("explore");
  }

  function resetFilters() {
    setQuery("");
    setKindFilter("all");
    setStatusFilter("all");
    setSelectedCategoryId(undefined);
    setActiveResultIndex(0);
  }

  const sidebar = (
    <KnowledgeSidebar
      title="Knowledge tree"
      description="Categories and operational articles."
      tree={
        <KnowledgeTree
          nodes={tree}
          selectedId={selectedId ? `article:${selectedId}` : selectedCategoryId}
          onSelect={onTreeSelect}
        />
      }
    />
  );

  const inspector = selected ? (
    <Stack gap="md">
      <ArticleMetadata article={selected} />
      <RelatedArticles items={related} onOpen={(id) => openArticle(id)} />
      <ArticleAttachments attachments={selected.attachments} />
      <ArticleTimeline events={selected.timeline} />
      <VersionHistory
        versions={[...selected.versions].reverse()}
        activeVersion={selectedVersionId}
        onSelect={setSelectedVersionId}
      />
      {selected.status === "in_review" || mode === "review" ? (
        <ReviewPanel
          items={selected.reviews}
          actions={
            selected.permissions.review ? (
              <Cluster gap="sm">
                <button type="button" className="secondary-button" disabled>
                  Request changes
                </button>
                <button type="button" className="primary-button" disabled>
                  Approve
                </button>
              </Cluster>
            ) : undefined
          }
        />
      ) : null}
    </Stack>
  ) : undefined;

  const exploreMain = (
    <KnowledgeExplorer
      title="Operational knowledge"
      description="Find runbooks, SOPs, and policies without leaving the support workflow."
      query={query}
      onQueryChange={setQuery}
      facets={facets}
      resultCount={filtered.length}
      onReset={resetFilters}
      results={
        filtered.length === 0 ? (
          <EmptyState
            title="No articles match"
            body="Clear filters or pick another category in the knowledge tree."
          />
        ) : (
          <div
            className="nx-knowledge-explorer__results"
            role="listbox"
            aria-label="Knowledge results"
            tabIndex={0}
            onKeyDown={(event) =>
              handleListNavigationKeyDown(event, {
                length: filtered.length,
                activeIndex: activeResultIndex,
                onChange: setActiveResultIndex,
                onEnter: (index) => openArticle(filtered[index].id)
              })
            }
          >
            {filtered.map((article, index) => (
              <KnowledgeArticleResultRow
                key={article.id}
                article={article}
                selected={article.id === selectedId || index === activeResultIndex}
                onOpen={openArticle}
              />
            ))}
          </div>
        )
      }
    />
  );

  const readerActions = selected ? (
    <Cluster gap="sm">
      <button type="button" className="secondary-button" onClick={() => setMode("explore")}>
        Back to explorer
      </button>
      {selected.permissions.edit ? (
        <button type="button" className="secondary-button" onClick={() => setMode("edit")}>
          Edit
        </button>
      ) : null}
      {selected.permissions.review && selected.status === "in_review" ? (
        <button type="button" className="secondary-button" onClick={() => setMode("review")}>
          Review
        </button>
      ) : null}
    </Cluster>
  ) : null;

  const readerMain = selected ? (
    <KnowledgeReader
      articleKey={selected.key}
      title={selected.title}
      summary={selected.summary}
      badges={
        <Cluster gap="sm">
          <StatusBadge tone={statusTone(selected.status)}>{selected.status}</StatusBadge>
          <StatusBadge tone="neutral">{selected.kind}</StatusBadge>
        </Cluster>
      }
      actions={readerActions}
      body={<KnowledgeProse text={selected.body} />}
      aiSlot={
        selected.aiContext?.suggestedQueries?.length ? (
          <div>
            <h3 className="nx-title">AI-ready context</h3>
            <p className="nx-caption nx-text-secondary">
              Reserved for future assist. Suggested operational queries:
            </p>
            <ul className="nx-knowledge-prose__list">
              {selected.aiContext.suggestedQueries.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          </div>
        ) : undefined
      }
    />
  ) : (
    <EmptyState title="Select an article" body="Choose a result or tree item to read." />
  );

  const editorMain = selected ? (
    <KnowledgeEditor
      title={`Edit ${selected.key}`}
      description="Operational edits stay in draft until review publishes them."
      form={
        <>
          <label className="nx-knowledge-field">
            <span>Title</span>
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} aria-label="Title" />
          </label>
          <label className="nx-knowledge-field">
            <span>Summary</span>
            <input
              value={draftSummary}
              onChange={(event) => setDraftSummary(event.target.value)}
              aria-label="Summary"
            />
          </label>
          <label className="nx-knowledge-field">
            <span>Body</span>
            <textarea
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              rows={16}
              aria-label="Body"
            />
          </label>
        </>
      }
      footer={
        <>
          <button type="button" className="secondary-button" onClick={() => setMode("read")}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setMode("read")}
            disabled={!selected.permissions.edit}
          >
            Save draft
          </button>
        </>
      }
      aiSlot={
        <p className="nx-caption nx-text-secondary">
          Future AI writing assist will land in this slot without changing the editor chrome.
        </p>
      }
    />
  ) : null;

  const main =
    mode === "edit" ? editorMain : mode === "explore" || !selected ? exploreMain : readerMain;

  return (
    <DetailsTemplate
      title="Knowledge"
      description="Operational runbooks, SOPs, and policies — find fast, read clean, act with clear ownership."
      actions={
        canWrite ? (
          <button type="button" className="primary-button" disabled title="Create flow ships in a later wave">
            New article
          </button>
        ) : undefined
      }
      detail={
        <KnowledgeWorkspaceLayout
          sidebar={sidebar}
          main={main}
          inspector={selected && mode !== "explore" ? inspector : undefined}
        />
      }
    />
  );
}
