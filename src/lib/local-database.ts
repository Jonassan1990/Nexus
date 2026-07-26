import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import {
  aiIntegration,
  adminConfig,
  defaultLeadTimeStatusRules,
  defaultLeadTimeTransitionRules,
  getJiraPriorityOptions,
  gitlabIntegration,
  isLegacyDefaultPriorityConfig,
  jiraIntegration,
  migrateLegacyPriorityReferences,
  normalizeLeadTimeStatusRules,
  normalizeLeadTimeTransitionRules,
  normalizeAdminUser,
  normalizeProductConfig,
  normalizeWorkflowStepOwnerRole,
  smtpConfig,
  statusColorOptions
} from "./admin-config";
import {
  deleteAttachmentObject,
  parseAttachmentDataUrl,
  uploadAttachmentObject,
  type StoredAttachmentRecord
} from "./attachment-storage";
import type {
  AdminConfig,
  GitLabIntegrationConfig,
  StatusColorConfig,
  TicketTypeWorkflowConfig
} from "./admin-config";
import { extractJiraProjectKey, normalizeJiraBaseUrl } from "./integration-actions";
import { buildDemoTickets } from "./demo-tickets";
import { workflowTemplates } from "./nexus-data";
import { createOutboxJobId, type OutboxEnqueueInput, type OutboxJob, type OutboxJobStatus } from "./outbox";
import type { Attachment, Ticket } from "./types";

type ConfigRow = {
  payload: string;
};

type TicketRow = {
  payload: string;
};

type AttachmentRow = {
  id: string;
  ticket_id: string;
  original_filename?: string;
  file_name?: string;
  mime_type: string;
  size_bytes?: number;
  byte_size?: number;
  checksum_sha256: string;
  uploaded_by: string;
  uploaded_at: string;
  storage_provider?: "s3" | "local";
  bucket_name?: string | null;
  s3_key?: string | null;
  object_key?: string | null;
  relation_type?: string;
  relation_id: string | null;
  preview_available: number | boolean;
};

type SqliteTableRow = {
  name: string;
};

type CountRow = {
  count: number;
};

type ColumnInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};

type NotificationDeliveryStatus = "pending" | "sent" | "failed";

type NotificationDeliveryRow = {
  idempotency_key: string;
  status: NotificationDeliveryStatus;
  recipient_count: number;
  message_id: string | null;
  accepted_count: number | null;
  rejected_count: number | null;
  response: string | null;
  error: string | null;
  updated_at: string;
};

export interface DatabaseColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: unknown;
}

export interface DatabaseTableSummary {
  name: string;
  rowCount: number;
  columns: DatabaseColumnInfo[];
  previewRows: Record<string, unknown>[];
}

export interface DatabaseQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  elapsedMs: number;
  statementType: string;
}

export type NotificationDeliveryClaim =
  | {
      status: "claimed";
      attempt: "new" | "retry";
      idempotencyKey: string;
    }
  | {
      status: "duplicate";
      deliveryStatus: Exclude<NotificationDeliveryStatus, "failed">;
      idempotencyKey: string;
      messageId: string | null;
      acceptedCount: number;
      rejectedCount: number;
      response: string | null;
      updatedAt: string;
    };

const adminConfigKey = "admin";
const defaultDatabasePath = path.join(process.cwd(), "db", "nexus-local.sqlite");

let database: DatabaseSync | null = null;

const emptyAdminConfig: AdminConfig = {
  users: [],
  customRoles: [],
  roleDomains: [],
  deletedRoleKeys: [],
  regionSites: [],
  departments: [],
  productDomains: [],
  products: [],
  responsibilityMappings: [],
  requestTypes: [],
  priorities: getJiraPriorityOptions(),
  riskOptions: [],
  statusColors: [],
  requestCategories: [],
  slaRules: [],
  escalationPolicies: [],
  leadTimeStatusRules: defaultLeadTimeStatusRules,
  leadTimeTransitionRules: defaultLeadTimeTransitionRules,
  notificationTemplates: [],
  formTemplates: [],
  ticketTypeWorkflows: [],
  integrations: {
    jira: jiraIntegration,
    smtp: smtpConfig,
    ai: aiIntegration,
    gitlab: gitlabIntegration
  }
};

function normalizeStatusLabel(value: string): string {
  return value.trim().toLowerCase();
}

function mergeDefaultStatusColors(statusColors: StatusColorConfig[]): StatusColorConfig[] {
  const currentStatusColors = Array.isArray(statusColors) ? statusColors : [];
  const currentByStatus = new Map(
    currentStatusColors.map((statusColor) => [normalizeStatusLabel(statusColor.status), statusColor])
  );
  const defaultStatusKeys = new Set(
    statusColorOptions.map((statusColor) => normalizeStatusLabel(statusColor.status))
  );
  const mergedDefaults = statusColorOptions.map(
    (statusColor) => currentByStatus.get(normalizeStatusLabel(statusColor.status)) ?? statusColor
  );
  const customStatusColors = currentStatusColors.filter(
    (statusColor) => !defaultStatusKeys.has(normalizeStatusLabel(statusColor.status))
  );

  return [...mergedDefaults, ...customStatusColors];
}

function getJiraProjectUrl(apiBaseUrl: string, projectKey: string): string {
  const normalizedBaseUrl = normalizeJiraBaseUrl(apiBaseUrl);
  const normalizedProjectKey = extractJiraProjectKey(projectKey);

  return normalizedBaseUrl && normalizedProjectKey
    ? `${normalizedBaseUrl}/projects/${normalizedProjectKey}`
    : "";
}

