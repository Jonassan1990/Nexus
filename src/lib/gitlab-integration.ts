export type GitLabActionConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  token?: string;
};

export type GitLabGroupResult = {
  id: number;
  name: string;
  fullPath: string;
  webUrl: string;
  visibility: string;
};

export type GitLabProjectResult = {
  id: number;
  name: string;
  pathWithNamespace: string;
  webUrl: string;
  defaultBranch: string;
  visibility: string;
  namespaceId?: number;
  namespaceFullPath?: string;
  namespaceName?: string;
};

export type GitLabCodeSearchResult = {
  basename: string;
  path: string;
  filename: string;
  ref: string;
  projectId: number;
};

export type GitLabRepositoryFileResult = {
  filePath: string;
  ref: string;
  content: string;
  contentType: string;
  sizeBytes: number;
  truncated: boolean;
};

type GitLabProjectResponse = {
  id?: number;
  name?: string;
  path_with_namespace?: string;
  web_url?: string;
  default_branch?: string;
  visibility?: string;
  namespace?: {
    id?: number;
    name?: string;
    full_path?: string;
    kind?: string;
  };
};

type GitLabGroupResponse = {
  id?: number;
  name?: string;
  full_path?: string;
  web_url?: string;
  visibility?: string;
};

type GitLabCodeSearchResponse = {
  basename?: string;
  path?: string;
  filename?: string;
  ref?: string;
  project_id?: number;
};

const maxRawFileBytes = 200000;

export function normalizeGitLabBaseUrl(value: string): string {
  const trimmedValue = value.trim().replace(/\/+$/, "");

  if (!trimmedValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const apiIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === "api");
    const basePath = apiIndex >= 0 ? pathSegments.slice(0, apiIndex).join("/") : pathSegments.join("/");

    return `${parsedUrl.origin}${basePath ? `/${basePath}` : ""}`;
  } catch {
    return trimmedValue;
  }
}

