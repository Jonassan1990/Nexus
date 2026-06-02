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

export type JiraIssueStatusData = {
  jiraKey: string;
  jiraId: string | null;
  jiraUrl: string;
  self: string | null;
  jiraStatus: JiraIssueStatusDetails;
};

export type JiraIssueStatusFetchResult =
  | { ok: true; data: JiraIssueStatusData }
  | { ok: false; status: number; details: string[] };

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
  };
  errors?: Record<string, string>;
  errorMessages?: string[];
};

export function getJiraErrorDetails(body: Pick<JiraIssueResponse, "errors" | "errorMessages"> | null): string[] {
  return [
    body?.errorMessages?.join(" "),
    body?.errors ? Object.entries(body.errors).map(([key, value]) => `${key}: ${value}`).join(" ") : ""
  ].filter((detail): detail is string => Boolean(detail));
}

export async function fetchJiraIssueStatus(
  config: JiraActionConfig,
  jiraKey: string,
  timeoutMs = 10000
): Promise<JiraIssueStatusFetchResult> {
  const endpoint = buildJiraEndpoint(
    config,
    `issue/${encodeURIComponent(jiraKey)}?fields=status,resolution`
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
      }
    }
  };
}
