import { NextRequest, NextResponse } from "next/server";
import {
  searchGitLabCode,
  validateGitLabActionConfig,
  type GitLabActionConfig
} from "@/lib/gitlab-integration";

export const runtime = "nodejs";

type GitLabCodeSearchPayload = {
  config?: GitLabActionConfig;
  projectId?: number;
  search?: string;
  ref?: string;
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as GitLabCodeSearchPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include GitLab configuration.");
  }

  const errors = validateGitLabActionConfig(payload.config);
  const search = payload.search?.trim() ?? "";

  if (!Number.isInteger(payload.projectId) || Number(payload.projectId) <= 0) {
    errors.push("A valid GitLab project ID is required.");
  }

  if (!search) {
    errors.push("Code search text is required.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "GitLab code search failed validation.", errors);
  }

  try {
    const results = await searchGitLabCode(payload.config, Number(payload.projectId), search, payload.ref);

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
