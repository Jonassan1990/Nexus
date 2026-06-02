import { NextRequest, NextResponse } from "next/server";
import { extractJiraIssueKey, validateJiraActionConfig, type JiraActionConfig } from "@/lib/integration-actions";
import { fetchJiraIssueStatus } from "@/lib/jira-issue-status";

export const runtime = "nodejs";

type JiraIssueStatusPayload = {
  config?: JiraActionConfig;
  issueKey?: string;
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

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as JiraIssueStatusPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include Jira configuration.");
  }

  const config = payload.config;
  const errors = validateJiraActionConfig(config);
  const jiraKey = extractJiraIssueKey(payload.issueKey);

  if (!jiraKey) {
    errors.push("A valid Jira issue key is required before syncing Jira status.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "Jira status sync request failed validation.", errors);
  }

  console.info(
    JSON.stringify({
      event: "jira_issue_status_sync_attempt",
      jiraKey,
      project: config.defaultProjectKey
    })
  );

  try {
    const result = await fetchJiraIssueStatus(config, jiraKey);

    if (!result.ok) {
      console.error(
        JSON.stringify({
          event: "jira_issue_status_sync_failed",
          status: result.status,
          jiraKey,
          project: config.defaultProjectKey
        })
      );

      if (result.status === 404) {
        return errorResponse(
          "jira_issue_not_found",
          `Jira issue ${jiraKey} was not found in Jira.`,
          result.details.length > 0
            ? result.details
            : ["The linked Jira key does not exist or is not visible to the configured Jira token."],
          result.status
        );
      }

      return errorResponse(
        "jira_status_sync_failed",
        `Jira returned HTTP ${result.status} while syncing issue status.`,
        result.details.length > 0 ? result.details : ["Check Jira issue key, token scope, and field permissions."],
        result.status
      );
    }

    console.info(
      JSON.stringify({
        event: "jira_issue_status_sync_success",
        jiraKey: result.data.jiraKey,
        jiraStatus: result.data.jiraStatus.name,
        jiraStatusCategory: result.data.jiraStatus.categoryKey,
        project: config.defaultProjectKey
      })
    );

    return NextResponse.json({
      data: {
        status: "synced",
        ...result.data
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira status sync failure.";

    console.error(
      JSON.stringify({
        event: "jira_issue_status_sync_exception",
        jiraKey,
        message
      })
    );

    return errorResponse("jira_request_failed", "Could not reach Jira issue status endpoint.", [message], 502);
  }
}
