import type { ReactNode } from "react";
import { cx, type Tone } from "../shared";
import { Panel, Stack, Cluster, Section, SidebarSection } from "../layout";
import {
  EmptyState,
  SearchBox,
  StatusBadge
} from "../primitives";
import type {
  KnowledgeArticle,
  KnowledgeAttachment,
  KnowledgeFacet,
  KnowledgeRelatedRef,
  KnowledgeReviewItem,
  KnowledgeTimelineEvent,
  KnowledgeTreeNode,
  KnowledgeVersion
} from "@/features/knowledge/types";

function statusTone(status?: string): Tone {
  switch (status) {
    case "published":
      return "success";
    case "in_review":
      return "warning";
    case "deprecated":
      return "danger";
    case "draft":
    default:
      return "neutral";
  }
}

function reviewTone(state: KnowledgeReviewItem["state"]): Tone {
  switch (state) {
    case "approved":
      return "success";
    case "changes_requested":
    case "blocked":
      return "danger";
    default:
      return "warning";
  }
}

/** Category / article tree for keyboardable browse. */
export function KnowledgeTree({
  nodes,
  selectedId,
  onSelect,
  className,
  "aria-label": ariaLabel = "Knowledge categories"
}: {
  nodes: KnowledgeTreeNode[];
  selectedId?: string;
  onSelect: (node: KnowledgeTreeNode) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <nav className={cx("nx-knowledge-tree", className)} aria-label={ariaLabel}>
      <ul className="nx-knowledge-tree__list" role="tree">
        {nodes.map((node) => (
          <KnowledgeTreeBranch
            key={node.id}
            node={node}
            selectedId={selectedId}
            onSelect={onSelect}
            depth={0}
          />
        ))}
      </ul>
    </nav>
  );
}

