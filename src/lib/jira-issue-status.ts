import {
  buildJiraEndpoint,
  buildJiraHeaders,
  normalizeJiraBaseUrl,
  type JiraActionConfig
} from "./integration-actions";

export type JiraIssueStatusDetails = {
  name: string;
  categoryKey: string;
  categoryName: string;
  resolutionName: string | null;
};

export type JiraIssueFixVersionData = {
  id: string;
  name: string;
  archived?: boolean;
  overdue?: boolean;
  released?: boolean;
  startDate?: string;
  userStartDate?: string;
  releaseDate?: string;
  userReleaseDate?: string;
};

export type JiraIssueStatusData = {
  jiraKey: string;
  jiraId: string | null;
  jiraUrl: string;
  self: string | null;
  jiraStatus: JiraIssueStatusDetails;
  issueFields?: {
    fixVersions: JiraIssueFixVersionData[];
    estimateHours?: number;
    remainingHours?: number;
  };
  comments?: JiraIssueCommentData[];
  warnings?: string[];
};

export type JiraIssueCommentData = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  self: string | null;
};

export type JiraIssueStatusFetchResult =
  | { ok: true; data: JiraIssueStatusData }
  | { ok: false; status: number; details: string[] };

type JiraIssueAttachmentResponse = {
  id?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  content?: string;
  thumbnail?: string;
};

type JiraIssueResponse = {
  id?: string;
  key?: string;
  self?: string;
  fields?: {
    status?: {
      name?: string;
      statusCategory?: {
        key?: string;
        name?: string;
      };
    };
    resolution?: {
      name?: string;
    } | null;
    fixVersions?: JiraIssueFixVersionData[];
    timeoriginalestimate?: number | null;
    timeestimate?: number | null;
    aggregatetimeoriginalestimate?: number | null;
    aggregatetimeestimate?: number | null;
    attachment?: JiraIssueAttachmentResponse[];
  };
  errors?: Record<string, string>;
  errorMessages?: string[];
};

type JiraIssueCommentResponse = Pick<JiraIssueResponse, "errors" | "errorMessages"> & {
  comments?: Array<{
    id?: string;
    self?: string;
    body?: unknown;
    author?: {
      displayName?: string;
      name?: string;
      emailAddress?: string;
    };
    created?: string;
    updated?: string;
  }>;
};

type JiraCommentImageReference = {
  markup: string;
  fileName: string;
  normalizedName: string;
  index: number;
};

type JiraInlineCommentImage = {
  fileName: string;
  contentDataUrl: string;
};

type JiraVersionResponse = JiraIssueFixVersionData & Pick<JiraIssueResponse, "errors" | "errorMessages">;

const jiraInlineImageMaxBytes = 5 * 1024 * 1024;
const jiraInlineImageMaxPerComment = 4;
const jiraImageWarningLimit = 5;
const jiraSafeInlineImageMimeTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);

export function getJiraErrorDetails(body: Pick<JiraIssueResponse, "errors" | "errorMessages"> | null): string[] {
  return [
    body?.errorMessages?.join(" "),
    body?.errors ? Object.entries(body.errors).map(([key, value]) => `${key}: ${value}`).join(" ") : ""
  ].filter((detail): detail is string => Boolean(detail));
}

function getJiraWikiImageMarkupPattern(): RegExp {
  return /!([^!\r\n|]+?\.(?:png|jpe?g|gif|webp))(?:\|[^!\r\n]*)?!/gi;
}

