import { NextRequest, NextResponse } from "next/server";
import { requireApiPrincipal } from "@/lib/auth/api-auth";
import { listGitLabProjects, validateGitLabActionConfig } from "@/lib/gitlab-integration";
import { readAdminConfig } from "@/lib/database";
import { getGitLabPlatformToken } from "@/lib/platform-secrets";

export const runtime = "nodejs";

type GitLabProjectListPayload = {
  query?: string;
  groupId?: number | string;
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const payload = (await request.json().catch(() => null)) as GitLabProjectListPayload | null;
  const adminConfig = await readAdminConfig();
  const gitlabConfig = {
    ...adminConfig.integrations.gitlab,
    token: getGitLabPlatformToken()
  };
  const errors = validateGitLabActionConfig(gitlabConfig);
  const groupId =
    payload?.groupId === undefined || payload?.groupId === "" ? undefined : Number(payload.groupId);

  if (groupId !== undefined && (!Number.isInteger(groupId) || groupId <= 0)) {
    errors.push("Group ID must be a positive integer when provided.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "GitLab project list failed validation.", errors);
  }

  try {
    const projects = await listGitLabProjects(gitlabConfig, payload?.query ?? "", groupId);

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
