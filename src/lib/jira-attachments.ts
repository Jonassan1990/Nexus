import {
  buildJiraEndpoint,
  buildJiraHeaders,
  type JiraActionConfig
} from "./integration-actions";

export type JiraIssueAttachmentInput = {
  id?: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
  contentDataUrl?: string;
};

export type JiraIssueAttachmentUploadResult = {
  uploaded: string[];
  skipped: string[];
  warnings: string[];
};

type JiraAttachmentMetadata = {
  id?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
};

type JiraIssueAttachmentsResponse = {
  fields?: {
    attachment?: JiraAttachmentMetadata[];
  };
  errors?: Record<string, string>;
  errorMessages?: string[];
};

type PreparedJiraAttachment =
  | {
      ok: true;
      fileName: string;
      mimeType: string;
      content: Buffer;
    }
  | {
      ok: false;
      fileName: string;
      warning: string;
    };

const jiraAttachmentMaxUploadBytes = 50 * 1024 * 1024;
const defaultAttachmentMimeType = "application/octet-stream";

function getJiraErrorDetails(body: Pick<JiraIssueAttachmentsResponse, "errors" | "errorMessages"> | null): string[] {
  return [
    body?.errorMessages?.join(" "),
    body?.errors ? Object.entries(body.errors).map(([key, value]) => `${key}: ${value}`).join(" ") : ""
  ].filter((detail): detail is string => Boolean(detail));
}

function parseJiraAttachmentResponseBody(responseText: string): JiraIssueAttachmentsResponse | null {
  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as JiraIssueAttachmentsResponse;
  } catch {
    return null;
  }
}

function sanitizeJiraAttachmentFileName(value?: string): string {
  const leafName = (value ?? "").trim().split(/[\\/]/).filter(Boolean).pop() ?? "";
  const safeName = leafName
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();

  return safeName || "attachment";
}

function normalizeJiraAttachmentFileName(value?: string): string {
  return sanitizeJiraAttachmentFileName(value).toLowerCase();
}

function parseAttachmentDataUrl(value: string): { mimeType: string; content: Buffer } | null {
  const commaIndex = value.indexOf(",");

  if (!value.startsWith("data:") || commaIndex < 0) {
    return null;
  }

  const metadata = value.slice("data:".length, commaIndex);
  const data = value.slice(commaIndex + 1);
  const metadataParts = metadata.split(";").map((part) => part.trim()).filter(Boolean);
  const isBase64 = metadataParts.some((part) => part.toLowerCase() === "base64");
  const mimeType = metadataParts.find((part) => part.includes("/")) || defaultAttachmentMimeType;

  try {
    return {
      mimeType,
      content: isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8")
    };
  } catch {
    return null;
  }
}

function prepareJiraAttachment(attachment: JiraIssueAttachmentInput): PreparedJiraAttachment {
  const fileName = sanitizeJiraAttachmentFileName(attachment.fileName);
  const declaredByteSize = attachment.byteSize;

  if (
    typeof declaredByteSize === "number" &&
    Number.isFinite(declaredByteSize) &&
    declaredByteSize > jiraAttachmentMaxUploadBytes
  ) {
    return {
      ok: false,
      fileName,
      warning: `${fileName} is larger than the ${Math.round(jiraAttachmentMaxUploadBytes / 1024 / 1024)} MB Jira upload limit used by this portal.`
    };
  }

  if (!attachment.contentDataUrl?.trim()) {
    return {
      ok: false,
      fileName,
      warning: `${fileName} was not uploaded because the ticket only has attachment metadata, not stored file content.`
    };
  }

  const decoded = parseAttachmentDataUrl(attachment.contentDataUrl.trim());

  if (!decoded) {
    return {
      ok: false,
      fileName,
      warning: `${fileName} was not uploaded because its stored content is not a valid data URL.`
    };
  }

  if (decoded.content.byteLength === 0) {
    return {
      ok: false,
      fileName,
      warning: `${fileName} was not uploaded because its stored content is empty.`
    };
  }

  if (decoded.content.byteLength > jiraAttachmentMaxUploadBytes) {
    return {
      ok: false,
      fileName,
      warning: `${fileName} is larger than the ${Math.round(jiraAttachmentMaxUploadBytes / 1024 / 1024)} MB Jira upload limit used by this portal.`
    };
  }

  return {
    ok: true,
    fileName,
    mimeType: attachment.mimeType?.trim() || decoded.mimeType || defaultAttachmentMimeType,
    content: decoded.content
  };
}