function normalizeStoredJiraIntegration(
  config: AdminConfig["integrations"]["jira"] | undefined
): AdminConfig["integrations"]["jira"] {
  const mergedConfig = {
    ...jiraIntegration,
    ...(config ?? {})
  };
  const apiBaseUrl = normalizeJiraBaseUrl(mergedConfig.apiBaseUrl || mergedConfig.projectUrl);
  const defaultProjectKey =
    extractJiraProjectKey(mergedConfig.defaultProjectKey) ||
    extractJiraProjectKey(mergedConfig.projectUrl) ||
    jiraIntegration.defaultProjectKey;

  return {
    ...mergedConfig,
    apiBaseUrl,
    defaultProjectKey,
    projectUrl:
      getJiraProjectUrl(mergedConfig.projectUrl || apiBaseUrl, defaultProjectKey) || mergedConfig.projectUrl
  };
}

function normalizeStoredGitLabIntegration(
  config: Partial<GitLabIntegrationConfig> | undefined
): GitLabIntegrationConfig {
  const productRepositoryMappings = Array.isArray(config?.productRepositoryMappings)
    ? config.productRepositoryMappings
    : [];
  const apiBaseUrl = config?.apiBaseUrl?.trim();
  const isUnsavedLegacyDefault =
    apiBaseUrl === "https://gitlab.com" &&
    !config?.tokenConfigured &&
    !config?.tokenLastFour &&
    productRepositoryMappings.length === 0;

  return {
    ...gitlabIntegration,
    ...(config ?? {}),
    apiBaseUrl:
      !apiBaseUrl || isUnsavedLegacyDefault
        ? gitlabIntegration.apiBaseUrl
        : (apiBaseUrl ?? gitlabIntegration.apiBaseUrl),
    productRepositoryMappings
  };
}

function normalizeStoredTicketTypeWorkflow(workflow: TicketTypeWorkflowConfig): TicketTypeWorkflowConfig {
  const template = workflowTemplates.find((item) => item.id === workflow.workflowTemplateId);
  const stepOverrides = Object.fromEntries(
    Object.entries(workflow.stepOverrides ?? {}).map(([stepId, override]) => {
      const templateStep = template?.steps.find((step) => step.id === stepId);
      const label = override.label?.trim() || templateStep?.label || "";
      const ownerRole = normalizeWorkflowStepOwnerRole({
        id: stepId,
        label,
        ownerRole: override.ownerRole ?? templateStep?.ownerRole ?? "requester"
      });

      return [
        stepId,
        {
          ...override,
          ownerRole
        }
      ] as const;
    })
  );

  return {
    ...workflow,
    escalationPolicyId: workflow.escalationPolicyId ?? "",
    stepOverrides
  };
}

function normalizeStoredFunctionMappingReviews(
  ticket: Ticket
): NonNullable<Ticket["functionMappingReviews"]> {
  if (!Array.isArray(ticket.functionMappingReviews)) {
    return [];
  }

  return ticket.functionMappingReviews.map((review) => ({
    ...review,
    materialAttachmentIds: Array.isArray(review.materialAttachmentIds) ? review.materialAttachmentIds : [],
    steps: review.steps.map((step) =>
      step.id === "solution_architecture"
        ? {
            ...step,
            label: "Solution architecture mapping",
            ownerRole: "solution_architect",
            ownerName:
              step.ownerRole === "solution_architect" && step.ownerName
                ? step.ownerName
                : "Solution Architect",
            discussion: Array.isArray(step.discussion) ? step.discussion : []
          }
        : {
            ...step,
            discussion: Array.isArray(step.discussion) ? step.discussion : []
          }
    )
  }));
}

function normalizeStoredTicket(ticket: Ticket): Ticket {
  const projectKey = extractJiraProjectKey(ticket.jiraDraft.project);
  const normalizedTicket: Ticket = {
    ...ticket,
    functionMappingReviews: normalizeStoredFunctionMappingReviews(ticket)
  };

  if (!projectKey) {
    return normalizedTicket;
  }

  return {
    ...normalizedTicket,
    jiraDraft: {
      ...normalizedTicket.jiraDraft,
      project: projectKey
    }
  };
}

function getAttachmentRecordFileName(row: AttachmentRow): string {
  return (row.original_filename || row.file_name || "attachment").trim() || "attachment";
}

function getAttachmentRecordSizeBytes(row: AttachmentRow): number {
  const sizeBytes = row.size_bytes ?? row.byte_size ?? 0;

  return Number.isFinite(sizeBytes) && sizeBytes > 0 ? Number(sizeBytes) : 0;
}

function getAttachmentRecordS3Key(row: AttachmentRow): string {
  return (row.s3_key || row.object_key || "").trim();
}

function getAttachmentRecordBucketName(row: AttachmentRow): string {
  return (row.bucket_name || "").trim();
}

function getAttachmentRecordStorageProvider(row: AttachmentRow): "local" | "s3" {
  return row.storage_provider === "s3" ? "s3" : "local";
}

