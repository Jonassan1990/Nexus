import {
  buildJiraAgileEndpoint,
  buildJiraHeaders,
  type JiraActionConfig
} from "./integration-actions";

type JiraPagedResponse<T> = {
  values?: T[];
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
};

type JiraErrorBody = {
  errorMessages?: string[];
  errors?: Record<string, string>;
};

export type JiraAgilePlacementInput = {
  board?: string;
  sprint?: string;
};

export type JiraAgilePlacementResult = {
  target: "sprint" | "backlog";
  moved: boolean;
  sprintId?: string;
  sprintName?: string;
  warnings: string[];
};

function normalizeJiraName(value?: string): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getJiraErrorDetails(body: JiraErrorBody | null, fallback: string): string {
  const details = [
    body?.errorMessages?.join(" "),
    body?.errors ? Object.entries(body.errors).map(([key, value]) => `${key}: ${value}`).join(" ") : ""
  ].filter(Boolean);

  return details.length > 0 ? details.join(" ") : fallback;
}

function parseJiraErrorBody(value: string): JiraErrorBody | null {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as JiraErrorBody;
  } catch {
    return null;
  }
}

async function fetchJiraJson<T>(url: string, config: JiraActionConfig): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...buildJiraHeaders(config)
    },
    signal: AbortSignal.timeout(20000)
  });
  const responseBody = (await response.json().catch(() => null)) as T | JiraErrorBody | null;

  if (!response.ok) {
    throw new Error(getJiraErrorDetails(responseBody as JiraErrorBody | null, `Jira returned HTTP ${response.status}.`));
  }

  return responseBody as T;
}

async function postJiraAgileMove(url: string, config: JiraActionConfig, issueKey: string): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...buildJiraHeaders(config)
    },
    body: JSON.stringify({
      issues: [issueKey]
    }),
    signal: AbortSignal.timeout(20000)
  });
  const responseText = await response.text().catch(() => "");
  const responseBody = parseJiraErrorBody(responseText);

  if (!response.ok) {
    throw new Error(getJiraErrorDetails(responseBody, `Jira returned HTTP ${response.status}.`));
  }
}

async function loadProjectBoards(config: JiraActionConfig): Promise<JiraBoardResponse[]> {
  const projectKey = config.defaultProjectKey.trim().toUpperCase();
  const endpoint = buildJiraAgileEndpoint(
    config,
    `board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`
  );
  const response = await fetchJiraJson<JiraPagedResponse<JiraBoardResponse>>(endpoint, config);

  return response.values ?? [];
}

async function loadBoardSprints(config: JiraActionConfig, boardId: string): Promise<JiraSprintResponse[]> {
  const endpoint = buildJiraAgileEndpoint(
    config,
    `board/${encodeURIComponent(boardId)}/sprint?state=active,future&maxResults=100`
  );
  const response = await fetchJiraJson<JiraPagedResponse<JiraSprintResponse>>(endpoint, config);

  return response.values ?? [];
}

async function resolveSprintId(
  config: JiraActionConfig,
  sprintName: string,
  boardName?: string
): Promise<{ sprintId?: string; sprintName?: string; boardName?: string; warning?: string }> {
  if (/^\d+$/.test(sprintName.trim())) {
    return {
      sprintId: sprintName.trim(),
      sprintName
    };
  }

  const boards = await loadProjectBoards(config);
  const normalizedBoardName = normalizeJiraName(boardName);
  const candidateBoards = normalizedBoardName
    ? boards.filter((board) => normalizeJiraName(board.name) === normalizedBoardName)
    : boards;
  const searchableBoards = candidateBoards.length > 0 ? candidateBoards : boards;
  const normalizedSprintName = normalizeJiraName(sprintName);

  for (const board of searchableBoards) {
    if (!board.id) {
      continue;
    }

    const sprints = await loadBoardSprints(config, String(board.id));
    const matchedSprint = sprints.find((sprint) => normalizeJiraName(sprint.name) === normalizedSprintName);

    if (matchedSprint?.id) {
      return {
        sprintId: String(matchedSprint.id),
        sprintName: matchedSprint.name ?? sprintName,
        boardName: board.name
      };
    }
  }

  return {
    warning: `Selected sprint ${sprintName} was not found in Jira active or future sprints for ${boardName || config.defaultProjectKey}.`
  };
}

export async function placeJiraIssueInSprintOrBacklog(
  config: JiraActionConfig,
  issueKey: string,
  input?: JiraAgilePlacementInput
): Promise<JiraAgilePlacementResult> {
  const sprintName = input?.sprint?.trim() ?? "";

  if (sprintName) {
    try {
      const sprint = await resolveSprintId(config, sprintName, input?.board);

      if (!sprint.sprintId) {
        return {
          target: "sprint",
          moved: false,
          sprintName,
          warnings: [sprint.warning ?? `Selected sprint ${sprintName} could not be resolved.`]
        };
      }

      await postJiraAgileMove(
        buildJiraAgileEndpoint(config, `sprint/${encodeURIComponent(sprint.sprintId)}/issue`),
        config,
        issueKey
      );

      return {
        target: "sprint",
        moved: true,
        sprintId: sprint.sprintId,
        sprintName: sprint.sprintName ?? sprintName,
        warnings: []
      };
    } catch (error) {
      return {
        target: "sprint",
        moved: false,
        sprintName,
        warnings: [
          `Jira issue ${issueKey} was created or updated, but could not be moved to sprint ${sprintName}. ${
            error instanceof Error ? error.message : "Unknown Jira sprint move failure."
          }`
        ]
      };
    }
  }

  try {
    await postJiraAgileMove(buildJiraAgileEndpoint(config, "backlog/issue"), config, issueKey);

    return {
      target: "backlog",
      moved: true,
      warnings: []
    };
  } catch (error) {
    return {
      target: "backlog",
      moved: false,
      warnings: [
        `Jira issue ${issueKey} was created or updated, but could not be moved to backlog. ${
          error instanceof Error ? error.message : "Unknown Jira backlog move failure."
        }`
      ]
    };
  }
}