async function fetchExistingJiraAttachmentFileNames(
  config: JiraActionConfig,
  jiraKey: string
): Promise<{ fileNames: Set<string>; warnings: string[] }> {
  const endpoint = buildJiraEndpoint(config, `issue/${encodeURIComponent(jiraKey)}?fields=attachment`);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...buildJiraHeaders(config)
      },
      signal: AbortSignal.timeout(20000)
    });
    const responseBody = (await response.json().catch(() => null)) as JiraIssueAttachmentsResponse | null;

    if (!response.ok) {
      const details = getJiraErrorDetails(responseBody);

      console.warn(
        JSON.stringify({
          event: "jira_attachment_existing_fetch_failed",
          status: response.status,
          jiraKey
        })
      );

      return {
        fileNames: new Set(),
        warnings: [
          `Could not read existing Jira attachments before upload: ${
            details.join(" ") || `Jira returned HTTP ${response.status}.`
          }`
        ]
      };
    }

    return {
      fileNames: new Set(
        (responseBody?.fields?.attachment ?? [])
          .map((attachment) => normalizeJiraAttachmentFileName(attachment.filename))
          .filter(Boolean)
      ),
      warnings: []
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira attachment lookup failure.";

    console.warn(
      JSON.stringify({
        event: "jira_attachment_existing_fetch_exception",
        jiraKey,
        message
      })
    );

    return {
      fileNames: new Set(),
      warnings: [`Could not read existing Jira attachments before upload: ${message}`]
    };
  }
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);

  return arrayBuffer;
}

async function uploadPreparedJiraAttachment(
  config: JiraActionConfig,
  jiraKey: string,
  attachment: Extract<PreparedJiraAttachment, { ok: true }>
): Promise<{ ok: true } | { ok: false; warning: string }> {
  const endpoint = buildJiraEndpoint(config, `issue/${encodeURIComponent(jiraKey)}/attachments`);
  const formData = new FormData();
  const blob = new Blob([toArrayBuffer(attachment.content)], { type: attachment.mimeType });

  formData.append("file", blob, attachment.fileName);

  console.info(
    JSON.stringify({
      event: "jira_attachment_upload_attempt",
      jiraKey,
      fileName: attachment.fileName,
      byteSize: attachment.content.byteLength
    })
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Atlassian-Token": "no-check",
        ...buildJiraHeaders(config)
      },
      body: formData,
      signal: AbortSignal.timeout(60000)
    });
    const responseText = await response.text().catch(() => "");
    const responseBody = parseJiraAttachmentResponseBody(responseText);

    if (!response.ok) {
      const details = getJiraErrorDetails(responseBody);

      console.error(
        JSON.stringify({
          event: "jira_attachment_upload_failed",
          status: response.status,
          jiraKey,
          fileName: attachment.fileName
        })
      );

      return {
        ok: false,
        warning: `${attachment.fileName} was not uploaded to Jira: ${
          details.join(" ") || `Jira returned HTTP ${response.status}.`
        }`
      };
    }

    console.info(
      JSON.stringify({
        event: "jira_attachment_upload_success",
        jiraKey,
        fileName: attachment.fileName
      })
    );

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Jira attachment upload failure.";

    console.error(
      JSON.stringify({
        event: "jira_attachment_upload_exception",
        jiraKey,
        fileName: attachment.fileName,
        message
      })
    );

    return {
      ok: false,
      warning: `${attachment.fileName} was not uploaded to Jira: ${message}`
    };
  }
}

export async function uploadJiraIssueAttachments(
  config: JiraActionConfig,
  jiraKey: string,
  attachments: JiraIssueAttachmentInput[] = []
): Promise<JiraIssueAttachmentUploadResult> {
  const result: JiraIssueAttachmentUploadResult = {
    uploaded: [],
    skipped: [],
    warnings: []
  };

  if (attachments.length === 0) {
    return result;
  }

  const existingAttachments = await fetchExistingJiraAttachmentFileNames(config, jiraKey);
  const existingFileNames = existingAttachments.fileNames;

  result.warnings.push(...existingAttachments.warnings);

  for (const attachment of attachments) {
    const preparedAttachment = prepareJiraAttachment(attachment);

    if (!preparedAttachment.ok) {
      result.skipped.push(preparedAttachment.fileName);
      result.warnings.push(preparedAttachment.warning);
      continue;
    }

    const normalizedFileName = normalizeJiraAttachmentFileName(preparedAttachment.fileName);

    if (existingFileNames.has(normalizedFileName)) {
      result.skipped.push(preparedAttachment.fileName);
      continue;
    }

    const uploadResult = await uploadPreparedJiraAttachment(config, jiraKey, preparedAttachment);

    if (uploadResult.ok) {
      result.uploaded.push(preparedAttachment.fileName);
      existingFileNames.add(normalizedFileName);
    } else {
      result.skipped.push(preparedAttachment.fileName);
      result.warnings.push(uploadResult.warning);
    }
  }

  return result;
}
