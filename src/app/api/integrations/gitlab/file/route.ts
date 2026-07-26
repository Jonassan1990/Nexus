import { NextRequest, NextResponse } from "next/server";
import { requireApiPrincipal } from "@/lib/auth/api-auth";
import { getGitLabRawFile, validateGitLabActionConfig } from "@/lib/gitlab-integration";
import { readAdminConfig } from "@/lib/database";
import { getGitLabPlatformToken } from "@/lib/platform-secrets";

export const runtime = "nodejs";

type GitLabFilePayload = {
  projectId?: number;
  filePath?: string;
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

  const payload = (await request.json().catch(() => null)) as GitLabFilePayload | null;
  const adminConfig = await readAdminConfig();
  const gitlabConfig = {
    ...adminConfig.integrations.gitlab,
    token: getGitLabPlatformToken()
  };
  const errors = validateGitLabActionConfig(gitlabConfig);
  const filePath = payload?.filePath?.trim() ?? "";
  const ref = payload?.ref?.trim() ?? "";

  if (!Number.isInteger(payload?.projectId) || Number(payload?.projectId) <= 0) {
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
    const file = await getGitLabRawFile(gitlabConfig, Number(payload?.projectId), filePath, ref);

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
