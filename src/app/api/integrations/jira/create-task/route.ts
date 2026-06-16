import { NextRequest, NextResponse } from "next/server";
import {
  applyJiraOptionalIssueFields,
  buildJiraDescription,
  buildJiraEndpoint,
  buildJiraHeaders,
  toJiraDescription,
  validateJiraActionConfig,
  type JiraActionConfig
} from "@/lib/integration-actions";
import {
  uploadJiraIssueAttachments,
  type JiraIssueAttachmentInput
} from "@/lib/jira-attachments";
import { placeJiraIssueInSprintOrBacklog } from "@/lib/jira-agile-placement";
import { fetchJiraIssueStatus } from "@/lib/jira-issue-status";

export const runtime = "nodejs";

type CreateJiraTaskPayload = {
  config?: JiraActionConfig;
  issue?: {
    summary?: string;
    description?: string;
    sourceTicketKey?: string;
    labels?: string[];
    components?: string[];
    fixVersion?: string;
    board?: string;
    sprint?: string;
    backlog?: string;
    priority?: string;
    estimateHours?: number;
    attachments?: JiraIssueAttachmentInput[];
  };
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
  const payload = (await request.json().catch(() => null)) as CreateJiraTaskPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include Jira configuration.");
  }

  const config = payload.config;
  const errors = validateJiraActionConfig(config);
  const summary = payload.issue?.summary?.trim() || "NEXUS Portal integration test task";

  if (!summary) {
    errors.push("Jira task summary is required.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "Jira task creation request failed validation.", errors);
  }

  const description =
    payload.issue?.description?.trim() ||
    buildJiraDescription(summary, payload.issue?.sourceTicketKey?.trim());

  const fields: Record<string, unknown> = {
    project: {
      key: config.defaultProjectKey.trim().toUpperCase()
    },
    issuetype: {
      name: config.defaultIssueType.trim()
    },
    summary,
    description: toJiraDescription(config.apiVersion, description)
  };

  applyJiraOptionalIssueFields(fields, payload.issue);

  const endpoint = buildJiraEndpoint(config, "issue");

  console.info(
    JSON.stringify({
      event: "jira_task_create_attempt",
      endpoint,
      project: config.defaultProjectKey,
      issueType: config.defaultIssueType
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
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(20000)
    });

    const responseBody = (await response.json().catch(() => null)) as
      | { key?: string; id?: string; self?: string; errors?: Record<string, string>; errorMessages?: string[] }
      | null;

    if (!response.ok) {
      const details = [
        responseBody?.errorMessages?.join(" "),
        responseBody?.errors ? Object.entries(responseBody.errors).map(([key, value]) => `${key}: ${value}`).join(" ") : ""
      ].filter((detail): detail is string => Boolean(detail));

      console.error(
        JSON.stringify({
          event: "jira_task_create_failed",
          status: response.status,
          project: config.defaultProjectKey,
          issueType: config.defaultIssueType
        })
      );

      return errorResponse(
        "jira_create_failed",
        `Jira returned HTTP ${response.status} while creating the task.`,
        details.length > 0 ? details : ["Check Jira project, issue type, token scope, and field permissions."],
        response.status
      );
    }

    if (!responseBody?.key) {
      console.error(
        JSON.stringify({
          event: "jira_task_create_missing_key",
          project: config.defaultProjectKey,
          jiraId: responseBody?.id ?? null
        })
      );

      return errorResponse(
        "jira_create_missing_key",
        "Jira accepted the create issue request but did not return an issue key.",
        ["The portal did not link the ticket because the Jira response did not include a key."],
        502
      );
    }

    const createdJiraKey = responseBody.key;
    const validationResult = await fetchJiraIssueStatus(config, createdJiraKey);

    if (!validationResult.ok) {
      console.error(
        JSON.stringify({
          event: "jira_task_create_validation_failed",
          status: validationResult.status,
          jiraKey: createdJiraKey,
          project: config.defaultProjectKey
        })
      );

      return errorResponse(
        "jira_create_validation_failed",
        `Jira created ${createdJiraKey} but the portal could not validate the issue in Jira.`,
        validationResult.details.length > 0
          ? validationResult.details
          : ["The issue was not linked because Jira did not confirm that the returned key exists."],
        502
      );
    }

    const placementResult = await placeJiraIssueInSprintOrBacklog(config, validationResult.data.jiraKey, {
      board: payload.issue?.board,
      sprint: payload.issue?.sprint
    });
    const attachmentResult = await uploadJiraIssueAttachments(
      config,
      validationResult.data.jiraKey,
      payload.issue?.attachments ?? []
    );
    const warnings = [...placementResult.warnings, ...attachmentResult.warnings];

    if (warnings.length > 0) {
      console.warn(
        JSON.stringify({
          event: "jira_task_create_warnings",
          jiraKey: validationResult.data.jiraKey,
          placementTarget: placementResult.target,
          placementMoved: placementResult.moved,
          uploadedCount: attachmentResult.uploaded.length,
          skippedCount: attachmentResult.skipped.length,
          warningCount: warnings.length
        })
      );
    }

    console.info(
      JSON.stringify({
        event: "jira_task_create_success",
        jiraKey: createdJiraKey,
        project: config.defaultProjectKey,
        attachmentUploadCount: attachmentResult.uploaded.length
      })
    );

    return NextResponse.json({
      data: {
        status: "created",
        jiraKey: validationResult.data.jiraKey,
        jiraId: validationResult.data.jiraId ?? responseBody?.id ?? null,
        jiraUrl: validationResult.data.jiraUrl,
        self: validationResult.data.self ?? responseBody?.self ?? null,
        jiraStatus: validationResult.data.jiraStatus,
        attachments: {
          uploaded: attachmentResult.uploaded,
          skipped: attachmentResult.skipped
        },
        placement: {
          target: placementResult.target,
          moved: placementResult.moved,
          sprintId: placementResult.sprintId,
          sprintName: placementResult.sprintName
        },
        warnings
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira request failure.";

    console.error(
      JSON.stringify({
        event: "jira_task_create_exception",
        message
      })
    );

    return errorResponse("jira_request_failed", "Could not reach Jira create issue endpoint.", [message], 502);
  }
}
