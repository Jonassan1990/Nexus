import { NextRequest, NextResponse } from "next/server";
import {
  searchGitLabProjects,
  validateGitLabActionConfig,
  type GitLabActionConfig
} from "@/lib/gitlab-integration";

export const runtime = "nodejs";

type GitLabProjectSearchPayload = {
  config?: GitLabActionConfig;
  query?: string;
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as GitLabProjectSearchPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include GitLab configuration.");
  }

  const errors = validateGitLabActionConfig(payload.config);
  const query = payload.query?.trim() ?? "";

  if (!query) {
    errors.push("Project search text is required.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "GitLab project search failed validation.", errors);
  }

  try {
    const projects = await searchGitLabProjects(payload.config, query);

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
