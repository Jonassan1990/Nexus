/**
 * Knowledge search — uses WorkspaceSearch normalize; does not invent a parallel query language.
 */

import { normalizeWorkspaceQuery } from "@/features/workspace";
import type { KnowledgeArticle } from "./types";

export type KnowledgeSearchable = Pick<
  KnowledgeArticle,
  "id" | "key" | "title" | "summary" | "body" | "kind" | "status" | "categoryLabel" | "tags" | "product" | "module" | "site"
>;

export function getKnowledgeSearchHaystack(article: KnowledgeSearchable): string {
  return [
    article.key,
    article.title,
    article.summary,
    article.body,
    article.kind,
    article.status,
    article.categoryLabel,
    article.product,
    article.module,
    article.site,
    ...(article.tags ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function articleMatchesKnowledgeQuery(article: KnowledgeSearchable, query: string): boolean {
  const normalized = normalizeWorkspaceQuery(query);
  if (!normalized) {
    return true;
  }
  return getKnowledgeSearchHaystack(article).includes(normalized);
}

export type KnowledgeSearchMatch<T> = {
  item: T;
  score: number;
  exactKey: boolean;
};

export function searchKnowledgeArticles<T extends KnowledgeSearchable>(
  articles: readonly T[],
  query: string,
  limit = 50
): KnowledgeSearchMatch<T>[] {
  const normalized = normalizeWorkspaceQuery(query);

  if (!normalized) {
    return articles.slice(0, limit).map((item) => ({ item, score: 0, exactKey: false }));
  }

  const matches: KnowledgeSearchMatch<T>[] = [];

  for (const article of articles) {
    const key = article.key.toLowerCase();
    const title = article.title.toLowerCase();
    const haystack = getKnowledgeSearchHaystack(article);

    if (!haystack.includes(normalized)) {
      continue;
    }

    const exactKey = key === normalized;
    const score = exactKey
      ? 100
      : key.startsWith(normalized)
        ? 80
        : title.startsWith(normalized)
          ? 60
          : title.includes(normalized)
            ? 40
            : 20;

    matches.push({ item: article, score, exactKey });
  }

  return matches.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title)).slice(0, limit);
}