function mapAttachmentRow(row: AttachmentRow): Attachment {
  const fileName = getAttachmentRecordFileName(row);
  const sizeBytes = getAttachmentRecordSizeBytes(row);
  const storageProvider = getAttachmentRecordStorageProvider(row);
  const bucketName = getAttachmentRecordBucketName(row);
  const s3Key = getAttachmentRecordS3Key(row);

  return {
    id: row.id,
    ticketId: row.ticket_id,
    fileName,
    mimeType: row.mime_type,
    byteSize: sizeBytes,
    sizeLabel: sizeBytes > 1024 * 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(Math.round(sizeBytes / 1024), 1)} KB`,
    relation: (row.relation_type as Attachment["relation"]) || "ticket_information",
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    storageProvider,
    bucketName: bucketName || undefined,
    s3Key: s3Key || undefined,
    previewAvailable: Boolean(row.preview_available),
    downloadUrl: undefined
  };
}

function stripAttachmentBinaryData(attachment: Attachment): Attachment {
  return {
    ...attachment,
    contentDataUrl: undefined,
    downloadUrl: undefined
  };
}

function stripTicketAttachmentBinaryData(ticket: Ticket): Ticket {
  return {
    ...ticket,
    attachments: ticket.attachments.map((attachment) => stripAttachmentBinaryData(attachment))
  };
}

function buildAttachmentInsertSql(): string {
  return `
    INSERT INTO attachment_objects (
      id,
      ticket_id,
      original_filename,
      mime_type,
      size_bytes,
      checksum_sha256,
      uploaded_by,
      uploaded_at,
      storage_provider,
      bucket_name,
      s3_key,
      relation_type,
      relation_id,
      preview_available
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ticket_id = excluded.ticket_id,
      original_filename = excluded.original_filename,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      checksum_sha256 = excluded.checksum_sha256,
      uploaded_by = excluded.uploaded_by,
      uploaded_at = excluded.uploaded_at,
      storage_provider = excluded.storage_provider,
      bucket_name = excluded.bucket_name,
      s3_key = excluded.s3_key,
      relation_type = excluded.relation_type,
      relation_id = excluded.relation_id,
      preview_available = excluded.preview_available
  `;
}

async function getAttachmentRowsForTicket(ticketId: string): Promise<AttachmentRow[]> {
  return getDatabase()
    .prepare("SELECT * FROM attachment_objects WHERE ticket_id = ? ORDER BY uploaded_at ASC, id ASC")
    .all(ticketId) as AttachmentRow[];
}

async function getAttachmentRowById(attachmentId: string): Promise<AttachmentRow | undefined> {
  return getDatabase().prepare("SELECT * FROM attachment_objects WHERE id = ?").get(attachmentId) as
    | AttachmentRow
    | undefined;
}

function ensureAttachmentRowsTableColumns(db: DatabaseSync): void {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(attachment_objects)").all() as ColumnInfoRow[]).map((column) => column.name)
  );

  if (columns.size === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS attachment_objects (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        checksum_sha256 TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        storage_provider TEXT NOT NULL DEFAULT 's3',
        bucket_name TEXT NOT NULL,
        s3_key TEXT NOT NULL,
        relation_type TEXT NOT NULL DEFAULT 'ticket_information',
        relation_id TEXT,
        preview_available INTEGER NOT NULL DEFAULT 0
      )
    `);
    return;
  }

  const alterStatements = [
    !columns.has("original_filename") ? "ALTER TABLE attachment_objects ADD COLUMN original_filename TEXT" : "",
    !columns.has("size_bytes") ? "ALTER TABLE attachment_objects ADD COLUMN size_bytes INTEGER" : "",
    !columns.has("s3_key") ? "ALTER TABLE attachment_objects ADD COLUMN s3_key TEXT" : "",
    !columns.has("storage_provider") ? "ALTER TABLE attachment_objects ADD COLUMN storage_provider TEXT" : "",
    !columns.has("bucket_name") ? "ALTER TABLE attachment_objects ADD COLUMN bucket_name TEXT" : "",
    !columns.has("relation_type") ? "ALTER TABLE attachment_objects ADD COLUMN relation_type TEXT" : "",
    !columns.has("preview_available") ? "ALTER TABLE attachment_objects ADD COLUMN preview_available INTEGER" : ""
  ].filter(Boolean);

  for (const statement of alterStatements) {
    db.exec(statement);
  }

  if (columns.has("file_name")) {
    db.exec(
      "UPDATE attachment_objects SET original_filename = COALESCE(original_filename, file_name) WHERE original_filename IS NULL"
    );
  }

  if (columns.has("object_key")) {
    db.exec("UPDATE attachment_objects SET s3_key = COALESCE(s3_key, object_key) WHERE s3_key IS NULL");
  }

  if (columns.has("byte_size")) {
    db.exec("UPDATE attachment_objects SET size_bytes = COALESCE(size_bytes, byte_size) WHERE size_bytes IS NULL");
  }

  db.exec(
    "UPDATE attachment_objects SET storage_provider = COALESCE(storage_provider, 's3'), relation_type = COALESCE(relation_type, 'ticket_information'), preview_available = COALESCE(preview_available, 0)"
  );
}

