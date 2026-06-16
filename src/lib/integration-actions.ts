import type { JiraApiVersion, JiraAuthMode, SmtpConfig } from "./admin-config";

export type JiraActionConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  apiVersion: JiraApiVersion;
  authMode: JiraAuthMode;
  username?: string;
  token?: string;
  defaultProjectKey: string;
  defaultIssueType: string;
};

export type JiraIssueFieldInput = {
  labels?: string[];
  components?: string[];
  fixVersion?: string;
  priority?: string;
  estimateHours?: number;
};

export type SmtpActionConfig = {
  enabled: boolean;
  host: string;
  port: number;
  security: SmtpConfig["security"];
  fromName: string;
  fromEmail: string;
  username?: string;
  password?: string;
};

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function normalizeJiraBaseUrl(value: string): string {
  const trimmedValue = normalizeBaseUrl(value);

  if (!trimmedValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const reservedSegmentIndex = pathSegments.findIndex((segment) =>
      ["browse", "issues", "projects", "rest"].includes(segment.toLowerCase())
    );
    const basePathSegments =
      reservedSegmentIndex >= 0 ? pathSegments.slice(0, reservedSegmentIndex) : pathSegments;
    const basePath = basePathSegments.length > 0 ? `/${basePathSegments.join("/")}` : "";

    return `${parsedUrl.origin}${basePath}`;
  } catch {
    return trimmedValue;
  }
}

