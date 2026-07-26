import { getOpenAiPlatformApiKey } from "./platform-secrets";

export type AiActionConfig = {
  enabled: boolean;
  provider: "openai";
  model: string;
};

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type JiraFieldGenerationResult = {
  summary: string;
  description: string;
  releaseNote: string;
  notes: string[];
};

export type ReleaseNoteGenerationResult = {
  releaseNote: string;
  notes: string[];
};

export type EscalationMeetingSeriesGenerationResult = {
  meetingSeries: string;
  notes: string[];
};

export type TicketRequirementReviewResult = {
  verdict: "fulfilled" | "partially_fulfilled" | "not_fulfilled" | "insufficient_evidence";
  confidence: "low" | "medium" | "high";
  summary: string;
  matchedRequirements: string[];
  gaps: string[];
  evidence: string[];
};

type OpenAiResponsesApiBody = {
  model: string;
  input: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  max_output_tokens: number;
  store: boolean;
  text?: {
    format: {
      type: "json_schema";
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
  };
};

type OpenAiResponsesApiResponse = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: unknown;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type OpenAiGenerateResult = {
  id: string | null;
  model: string;
  text: string;
  usage?: unknown;
};

const openAiResponsesEndpoint = "https://api.openai.com/v1/responses";
const defaultOpenAiModel = "gpt-5.5";
const maxInputLength = 20000;
const sensitiveTokenPattern = /\bsk-[A-Za-z0-9_-]+/g;

export function getDefaultOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || defaultOpenAiModel;
}

export function resolveOpenAiApiKey(): string {
  return getOpenAiPlatformApiKey();
}

export function validateAiActionConfig(config: AiActionConfig): string[] {
  const errors: string[] = [];

  if (!config.enabled) {
    errors.push("AI integration must be enabled before running AI actions.");
  }

  if (config.provider !== "openai") {
    errors.push("Only the OpenAI provider is supported by this integration.");
  }

  if (!config.model.trim()) {
    errors.push("OpenAI model is required.");
  }

  if (!resolveOpenAiApiKey()) {
    errors.push(
      "OpenAI API key is required. Configure OPENAI_API_KEY on the server."
    );
  }

  return errors;
}

function truncateInput(value: string, maxLength = maxInputLength): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function extractOpenAiOutputText(responseBody: OpenAiResponsesApiResponse): string {
  const directText = responseBody.output_text?.trim();

  if (directText) {
    return directText;
  }

  const outputText = responseBody.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  return outputText ?? "";
}

function redactSensitiveErrorText(value: string): string {
  return value.replace(sensitiveTokenPattern, "[redacted OpenAI API key]");
}

function normalizeShortReleaseNote(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
}

async function createOpenAiResponse(
  config: AiActionConfig,
  body: OpenAiResponsesApiBody
): Promise<OpenAiGenerateResult> {
  const apiKey = resolveOpenAiApiKey();
  const response = await fetch(openAiResponsesEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });

  const responseBody = (await response.json().catch(() => null)) as OpenAiResponsesApiResponse | null;

  if (!response.ok) {
    const details = [
      responseBody?.error?.message,
      responseBody?.error?.type,
      responseBody?.error?.code
    ].filter((detail): detail is string => Boolean(detail));

    throw new Error(
      details.length > 0
        ? redactSensitiveErrorText(details.join(" "))
        : `OpenAI returned HTTP ${response.status}.`
    );
  }

  if (!responseBody) {
    throw new Error("OpenAI returned an empty response body.");
  }

  const text = extractOpenAiOutputText(responseBody);

  if (!text) {
    throw new Error("OpenAI response did not include generated text.");
  }

  return {
    id: responseBody.id ?? null,
    model: responseBody.model ?? body.model,
    text,
    usage: responseBody.usage
  };
}

export async function generateAiChatText(
  config: AiActionConfig,
  messages: AiChatMessage[],
  prompt: string
): Promise<OpenAiGenerateResult> {
  const input = [
    {
      role: "system" as const,
      content:
        "You are the Nexus-support portal support assistant. Be concise, practical, and do not invent Jira fields, APIs, or facts that are not in the user context."
    },
    ...messages.map((message) => ({
      role: message.role,
      content: truncateInput(message.content)
    })),
    {
      role: "user" as const,
      content: truncateInput(prompt)
    }
  ];

  return createOpenAiResponse(config, {
    model: config.model.trim() || getDefaultOpenAiModel(),
    input,
    max_output_tokens: 1200,
    store: false
  });
}

