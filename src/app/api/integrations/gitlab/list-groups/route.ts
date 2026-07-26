import { NextRequest, NextResponse } from "next/server";
import { requireApiPrincipal } from "@/lib/auth/api-auth";
import { listGitLabGroups, validateGitLabActionConfig } from "@/lib/gitlab-integration";
import { readAdminConfig } from "@/lib/database";
import { getGitLabPlatformToken } from "@/lib/platform-secrets";

export const runtime = "nodejs";

type GitLabGroupListPayload = {
  query?: string;
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const payload = (await request.json().catch(() => null)) as GitLabGroupListPayload | null;
  const adminConfig = await readAdminConfig();
  const gitlabConfig = {
    ...adminConfig.integrations.gitlab,
    token: getGitLabPlatformToken()
  };
  const errors = validateGitLabActionConfig(gitlabConfig);

  if (errors.length > 0) {
    return errorResponse("validation_failed", "GitLab group list failed validation.", errors);
  }

  try {
    const groups = await listGitLabGroups(gitlabConfig, payload?.query ?? "");

    return NextResponse.json({
      data: {
        groups
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitLab group list failure.";

    console.error(JSON.stringify({ event: "gitlab_group_list_exception", message }));

    return errorResponse("gitlab_request_failed", "Could not load GitLab groups.", [message], 502);
  }
}
