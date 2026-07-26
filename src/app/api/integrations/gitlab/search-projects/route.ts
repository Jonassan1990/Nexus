import { NextRequest, NextResponse } from "next/server";
import { requireApiPrincipal } from "@/lib/auth/api-auth";
import { searchGitLabProjects, validateGitLabActionConfig } from "@/lib/gitlab-integration";
import { readAdminConfig } from "@/lib/database";
import { getGitLabPlatformToken } from "@/lib/platform-secrets";

export const runtime = "nodejs";

type GitLabProjectSearchPayload = {
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

  const payload = (await request.json().catch(() => null)) as GitLabProjectSearchPayload | null;
  const adminConfig = await readAdminConfig();
  const gitlabConfig = {
    ...adminConfig.integrations.gitlab,
    token: getGitLabPlatformToken()
  };
  const errors = validateGitLabActionConfig(gitlabConfig);
  const query = payload?.query?.trim() ?? "";

  if (!query) {
    errors.push("Project search text is required.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "GitLab project search failed validation.", errors);
  }

  try {
    const projects = await searchGitLabProjects(gitlabConfig, query);

    return NextResponse.json({
      data: {
        projects
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitLab project search failure.";

    console.error(JSON.stringify({ event: "gitlab_project_search_exception", message }));

    return errorResponse("gitlab_request_failed", "Could not search GitLab projects.", [message], 502);
  }
}
