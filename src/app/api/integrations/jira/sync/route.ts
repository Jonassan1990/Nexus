import { NextRequest, NextResponse } from "next/server";
import {
  buildJiraAgileEndpoint,
  buildJiraEndpoint,
  buildJiraHeaders,
  validateJiraActionConfig,
  type JiraActionConfig
} from "@/lib/integration-actions";

export const runtime = "nodejs";

type JiraSyncPayload = {
  config?: JiraActionConfig;
};

type JiraProjectResponse = {
  key?: string;
  name?: string;
  components?: Array<{ id?: string; name?: string }>;
  versions?: Array<{
    id?: string;
    name?: string;
    archived?: boolean;
    overdue?: boolean;
    released?: boolean;
    startDate?: string;
    userStartDate?: string;
    releaseDate?: string;
    userReleaseDate?: string;
  }>;
};

type JiraIssueTypeResponse = Array<{ id?: string; name?: string; subtask?: boolean }>;
type JiraPriorityResponse = Array<{ id?: string; name?: string; statusColor?: string }>;
type JiraProjectStatusesResponse = Array<{
  id?: string;
  name?: string;
  statuses?: JiraStatusResponse[];
}>;
type JiraStatusResponse = {
  id?: string;
  name?: string;
  statusCategory?: {
    key?: string;
    name?: string;
    colorName?: string;
  };
};
type JiraAssignableUserResponse = Array<{
  accountId?: string;
  key?: string;
  name?: string;
  displayName?: string;
  emailAddress?: string;
  active?: boolean;
}>;
type JiraPagedResponse<T> = {
  values?: T[];
  startAt?: number;
  maxResults?: number;
  total?: number;
  isLast?: boolean;
};
type JiraBoardResponse = {
  id?: number;
  name?: string;
  type?: string;
};
type JiraSprintResponse = {
  id?: number;
  name?: string;
  state?: string;
  startDate?: string;
  endDate?: string;
};
type JiraFetchResult<T> = { ok: true; data: T } | { ok: false; status: number; details: string[] };

function errorResponse(code: string, message: string, details: string[] = [], status = 400) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details
      }
    },
    { status }
  );
}

async function fetchJira<T>(url: string, config: JiraActionConfig): Promise<JiraFetchResult<T>> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...buildJiraHeaders(config)
    },
    signal: AbortSignal.timeout(20000)
  });
  const responseBody = (await response.json().catch(() => null)) as
    { errorMessages?: string[]; errors?: Record<string, string> } | T | null;

  if (!response.ok) {
    const errorBody = responseBody as { errorMessages?: string[]; errors?: Record<string, string> } | null;
    const details = [
      errorBody?.errorMessages?.join(" "),
      errorBody?.errors
        ? Object.entries(errorBody.errors)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" ")
        : ""
    ].filter((detail): detail is string => Boolean(detail));

    return {
      ok: false,
      status: response.status,
      details: details.length > 0 ? details : [`Jira returned HTTP ${response.status}.`]
    };
  }

  return {
    ok: true,
    data: responseBody as T
  };
}

