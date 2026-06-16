import { NextRequest, NextResponse } from "next/server";
import {
  listGitLabProjects,
  validateGitLabActionConfig,
  type GitLabActionConfig
} from "@/lib/gitlab-integration";

export const runtime = "nodejs";

type GitLabProjectListPayload = {
  config?: GitLabActionConfig;
  query?: string;
  groupId?: number | string;
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as GitLabProjectListPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include GitLab configuration.");
  }

  const errors = validateGitLabActionConfig(payload.config);
  const groupId = payload.groupId === undefined || payload.groupId === ""
    ? undefined
    : Number(payload.groupId);

  if (groupId !== undefined && (!Number.isInteger(groupId) || groupId <= 0)) {
    errors.push("Group ID must be a positive integer when provided.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "GitLab project list failed validation.", errors);
  }

  try {
    const projects = await listGitLabProjects(payload.config, payload.query ?? "", groupId);

    return NextResponse.json({
      data: {
        projects
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitLab project list failure.";

    console.error(JSON.stringify({ event: "gitlab_project_list_exception", message }));

    return errorResponse("gitlab_request_failed", "Could not load GitLab projects.", [message], 502);
  }
}