export async function generateJiraFieldText(
  config: AiActionConfig,
  context: Record<string, unknown>
): Promise<OpenAiGenerateResult & { jiraText: JiraFieldGenerationResult }> {
  const prompt = [
    "Create polished Jira handoff text from this Nexus-support portal ticket context.",
    "Return a concise Jira summary, a structured Jira description, and a short release note.",
    "Keep factual details only from the supplied JSON. If information is missing, state 'Not provided' instead of inventing it.",
    "Use clear section headings in the description and include portal ticket key, request, impact, priority, risk, product, PRU, module, and release context when available.",
    "",
    JSON.stringify(context, null, 2)
  ].join("\n");

  const result = await createOpenAiResponse(config, {
    model: config.model.trim() || getDefaultOpenAiModel(),
    input: [
      {
        role: "system",
        content:
          "You write Jira-ready execution text for enterprise support and release workflows. Be precise, neutral, and actionable."
      },
      {
        role: "user",
        content: truncateInput(prompt)
      }
    ],
    max_output_tokens: 1600,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "jira_field_text",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: {
              type: "string",
              description: "Jira summary/title. Keep under 140 characters when possible."
            },
            description: {
              type: "string",
              description: "Jira description with compact section headings and actionable handoff detail."
            },
            releaseNote: {
              type: "string",
              description: "Short release note or deployment summary. Empty string if not applicable."
            },
            notes: {
              type: "array",
              description: "Warnings or assumptions about missing source details.",
              items: {
                type: "string"
              }
            }
          },
          required: ["summary", "description", "releaseNote", "notes"]
        }
      }
    }
  });

  let jiraText: JiraFieldGenerationResult;

  try {
    jiraText = JSON.parse(result.text) as JiraFieldGenerationResult;
  } catch {
    throw new Error("OpenAI returned text that did not match the Jira field JSON schema.");
  }

  return {
    ...result,
    jiraText: {
      summary: jiraText.summary?.trim() ?? "",
      description: jiraText.description?.trim() ?? "",
      releaseNote: jiraText.releaseNote?.trim() ?? "",
      notes: Array.isArray(jiraText.notes) ? jiraText.notes.map((note) => note.trim()).filter(Boolean) : []
    }
  };
}

export async function generateReleaseNoteText(
  config: AiActionConfig,
  context: Record<string, unknown>
): Promise<OpenAiGenerateResult & { releaseNoteText: ReleaseNoteGenerationResult }> {
  const prompt = [
    "Create a release note announcement from this complete Nexus-support portal ticket context.",
    "Use the ticket request, business impact, Jira draft, comments, clarification threads, and attachment details.",
    "Return only a short user-facing release note, maximum 2-3 lines.",
    "Do not change Jira title or Jira description. Do not invent facts. If evidence is missing, keep the release note general and add a note.",
    "",
    JSON.stringify(context, null, 2)
  ].join("\n");

  const result = await createOpenAiResponse(config, {
    model: config.model.trim() || getDefaultOpenAiModel(),
    input: [
      {
        role: "system",
        content:
          "You write concise release announcement notes for enterprise support tickets. Be factual, neutral, and understandable for business and IT readers."
      },
      {
        role: "user",
        content: truncateInput(prompt)
      }
    ],
    max_output_tokens: 600,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "release_note_text",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            releaseNote: {
              type: "string",
              description: "A concise release announcement note. Maximum 2-3 short lines."
            },
            notes: {
              type: "array",
              description: "Warnings or assumptions about missing source details.",
              items: {
                type: "string"
              }
            }
          },
          required: ["releaseNote", "notes"]
        }
      }
    }
  });

  let releaseNoteText: ReleaseNoteGenerationResult;

  try {
    releaseNoteText = JSON.parse(result.text) as ReleaseNoteGenerationResult;
  } catch {
    throw new Error("OpenAI returned text that did not match the release note JSON schema.");
  }

  return {
    ...result,
    releaseNoteText: {
      releaseNote: normalizeShortReleaseNote(releaseNoteText.releaseNote ?? ""),
      notes: Array.isArray(releaseNoteText.notes)
        ? releaseNoteText.notes.map((note) => note.trim()).filter(Boolean)
        : []
    }
  };
}