function KnowledgeTreeBranch({
  node,
  selectedId,
  onSelect,
  depth
}: {
  node: KnowledgeTreeNode;
  selectedId?: string;
  onSelect: (node: KnowledgeTreeNode) => void;
  depth: number;
}) {
  const isSelected = selectedId === node.id || selectedId === node.articleId;
  const hasChildren = Boolean(node.children && node.children.length > 0);

  return (
    <li
      className={cx("nx-knowledge-tree__node", `is-${node.kind}`, isSelected && "is-selected")}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={hasChildren ? true : undefined}
    >
      <button
        type="button"
        className="nx-knowledge-tree__button nx-touch"
        style={{ paddingInlineStart: `calc(var(--space-2) + ${depth} * var(--space-3))` }}
        onClick={() => onSelect(node)}
      >
        <span className="nx-knowledge-tree__label">{node.label}</span>
        {node.kind === "category" && typeof node.count === "number" ? (
          <span className="nx-caption nx-text-muted">{node.count}</span>
        ) : null}
        {node.status ? <StatusBadge tone={statusTone(node.status)}>{node.status}</StatusBadge> : null}
      </button>
      {hasChildren ? (
        <ul className="nx-knowledge-tree__list" role="group">
          {node.children!.map((child) => (
            <KnowledgeTreeBranch
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Persistent knowledge chrome: search + tree + optional saved views. */
export function KnowledgeSidebar({
  title = "Browse",
  description,
  search,
  tree,
  footer,
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  search?: ReactNode;
  tree: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <SidebarSection className={cx("nx-knowledge-sidebar", className)} title={title} aria-label="Knowledge navigation">
      {description ? <p className="nx-caption nx-text-secondary">{description}</p> : null}
      {search}
      <div className="nx-knowledge-sidebar__tree">{tree}</div>
      {footer}
    </SidebarSection>
  );
}

/** Explorer: filters + result list (operational find, not a wiki home). */
export function KnowledgeExplorer({
  title = "Find knowledge",
  description,
  query,
  onQueryChange,
  queryPlaceholder = "Search runbooks, SOPs, keys…",
  facets,
  results,
  empty,
  resultCount,
  onReset,
  className,
  "aria-label": ariaLabel = "Knowledge explorer"
}: {
  title?: ReactNode;
  description?: ReactNode;
  query: string;
  onQueryChange: (query: string) => void;
  queryPlaceholder?: string;
  facets?: KnowledgeFacet[];
  results: ReactNode;
  empty?: ReactNode;
  resultCount?: number;
  onReset?: () => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <section className={cx("nx-knowledge-explorer", className)} aria-label={ariaLabel}>
      <div className="nx-knowledge-explorer__heading">
        <h2 className="nx-h2">{title}</h2>
        {description ? <p className="nx-body nx-text-secondary">{description}</p> : null}
      </div>

      <div className="nx-knowledge-explorer__filters" role="search" aria-label="Knowledge search">
        <div className="nx-knowledge-field">
          <span>Search</span>
          <SearchBox
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={queryPlaceholder}
            aria-label="Search knowledge"
          />
        </div>

        {facets?.map((facet) => (
          <label className="nx-knowledge-field" key={facet.id}>
            <span>{facet.label}</span>
            <select
              value={facet.value}
              onChange={(event) => facet.onChange(event.target.value)}
              aria-label={facet.label}
            >
              {facet.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {onReset ? (
          <div className="nx-knowledge-field nx-knowledge-field--actions">
            <span className="sr-only">Reset</span>
            <button type="button" className="secondary-button" onClick={onReset}>
              Reset
            </button>
          </div>
        ) : null}
      </div>

      {typeof resultCount === "number" ? (
        <p className="nx-caption nx-text-muted" aria-live="polite">
          {resultCount} result{resultCount === 1 ? "" : "s"}
        </p>
      ) : null}

      <div className="nx-knowledge-explorer__results">{results ?? empty}</div>
    </section>
  );
}

/** Reading surface — typography-first, minimal chrome. */
export function KnowledgeReader({
  articleKey,
  title,
  summary,
  badges,
  actions,
  body,
  aiSlot,
  className,
  "aria-label": ariaLabel
}: {
  articleKey: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  body: ReactNode;
  /** Future AI assist / citations region — keep empty until wired. */
  aiSlot?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <article
      className={cx("nx-knowledge-reader", "panel", className)}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : "Knowledge article")}
    >
      <header className="nx-knowledge-reader__hero">
        <div>
          <span className="nx-knowledge-reader__key">{articleKey}</span>
          <h2 className="nx-h2">{title}</h2>
          {summary ? <p className="nx-body nx-text-secondary">{summary}</p> : null}
        </div>
        <div className="nx-knowledge-reader__actions">
          {badges}
          {actions}
        </div>
      </header>
      <div className="nx-knowledge-reader__body nx-knowledge-prose">{body}</div>
      {aiSlot ? (
        <aside className="nx-knowledge-reader__ai" aria-label="AI assist">
          {aiSlot}
        </aside>
      ) : null}
    </article>
  );
}

/** Create / edit article form shell. */
export function KnowledgeEditor({
  title = "Edit article",
  description,
  form,
  footer,
  notice,
  aiSlot,
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  form: ReactNode;
  footer?: ReactNode;
  notice?: ReactNode;
  aiSlot?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("nx-knowledge-editor", "panel", className)} aria-label={typeof title === "string" ? title : "Editor"}>
      <header className="nx-knowledge-editor__header">
        <div>
          <h2 className="nx-h2">{title}</h2>
          {description ? <p className="nx-body nx-text-secondary">{description}</p> : null}
        </div>
      </header>
      {notice}
      <div className="nx-knowledge-editor__form">{form}</div>
      {aiSlot ? (
        <aside className="nx-knowledge-editor__ai" aria-label="AI writing assist">
          {aiSlot}
        </aside>
      ) : null}
      {footer ? <div className="nx-knowledge-editor__footer">{footer}</div> : null}
    </section>
  );
}

/** Metadata inspector for the focused article. */
export function ArticleMetadata({
  article,
  className
}: {
  article: Pick<
    KnowledgeArticle,
    "kind" | "status" | "categoryLabel" | "owner" | "product" | "module" | "site" | "updatedAt" | "publishedAt" | "version" | "tags"
  >;
  className?: string;
}) {
  return (
    <Panel className={cx("nx-article-metadata", className)} aria-label="Article metadata">
      <h3 className="nx-title">Metadata</h3>
      <dl className="nx-article-metadata__list">
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge tone={statusTone(article.status)}>{article.status}</StatusBadge>
          </dd>
        </div>
        <div>
          <dt>Kind</dt>
          <dd>{article.kind}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{article.categoryLabel}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{article.version}</dd>
        </div>
        {article.owner ? (
          <div>
            <dt>Owner</dt>
            <dd>
              {article.owner.name}
              {article.owner.role ? <span className="nx-caption nx-text-muted"> · {article.owner.role}</span> : null}
            </dd>
          </div>
        ) : null}
        {article.product ? (
          <div>
            <dt>Product</dt>
            <dd>{article.product}</dd>
          </div>
        ) : null}
        {article.module ? (
          <div>
            <dt>Module</dt>
            <dd>{article.module}</dd>
          </div>
        ) : null}
        {article.site ? (
          <div>
            <dt>Site</dt>
            <dd>{article.site}</dd>
          </div>
        ) : null}
        {article.updatedAt ? (
          <div>
            <dt>Updated</dt>
            <dd>
              <time>{article.updatedAt}</time>
            </dd>
          </div>
        ) : null}
        {article.publishedAt ? (
          <div>
            <dt>Published</dt>
            <dd>
              <time>{article.publishedAt}</time>
            </dd>
          </div>
        ) : null}
        {article.tags && article.tags.length > 0 ? (
          <div>
            <dt>Tags</dt>
            <dd className="nx-article-metadata__tags">
              {article.tags.map((tag) => (
                <span className="nx-knowledge-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </Panel>
  );
}

export function RelatedArticles({
  title = "Related articles",
  items,
  onOpen,
  emptyTitle = "No related articles",
  emptyBody = "Related operational knowledge will appear here.",
  className
}: {
  title?: ReactNode;
  items: KnowledgeRelatedRef[];
  onOpen?: (id: string) => void;
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
}) {
  return (
    <Section title={title} className={cx("nx-related-articles", className)}>
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <ul className="nx-related-articles__list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="nx-related-articles__item nx-touch"
                onClick={() => onOpen?.(item.id)}
              >
                <strong className="nx-body">{item.title}</strong>
                <span className="nx-caption nx-text-muted">
                  {[item.kind, item.categoryLabel, item.status].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function ArticleTimeline({
  title = "Article timeline",
  events,
  emptyTitle = "No timeline",
  emptyBody = "Lifecycle events will appear here.",
  className
}: {
  title?: ReactNode;
  events: KnowledgeTimelineEvent[];
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
}) {
  return (
    <Section title={title} className={cx("nx-article-timeline", className)}>
      {events.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <ol className="nx-article-timeline__list">
          {events.map((event) => (
            <li key={event.id} className="nx-article-timeline__item">
              <div>
                <strong className="nx-body">{event.title}</strong>
                {event.detail ? <p className="nx-caption nx-text-secondary">{event.detail}</p> : null}
              </div>
              <div className="nx-article-timeline__meta">
                {event.actor ? <span className="nx-caption">{event.actor}</span> : null}
                {event.at ? <time className="nx-caption nx-text-muted">{event.at}</time> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

export function ArticleAttachments({
  title = "Attachments",
  attachments,
  emptyTitle = "No attachments",
  emptyBody = "Operational files linked to this article appear here.",
  actions,
  className
}: {
  title?: ReactNode;
  attachments: KnowledgeAttachment[];
  emptyTitle?: string;
  emptyBody?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Section title={title} className={cx("nx-article-attachments", className)} actions={actions}>
      {attachments.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <ul className="nx-article-attachments__list">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="nx-article-attachments__item">
              <div>
                <strong className="nx-body">{attachment.fileName}</strong>
                <p className="nx-caption nx-text-muted">
                  {[attachment.sizeLabel, attachment.uploadedBy, attachment.uploadedAt].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function VersionHistory({
  title = "Version history",
  versions,
  activeVersion,
  onSelect,
  emptyTitle = "No versions",
  emptyBody = "Version history will appear after the first save.",
  className
}: {
  title?: ReactNode;
  versions: KnowledgeVersion[];
  activeVersion?: string;
  onSelect?: (versionId: string) => void;
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
}) {
  return (
    <Section title={title} className={cx("nx-version-history", className)}>
      {versions.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <ul className="nx-version-history__list">
          {versions.map((version) => {
            const isActive = activeVersion === version.version || activeVersion === version.id;
            return (
              <li key={version.id} className={cx("nx-version-history__item", isActive && "is-active")}>
                <button
                  type="button"
                  className="nx-version-history__button nx-touch"
                  onClick={() => onSelect?.(version.id)}
                  aria-current={isActive ? "true" : undefined}
                >
                  <Cluster gap="sm" align="center">
                    <strong className="nx-body">v{version.version}</strong>
                    <StatusBadge tone={statusTone(version.status)}>{version.status}</StatusBadge>
                  </Cluster>
                  {version.summary ? <p className="nx-caption nx-text-secondary">{version.summary}</p> : null}
                  <p className="nx-caption nx-text-muted">
                    {version.author} · <time>{version.createdAt}</time>
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function ReviewPanel({
  title = "Review",
  description,
  items,
  actions,
  emptyTitle = "No review tasks",
  emptyBody = "Review checklist items appear when an article is in review.",
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  items: KnowledgeReviewItem[];
  actions?: ReactNode;
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
}) {
  return (
    <Panel className={cx("nx-review-panel", className)} aria-label={typeof title === "string" ? title : "Review"}>
      <div className="nx-review-panel__header">
        <div>
          <h3 className="nx-title">{title}</h3>
          {description ? <p className="nx-caption nx-text-secondary">{description}</p> : null}
        </div>
        {actions}
      </div>
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <ul className="nx-review-panel__list">
          {items.map((item) => (
            <li key={item.id} className="nx-review-panel__item">
              <Cluster gap="sm" align="center">
                <StatusBadge tone={reviewTone(item.state)}>{item.state.replaceAll("_", " ")}</StatusBadge>
                <strong className="nx-body">{item.label}</strong>
              </Cluster>
              {item.detail ? <p className="nx-caption nx-text-secondary">{item.detail}</p> : null}
              <p className="nx-caption nx-text-muted">
                {[item.reviewer, item.dueAt ? `Due ${item.dueAt}` : null].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Explore = sidebar (left) + main; Read/Edit may add inspector (right). */
export function KnowledgeWorkspaceLayout({
  sidebar,
  main,
  inspector,
  className
}: {
  sidebar?: ReactNode;
  main: ReactNode;
  inspector?: ReactNode;
  className?: string;
}) {
  if (sidebar && inspector) {
    return (
      <div className={cx("nx-knowledge-workspace", "nx-knowledge-workspace--triple", className)}>
        <div className="nx-knowledge-workspace__sidebar">{sidebar}</div>
        <div className="nx-knowledge-workspace__main">{main}</div>
        <aside className="nx-knowledge-workspace__inspector">{inspector}</aside>
      </div>
    );
  }

  if (sidebar) {
    return (
      <div className={cx("nx-knowledge-workspace", "nx-knowledge-workspace--browse", className)}>
        <div className="nx-knowledge-workspace__sidebar">{sidebar}</div>
        <div className="nx-knowledge-workspace__main">{main}</div>
      </div>
    );
  }

  if (inspector) {
    return (
      <div className={cx("nx-knowledge-workspace", "nx-knowledge-workspace--inspect", className)}>
        <div className="nx-knowledge-workspace__main">{main}</div>
        <aside className="nx-knowledge-workspace__inspector">{inspector}</aside>
      </div>
    );
  }

  return <div className={cx("nx-knowledge-workspace", className)}>{main}</div>;
}

export function KnowledgeArticleResultRow({
  article,
  selected,
  onOpen
}: {
  article: Pick<KnowledgeArticle, "id" | "key" | "title" | "summary" | "kind" | "status" | "categoryLabel" | "updatedAt">;
  selected?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={cx("nx-knowledge-result", "nx-touch", selected && "is-selected")}
      onClick={() => onOpen(article.id)}
      aria-current={selected ? "true" : undefined}
    >
      <div className="nx-knowledge-result__main">
        <span className="nx-knowledge-result__key">{article.key}</span>
        <strong className="nx-body">{article.title}</strong>
        {article.summary ? <p className="nx-caption nx-text-secondary">{article.summary}</p> : null}
      </div>
      <div className="nx-knowledge-result__meta">
        <StatusBadge tone={statusTone(article.status)}>{article.status}</StatusBadge>
        <span className="nx-caption nx-text-muted">
          {[article.kind, article.categoryLabel, article.updatedAt].filter(Boolean).join(" · ")}
        </span>
      </div>
    </button>
  );
}

/** Simple markdown-ish body renderer for operational articles (headings + lists + paragraphs). */
export function KnowledgeProse({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);

  return (
    <Stack gap="md">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) {
          return null;
        }

        if (trimmed.startsWith("## ")) {
          return (
            <h3 className="nx-title" key={index}>
              {trimmed.slice(3)}
            </h3>
          );
        }

        if (trimmed.includes("\n") && trimmed.split("\n").every((line) => /^[-*]|\d+\./.test(line.trim()) || !line.trim())) {
          const lines = trimmed.split("\n").filter(Boolean);
          const ordered = lines.every((line) => /^\d+\./.test(line.trim()));
          const ListTag = ordered ? "ol" : "ul";
          return (
            <ListTag className="nx-knowledge-prose__list" key={index}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{line.replace(/^([-*]|\d+\.)\s*/, "")}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <p className="nx-body" key={index}>
            {trimmed}
          </p>
        );
      })}
    </Stack>
  );
}
