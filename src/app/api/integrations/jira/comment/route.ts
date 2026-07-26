import { NextRequest, NextResponse } from "next/server";
import { requireApiPrincipal } from "@/lib/auth/api-auth";
import {
  buildJiraEndpoint,
  buildJiraHeaders,
  extractJiraIssueKey,
  toJiraDescription,
  validateJiraActionConfig,
  type JiraActionConfig
} from "@/lib/integration-actions";
import { getJiraErrorDetails, jiraCommentBodyToPlainText } from "@/lib/jira-issue-status";
import { getJiraPlatformCredentials } from "@/lib/platform-secrets";

export const runtime = "nodejs";

type JiraCommentPayload = {
  config?: JiraActionConfig;
  issueKey?: string;
  comment?: string;
};

type JiraCommentResponseBody = {
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

function getJiraCommentAuthor(responseBody: JiraCommentResponseBody | null): string {
  return (
    responseBody?.author?.displayName?.trim() ||
    responseBody?.author?.name?.trim() ||
    responseBody?.author?.emailAddress?.trim() ||
    "Jira user"
  );
}

export async function POST(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const payload = (await request.json().catch(() => null)) as JiraCommentPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include Jira configuration.");
  }

  const config: JiraActionConfig = {
    ...payload.config,
    ...getJiraPlatformCredentials()
  };
  const errors = validateJiraActionConfig(config);
  const jiraKey = extractJiraIssueKey(payload.issueKey);
  const comment = payload.comment?.trim() ?? "";

  if (!jiraKey) {
    errors.push("A valid Jira issue key is required before adding a Jira comment.");
  }

  if (!comment) {
    errors.push("Jira comment body is required.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "Jira comment request failed validation.", errors);
  }

  const endpoint = buildJiraEndpoint(config, `issue/${encodeURIComponent(jiraKey)}/comment`);

  console.info(
    JSON.stringify({
      event: "jira_comment_create_attempt",
      endpoint,
      jiraKey,
      project: config.defaultProjectKey
    })
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...buildJiraHeaders(config)
      },
      body: JSON.stringify({
        body: toJiraDescription(config.apiVersion, comment)
      }),
      signal: AbortSignal.timeout(20000)
    });
    const responseBody = (await response.json().catch(() => null)) as JiraCommentResponseBody | null;

    if (!response.ok) {
      const details = getJiraErrorDetails(responseBody);

      console.error(
        JSON.stringify({
          event: "jira_comment_create_failed",
          status: response.status,
          jiraKey,
          project: config.defaultProjectKey
        })
      );

      if (response.status === 404) {
        return errorResponse(
          "jira_issue_not_found",
          `Jira issue ${jiraKey} was not found in Jira.`,
          details.length > 0
            ? details
            : ["The linked Jira key does not exist or is not visible to the configured Jira token."],
          response.status
        );
      }

      return errorResponse(
        "jira_comment_create_failed",
        `Jira returned HTTP ${response.status} while adding the comment.`,
        details.length > 0 ? details : ["Check Jira issue key, token scope, and comment permissions."],
        response.status
      );
    }

    const commentId = responseBody?.id?.trim() || responseBody?.self?.trim() || `posted-${Date.now()}`;
    const returnedCommentBody = jiraCommentBodyToPlainText(responseBody?.body) || comment;

    console.info(
      JSON.stringify({
        event: "jira_comment_create_success",
        jiraKey,
        commentId,
        project: config.defaultProjectKey
      })
    );

    return NextResponse.json({
      data: {
        status: "comment_added",
        jiraKey,
        comment: {
          id: commentId,
          author: getJiraCommentAuthor(responseBody),
          body: returnedCommentBody,
          createdAt: responseBody?.created?.trim() || new Date().toISOString(),
          updatedAt: responseBody?.updated?.trim() || null
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira comment request failure.";

    console.error(
      JSON.stringify({
        event: "jira_comment_create_exception",
        jiraKey,
        message
      })
    );

    return errorResponse("jira_request_failed", "Could not reach Jira comment endpoint.", [message], 502);
  }
}