export function extractJiraProjectKey(value?: string): string {
  const trimmedValue = value?.trim() ?? "";
  const normalizedValue = trimmedValue.toUpperCase();

  if (/^[A-Z][A-Z0-9_]{1,15}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  const queryProjectKeyMatch =
    /(?:^|[?&#])(?:projectKey|projectKeyOrId|project)=([A-Z][A-Z0-9_]{1,15})(?:$|[&#])/i.exec(trimmedValue);

  if (queryProjectKeyMatch) {
    return queryProjectKeyMatch[1].toUpperCase();
  }

  const issueKeyMatch = /^([A-Z][A-Z0-9_]{1,15})-\d+$/i.exec(trimmedValue);

  if (issueKeyMatch) {
    return issueKeyMatch[1].toUpperCase();
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const projectSegmentIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === "projects");

    if (projectSegmentIndex >= 0) {
      const projectKey = pathSegments[projectSegmentIndex + 1]?.toUpperCase() ?? "";

      return /^[A-Z][A-Z0-9_]{1,15}$/.test(projectKey) ? projectKey : "";
    }

    const queryProjectKey =
      parsedUrl.searchParams.get("projectKey") ??
      parsedUrl.searchParams.get("projectKeyOrId") ??
      parsedUrl.searchParams.get("project");

    if (queryProjectKey && /^[A-Z][A-Z0-9_]{1,15}$/i.test(queryProjectKey)) {
      return queryProjectKey.toUpperCase();
    }

    const browseSegmentIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === "browse");
    const issueKey = browseSegmentIndex >= 0 ? pathSegments[browseSegmentIndex + 1] ?? "" : "";
    const browseIssueKeyMatch = /^([A-Z][A-Z0-9_]{1,15})-\d+$/i.exec(issueKey);

    return browseIssueKeyMatch ? browseIssueKeyMatch[1].toUpperCase() : "";
  } catch {
    return "";
  }
}

export function extractJiraIssueKey(value?: string): string {
  const trimmedValue = value?.trim() ?? "";
  const directIssueKeyMatch = /^([A-Z][A-Z0-9_]{1,15}-\d+)$/i.exec(trimmedValue);

  if (directIssueKeyMatch) {
    return directIssueKeyMatch[1].toUpperCase();
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const browseSegmentIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === "browse");
    const issueKey = browseSegmentIndex >= 0 ? pathSegments[browseSegmentIndex + 1] ?? "" : "";
    const browseIssueKeyMatch = /^([A-Z][A-Z0-9_]{1,15}-\d+)$/i.exec(issueKey);

    return browseIssueKeyMatch ? browseIssueKeyMatch[1].toUpperCase() : "";
  } catch {
    return "";
  }
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function buildJiraEndpoint(config: JiraActionConfig, path: string): string {
  return `${normalizeJiraBaseUrl(config.apiBaseUrl)}/${config.apiVersion}/${path.replace(/^\/+/, "")}`;
}

export function buildJiraAgileEndpoint(config: JiraActionConfig, path: string): string {
  return `${normalizeJiraBaseUrl(config.apiBaseUrl)}/rest/agile/1.0/${path.replace(/^\/+/, "")}`;
}

export function buildJiraHeaders(config: JiraActionConfig): HeadersInit {
  const token = config.token?.trim() ?? "";

  if (!token) {
    return {};
  }

  if (config.authMode === "emailApiToken") {
    const username = config.username?.trim() ?? "";
    return {
      Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`
    };
  }

  if (config.authMode === "personalAccessToken") {
    return {
      Authorization: `Bearer ${token}`
    };
  }

  return {};
}

export function validateJiraActionConfig(config: JiraActionConfig): string[] {
  const errors: string[] = [];
  const apiBaseUrl = normalizeJiraBaseUrl(config.apiBaseUrl);

  if (!config.enabled) {
    errors.push("Jira sync must be enabled before running Jira actions.");
  }

  if (!apiBaseUrl || !isValidHttpUrl(apiBaseUrl)) {
    errors.push("Jira API base URL must be a valid HTTP or HTTPS URL.");
  }

  if (!config.defaultProjectKey.trim()) {
    errors.push("Default Jira project key is required.");
  }

  if (!config.defaultIssueType.trim()) {
    errors.push("Default Jira issue type is required.");
  }

  if (config.authMode === "oauth2ClientCredentials") {
    errors.push("OAuth2 client credentials are not configured in this portal.");
  }

  if (config.authMode === "emailApiToken" && !config.username?.trim()) {
    errors.push("Username or email is required for email + API token authentication.");
  }

  if (!config.token?.trim()) {
    errors.push("Paste a Jira token or PAT for this test. Saved token status cannot be used because secrets are not stored in the browser.");
  }

  return errors;
}

export function buildJiraDescription(summary: string, sourceTicketKey?: string): string {
  const lines = [
    "Created from NEXUS Portal integration test.",
    "",
    `Summary: ${summary}`,
    sourceTicketKey ? `Source ticket: ${sourceTicketKey}` : ""
  ].filter(Boolean);

  return lines.join("\n");
}

export function toJiraDescription(apiVersion: JiraApiVersion, description: string) {
  if (apiVersion === "rest/api/3") {
    return {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: description
            }
          ]
        }
      ]
    };
  }

  return description;
}

export function formatJiraOriginalEstimate(estimateHours?: number): string | undefined {
  if (typeof estimateHours !== "number" || !Number.isFinite(estimateHours) || estimateHours <= 0) {
    return undefined;
  }

  const totalMinutes = Math.round(estimateHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    hours > 0 ? `${hours}h` : "",
    minutes > 0 ? `${minutes}m` : ""
  ].filter(Boolean);

  return parts.join(" ");
}

export function applyJiraOptionalIssueFields(
  fields: Record<string, unknown>,
  issue?: JiraIssueFieldInput
): Record<string, unknown> {
  const labels = issue?.labels?.map((label) => label.trim()).filter(Boolean) ?? [];
  const components = issue?.components?.map((component) => component.trim()).filter(Boolean) ?? [];
  const fixVersion = issue?.fixVersion?.trim();
  const priority = issue?.priority?.trim();
  const originalEstimate = formatJiraOriginalEstimate(issue?.estimateHours);

  if (labels.length > 0) {
    fields.labels = labels;
  }

  if (components.length > 0) {
    fields.components = components.map((name) => ({ name }));
  }

  if (fixVersion) {
    fields.fixVersions = [{ name: fixVersion }];
  }

  if (priority) {
    fields.priority = { name: priority };
  }

  if (originalEstimate) {
    fields.timetracking = {
      originalEstimate
    };
  }

  return fields;
}
