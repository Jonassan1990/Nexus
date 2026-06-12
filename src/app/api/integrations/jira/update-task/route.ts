import { NextRequest, NextResponse } from "next/server";
import {
  applyJiraOptionalIssueFields,
  buildJiraDescription,
  buildJiraEndpoint,
  buildJiraHeaders,
  normalizeJiraBaseUrl,
  toJiraDescription,
  validateJiraActionConfig,
  type JiraActionConfig
} from "@/lib/integration-actions";
import {
  uploadJiraIssueAttachments,
  type JiraIssueAttachmentInput
} from "@/lib/jira-attachments";
import { fetchJiraIssueStatus } from "@/lib/jira-issue-status";

export const runtime = "nodejs";

type UpdateJiraTaskPayload = {
  config?: JiraActionConfig;
  issueKey?: string;
  issue?: {
    summary?: string;
    description?: string;
    sourceTicketKey?: string;
    labels?: string[];
    components?: string[];
    fixVersion?: string;
    priority?: string;
    estimateHours?: number;
    attachments?: JiraIssueAttachmentInput[];
  };
};

type JiraErrorBody = {
  errors?: Record<string, string>;
  errorMessages?: string[];
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details
      }
    },
    { status }
  );
}

function getValidJiraIssueKey(value?: string): string {
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

function parseJiraErrorBody(responseText: string): JiraErrorBody | null {
  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as JiraErrorBody;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as UpdateJiraTaskPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include Jira configuration.");
  }

  const config = payload.config;
  const errors = validateJiraActionConfig(config);
  const jiraKey = getValidJiraIssueKey(payload.issueKey);
  const summary = payload.issue?.summary?.trim() ?? "";

  if (!jiraKey) {
    errors.push("A valid Jira issue key is required before updating Jira.");
  }

  if (!summary) {
    errors.push("Jira task summary is required.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "Jira task update request failed validation.", errors);
  }

  const description =
    payload.issue?.description?.trim() ||
    buildJiraDescription(summary, payload.issue?.sourceTicketKey?.trim());
  const fields: Record<string, unknown> = {
    summary,
    description: toJiraDescription(config.apiVersion, description)
  };

  applyJiraOptionalIssueFields(fields, payload.issue);

  const endpoint = buildJiraEndpoint(config, `issue/${encodeURIComponent(jiraKey)}`);

  console.info(
    JSON.stringify({
      event: "jira_task_update_attempt",
      endpoint,
      jiraKey,
      project: config.defaultProjectKey,
      issueType: config.defaultIssueType
    })
  );

  try {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...buildJiraHeaders(config)
      },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(20000)
    });

    const responseText = await response.text().catch(() => "");
    const responseBody = parseJiraErrorBody(responseText);

    if (!response.ok) {
      const details = [
        responseBody?.errorMessages?.join(" "),
        responseBody?.errors ? Object.entries(responseBody.errors).map(([key, value]) => `${key}: ${value}`).join(" ") : ""
      ].filter((detail): detail is string => Boolean(detail));

      console.error(
        JSON.stringify({
          event: "jira_task_update_failed",
          status: response.status,
          jiraKey,
          project: config.defaultProjectKey,
          issueType: config.defaultIssueType
        })
      );

      if (response.status === 404) {
        return errorResponse(
          "jira_issue_not_found",
          `Jira issue ${jiraKey} was not found in Jira.`,
          details.length > 0 ? details : ["The linked Jira key does not exist or is not visible to the configured Jira token."],
          response.status
        );
      }

      return errorResponse(
        "jira_update_failed",
        `Jira returned HTTP ${response.status} while updating the task.`,
        details.length > 0 ? details : ["Check Jira issue key, token scope, workflow status, and field permissions."],
        response.status
      );
    }

    console.info(
      JSON.stringify({
        event: "jira_task_update_success",
        jiraKey,
        project: config.defaultProjectKey
      })
    );

    const issueStatusResult = await fetchJiraIssueStatus(config, jiraKey);
    const attachmentResult = await uploadJiraIssueAttachments(config, jiraKey, payload.issue?.attachments ?? []);
    const warnings = issueStatusResult.ok
      ? [...attachmentResult.warnings]
      : [
          `Jira issue was updated, but status sync failed: ${issueStatusResult.details.join(" ")}`,
          ...attachmentResult.warnings
        ];

    if (attachmentResult.warnings.length > 0) {
      console.warn(
        JSON.stringify({
          event: "jira_task_update_attachment_warnings",
          jiraKey,
          uploadedCount: attachmentResult.uploaded.length,
          skippedCount: attachmentResult.skipped.length,
          warningCount: attachmentResult.warnings.length
        })
      );
    }

    return NextResponse.json({
      data: {
        status: "updated",
        jiraKey: issueStatusResult.ok ? issueStatusResult.data.jiraKey : jiraKey,
        jiraUrl: issueStatusResult.ok
          ? issueStatusResult.data.jiraUrl
          : `${normalizeJiraBaseUrl(config.apiBaseUrl)}/browse/${jiraKey}`,
        jiraStatus: issueStatusResult.ok ? issueStatusResult.data.jiraStatus : undefined,
        attachments: {
          uploaded: attachmentResult.uploaded,
          skipped: attachmentResult.skipped
        },
        warnings
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira request failure.";

    console.error(
      JSON.stringify({
        event: "jira_task_update_exception",
        jiraKey,
        message
      })
    );

    return errorResponse("jira_request_failed", "Could not reach Jira update issue endpoint.", [message], 502);
  }
}
