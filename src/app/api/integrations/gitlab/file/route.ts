import { NextRequest, NextResponse } from "next/server";
import {
  getGitLabRawFile,
  validateGitLabActionConfig,
  type GitLabActionConfig
} from "@/lib/gitlab-integration";

export const runtime = "nodejs";

type GitLabFilePayload = {
  config?: GitLabActionConfig;
  projectId?: number;
  filePath?: string;
  ref?: string;
};

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as GitLabFilePayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include GitLab configuration.");
  }

  const errors = validateGitLabActionConfig(payload.config);
  const filePath = payload.filePath?.trim() ?? "";
  const ref = payload.ref?.trim() ?? "";

  if (!Number.isInteger(payload.projectId) || Number(payload.projectId) <= 0) {
    errors.push("A valid GitLab project ID is required.");
  }

  if (!filePath) {
    errors.push("GitLab file path is required.");
  }

  if (!ref) {
    errors.push("GitLab ref, branch, or commit SHA is required.");
  }

  if (errors.length > 0) {
    return errorResponse("validation_failed", "GitLab file request failed validation.", errors);
  }

  try {
    const file = await getGitLabRawFile(payload.config, Number(payload.projectId), filePath, ref);

    return NextResponse.json({
      data: {
        file
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitLab file request failure.";

    console.error(JSON.stringify({ event: "gitlab_file_fetch_exception", message }));

    return errorResponse("gitlab_request_failed", "Could not fetch GitLab source file.", [message], 502);
  }
}