async function syncAttachmentRowsForTicket(ticket: Ticket, db: DatabaseSync): Promise<void> {
  ensureAttachmentRowsTableColumns(db);

  const existingRows = (db
    .prepare("SELECT * FROM attachment_objects WHERE ticket_id = ?")
    .all(ticket.id) as AttachmentRow[]).map((row) => ({
    ...row,
    s3_key: getAttachmentRecordS3Key(row),
    bucket_name: getAttachmentRecordBucketName(row),
    original_filename: getAttachmentRecordFileName(row),
    size_bytes: getAttachmentRecordSizeBytes(row)
  }));
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const nextIds = new Set<string>();
  const insert = db.prepare(buildAttachmentInsertSql());

  for (const attachment of ticket.attachments) {
    const relationType = attachment.relation || "ticket_information";
    const existing = existingById.get(attachment.id);
    let storedRecord: StoredAttachmentRecord | null = null;
    let contentDataUrl = attachment.contentDataUrl?.trim() ?? "";

    if (contentDataUrl) {
      const decoded = parseAttachmentDataUrl(contentDataUrl);

      if (!decoded) {
        throw new Error(`Attachment ${attachment.fileName} has invalid content data.`);
      }

      storedRecord = await uploadAttachmentObject({
        ticketId: ticket.id,
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType || decoded.mimeType,
        content: decoded.content,
        uploadedBy: attachment.uploadedBy,
        uploadedAt: attachment.uploadedAt
      });
    } else if (attachment.storageProvider === "s3" && attachment.s3Key) {
      storedRecord = {
        id: attachment.id,
        ticketId: ticket.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.byteSize ?? existing?.size_bytes ?? 0,
        checksumSha256: attachment.checksumSha256 || existing?.checksum_sha256 || "",
        uploadedBy: attachment.uploadedBy || existing?.uploaded_by || "",
        uploadedAt: attachment.uploadedAt || existing?.uploaded_at || nowIso(),
        storageProvider: "s3",
        bucketName: attachment.bucketName || existing?.bucket_name || "",
        s3Key: attachment.s3Key,
        previewAvailable: attachment.previewAvailable
      };
    } else if (existing) {
      storedRecord = {
        id: existing.id,
        ticketId: existing.ticket_id,
        fileName: getAttachmentRecordFileName(existing),
        mimeType: existing.mime_type,
        sizeBytes: getAttachmentRecordSizeBytes(existing),
        checksumSha256: existing.checksum_sha256,
        uploadedBy: existing.uploaded_by,
        uploadedAt: existing.uploaded_at,
        storageProvider: "s3",
        bucketName: getAttachmentRecordBucketName(existing),
        s3Key: getAttachmentRecordS3Key(existing),
        previewAvailable: Boolean(existing.preview_available)
      };
    } else {
      throw new Error(`Attachment ${attachment.fileName} is missing stored content.`);
    }

    nextIds.add(storedRecord.id);

    insert.run(
      storedRecord.id,
      ticket.id,
      storedRecord.fileName,
      storedRecord.mimeType,
      storedRecord.sizeBytes,
      storedRecord.checksumSha256,
      storedRecord.uploadedBy,
      storedRecord.uploadedAt,
      storedRecord.storageProvider,
      storedRecord.bucketName,
      storedRecord.s3Key,
      relationType,
      null,
      storedRecord.previewAvailable ? 1 : 0
    );
  }

  for (const row of existingRows) {
    if (nextIds.has(row.id)) {
      continue;
    }

    const s3Key = getAttachmentRecordS3Key(row);

    if (s3Key) {
      await deleteAttachmentObject(s3Key);
    }

    db.prepare("DELETE FROM attachment_objects WHERE id = ?").run(row.id);
  }
}

async function hydrateTicketAttachmentDownloads(ticket: Ticket): Promise<Ticket> {
  const attachments = await Promise.all(
    ticket.attachments.map(async (attachment) => {
      if (attachment.contentDataUrl?.trim()) {
        return attachment;
      }

      if (!attachment.s3Key || attachment.storageProvider !== "s3") {
        return attachment;
      }

      return {
        ...attachment,
        downloadUrl: `/api/attachments/${attachment.id}`,
        contentDataUrl: undefined
      };
    })
  );

  return {
    ...ticket,
    attachments
  };
}

function getDatabasePath(): string {
  const configuredPath = process.env.NEXUS_LOCAL_DB_PATH?.trim();

  return configuredPath ? path.resolve(configuredPath) : defaultDatabasePath;
}

function nowIso(): string {
  return new Date().toISOString();
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error("Failed to parse local database JSON document.", {
      label,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeDatabaseValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Buffer.isBuffer(value)) {
    return `[binary ${value.byteLength} bytes]`;
  }

  return value;
}

function normalizeDatabaseRow(row: unknown): Record<string, unknown> {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return {};
  }

  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeDatabaseValue(value)]));
}