export async function generateEscalationMeetingSeriesText(
  config: AiActionConfig,
  context: Record<string, unknown>
): Promise<OpenAiGenerateResult & { meetingSeriesText: EscalationMeetingSeriesGenerationResult }> {
  const prompt = [
    "Create a practical meeting series plan for this Nexus-support portal escalation.",
    "Use only the supplied ticket and escalation context. Do not schedule a real calendar event or invent unavailable people, dates, links, or decisions.",
    "Return paste-ready text for the portal Meeting series field.",
    "Include the proposed start time, end time, timezone, meeting type, repeat cadence, series end, and Outlook availability-check status when supplied.",
    "Do not claim attendee free/busy is confirmed unless the context explicitly says it was checked externally.",
    "Include cadence, attendees or roles, agenda, decision/follow-up handling, and action tracking.",
    "Keep it concise: 4-7 short lines or bullets.",
    "",
    JSON.stringify(context, null, 2)
  ].join("\n");

  const result = await createOpenAiResponse(config, {
    model: config.model.trim() || getDefaultOpenAiModel(),
    input: [
      {
        role: "system",
        content:
          "You draft escalation follow-up meeting series text for enterprise support workflows. Be concrete, neutral, and operational."
      },
      {
        role: "user",
        content: truncateInput(prompt)
      }
    ],
    max_output_tokens: 800,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "escalation_meeting_series_text",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            meetingSeries: {
              type: "string",
              description: "Paste-ready meeting series plan for the escalation Meeting series field."
            },
            notes: {
              type: "array",
              description: "Warnings or assumptions about missing source details.",
              items: {
                type: "string"
              }
            }
          },
          required: ["meetingSeries", "notes"]
        }
      }
    }
  });

  let meetingSeriesText: EscalationMeetingSeriesGenerationResult;

  try {
    meetingSeriesText = JSON.parse(result.text) as EscalationMeetingSeriesGenerationResult;
  } catch {
    throw new Error("OpenAI returned text that did not match the escalation meeting series JSON schema.");
  }

  return {
    ...result,
    meetingSeriesText: {
      meetingSeries: meetingSeriesText.meetingSeries?.trim() ?? "",
      notes: Array.isArray(meetingSeriesText.notes)
        ? meetingSeriesText.notes.map((note) => note.trim()).filter(Boolean)
        : []
    }
  };
}

export async function reviewTicketRequirementFulfillment(
  config: AiActionConfig,
  context: Record<string, unknown>
): Promise<OpenAiGenerateResult & { requirementReview: TicketRequirementReviewResult }> {
  const prompt = [
    "Review whether the supplied GitLab source evidence fulfills the Jira/Nexus-support portal ticket requirements.",
    "Use only the ticket context and source evidence in the JSON. Do not infer implementation details that are not visible.",
    "Return a concise verdict with matched requirements, gaps, and evidence references.",
    "If the source files are not enough to judge, use verdict insufficient_evidence.",
    "",
    JSON.stringify(context, null, 2)
  ].join("\n");

  const result = await createOpenAiResponse(config, {
    model: config.model.trim() || getDefaultOpenAiModel(),
    input: [
      {
        role: "system",
        content:
          "You are a senior software reviewer comparing Jira requirements to GitLab source evidence. Be strict, factual, and explicit about missing evidence."
      },
      {
        role: "user",
        content: truncateInput(prompt)
      }
    ],
    max_output_tokens: 1400,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "ticket_requirement_review",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            verdict: {
              type: "string",
              enum: ["fulfilled", "partially_fulfilled", "not_fulfilled", "insufficient_evidence"]
            },
            confidence: {
              type: "string",
              enum: ["low", "medium", "high"]
            },
            summary: {
              type: "string"
            },
            matchedRequirements: {
              type: "array",
              items: {
                type: "string"
              }
            },
            gaps: {
              type: "array",
              items: {
                type: "string"
              }
            },
            evidence: {
              type: "array",
              items: {
                type: "string"
              }
            }
          },
          required: ["verdict", "confidence", "summary", "matchedRequirements", "gaps", "evidence"]
        }
      }
    }
  });

  let requirementReview: TicketRequirementReviewResult;

  try {
    requirementReview = JSON.parse(result.text) as TicketRequirementReviewResult;
  } catch {
    throw new Error("OpenAI returned text that did not match the ticket requirement review JSON schema.");
  }

  return {
    ...result,
    requirementReview: {
      verdict: requirementReview.verdict,
      confidence: requirementReview.confidence,
      summary: requirementReview.summary?.trim() ?? "",
      matchedRequirements: Array.isArray(requirementReview.matchedRequirements)
        ? requirementReview.matchedRequirements.map((item) => item.trim()).filter(Boolean)
        : [],
      gaps: Array.isArray(requirementReview.gaps)
        ? requirementReview.gaps.map((item) => item.trim()).filter(Boolean)
        : [],
      evidence: Array.isArray(requirementReview.evidence)
        ? requirementReview.evidence.map((item) => item.trim()).filter(Boolean)
        : []
    }
  };
}
