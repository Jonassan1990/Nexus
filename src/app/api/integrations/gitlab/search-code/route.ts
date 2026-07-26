import { NextRequest, NextResponse } from "next/server";
import { requireApiPrincipal } from "@/lib/auth/api-auth";
import { searchGitLabCode, validateGitLabActionConfig } from "@/lib/gitlab-integration";
import { readAdminConfig } from "@/lib/database";
import { getGitLabPlatformToken } from "@/lib/platform-secrets";

export const runtime = "nodejs";

type GitLabCodeSearchPayload = {
  projectId?: number;
  search?: string;
  ref?: string;
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const payload = (await request.json().catch(() => null)) as GitLabCodeSearchPayload | null;
  const adminConfig = await readAdminConfig();
  const gitlabConfig = {
    ...adminConfig.integrations.gitlab,
    token: getGitLabPlatformToken()
  };
  const errors = validateGitLabActionConfig(gitlabConfig);
  const search = payload?.search?.trim() ?? "";

  if (!Number.isInteger(payload?.projectId) || Number(payload?.projectId) <= 0) {
    errors.push("A valid GitLab project ID is required.");
  }

  if (!search) {
    errors.push("Code search text is required.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "GitLab code search failed validation.", errors);
  }

  try {
    const results = await searchGitLabCode(
      gitlabConfig,
      Number(payload?.projectId),
      search,
      payload?.ref
    );

    return NextResponse.json({
      data: {
        results
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitLab code search failure.";

    console.error(JSON.stringify({ event: "gitlab_code_search_exception", message }));

    return errorResponse("gitlab_request_failed", "Could not search GitLab code.", [message], 502);
  }
}