function assertReadOnlySql(sql: string): string {
  const trimmedSql = sql.trim();

  if (!trimmedSql) {
    throw new Error("SQL query is required.");
  }

  if (trimmedSql.length > 4000) {
    throw new Error("SQL query is too long. Keep local admin queries under 4000 characters.");
  }

  const normalizedSql = trimmedSql.replace(/;+$/g, "").trim();

  if (normalizedSql.includes(";")) {
    throw new Error("Only one SQL statement is allowed.");
  }

  if (!/^(select|with|pragma)\b/i.test(normalizedSql)) {
    throw new Error("Only read-only SELECT, WITH, and safe PRAGMA queries are allowed.");
  }

  const forbiddenPattern =
    /\b(insert|update|delete|replace|drop|alter|create|attach|detach|vacuum|reindex|analyze|truncate)\b|load_extension|writable_schema/i;

  if (forbiddenPattern.test(normalizedSql)) {
    throw new Error(
      "Write, schema, attachment, and extension operations are not allowed from the admin query console."
    );
  }

  if (/^pragma\b/i.test(normalizedSql)) {
    const safePragmaPattern =
      /^pragma\s+(table_info|table_xinfo|index_list|foreign_key_list)\s*\(\s*["'`]?[\w-]+["'`]?\s*\)$|^pragma\s+(table_list|database_list)\s*$/i;

    if (!safePragmaPattern.test(normalizedSql)) {
      throw new Error(
        "Only table_info, table_xinfo, index_list, foreign_key_list, table_list, and database_list PRAGMA queries are allowed."
      );
    }
  }

  return normalizedSql;
}

function isEmptyShellConfig(config: AdminConfig): boolean {
  const users = Array.isArray(config.users) ? config.users : [];
  const products = Array.isArray(config.products) ? config.products : [];

  return users.length === 0 && products.length === 0;
}

function backfillEmptyConfigArrays(config: AdminConfig): AdminConfig {
  const pickArray = <T>(value: T[] | undefined, fallback: T[]): T[] =>
    Array.isArray(value) && value.length > 0 ? value : fallback;

  return {
    ...config,
    users: pickArray(config.users, adminConfig.users),
    customRoles: pickArray(config.customRoles, adminConfig.customRoles ?? []),
    roleDomains: pickArray(config.roleDomains, adminConfig.roleDomains),
    regionSites: pickArray(config.regionSites, adminConfig.regionSites),
    departments: pickArray(config.departments, adminConfig.departments),
    productDomains: pickArray(config.productDomains, adminConfig.productDomains),
    products: pickArray(config.products, adminConfig.products),
    responsibilityMappings: pickArray(config.responsibilityMappings, adminConfig.responsibilityMappings),
    requestTypes: pickArray(config.requestTypes, adminConfig.requestTypes),
    priorities: pickArray(config.priorities, adminConfig.priorities),
    riskOptions: pickArray(config.riskOptions, adminConfig.riskOptions),
    requestCategories: pickArray(config.requestCategories, adminConfig.requestCategories),
    slaRules: pickArray(config.slaRules, adminConfig.slaRules),
    escalationPolicies: pickArray(config.escalationPolicies, adminConfig.escalationPolicies),
    notificationTemplates: pickArray(config.notificationTemplates, adminConfig.notificationTemplates),
    formTemplates: pickArray(config.formTemplates, adminConfig.formTemplates),
    ticketTypeWorkflows: pickArray(config.ticketTypeWorkflows, adminConfig.ticketTypeWorkflows)
  };
}

function normalizeStoredAdminConfig(config: AdminConfig): AdminConfig {
  const sourceConfig = isEmptyShellConfig(config) ? adminConfig : backfillEmptyConfigArrays(config);
  const roleDomains = Array.isArray(sourceConfig.roleDomains)
    ? sourceConfig.roleDomains.map((roleDomain) => ({
        ...roleDomain,
        active: roleDomain.active ?? true
      }))
    : [];
  const rawPriorities = Array.isArray(sourceConfig.priorities) ? sourceConfig.priorities : [];
  const shouldMigrateLegacyPriorities = isLegacyDefaultPriorityConfig(rawPriorities);
  const priorities =
    rawPriorities.length === 0 || shouldMigrateLegacyPriorities ? getJiraPriorityOptions() : rawPriorities;

  return {
    ...emptyAdminConfig,
    ...sourceConfig,
    users: Array.isArray(sourceConfig.users)
      ? sourceConfig.users.map((user) => normalizeAdminUser(user))
      : [],
    customRoles: Array.isArray(sourceConfig.customRoles) ? sourceConfig.customRoles : [],
    roleDomains,
    deletedRoleKeys: Array.isArray(sourceConfig.deletedRoleKeys) ? sourceConfig.deletedRoleKeys : [],
    regionSites: Array.isArray(sourceConfig.regionSites) ? sourceConfig.regionSites : [],
    departments: Array.isArray(sourceConfig.departments) ? sourceConfig.departments : adminConfig.departments,
    productDomains: Array.isArray(sourceConfig.productDomains)
      ? sourceConfig.productDomains
      : adminConfig.productDomains,
    products: Array.isArray(sourceConfig.products)
      ? sourceConfig.products.map((product) => normalizeProductConfig(product))
      : [],
    responsibilityMappings: Array.isArray(sourceConfig.responsibilityMappings)
      ? sourceConfig.responsibilityMappings
      : [],
    requestTypes: Array.isArray(sourceConfig.requestTypes) ? sourceConfig.requestTypes : [],
    priorities,
    riskOptions: Array.isArray(sourceConfig.riskOptions) ? sourceConfig.riskOptions : [],
    statusColors: mergeDefaultStatusColors(
      Array.isArray(sourceConfig.statusColors) ? sourceConfig.statusColors : []
    ),
    requestCategories: Array.isArray(sourceConfig.requestCategories) ? sourceConfig.requestCategories : [],
    slaRules: shouldMigrateLegacyPriorities
      ? migrateLegacyPriorityReferences(Array.isArray(sourceConfig.slaRules) ? sourceConfig.slaRules : [])
      : Array.isArray(sourceConfig.slaRules)
        ? sourceConfig.slaRules
        : [],
    escalationPolicies: shouldMigrateLegacyPriorities
      ? migrateLegacyPriorityReferences(
          Array.isArray(sourceConfig.escalationPolicies) ? sourceConfig.escalationPolicies : []
        )
      : Array.isArray(sourceConfig.escalationPolicies)
        ? sourceConfig.escalationPolicies
        : [],
    leadTimeStatusRules: normalizeLeadTimeStatusRules(sourceConfig.leadTimeStatusRules),
    leadTimeTransitionRules: normalizeLeadTimeTransitionRules(sourceConfig.leadTimeTransitionRules),
    notificationTemplates: Array.isArray(sourceConfig.notificationTemplates)
      ? sourceConfig.notificationTemplates
      : [],
    formTemplates: Array.isArray(sourceConfig.formTemplates) ? sourceConfig.formTemplates : [],
    ticketTypeWorkflows: Array.isArray(sourceConfig.ticketTypeWorkflows)
      ? sourceConfig.ticketTypeWorkflows.map((workflow) => normalizeStoredTicketTypeWorkflow(workflow))
      : [],
    integrations: {
      jira: normalizeStoredJiraIntegration(sourceConfig.integrations?.jira),
      smtp: {
        ...smtpConfig,
        ...(sourceConfig.integrations?.smtp ?? {})
      },
      ai: {
        ...aiIntegration,
        ...(sourceConfig.integrations?.ai ?? {})
      },
      gitlab: normalizeStoredGitLabIntegration(sourceConfig.integrations?.gitlab)
    }
  };
}

function migrate(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      key TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      type_id TEXT NOT NULL,
      state TEXT NOT NULL,
      product TEXT NOT NULL,
      module_name TEXT NOT NULL,
      site TEXT NOT NULL,
      priority TEXT NOT NULL,
      risk TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachment_objects (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 's3',
      bucket_name TEXT NOT NULL,
      s3_key TEXT NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'ticket_information',
      relation_id TEXT,
      preview_available INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      idempotency_key TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
      recipient_count INTEGER NOT NULL,
      message_id TEXT,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      response TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_tickets_state ON tickets(state);
    CREATE INDEX IF NOT EXISTS idx_local_tickets_priority ON tickets(priority);
    CREATE INDEX IF NOT EXISTS idx_local_tickets_product ON tickets(product);
    CREATE INDEX IF NOT EXISTS idx_local_tickets_updated_at ON tickets(updated_at);
    CREATE INDEX IF NOT EXISTS idx_attachment_objects_ticket ON attachment_objects(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_attachment_objects_relation ON attachment_objects(relation_type, relation_id);
    CREATE INDEX IF NOT EXISTS idx_attachment_objects_storage ON attachment_objects(storage_provider, bucket_name);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_updated_at ON notification_deliveries(updated_at);

    CREATE TABLE IF NOT EXISTS outbox_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_error TEXT,
      available_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_jobs_status_available
      ON outbox_jobs(status, available_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_jobs_type ON outbox_jobs(type);
  `);

  ensureAttachmentRowsTableColumns(db);
}

function insertDemoTickets(db: DatabaseSync, tickets: Ticket[]) {
  const insert = db.prepare(
    `
      INSERT INTO tickets (
        key,
        id,
        title,
        type_id,
        state,
        product,
        module_name,
        site,
        priority,
        risk,
        updated_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  for (const ticket of tickets) {
    insert.run(
      ticket.key,
      ticket.id,
      ticket.title,
      ticket.typeId,
      ticket.state,
      ticket.product,
      ticket.module,
      ticket.site,
      ticket.priority,
      ticket.risk,
      ticket.updatedAt,
      serializeJson(ticket)
    );
  }
}

function seedDefaults(db: DatabaseSync) {
  const existingConfig = db.prepare("SELECT payload FROM app_config WHERE key = ?").get(adminConfigKey) as
    ConfigRow | undefined;

  if (!existingConfig) {
    db.prepare("INSERT INTO app_config (key, payload, updated_at) VALUES (?, ?, ?)").run(
      adminConfigKey,
      serializeJson(adminConfig),
      nowIso()
    );
  } else {
    const storedConfig = parseJson<AdminConfig>(existingConfig.payload, "admin-config-seed");

    if (isEmptyShellConfig(storedConfig)) {
      db.prepare("UPDATE app_config SET payload = ?, updated_at = ? WHERE key = ?").run(
        serializeJson(normalizeStoredAdminConfig(adminConfig)),
        nowIso(),
        adminConfigKey
      );
    }
  }

  const ticketCount =
    (db.prepare("SELECT COUNT(*) AS count FROM tickets").get() as CountRow | undefined)?.count ?? 0;

  if (ticketCount === 0) {
    insertDemoTickets(db, buildDemoTickets());
    return;
  }

  // Re-align seeded demo tickets when product catalog changed (e.g. Calibration Hub → IIoT).
  const configRow = db.prepare("SELECT payload FROM app_config WHERE key = ?").get(adminConfigKey) as
    ConfigRow | undefined;
  const liveConfig = configRow
    ? parseJson<AdminConfig>(configRow.payload, "admin-config-ticket-align")
    : adminConfig;
  const knownProducts = new Set(
    (liveConfig.products ?? []).map((product) => product.productName.trim().toLowerCase()).filter(Boolean)
  );

  if (knownProducts.size === 0) {
    return;
  }

  const ticketRows = db.prepare("SELECT payload FROM tickets").all() as TicketRow[];
  const tickets = ticketRows.map((row) =>
    normalizeStoredTicket(parseJson<Ticket>(row.payload, "ticket-align"))
  );
  const hasUnknownProduct = tickets.some(
    (ticket) =>
      !knownProducts.has(
        String(ticket.product ?? "")
          .trim()
          .toLowerCase()
      )
  );
  const looksLikeDemoSeed =
    tickets.length > 0 && tickets.every((ticket) => String(ticket.id ?? "").startsWith("ticket-demo-"));

  if (hasUnknownProduct && looksLikeDemoSeed) {
    db.prepare("DELETE FROM tickets").run();
    insertDemoTickets(db, buildDemoTickets());
  }
}

function getDatabase(): DatabaseSync {
  if (database) {
    return database;
  }

  const databasePath = getDatabasePath();
  const directory = path.dirname(databasePath);

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  database = new DatabaseSync(databasePath);
  migrate(database);
  seedDefaults(database);

  return database;
}

export function getLocalDatabasePath(): string {
  return getDatabasePath();
}

export function listDatabaseTables(): DatabaseTableSummary[] {
  const db = getDatabase();
  const tables = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `
    )
    .all() as SqliteTableRow[];

  return tables.map((table) => {
    const tableName = table.name;
    const quotedTableName = quoteIdentifier(tableName);
    const rowCount =
      (db.prepare(`SELECT COUNT(*) AS count FROM ${quotedTableName}`).get() as CountRow | undefined)?.count ??
      0;
    const columns = (db.prepare(`PRAGMA table_info(${quotedTableName})`).all() as ColumnInfoRow[]).map(
      (column) => ({
        name: column.name,
        type: column.type || "ANY",
        nullable: column.notnull === 0,
        primaryKey: column.pk > 0,
        defaultValue: normalizeDatabaseValue(column.dflt_value)
      })
    );
    const previewRows = db
      .prepare(`SELECT * FROM ${quotedTableName} LIMIT 5`)
      .all()
      .map(normalizeDatabaseRow);

    return {
      name: tableName,
      rowCount,
      columns,
      previewRows
    };
  });
}

export function runReadOnlyDatabaseQuery(sql: string, maxRows = 200): DatabaseQueryResult {
  const db = getDatabase();
  const normalizedSql = assertReadOnlySql(sql);
  const startedAt = performance.now();
  const rows = db.prepare(normalizedSql).all().slice(0, maxRows).map(normalizeDatabaseRow);
  const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const columns = rows[0] ? Object.keys(rows[0]) : [];

  return {
    columns,
    rows,
    rowCount: rows.length,
    elapsedMs,
    statementType: normalizedSql.split(/\s+/, 1)[0].toUpperCase()
  };
}

export function clearLocalTicketsForDevelopment(
  options: { allowProduction?: boolean } = {}
): DatabaseTableSummary[] {
  if (process.env.NODE_ENV === "production" && !options.allowProduction) {
    throw new Error("Local ticket cleanup is disabled in production.");
  }

  const db = getDatabase();

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM tickets").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return listDatabaseTables();
}

export function readAdminConfig(): AdminConfig {
  const row = getDatabase().prepare("SELECT payload FROM app_config WHERE key = ?").get(adminConfigKey) as
    ConfigRow | undefined;

  if (!row) {
    saveAdminConfig(adminConfig);
    return normalizeStoredAdminConfig(adminConfig);
  }

  return normalizeStoredAdminConfig(parseJson<AdminConfig>(row.payload, "admin-config"));
}

export function saveAdminConfig(config: AdminConfig): void {
  getDatabase()
    .prepare(
      `
        INSERT INTO app_config (key, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `
    )
    .run(adminConfigKey, serializeJson(config), nowIso());
}

function mapDuplicateNotificationDelivery(row: NotificationDeliveryRow): NotificationDeliveryClaim {
  return {
    status: "duplicate",
    deliveryStatus: row.status === "sent" ? "sent" : "pending",
    idempotencyKey: row.idempotency_key,
    messageId: row.message_id,
    acceptedCount: row.accepted_count ?? 0,
    rejectedCount: row.rejected_count ?? 0,
    response: row.response,
    updatedAt: row.updated_at
  };
}

export function claimNotificationDelivery(
  idempotencyKey: string,
  recipientCount: number
): NotificationDeliveryClaim {
  const db = getDatabase();
  const timestamp = nowIso();
  const insertResult = db
    .prepare(
      `
        INSERT OR IGNORE INTO notification_deliveries (
          idempotency_key,
          status,
          recipient_count,
          created_at,
          updated_at
        )
        VALUES (?, 'pending', ?, ?, ?)
      `
    )
    .run(idempotencyKey, recipientCount, timestamp, timestamp);

  if (Number(insertResult.changes) === 1) {
    return {
      status: "claimed",
      attempt: "new",
      idempotencyKey
    };
  }

  const existingDelivery = db
    .prepare("SELECT * FROM notification_deliveries WHERE idempotency_key = ?")
    .get(idempotencyKey) as NotificationDeliveryRow | undefined;

  if (!existingDelivery) {
    throw new Error("Notification delivery claim could not be read after insert conflict.");
  }

  if (existingDelivery.status === "failed") {
    const retryResult = db
      .prepare(
        `
          UPDATE notification_deliveries
          SET
            status = 'pending',
            recipient_count = ?,
            message_id = NULL,
            accepted_count = 0,
            rejected_count = 0,
            response = NULL,
            error = NULL,
            updated_at = ?
          WHERE idempotency_key = ?
            AND status = 'failed'
        `
      )
      .run(recipientCount, timestamp, idempotencyKey);

    if (Number(retryResult.changes) === 1) {
      return {
        status: "claimed",
        attempt: "retry",
        idempotencyKey
      };
    }
  }

  const currentDelivery = db
    .prepare("SELECT * FROM notification_deliveries WHERE idempotency_key = ?")
    .get(idempotencyKey) as NotificationDeliveryRow | undefined;

  return mapDuplicateNotificationDelivery(currentDelivery ?? existingDelivery);
}

export function markNotificationDeliverySent(
  idempotencyKey: string,
  result: {
    messageId?: string | false;
    acceptedCount: number;
    rejectedCount: number;
    response?: string | false;
  }
): void {
  getDatabase()
    .prepare(
      `
        UPDATE notification_deliveries
        SET
          status = 'sent',
          message_id = ?,
          accepted_count = ?,
          rejected_count = ?,
          response = ?,
          error = NULL,
          updated_at = ?
        WHERE idempotency_key = ?
      `
    )
    .run(
      result.messageId || null,
      result.acceptedCount,
      result.rejectedCount,
      result.response || null,
      nowIso(),
      idempotencyKey
    );
}

export function markNotificationDeliveryFailed(idempotencyKey: string, errorMessage: string): void {
  getDatabase()
    .prepare(
      `
        UPDATE notification_deliveries
        SET
          status = 'failed',
          error = ?,
          updated_at = ?
        WHERE idempotency_key = ?
      `
    )
    .run(errorMessage, nowIso(), idempotencyKey);
}

export async function listTickets(): Promise<Ticket[]> {
  const rows = getDatabase()
    .prepare("SELECT payload FROM tickets ORDER BY updated_at DESC, key DESC")
    .all() as TicketRow[];

  const tickets = rows.map((row) => normalizeStoredTicket(parseJson<Ticket>(row.payload, "ticket")));

  return Promise.all(tickets.map((ticket) => hydrateTicketAttachmentDownloads(ticket)));
}

export async function getTicketByKeyFromDatabase(ticketKey: string): Promise<Ticket | undefined> {
  const row = getDatabase().prepare("SELECT payload FROM tickets WHERE key = ?").get(ticketKey) as
    TicketRow | undefined;

  if (!row) {
    return undefined;
  }

  return hydrateTicketAttachmentDownloads(
    normalizeStoredTicket(parseJson<Ticket>(row.payload, `ticket-${ticketKey}`))
  );
}

export async function saveTicket(ticket: Ticket): Promise<void> {
  const db = getDatabase();
  const storedTicket = stripTicketAttachmentBinaryData(ticket);

  await syncAttachmentRowsForTicket(storedTicket, db);

  db.prepare(
    `
      INSERT INTO tickets (
        key,
        id,
        title,
        type_id,
        state,
        product,
        module_name,
        site,
        priority,
        risk,
        updated_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        id = excluded.id,
        title = excluded.title,
        type_id = excluded.type_id,
        state = excluded.state,
        product = excluded.product,
        module_name = excluded.module_name,
        site = excluded.site,
        priority = excluded.priority,
        risk = excluded.risk,
        updated_at = excluded.updated_at,
        payload = excluded.payload
    `
  ).run(
    storedTicket.key,
    storedTicket.id,
    storedTicket.title,
    storedTicket.typeId,
    storedTicket.state,
    storedTicket.product,
    storedTicket.module,
    storedTicket.site,
    storedTicket.priority,
    storedTicket.risk,
    storedTicket.updatedAt,
    serializeJson(storedTicket)
  );
}

export async function replaceTickets(tickets: Ticket[]): Promise<void> {
  const db = getDatabase();
  const attachmentRows = (db.prepare("SELECT * FROM attachment_objects").all() as AttachmentRow[]).map((row) => ({
    ...row,
    s3_key: getAttachmentRecordS3Key(row)
  }));

  db.exec("BEGIN IMMEDIATE");

  try {
    for (const row of attachmentRows) {
      if (row.s3_key) {
        await deleteAttachmentObject(row.s3_key);
      }
    }

    db.prepare("DELETE FROM tickets").run();
    db.prepare("DELETE FROM attachment_objects").run();

    for (const ticket of tickets) {
      await saveTicket(ticket);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

type OutboxJobRow = {
  id: string;
  type: OutboxJob["type"];
  status: OutboxJobStatus;
  payload: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  available_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function mapOutboxJob(row: OutboxJobRow): OutboxJob {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    availableAt: row.available_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export function enqueueOutboxJob(input: OutboxEnqueueInput): OutboxJob {
  const now = nowIso();
  const job: OutboxJob = {
    id: createOutboxJobId(input.type),
    type: input.type,
    status: "pending",
    payload: serializeJson(input.payload),
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 5,
    lastError: null,
    availableAt: input.availableAt ?? now,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };

  getDatabase()
    .prepare(
      `
        INSERT INTO outbox_jobs (
          id, type, status, payload, attempts, max_attempts, last_error,
          available_at, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      job.id,
      job.type,
      job.status,
      job.payload,
      job.attempts,
      job.maxAttempts,
      job.lastError,
      job.availableAt,
      job.createdAt,
      job.updatedAt,
      job.completedAt
    );

  return job;
}

export function claimOutboxJobs(limit = 10): OutboxJob[] {
  const db = getDatabase();
  const now = nowIso();
  const rows = db
    .prepare(
      `
        SELECT * FROM outbox_jobs
        WHERE status = 'pending' AND available_at <= ?
        ORDER BY available_at ASC
        LIMIT ?
      `
    )
    .all(now, limit) as OutboxJobRow[];

  const claimed: OutboxJob[] = [];

  for (const row of rows) {
    const result = db
      .prepare(
        `
          UPDATE outbox_jobs
          SET status = 'processing', attempts = attempts + 1, updated_at = ?
          WHERE id = ? AND status = 'pending'
        `
      )
      .run(now, row.id);

    if (result.changes > 0) {
      claimed.push(
        mapOutboxJob({
          ...row,
          status: "processing",
          attempts: row.attempts + 1,
          updated_at: now
        })
      );
    }
  }

  return claimed;
}

export function completeOutboxJob(jobId: string): void {
  const now = nowIso();
  getDatabase()
    .prepare(
      `
        UPDATE outbox_jobs
        SET status = 'completed', completed_at = ?, updated_at = ?, last_error = NULL
        WHERE id = ?
      `
    )
    .run(now, now, jobId);
}

export function failOutboxJob(jobId: string, errorMessage: string, retryDelaySeconds = 60): void {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM outbox_jobs WHERE id = ?").get(jobId) as OutboxJobRow | undefined;

  if (!row) {
    return;
  }

  const now = new Date();
  const nextStatus: OutboxJobStatus = row.attempts >= row.max_attempts ? "dead" : "pending";
  const availableAt =
    nextStatus === "pending"
      ? new Date(now.getTime() + retryDelaySeconds * 1000).toISOString()
      : row.available_at;

  db.prepare(
    `
      UPDATE outbox_jobs
      SET status = ?, last_error = ?, available_at = ?, updated_at = ?,
          completed_at = CASE WHEN ? = 'dead' THEN ? ELSE completed_at END
      WHERE id = ?
    `
  ).run(
    nextStatus,
    errorMessage.slice(0, 2000),
    availableAt,
    now.toISOString(),
    nextStatus,
    now.toISOString(),
    jobId
  );
}

export function listOutboxJobs(limit = 50): OutboxJob[] {
  const rows = getDatabase()
    .prepare(
      `
        SELECT * FROM outbox_jobs
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(limit) as OutboxJobRow[];

  return rows.map(mapOutboxJob);
}