async function fetchOptionalJira<T>(
  url: string,
  config: JiraActionConfig,
  label: string
): Promise<JiraFetchResult<T>> {
  try {
    return await fetchJira<T>(url, config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira request failure.";

    return {
      ok: false,
      status: 0,
      details: [`${label}: ${message}`]
    };
  }
}

function optionalWarning(label: string, result: JiraFetchResult<unknown>): string | null {
  return result.ok ? null : `${label} could not be synced: ${result.details.join(" ")}`;
}

function buildJiraStatusMetadata(projectStatuses: JiraProjectStatusesResponse): Array<{
  id: string;
  name: string;
  categoryKey: string;
  categoryName: string;
  colorName: string;
  issueTypes: string[];
}> {
  const statusesByKey = new Map<
    string,
    {
      id: string;
      name: string;
      categoryKey: string;
      categoryName: string;
      colorName: string;
      issueTypes: string[];
    }
  >();

  for (const issueType of projectStatuses) {
    const issueTypeName = issueType.name?.trim() || "Unnamed issue type";

    for (const status of issueType.statuses ?? []) {
      const name = status.name?.trim();

      if (!name) {
        continue;
      }

      const id = status.id?.trim() || name;
      const statusKey = id.toLowerCase();
      const existingStatus = statusesByKey.get(statusKey);

      if (existingStatus) {
        if (!existingStatus.issueTypes.includes(issueTypeName)) {
          existingStatus.issueTypes.push(issueTypeName);
        }

        continue;
      }

      statusesByKey.set(statusKey, {
        id,
        name,
        categoryKey: status.statusCategory?.key?.trim() ?? "",
        categoryName: status.statusCategory?.name?.trim() ?? "",
        colorName: status.statusCategory?.colorName?.trim() ?? "",
        issueTypes: [issueTypeName]
      });
    }
  }

  return Array.from(statusesByKey.values());
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as JiraSyncPayload | null;

  if (!payload?.config) {
    return errorResponse("invalid_json", "Request body must include Jira configuration.");
  }

  const config = payload.config;
  const errors = validateJiraActionConfig(config);

  if (errors.length > 0) {
    return errorResponse("validation_failed", "Jira sync request failed validation.", errors);
  }

  const projectKey = config.defaultProjectKey.trim().toUpperCase();
  const projectEndpoint = buildJiraEndpoint(config, `project/${encodeURIComponent(projectKey)}`);
  const issueTypesEndpoint = buildJiraEndpoint(config, "issuetype");
  const prioritiesEndpoint = buildJiraEndpoint(config, "priority");
  const statusesEndpoint = buildJiraEndpoint(config, `project/${encodeURIComponent(projectKey)}/statuses`);
  const assignableUsersEndpoint = buildJiraEndpoint(
    config,
    `user/assignable/search?project=${encodeURIComponent(projectKey)}&maxResults=50`
  );
  const boardsEndpoint = buildJiraAgileEndpoint(
    config,
    `board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`
  );

  console.info(
    JSON.stringify({
      event: "jira_metadata_sync_attempt",
      project: projectKey,
      projectEndpoint,
      issueTypesEndpoint,
      prioritiesEndpoint,
      statusesEndpoint,
      boardsEndpoint
    })
  );

  try {
    const [
      projectResult,
      issueTypesResult,
      prioritiesResult,
      statusesResult,
      assignableUsersResult,
      boardsResult
    ] = await Promise.all([
      fetchJira<JiraProjectResponse>(projectEndpoint, config),
      fetchOptionalJira<JiraIssueTypeResponse>(issueTypesEndpoint, config, "Issue types"),
      fetchOptionalJira<JiraPriorityResponse>(prioritiesEndpoint, config, "Priorities"),
      fetchOptionalJira<JiraProjectStatusesResponse>(statusesEndpoint, config, "Statuses"),
      fetchOptionalJira<JiraAssignableUserResponse>(assignableUsersEndpoint, config, "Assignable users"),
      fetchOptionalJira<JiraPagedResponse<JiraBoardResponse>>(boardsEndpoint, config, "Boards")
    ]);

    if (!projectResult.ok) {
      console.error(
        JSON.stringify({
          event: "jira_metadata_sync_failed",
          status: projectResult.status,
          project: projectKey
        })
      );

      return errorResponse(
        "jira_project_sync_failed",
        `Jira returned HTTP ${projectResult.status} while loading project metadata.`,
        projectResult.details,
        projectResult.status
      );
    }

    const issueTypes = issueTypesResult.ok
      ? issueTypesResult.data
          .filter((issueType) => !issueType.subtask)
          .map((issueType) => ({
            id: issueType.id ?? "",
            name: issueType.name ?? "Unnamed issue type"
          }))
      : [];
    const selectedIssueType = issueTypes.find(
      (issueType) => issueType.name.toLowerCase() === config.defaultIssueType.trim().toLowerCase()
    );
    const boards = boardsResult.ok
      ? (boardsResult.data.values?.map((board) => ({
          id: String(board.id ?? ""),
          name: board.name ?? "Unnamed board",
          type: board.type ?? "board"
        })) ?? [])
      : [];
    const statuses = statusesResult.ok ? buildJiraStatusMetadata(statusesResult.data) : [];
    const sprintResults = await Promise.all(
      boards
        .filter((board) => board.id)
        .slice(0, 8)
        .map(async (board) => ({
          board,
          result: await fetchOptionalJira<JiraPagedResponse<JiraSprintResponse>>(
            buildJiraAgileEndpoint(
              config,
              `board/${encodeURIComponent(board.id)}/sprint?state=active,future&maxResults=50`
            ),
            config,
            `Sprints for ${board.name}`
          )
        }))
    );
    const sprintWarnings = sprintResults
      .map(({ board, result }) => optionalWarning(`Sprints for ${board.name}`, result))
      .filter((warning): warning is string => Boolean(warning));
    const warnings = [
      optionalWarning("Issue types", issueTypesResult),
      optionalWarning("Priorities", prioritiesResult),
      optionalWarning("Statuses", statusesResult),
      optionalWarning("Assignable users", assignableUsersResult),
      optionalWarning("Boards", boardsResult),
      ...sprintWarnings
    ].filter((warning): warning is string => Boolean(warning));

    console.info(
      JSON.stringify({
        event: "jira_metadata_sync_success",
        project: projectResult.data.key,
        issueTypes: issueTypes.length,
        statuses: statuses.length,
        boards: boards.length
      })
    );

    return NextResponse.json({
      data: {
        status: "synced",
        project: {
          key: projectResult.data.key ?? projectKey,
          name: projectResult.data.name ?? projectKey
        },
        issueType: selectedIssueType ?? null,
        issueTypes,
        components:
          projectResult.data.components?.map((component) => ({
            id: component.id ?? "",
            name: component.name ?? "Unnamed component"
          })) ?? [],
        versions:
          projectResult.data.versions?.map((version) => ({
            id: version.id ?? "",
            name: version.name ?? "Unnamed version",
            archived: Boolean(version.archived),
            overdue: Boolean(version.overdue),
            released: Boolean(version.released),
            startDate: version.startDate ?? "",
            userStartDate: version.userStartDate ?? "",
            releaseDate: version.releaseDate ?? "",
            userReleaseDate: version.userReleaseDate ?? ""
          })) ?? [],
        priorities: prioritiesResult.ok
          ? prioritiesResult.data.map((priority) => ({
              id: priority.id ?? "",
              name: priority.name ?? "Unnamed priority",
              statusColor: priority.statusColor ?? ""
            }))
          : [],
        statuses,
        assignableUsers: assignableUsersResult.ok
          ? assignableUsersResult.data.map((user) => ({
              id: user.accountId ?? user.key ?? user.name ?? "",
              name: user.displayName ?? user.name ?? user.key ?? user.accountId ?? "Unnamed user",
              email: user.emailAddress ?? "",
              active: user.active !== false
            }))
          : [],
        boards,
        sprints: sprintResults.flatMap(({ board, result }) =>
          result.ok
            ? (result.data.values?.map((sprint) => ({
                id: String(sprint.id ?? ""),
                name: sprint.name ?? "Unnamed sprint",
                state: sprint.state ?? "",
                boardId: board.id,
                boardName: board.name,
                startDate: sprint.startDate ?? "",
                endDate: sprint.endDate ?? ""
              })) ?? [])
            : []
        ),
        warnings
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira sync failure.";

    console.error(
      JSON.stringify({
        event: "jira_metadata_sync_exception",
        message
      })
    );

    return errorResponse(
      "jira_sync_request_failed",
      "Could not reach Jira metadata endpoints.",
      [message],
      502
    );
  }
}
