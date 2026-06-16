import { NextRequest, NextResponse } from "next/server";
import {
  listGitLabGroups,
  validateGitLabActionConfig,
  type GitLabActionConfig
} from "@/lib/gitlab-integration";

export const runtime = "nodejs";

type GitLabGroupListPayload = {
  config?: GitLabActionConfig;
  query?: string;
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as GitLabGroupListPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include GitLab configuration.");
  }

  const errors = validateGitLabActionConfig(payload.config);

  if (errors.length > 0) {
    return errorResponse("validation_failed", "GitLab group list failed validation.", errors);
  }

  try {
    const groups = await listGitLabGroups(payload.config, payload.query ?? "");

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