function decodeJiraFileName(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getJiraImageFileName(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const lastPathSegment = parsedUrl.pathname.split("/").filter(Boolean).pop() ?? "";

    return decodeJiraFileName(lastPathSegment || trimmedValue).trim();
  } catch {
    const pathWithoutQuery = trimmedValue.split(/[?#]/)[0] ?? trimmedValue;
    const lastPathSegment = pathWithoutQuery.split(/[\\/]/).filter(Boolean).pop() ?? pathWithoutQuery;

    return decodeJiraFileName(lastPathSegment).trim();
  }
}

function normalizeJiraImageFileName(value: string): string {
  return getJiraImageFileName(value).toLowerCase();
}

function extractJiraCommentImageReferences(body: string): JiraCommentImageReference[] {
  const references: JiraCommentImageReference[] = [];
  const pattern = getJiraWikiImageMarkupPattern();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    const fileName = getJiraImageFileName(match[1] ?? "");
    const normalizedName = normalizeJiraImageFileName(fileName);

    if (!fileName || !normalizedName) {
      continue;
    }

    references.push({
      markup: match[0],
      fileName,
      normalizedName,
      index: match.index
    });
  }

  return references;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function renderJiraCommentTextAsHtml(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

function inlineJiraCommentImages(body: string, imagesByName: Map<string, JiraInlineCommentImage>): string {
  const references = extractJiraCommentImageReferences(body);

  if (references.length === 0) {
    return body;
  }

  let cursor = 0;
  let output = "";

  for (const reference of references) {
    output += renderJiraCommentTextAsHtml(body.slice(cursor, reference.index));

    const image = imagesByName.get(reference.normalizedName);
    output += image
      ? `<img src="${escapeHtml(image.contentDataUrl)}" alt="${escapeHtml(image.fileName)}">`
      : renderJiraCommentTextAsHtml(`Jira image: ${reference.fileName}`);
    cursor = reference.index + reference.markup.length;
  }

  output += renderJiraCommentTextAsHtml(body.slice(cursor));

  return output.trim();
}

function normalizeJiraImageMimeType(value?: string | null): string {
  const normalizedValue = value?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (!jiraSafeInlineImageMimeTypes.has(normalizedValue)) {
    return "";
  }

  return normalizedValue === "image/jpg" ? "image/jpeg" : normalizedValue;
}

function buildJiraAttachmentLookup(attachments: JiraIssueAttachmentResponse[]): Map<string, JiraIssueAttachmentResponse> {
  const lookup = new Map<string, JiraIssueAttachmentResponse>();

  for (const attachment of attachments) {
    const normalizedName = normalizeJiraImageFileName(attachment.filename ?? "");

    if (!normalizedName || lookup.has(normalizedName)) {
      continue;
    }

    lookup.set(normalizedName, attachment);
  }

  return lookup;
}

function resolveJiraAttachmentUrl(config: JiraActionConfig, value?: string): string {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue) {
    return "";
  }

  try {
    const baseUrl = new URL(normalizeJiraBaseUrl(config.apiBaseUrl));
    const attachmentUrl = new URL(trimmedValue, baseUrl);

    return attachmentUrl.origin === baseUrl.origin ? attachmentUrl.toString() : "";
  } catch {
    return "";
  }
}

function recordJiraImageWarning(warnings: string[], message: string): void {
  if (warnings.length >= jiraImageWarningLimit || warnings.includes(message)) {
    return;
  }

  warnings.push(message);
}

async function fetchJiraInlineCommentImage(
  config: JiraActionConfig,
  attachment: JiraIssueAttachmentResponse,
  timeoutMs: number,
  warnings: string[]
): Promise<JiraInlineCommentImage | null> {
  const fileName = attachment.filename?.trim() ?? "Jira image";
  const attachmentMimeType = normalizeJiraImageMimeType(attachment.mimeType);

  if (!attachmentMimeType) {
    return null;
  }

  if (typeof attachment.size === "number" && attachment.size > jiraInlineImageMaxBytes) {
    recordJiraImageWarning(warnings, `Jira image ${fileName} was not imported because it is larger than 5 MB.`);
    return null;
  }

  const attachmentUrl = resolveJiraAttachmentUrl(config, attachment.content || attachment.thumbnail);

  if (!attachmentUrl) {
    recordJiraImageWarning(warnings, `Jira image ${fileName} could not be imported because Jira did not provide a trusted attachment URL.`);
    return null;
  }

  try {
    const response = await fetch(attachmentUrl, {
      method: "GET",
      headers: {
        Accept: "image/*",
        ...buildJiraHeaders(config)
      },
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      recordJiraImageWarning(warnings, `Jira image ${fileName} could not be imported because Jira returned HTTP ${response.status}.`);
      return null;
    }

    const responseMimeType = normalizeJiraImageMimeType(response.headers.get("content-type"));
    const mimeType = responseMimeType || attachmentMimeType;
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);

    if (Number.isFinite(contentLength) && contentLength > jiraInlineImageMaxBytes) {
      recordJiraImageWarning(warnings, `Jira image ${fileName} was not imported because it is larger than 5 MB.`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > jiraInlineImageMaxBytes) {
      recordJiraImageWarning(warnings, `Jira image ${fileName} was not imported because it is larger than 5 MB.`);
      return null;
    }

    return {
      fileName,
      contentDataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira image import failure.";
    console.warn("[jira-sync] Jira comment image import failed", {
      attachmentId: attachment.id,
      fileName,
      reason: message
    });
    recordJiraImageWarning(warnings, `Jira image ${fileName} could not be imported.`);
    return null;
  }
}

async function loadJiraCommentImages(
  config: JiraActionConfig,
  references: JiraCommentImageReference[],
  attachmentLookup: Map<string, JiraIssueAttachmentResponse>,
  imageCache: Map<string, Promise<JiraInlineCommentImage | null>>,
  timeoutMs: number,
  warnings: string[]
): Promise<Map<string, JiraInlineCommentImage>> {
  const imagesByName = new Map<string, JiraInlineCommentImage>();
  const uniqueReferenceNames = Array.from(new Set(references.map((reference) => reference.normalizedName)))
    .slice(0, jiraInlineImageMaxPerComment);

  for (const normalizedName of uniqueReferenceNames) {
    const attachment = attachmentLookup.get(normalizedName);

    if (!attachment) {
      continue;
    }

    const cacheKey = attachment.id || attachment.content || attachment.thumbnail || normalizedName;
    let cachedImage = imageCache.get(cacheKey);

    if (!cachedImage) {
      cachedImage = fetchJiraInlineCommentImage(config, attachment, timeoutMs, warnings);
      imageCache.set(cacheKey, cachedImage);
    }

    const image = await cachedImage;

    if (image) {
      imagesByName.set(normalizedName, image);
    }
  }

  return imagesByName;
}

function appendJiraDocumentText(node: unknown, parts: string[]): void {
  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";

  if (text) {
    parts.push(text);
  }

  if (record.type === "hardBreak") {
    parts.push("\n");
  }

  const content = Array.isArray(record.content) ? record.content : [];

  for (const child of content) {
    appendJiraDocumentText(child, parts);
  }

  if (record.type === "paragraph" || record.type === "heading") {
    parts.push("\n");
  }
}

export function jiraCommentBodyToPlainText(body: unknown): string {
  if (typeof body === "string") {
    return body.trim();
  }

  const parts: string[] = [];
  appendJiraDocumentText(body, parts);

  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchJiraIssueComments(
  config: JiraActionConfig,
  jiraKey: string,
  timeoutMs: number,
  attachments: JiraIssueAttachmentResponse[],
  warnings: string[]
): Promise<JiraIssueCommentData[]> {
  const endpoint = buildJiraEndpoint(
    config,
    `issue/${encodeURIComponent(jiraKey)}/comment?orderBy=created&maxResults=50`
  );
  const attachmentLookup = buildJiraAttachmentLookup(attachments);
  const imageCache = new Map<string, Promise<JiraInlineCommentImage | null>>();

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...buildJiraHeaders(config)
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const responseBody = (await response.json().catch(() => null)) as JiraIssueCommentResponse | null;

  if (!response.ok) {
    const details = getJiraErrorDetails(responseBody);
    throw new Error(details.length > 0 ? details.join(" ") : `Jira returned HTTP ${response.status} while loading comments.`);
  }

  const comments = await Promise.all(
    (responseBody?.comments ?? []).map(async (comment) => {
      const body = jiraCommentBodyToPlainText(comment.body);
      const imageReferences = extractJiraCommentImageReferences(body);
      const imagesByName = await loadJiraCommentImages(
        config,
        imageReferences,
        attachmentLookup,
        imageCache,
        timeoutMs,
        warnings
      );
      const bodyWithInlineImages = imageReferences.length > 0
        ? inlineJiraCommentImages(body, imagesByName)
        : body;
      const author =
        comment.author?.displayName?.trim() ||
        comment.author?.name?.trim() ||
        comment.author?.emailAddress?.trim() ||
        "Jira user";

      return {
        id: comment.id?.trim() ?? "",
        author,
        body: bodyWithInlineImages,
        createdAt: comment.created?.trim() || new Date().toISOString(),
        updatedAt: comment.updated?.trim() || null,
        self: comment.self ?? null
      };
    })
  );

  return comments.filter((comment) => comment.id && comment.body);
}

function normalizeJiraFixVersions(fixVersions?: JiraIssueFixVersionData[]): JiraIssueFixVersionData[] {
  return (fixVersions ?? [])
    .map((version) => ({
      id: version.id?.trim() ?? "",
      name: version.name?.trim() ?? "",
      archived: Boolean(version.archived),
      overdue: Boolean(version.overdue),
      released: Boolean(version.released),
      startDate: version.startDate?.trim() ?? "",
      userStartDate: version.userStartDate?.trim() ?? "",
      releaseDate: version.releaseDate?.trim() ?? "",
      userReleaseDate: version.userReleaseDate?.trim() ?? ""
    }))
    .filter((version) => version.name);
}

function jiraSecondsToHours(value?: number | null): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.round((value / 3600) * 10) / 10;
}

async function fetchJiraVersionDetails(
  config: JiraActionConfig,
  versionId: string,
  timeoutMs: number
): Promise<JiraIssueFixVersionData | null> {
  const endpoint = buildJiraEndpoint(config, `version/${encodeURIComponent(versionId)}`);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...buildJiraHeaders(config)
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const responseBody = (await response.json().catch(() => null)) as JiraVersionResponse | null;

  if (!response.ok) {
    return null;
  }

  return responseBody?.name
    ? {
        id: responseBody.id?.trim() ?? versionId,
        name: responseBody.name.trim(),
        archived: Boolean(responseBody.archived),
        overdue: Boolean(responseBody.overdue),
        released: Boolean(responseBody.released),
        startDate: responseBody.startDate?.trim() ?? "",
        userStartDate: responseBody.userStartDate?.trim() ?? "",
        releaseDate: responseBody.releaseDate?.trim() ?? "",
        userReleaseDate: responseBody.userReleaseDate?.trim() ?? ""
      }
    : null;
}

async function enrichJiraFixVersions(
  config: JiraActionConfig,
  fixVersions: JiraIssueFixVersionData[],
  timeoutMs: number,
  warnings: string[]
): Promise<JiraIssueFixVersionData[]> {
  const enrichedVersions = await Promise.all(
    fixVersions.map(async (version) => {
      if ((version.releaseDate && version.startDate) || !version.id) {
        return version;
      }

      try {
        const versionDetails = await fetchJiraVersionDetails(config, version.id, timeoutMs);

        return versionDetails
          ? {
              ...version,
              archived: versionDetails.archived,
              overdue: versionDetails.overdue,
              released: versionDetails.released,
              startDate: versionDetails.startDate,
              userStartDate: versionDetails.userStartDate,
              releaseDate: versionDetails.releaseDate,
              userReleaseDate: versionDetails.userReleaseDate
            }
          : version;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Jira version lookup failure.";
        warnings.push(`Jira fix version ${version.name} was synced, but its release date could not be loaded. ${message}`);

        return version;
      }
    })
  );

  return enrichedVersions;
}

export async function fetchJiraIssueStatus(
  config: JiraActionConfig,
  jiraKey: string,
  timeoutMs = 10000,
  options: { includeComments?: boolean } = {}
): Promise<JiraIssueStatusFetchResult> {
  const fields = options.includeComments
    ? "status,resolution,fixVersions,timeoriginalestimate,timeestimate,aggregatetimeoriginalestimate,aggregatetimeestimate,attachment"
    : "status,resolution,fixVersions,timeoriginalestimate,timeestimate,aggregatetimeoriginalestimate,aggregatetimeestimate";
  const endpoint = buildJiraEndpoint(
    config,
    `issue/${encodeURIComponent(jiraKey)}?fields=${fields}`
  );

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...buildJiraHeaders(config)
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const responseBody = (await response.json().catch(() => null)) as JiraIssueResponse | null;

  if (!response.ok) {
    const details = getJiraErrorDetails(responseBody);

    return {
      ok: false,
      status: response.status,
      details: details.length > 0 ? details : [`Jira returned HTTP ${response.status}.`]
    };
  }

  const statusName = responseBody?.fields?.status?.name?.trim() ?? "";

  if (!responseBody?.key || !statusName) {
    return {
      ok: false,
      status: 502,
      details: ["Jira issue response did not include an issue key and status."]
    };
  }

  const warnings: string[] = [];
  const fixVersions = await enrichJiraFixVersions(
    config,
    normalizeJiraFixVersions(responseBody.fields?.fixVersions),
    timeoutMs,
    warnings
  );
  let comments: JiraIssueCommentData[] | undefined;

  if (options.includeComments) {
    try {
      comments = await fetchJiraIssueComments(
        config,
        responseBody.key,
        timeoutMs,
        responseBody.fields?.attachment ?? [],
        warnings
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Jira comment sync failure.";
      warnings.push(`Jira status was synced, but comments could not be loaded. ${message}`);
    }
  }

  return {
    ok: true,
    data: {
      jiraKey: responseBody.key,
      jiraId: responseBody.id ?? null,
      jiraUrl: `${normalizeJiraBaseUrl(config.apiBaseUrl)}/browse/${responseBody.key}`,
      self: responseBody.self ?? null,
      jiraStatus: {
        name: statusName,
        categoryKey: responseBody.fields?.status?.statusCategory?.key?.trim() ?? "",
        categoryName: responseBody.fields?.status?.statusCategory?.name?.trim() ?? "",
        resolutionName: responseBody.fields?.resolution?.name?.trim() || null
      },
      issueFields: {
        fixVersions,
        estimateHours: jiraSecondsToHours(
          responseBody.fields?.aggregatetimeoriginalestimate ?? responseBody.fields?.timeoriginalestimate
        ),
        remainingHours: jiraSecondsToHours(
          responseBody.fields?.aggregatetimeestimate ?? responseBody.fields?.timeestimate
        )
      },
      comments,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  };
}