export function buildGitLabApiUrl(
  config: GitLabActionConfig,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {}
): string {
  const url = new URL(`${normalizeGitLabBaseUrl(config.apiBaseUrl)}/api/v4/${path.replace(/^\/+/, "")}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function validateGitLabActionConfig(config: GitLabActionConfig): string[] {
  const errors: string[] = [];
  const apiBaseUrl = normalizeGitLabBaseUrl(config.apiBaseUrl);

  if (!config.enabled) {
    errors.push("GitLab integration must be enabled before running GitLab actions.");
  }

  if (!apiBaseUrl) {
    errors.push("GitLab base URL is required.");
  } else {
    try {
      const parsedUrl = new URL(apiBaseUrl);

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        errors.push("GitLab base URL must be a valid HTTP or HTTPS URL.");
      }
    } catch {
      errors.push("GitLab base URL must be a valid HTTP or HTTPS URL.");
    }
  }

  if (!config.token?.trim()) {
    errors.push("GitLab access token is required for project and source lookup.");
  }

  return errors;
}

function buildGitLabHeaders(config: GitLabActionConfig): HeadersInit {
  return {
    Accept: "application/json",
    "PRIVATE-TOKEN": config.token?.trim() ?? ""
  };
}

function getGitLabErrorDetails(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const body = value as { message?: unknown; error?: unknown };
  const details: string[] = [];

  if (typeof body.message === "string") {
    details.push(body.message);
  } else if (Array.isArray(body.message)) {
    details.push(body.message.filter((item) => typeof item === "string").join(" "));
  } else if (body.message && typeof body.message === "object") {
    details.push(
      Object.entries(body.message)
        .map(([key, message]) => `${key}: ${String(message)}`)
        .join(" ")
    );
  }

  if (typeof body.error === "string") {
    details.push(body.error);
  }

  return details.filter(Boolean);
}

async function fetchGitLab<T>(url: string, config: GitLabActionConfig): Promise<T> {
  const response = await fetch(url, {
    headers: buildGitLabHeaders(config),
    signal: AbortSignal.timeout(20000)
  });
  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const details = getGitLabErrorDetails(responseBody);

    throw new Error(details.length > 0 ? details.join(" ") : `GitLab returned HTTP ${response.status}.`);
  }

  return responseBody as T;
}

function mapGitLabProject(project: GitLabProjectResponse): GitLabProjectResult {
  return {
    id: project.id as number,
    name: project.name ?? "Unnamed project",
    pathWithNamespace: project.path_with_namespace ?? "",
    webUrl: project.web_url ?? "",
    defaultBranch: project.default_branch ?? "main",
    visibility: project.visibility ?? "",
    namespaceId: project.namespace?.id,
    namespaceFullPath: project.namespace?.full_path,
    namespaceName: project.namespace?.name
  };
}

export async function listGitLabGroups(
  config: GitLabActionConfig,
  query = "",
  limit = 50
): Promise<GitLabGroupResult[]> {
  const searchTerm = query.trim();
  const url = buildGitLabApiUrl(config, "groups", {
    search: searchTerm || undefined,
    all_available: true,
    order_by: "name",
    sort: "asc",
    per_page: Math.max(1, Math.min(limit, 100))
  });
  const groups = await fetchGitLab<GitLabGroupResponse[]>(url, config);

  return groups
    .filter((group) => typeof group.id === "number")
    .map((group) => ({
      id: group.id as number,
      name: group.name ?? "Unnamed group",
      fullPath: group.full_path ?? "",
      webUrl: group.web_url ?? "",
      visibility: group.visibility ?? ""
    }));
}

export async function listGitLabProjects(
  config: GitLabActionConfig,
  query = "",
  groupId?: number,
  limit = 50
): Promise<GitLabProjectResult[]> {
  const searchTerm = query.trim();
  const path = groupId
    ? `groups/${encodeURIComponent(String(groupId))}/projects`
    : "projects";
  const url = buildGitLabApiUrl(config, path, {
    search: searchTerm || undefined,
    membership: groupId ? undefined : true,
    include_subgroups: groupId ? true : undefined,
    simple: true,
    order_by: "name",
    sort: "asc",
    per_page: Math.max(1, Math.min(limit, 100))
  });
  const projects = await fetchGitLab<GitLabProjectResponse[]>(url, config);

  return projects
    .filter((project) => typeof project.id === "number")
    .map((project) => mapGitLabProject(project));
}

export async function searchGitLabProjects(
  config: GitLabActionConfig,
  query: string,
  limit = 10
): Promise<GitLabProjectResult[]> {
  return listGitLabProjects(config, query, undefined, Math.max(1, Math.min(limit, 20)));
}

export async function searchGitLabCode(
  config: GitLabActionConfig,
  projectId: number,
  search: string,
  ref?: string,
  limit = 20
): Promise<GitLabCodeSearchResult[]> {
  const url = buildGitLabApiUrl(config, `projects/${encodeURIComponent(String(projectId))}/search`, {
    scope: "blobs",
    search: search.trim(),
    ref: ref?.trim(),
    per_page: Math.max(1, Math.min(limit, 50))
  });
  const results = await fetchGitLab<GitLabCodeSearchResponse[]>(url, config);

  return results
    .filter((result) => result.path || result.filename)
    .map((result) => ({
      basename: result.basename ?? result.path?.split("/").pop() ?? result.filename ?? "",
      path: result.path ?? result.filename ?? "",
      filename: result.filename ?? result.path ?? "",
      ref: result.ref ?? ref?.trim() ?? "",
      projectId: result.project_id ?? projectId
    }));
}

export async function getGitLabRawFile(
  config: GitLabActionConfig,
  projectId: number,
  filePath: string,
  ref: string
): Promise<GitLabRepositoryFileResult> {
  const normalizedPath = filePath.trim().replace(/^\/+/, "");
  const normalizedRef = ref.trim();
  const url = buildGitLabApiUrl(
    config,
    `projects/${encodeURIComponent(String(projectId))}/repository/files/${encodeURIComponent(normalizedPath)}/raw`,
    { ref: normalizedRef }
  );
  const response = await fetch(url, {
    headers: buildGitLabHeaders(config),
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    const details = getGitLabErrorDetails(responseBody);

    throw new Error(details.length > 0 ? details.join(" ") : `GitLab returned HTTP ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const truncated = bytes.byteLength > maxRawFileBytes;
  const contentBytes = truncated ? bytes.slice(0, maxRawFileBytes) : bytes;
  const content = new TextDecoder().decode(contentBytes);

  return {
    filePath: normalizedPath,
    ref: normalizedRef,
    content,
    contentType: response.headers.get("content-type") ?? "text/plain",
    sizeBytes: bytes.byteLength,
    truncated
  };
}
