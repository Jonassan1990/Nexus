import { performance } from "node:perf_hooks";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import {
  clearLocalTicketsForDevelopment as clearLocalTicketsForDevelopmentSqlite,
  getLocalDatabasePath as getLocalDatabasePathSqlite,
  claimNotificationDelivery as claimNotificationDeliverySqlite,
  claimOutboxJobs as claimOutboxJobsSqlite,
  completeOutboxJob as completeOutboxJobSqlite,
  enqueueOutboxJob as enqueueOutboxJobSqlite,
  failOutboxJob as failOutboxJobSqlite,
  getTicketByKeyFromDatabase as getTicketByKeyFromDatabaseSqlite,
  listDatabaseTables as listDatabaseTablesSqlite,
  listOutboxJobs as listOutboxJobsSqlite,
  listTickets as listTicketsSqlite,
  markNotificationDeliveryFailed as markNotificationDeliveryFailedSqlite,
  markNotificationDeliverySent as markNotificationDeliverySentSqlite,
  readAdminConfig as readAdminConfigSqlite,
  replaceTickets as replaceTicketsSqlite,
  runReadOnlyDatabaseQuery as runReadOnlyDatabaseQuerySqlite,
  saveAdminConfig as saveAdminConfigSqlite,
  saveTicket as saveTicketSqlite
} from "@/lib/local-database";
import { adminConfig } from "@/lib/admin-config";
import { buildDemoTickets } from "@/lib/demo-tickets";
import { createOutboxJobId, type OutboxEnqueueInput, type OutboxJob, type OutboxJobStatus } from "@/lib/outbox";
import { getAuroraConnectionConfig, hasAuroraConnectionConfig } from "@/lib/platform-secrets";
import { normalizeAdminConfigForScaniaSes } from "@/lib/scania-ses";
import {
  deleteAttachmentObject,
  parseAttachmentDataUrl,
  uploadAttachmentObject,
  type StoredAttachmentRecord
} from "@/lib/attachment-storage";
import type { AdminConfig } from "@/lib/admin-config";
import type { DatabaseQueryResult, DatabaseTableSummary, NotificationDeliveryClaim } from "@/lib/local-database";
import type { Ticket } from "@/lib/types";
import type { Attachment } from "@/lib/types";

type NotificationDeliveryRow = {
  idempotency_key: string;
  status: "pending" | "sent" | "failed";
  recipient_count: number;
  message_id: string | null;
  accepted_count: number | null;
  rejected_count: number | null;
  response: string | null;
  error: string | null;
  updated_at: string;
};

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

type CountRow = {
  count: number | string;
};

type AttachmentRow = {
  id: string;
  ticket_id: string;
  original_filename?: string;
  file_name?: string;
  mime_type: string;
  size_bytes?: number | string;
  byte_size?: number | string;
  checksum_sha256: string;
  uploaded_by: string;
  uploaded_at: string;
  storage_provider?: "s3" | "local";
  bucket_name?: string | null;
  s3_key?: string | null;
  object_key?: string | null;
  relation_type?: string;
  relation_id?: string | null;
  preview_available?: boolean | number | string;
};

const adminConfigKey = "admin";
const databaseKind = detectDatabaseKind();
let auroraPool: Pool | null = null;
let auroraReady: Promise<void> | null = null;

function isLocalAppUrl(value?: string): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsedUrl = new URL(value);
    return (
      parsedUrl.hostname === "localhost" ||
      parsedUrl.hostname === "127.0.0.1" ||
      parsedUrl.hostname === "::1"
    );
  } catch {
    return false;
  }
}

function detectDatabaseKind(): "sqlite" | "aurora" {
  if (process.env.DATABASE_URL?.trim()) {
    return "aurora";
  }

  if (hasAuroraConnectionConfig()) {
    return "aurora";
  }

  const appUrl = process.env.NEXT_PUBLIC_NEXUS_APP_URL?.trim() || process.env.NEXUS_APP_URL?.trim() || "";

  if (appUrl && !isLocalAppUrl(appUrl)) {
    return "aurora";
  }

  return "sqlite";
}

function isAurora(): boolean {
  return databaseKind === "aurora";
}

function nowIso(): string {
  return new Date().toISOString();
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
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

function normalizeDatabaseRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeDatabaseValue(value)]));
}

function normalizeDatabaseQueryRows<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
  return rows.map((row) => normalizeDatabaseRow(row));
}

function getAttachmentRecordFileName(row: AttachmentRow): string {
  return (row.original_filename || row.file_name || "attachment").trim() || "attachment";
}

function getAttachmentRecordSizeBytes(row: AttachmentRow): number {
  const value = row.size_bytes ?? row.byte_size ?? 0;
  const sizeBytes = typeof value === "string" ? Number(value) : value;

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

function isTruthyRowValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
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
    sizeLabel: sizeBytes >= 1024 * 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(Math.round(sizeBytes / 1024), 1)} KB`,
    relation: (row.relation_type as Attachment["relation"]) || "ticket_information",
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    storageProvider,
    bucketName: bucketName || undefined,
    s3Key: s3Key || undefined,
    previewAvailable: isTruthyRowValue(row.preview_available),
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (id) DO UPDATE SET
      ticket_id = EXCLUDED.ticket_id,
      original_filename = EXCLUDED.original_filename,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      checksum_sha256 = EXCLUDED.checksum_sha256,
      uploaded_by = EXCLUDED.uploaded_by,
      uploaded_at = EXCLUDED.uploaded_at,
      storage_provider = EXCLUDED.storage_provider,
      bucket_name = EXCLUDED.bucket_name,
      s3_key = EXCLUDED.s3_key,
      relation_type = EXCLUDED.relation_type,
      relation_id = EXCLUDED.relation_id,
      preview_available = EXCLUDED.preview_available
  `;
}

function normalizeStoredTicketAttachments(ticket: Ticket): Ticket {
  return {
    ...ticket,
    attachments: ticket.attachments.map((attachment) => stripAttachmentBinaryData(attachment))
  };
}

async function ensureAuroraAttachmentSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS attachment_objects (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      original_filename TEXT,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      checksum_sha256 TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT NOT NULL DEFAULT '',
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      storage_provider TEXT NOT NULL DEFAULT 's3',
      bucket_name TEXT,
      s3_key TEXT,
      relation_type TEXT NOT NULL DEFAULT 'ticket_information',
      relation_id TEXT,
      preview_available BOOLEAN NOT NULL DEFAULT false
    );
  `);

  const existingColumns = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'attachment_objects'
    `
  );
  const columnNames = new Set(existingColumns.rows.map((row) => row.column_name));
  const alterStatements = [
    columnNames.has("id") ? "ALTER TABLE attachment_objects ALTER COLUMN id TYPE TEXT USING id::text" : "",
    columnNames.has("ticket_id")
      ? "ALTER TABLE attachment_objects ALTER COLUMN ticket_id TYPE TEXT USING ticket_id::text"
      : "",
    columnNames.has("relation_id")
      ? "ALTER TABLE attachment_objects ALTER COLUMN relation_id TYPE TEXT USING relation_id::text"
      : "",
    !columnNames.has("original_filename")
      ? "ALTER TABLE attachment_objects ADD COLUMN original_filename TEXT"
      : "",
    !columnNames.has("size_bytes") ? "ALTER TABLE attachment_objects ADD COLUMN size_bytes BIGINT" : "",
    !columnNames.has("s3_key") ? "ALTER TABLE attachment_objects ADD COLUMN s3_key TEXT" : "",
    !columnNames.has("storage_provider")
      ? "ALTER TABLE attachment_objects ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 's3'"
      : "",
    !columnNames.has("bucket_name") ? "ALTER TABLE attachment_objects ADD COLUMN bucket_name TEXT" : "",
    !columnNames.has("relation_type")
      ? "ALTER TABLE attachment_objects ADD COLUMN relation_type TEXT NOT NULL DEFAULT 'ticket_information'"
      : "",
    !columnNames.has("preview_available")
      ? "ALTER TABLE attachment_objects ADD COLUMN preview_available BOOLEAN NOT NULL DEFAULT false"
      : ""
  ].filter(Boolean);

  for (const statement of alterStatements) {
    await client.query(statement);
  }

  await client.query(
    "UPDATE attachment_objects SET original_filename = COALESCE(original_filename, file_name) WHERE original_filename IS NULL"
  ).catch(() => undefined);
  await client.query("UPDATE attachment_objects SET s3_key = COALESCE(s3_key, object_key) WHERE s3_key IS NULL").catch(() => undefined);
  await client.query("UPDATE attachment_objects SET size_bytes = COALESCE(size_bytes, byte_size) WHERE size_bytes IS NULL").catch(() => undefined);
  await client.query(
    "UPDATE attachment_objects SET storage_provider = COALESCE(storage_provider, 's3'), relation_type = COALESCE(relation_type, 'ticket_information'), preview_available = COALESCE(preview_available, false)"
  ).catch(() => undefined);
}

async function listAuroraAttachmentRows(ticketId: string): Promise<AttachmentRow[]> {
  return queryAurora<AttachmentRow>("SELECT * FROM attachment_objects WHERE ticket_id = $1 ORDER BY uploaded_at ASC, id ASC", [
    ticketId
  ]);
}

async function getAuroraAttachmentRowById(attachmentId: string): Promise<AttachmentRow | undefined> {
  const rows = await queryAurora<AttachmentRow>("SELECT * FROM attachment_objects WHERE id = $1", [attachmentId]);

  return rows[0];
}

async function syncAuroraAttachmentRows(ticket: Ticket, client: PoolClient): Promise<string[]> {
  const existingRowsResult = await client.query<AttachmentRow>(
    "SELECT * FROM attachment_objects WHERE ticket_id = $1 ORDER BY uploaded_at ASC, id ASC",
    [ticket.id]
  );
  const existingRows = existingRowsResult.rows;
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const nextIds = new Set<string>();
  const removedS3Keys: string[] = [];

  for (const attachment of ticket.attachments) {
    const relationType = attachment.relation || "ticket_information";
    const existing = existingById.get(attachment.id);
    let storedRecord: StoredAttachmentRecord | null = null;

    if (attachment.contentDataUrl?.trim()) {
      const decoded = parseAttachmentDataUrl(attachment.contentDataUrl!.trim());

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
        sizeBytes: attachment.byteSize ?? (existing ? getAttachmentRecordSizeBytes(existing) : 0),
        checksumSha256: attachment.checksumSha256 || (existing?.checksum_sha256 ?? ""),
        uploadedBy: attachment.uploadedBy || (existing?.uploaded_by ?? ""),
        uploadedAt: attachment.uploadedAt || (existing?.uploaded_at ?? nowIso()),
        storageProvider: "s3",
        bucketName: attachment.bucketName || (existing?.bucket_name ?? ""),
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
        previewAvailable: isTruthyRowValue(existing.preview_available)
      };
    } else {
      throw new Error(`Attachment ${attachment.fileName} is missing stored content.`);
    }

    nextIds.add(storedRecord.id);

    await client.query(
      buildAttachmentInsertSql(),
      [
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
        storedRecord.previewAvailable
      ]
    );
  }

  for (const row of existingRows) {
    if (nextIds.has(row.id)) {
      continue;
    }

    const s3Key = getAttachmentRecordS3Key(row);

    if (s3Key) {
      removedS3Keys.push(s3Key);
    }

    await client.query("DELETE FROM attachment_objects WHERE id = $1", [row.id]);
  }

  return removedS3Keys;
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

  if (!/^(select|with)\b/i.test(normalizedSql)) {
    throw new Error("Only read-only SELECT and WITH queries are allowed.");
  }

  const forbiddenPattern =
    /\b(insert|update|delete|replace|drop|alter|create|attach|detach|vacuum|reindex|analyze|truncate)\b|load_extension|writable_schema/i;

  if (forbiddenPattern.test(normalizedSql)) {
    throw new Error(
      "Write, schema, attachment, and extension operations are not allowed from the admin query console."
    );
  }

  return normalizedSql;
}

function getAuroraPool(): Pool {
  if (auroraPool) {
    return auroraPool;
  }

  const config = buildAuroraPoolConfig();
  auroraPool = new Pool(config);
  return auroraPool;
}

function buildAuroraPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (connectionString) {
    return {
      connectionString,
      ssl: connectionString.includes("sslmode=") ? undefined : { rejectUnauthorized: false }
    };
  }

  const aurora = getAuroraConnectionConfig();

  if (!aurora.host || !aurora.username) {
    throw new Error("Aurora connection env vars are missing host or username.");
  }

  return {
    host: aurora.host,
    port: aurora.port,
    database: aurora.databaseName,
    user: aurora.username,
    password: aurora.password,
    ssl: { rejectUnauthorized: false }
  };
}

async function withAuroraClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getAuroraPool().connect();

  try {
    await ensureAuroraReady(client);
    return await callback(client);
  } finally {
    client.release();
  }
}

async function queryAurora<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  return withAuroraClient(async (client) => {
    const result = await client.query<T>(text, values);
    return result.rows;
  });
}

async function executeAurora(text: string, values: unknown[] = []): Promise<void> {
  await withAuroraClient(async (client) => {
    await client.query(text, values);
  });
}

async function transactionAurora<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  return withAuroraClient(async (client) => {
    await client.query("BEGIN");

    try {
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function ensureAuroraReady(client?: PoolClient): Promise<void> {
  if (auroraReady) {
    await auroraReady;
    return;
  }

  auroraReady = initializeAurora(client);

  try {
    await auroraReady;
  } catch (error) {
    auroraReady = null;
    throw error;
  }
}

async function initializeAurora(client?: PoolClient): Promise<void> {
  const query = client ? client.query.bind(client) : getAuroraPool().query.bind(getAuroraPool());

  await query(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
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
      updated_at TIMESTAMPTZ NOT NULL,
      payload TEXT NOT NULL
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
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbox_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_error TEXT,
      available_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS attachment_objects (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      original_filename TEXT,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      checksum_sha256 TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT NOT NULL DEFAULT '',
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      storage_provider TEXT NOT NULL DEFAULT 's3',
      bucket_name TEXT,
      s3_key TEXT,
      relation_type TEXT NOT NULL DEFAULT 'ticket_information',
      relation_id TEXT,
      preview_available BOOLEAN NOT NULL DEFAULT false
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
    CREATE INDEX IF NOT EXISTS idx_outbox_jobs_status_available ON outbox_jobs(status, available_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_jobs_type ON outbox_jobs(type);
  `);

  if (client) {
    await ensureAuroraAttachmentSchema(client);
  }

  const configCountResult = await query<{ count: number | string }>(
    "SELECT COUNT(*)::int AS count FROM app_config WHERE key = $1",
    [adminConfigKey]
  );
  const configCount = Number(configCountResult.rows[0]?.count ?? 0);

  if (configCount === 0) {
    await query(
      "INSERT INTO app_config (key, payload, updated_at) VALUES ($1, $2, $3)",
      [adminConfigKey, serializeJson(adminConfig), nowIso()]
    );
  }

  const ticketCountResult = await query<{ count: number | string }>(
    "SELECT COUNT(*)::int AS count FROM tickets"
  );
  const ticketCount = Number(ticketCountResult.rows[0]?.count ?? 0);

  if (ticketCount === 0) {
    await seedAuroraDemoTickets({
      query: (text: string, values?: unknown[]) => query(text, values)
    });
  }
}

async function seedAuroraDemoTickets(runner: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }): Promise<void> {
  const tickets = buildDemoTickets();

  for (const ticket of tickets) {
    await runner.query(
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
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
      ]
    );
  }
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

async function listAuroraDatabaseTables(): Promise<DatabaseTableSummary[]> {
  const tables = await queryAurora<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
      ORDER BY table_name
    `
  );

  const summaries: DatabaseTableSummary[] = [];

  for (const table of tables) {
    const tableName = table.table_name;
    const quotedTableName = quoteIdentifier(tableName);
    const rowCountRows = await queryAurora<CountRow>(`SELECT COUNT(*)::int AS count FROM ${quotedTableName}`);
    const rowCount = Number(rowCountRows[0]?.count ?? 0);
    const columns = await queryAurora<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      ordinal_position: number;
      is_identity: string;
    }>(
      `
        SELECT column_name, data_type, is_nullable, column_default, ordinal_position, is_identity
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `,
      [tableName]
    );
    const previewRows = await queryAurora<Record<string, unknown>>(
      `SELECT * FROM ${quotedTableName} LIMIT 5`
    );

    summaries.push({
      name: tableName,
      rowCount,
      columns: columns.map((column) => ({
        name: column.column_name,
        type: column.data_type || "ANY",
        nullable: String(column.is_nullable).toUpperCase() === "YES",
        primaryKey: false,
        defaultValue: normalizeDatabaseValue(column.column_default)
      })),
      previewRows: normalizeDatabaseQueryRows(previewRows)
    });
  }

  return summaries;
}

async function runAuroraReadOnlyQuery(sql: string, maxRows = 200): Promise<DatabaseQueryResult> {
  const normalizedSql = assertReadOnlySql(sql);
  const startedAt = performance.now();
  const rows = await queryAurora<Record<string, unknown>>(normalizedSql);
  const limitedRows = rows.slice(0, maxRows).map(normalizeDatabaseRow);
  const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const columns = limitedRows[0] ? Object.keys(limitedRows[0]) : [];

  return {
    columns,
    rows: limitedRows,
    rowCount: limitedRows.length,
    elapsedMs,
    statementType: normalizedSql.split(/\s+/, 1)[0].toUpperCase()
  };
}

async function clearAuroraTicketsForDevelopment(): Promise<DatabaseTableSummary[]> {
  await executeAurora("DELETE FROM tickets");
  return listAuroraDatabaseTables();
}

async function readAuroraAdminConfig(): Promise<AdminConfig> {
  const rows = await queryAurora<{ payload: string }>(
    "SELECT payload FROM app_config WHERE key = $1",
    [adminConfigKey]
  );

  if (rows.length === 0) {
    await saveAuroraAdminConfig(adminConfig);
    return adminConfig;
  }

  return parseJson<AdminConfig>(rows[0].payload);
}

async function saveAuroraAdminConfig(config: AdminConfig): Promise<void> {
  await executeAurora(
    `
      INSERT INTO app_config (key, payload, updated_at)
      VALUES ($1, $2, $3)
      ON CONFLICT(key) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at
    `,
    [adminConfigKey, serializeJson(config), nowIso()]
  );
}

async function persistAuroraTicket(ticket: Ticket, client: PoolClient): Promise<string[]> {
  const storedTicket = stripTicketAttachmentBinaryData(ticket);

  const removedS3Keys = await syncAuroraAttachmentRows(storedTicket, client);
  await client.query(
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT(key) DO UPDATE SET
        id = EXCLUDED.id,
        title = EXCLUDED.title,
        type_id = EXCLUDED.type_id,
        state = EXCLUDED.state,
        product = EXCLUDED.product,
        module_name = EXCLUDED.module_name,
        site = EXCLUDED.site,
        priority = EXCLUDED.priority,
        risk = EXCLUDED.risk,
        updated_at = EXCLUDED.updated_at,
        payload = EXCLUDED.payload
    `,
    [
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
    ]
  );

  return removedS3Keys;
}

async function claimAuroraNotificationDelivery(
  idempotencyKey: string,
  recipientCount: number
): Promise<NotificationDeliveryClaim> {
  return transactionAurora(async (client) => {
    const timestamp = nowIso();
    const insertResult = await client.query(
      `
        INSERT INTO notification_deliveries (
          idempotency_key,
          status,
          recipient_count,
          created_at,
          updated_at
        )
        VALUES ($1, 'pending', $2, $3, $4)
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [idempotencyKey, recipientCount, timestamp, timestamp]
    );

    if (insertResult.rowCount === 1) {
      return {
        status: "claimed",
        attempt: "new",
        idempotencyKey
      };
    }

    const existing = await client.query<NotificationDeliveryRow>(
      "SELECT * FROM notification_deliveries WHERE idempotency_key = $1",
      [idempotencyKey]
    );

    const existingDelivery = existing.rows[0];

    if (!existingDelivery) {
      throw new Error("Notification delivery claim could not be read after insert conflict.");
    }

    if (existingDelivery.status === "failed") {
      const retryResult = await client.query(
        `
          UPDATE notification_deliveries
          SET
            status = 'pending',
            recipient_count = $1,
            message_id = NULL,
            accepted_count = 0,
            rejected_count = 0,
            response = NULL,
            error = NULL,
            updated_at = $2
          WHERE idempotency_key = $3
            AND status = 'failed'
        `,
        [recipientCount, timestamp, idempotencyKey]
      );

      if (retryResult.rowCount === 1) {
        return {
          status: "claimed",
          attempt: "retry",
          idempotencyKey
        };
      }
    }

    return mapDuplicateNotificationDelivery(existingDelivery);
  });
}

async function markAuroraNotificationDeliverySent(
  idempotencyKey: string,
  result: {
    messageId?: string | false;
    acceptedCount: number;
    rejectedCount: number;
    response?: string | false;
  }
): Promise<void> {
  await executeAurora(
    `
      UPDATE notification_deliveries
      SET
        status = 'sent',
        message_id = $1,
        accepted_count = $2,
        rejected_count = $3,
        response = $4,
        error = NULL,
        updated_at = $5
      WHERE idempotency_key = $6
    `,
    [
      result.messageId || null,
      result.acceptedCount,
      result.rejectedCount,
      result.response || null,
      nowIso(),
      idempotencyKey
    ]
  );
}

async function markAuroraNotificationDeliveryFailed(
  idempotencyKey: string,
  errorMessage: string
): Promise<void> {
  await executeAurora(
    `
      UPDATE notification_deliveries
      SET
        status = 'failed',
        error = $1,
        updated_at = $2
      WHERE idempotency_key = $3
    `,
    [errorMessage, nowIso(), idempotencyKey]
  );
}

async function listAuroraTickets(): Promise<Ticket[]> {
  const rows = await queryAurora<{ payload: string }>(
    "SELECT payload FROM tickets ORDER BY updated_at DESC, key DESC"
  );

  return Promise.all(rows.map((row) => hydrateTicketAttachmentDownloads(parseJson<Ticket>(row.payload))));
}

async function getAuroraTicketByKey(ticketKey: string): Promise<Ticket | undefined> {
  const rows = await queryAurora<{ payload: string }>(
    "SELECT payload FROM tickets WHERE key = $1",
    [ticketKey]
  );

  return rows[0] ? hydrateTicketAttachmentDownloads(parseJson<Ticket>(rows[0].payload)) : undefined;
}

async function deleteCommittedAttachmentObjects(s3Keys: string[]): Promise<void> {
  for (const s3Key of [...new Set(s3Keys)]) {
    try {
      await deleteAttachmentObject(s3Key);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown S3 delete failure.";
      console.error(
        JSON.stringify({
          event: "attachment_object_delete_failed_after_commit",
          s3Key,
          message
        })
      );
    }
  }
}

async function saveAuroraTicket(ticket: Ticket): Promise<void> {
  let removedS3Keys: string[] = [];

  await transactionAurora(async (client) => {
    removedS3Keys = await persistAuroraTicket(ticket, client);
  });

  await deleteCommittedAttachmentObjects(removedS3Keys);
}

async function replaceAuroraTickets(tickets: Ticket[]): Promise<void> {
  let removedS3Keys: string[] = [];

  await transactionAurora(async (client) => {
    const attachmentRows = await client.query<AttachmentRow>("SELECT * FROM attachment_objects");
    const retainedS3Keys = new Set(
      tickets.flatMap((ticket) =>
        ticket.attachments
          .map((attachment) => attachment.s3Key?.trim() || "")
          .filter((s3Key) => Boolean(s3Key))
      )
    );

    removedS3Keys = attachmentRows.rows
      .map((row) => getAttachmentRecordS3Key(row))
      .filter((s3Key) => Boolean(s3Key) && !retainedS3Keys.has(s3Key));

    await client.query("DELETE FROM attachment_objects");
    await client.query("DELETE FROM tickets");

    for (const ticket of tickets) {
      await persistAuroraTicket(ticket, client);
    }
  });

  await deleteCommittedAttachmentObjects(removedS3Keys);
}

function mapOutboxJobRow(row: OutboxJobRow): OutboxJob {
  return mapOutboxJob(row);
}

async function enqueueAuroraOutboxJob(input: OutboxEnqueueInput): Promise<OutboxJob> {
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

  await executeAurora(
    `
      INSERT INTO outbox_jobs (
        id, type, status, payload, attempts, max_attempts, last_error,
        available_at, created_at, updated_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
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
    ]
  );

  return job;
}

async function claimAuroraOutboxJobs(limit = 10): Promise<OutboxJob[]> {
  return transactionAurora(async (client) => {
    const now = nowIso();
    const rows = await client.query<OutboxJobRow>(
      `
        SELECT *
        FROM outbox_jobs
        WHERE status = 'pending' AND available_at <= $1
        ORDER BY available_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      `,
      [now, limit]
    );

    const claimed: OutboxJob[] = [];

    for (const row of rows.rows) {
      const result = await client.query(
        `
          UPDATE outbox_jobs
          SET status = 'processing', attempts = attempts + 1, updated_at = $1
          WHERE id = $2 AND status = 'pending'
        `,
        [now, row.id]
      );

      if ((result.rowCount ?? 0) > 0) {
        claimed.push(
          mapOutboxJobRow({
            ...row,
            status: "processing",
            attempts: row.attempts + 1,
            updated_at: now
          })
        );
      }
    }

    return claimed;
  });
}

async function completeAuroraOutboxJob(jobId: string): Promise<void> {
  const now = nowIso();
  await executeAurora(
    `
      UPDATE outbox_jobs
      SET status = 'completed', completed_at = $1, updated_at = $2, last_error = NULL
      WHERE id = $3
    `,
    [now, now, jobId]
  );
}

async function failAuroraOutboxJob(
  jobId: string,
  errorMessage: string,
  retryDelaySeconds = 60
): Promise<void> {
  return transactionAurora(async (client) => {
    const rowResult = await client.query<OutboxJobRow>("SELECT * FROM outbox_jobs WHERE id = $1", [jobId]);
    const row = rowResult.rows[0];

    if (!row) {
      return;
    }

    const now = new Date();
    const nextStatus: OutboxJobStatus = row.attempts >= row.max_attempts ? "dead" : "pending";
    const availableAt =
      nextStatus === "pending"
        ? new Date(now.getTime() + retryDelaySeconds * 1000).toISOString()
        : row.available_at;

    await client.query(
      `
        UPDATE outbox_jobs
        SET status = $1, last_error = $2, available_at = $3, updated_at = $4,
            completed_at = CASE WHEN $5 = 'dead' THEN $6 ELSE completed_at END
        WHERE id = $7
      `,
      [
        nextStatus,
        errorMessage.slice(0, 2000),
        availableAt,
        now.toISOString(),
        nextStatus,
        now.toISOString(),
        jobId
      ]
    );
  });
}

async function listAuroraOutboxJobs(limit = 50): Promise<OutboxJob[]> {
  const rows = await queryAurora<OutboxJobRow>(
    `
      SELECT *
      FROM outbox_jobs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return rows.map(mapOutboxJobRow);
}

export function getLocalDatabasePath(): string {
  if (!isAurora()) {
    return getLocalDatabasePathSqlite();
  }

  const aurora = getAuroraConnectionConfig();

  return aurora.host ? `aurora://${aurora.host}/${aurora.databaseName}` : `aurora://${aurora.databaseName}`;
}

export async function listDatabaseTables(): Promise<DatabaseTableSummary[]> {
  if (!isAurora()) {
    return Promise.resolve(listDatabaseTablesSqlite());
  }

  return listAuroraDatabaseTables();
}

export async function runReadOnlyDatabaseQuery(sql: string, maxRows = 200): Promise<DatabaseQueryResult> {
  if (!isAurora()) {
    return Promise.resolve(runReadOnlyDatabaseQuerySqlite(sql, maxRows));
  }

  return runAuroraReadOnlyQuery(sql, maxRows);
}

export async function clearLocalTicketsForDevelopment(
  options: { allowProduction?: boolean } = {}
): Promise<DatabaseTableSummary[]> {
  if (!isAurora()) {
    return Promise.resolve(clearLocalTicketsForDevelopmentSqlite(options));
  }

  if (process.env.NODE_ENV === "production" && !options.allowProduction) {
    throw new Error("Local ticket cleanup is disabled in production.");
  }

  return clearAuroraTicketsForDevelopment();
}

export async function readAdminConfig(): Promise<AdminConfig> {
  const normalize = (config: AdminConfig): AdminConfig => normalizeAdminConfigForScaniaSes(config);

  if (!isAurora()) {
    return Promise.resolve(normalize(readAdminConfigSqlite()));
  }

  const config = await readAuroraAdminConfig();
  const normalizedConfig = normalize(config);

  if (JSON.stringify(config) !== JSON.stringify(normalizedConfig)) {
    await saveAuroraAdminConfig(normalizedConfig);
  }

  return normalizedConfig;
}

export async function saveAdminConfig(config: AdminConfig): Promise<void> {
  const normalizedConfig = normalizeAdminConfigForScaniaSes(config);

  if (!isAurora()) {
    return Promise.resolve(saveAdminConfigSqlite(normalizedConfig));
  }

  return saveAuroraAdminConfig(normalizedConfig);
}

export async function claimNotificationDelivery(
  idempotencyKey: string,
  recipientCount: number
): Promise<NotificationDeliveryClaim> {
  if (!isAurora()) {
    return Promise.resolve(claimNotificationDeliverySqlite(idempotencyKey, recipientCount));
  }

  return claimAuroraNotificationDelivery(idempotencyKey, recipientCount);
}

export async function markNotificationDeliverySent(
  idempotencyKey: string,
  result: {
    messageId?: string | false;
    acceptedCount: number;
    rejectedCount: number;
    response?: string | false;
  }
): Promise<void> {
  if (!isAurora()) {
    return Promise.resolve(markNotificationDeliverySentSqlite(idempotencyKey, result));
  }

  return markAuroraNotificationDeliverySent(idempotencyKey, result);
}

export async function markNotificationDeliveryFailed(
  idempotencyKey: string,
  errorMessage: string
): Promise<void> {
  if (!isAurora()) {
    return Promise.resolve(markNotificationDeliveryFailedSqlite(idempotencyKey, errorMessage));
  }

  return markAuroraNotificationDeliveryFailed(idempotencyKey, errorMessage);
}

export async function listTickets(): Promise<Ticket[]> {
  if (!isAurora()) {
    return Promise.resolve(listTicketsSqlite());
  }

  return listAuroraTickets();
}

export async function getTicketByKeyFromDatabase(ticketKey: string): Promise<Ticket | undefined> {
  if (!isAurora()) {
    return Promise.resolve(getTicketByKeyFromDatabaseSqlite(ticketKey));
  }

  return getAuroraTicketByKey(ticketKey);
}

export async function saveTicket(ticket: Ticket): Promise<void> {
  if (!isAurora()) {
    return Promise.resolve(saveTicketSqlite(ticket));
  }

  return saveAuroraTicket(ticket);
}

export async function replaceTickets(tickets: Ticket[]): Promise<void> {
  if (!isAurora()) {
    return Promise.resolve(replaceTicketsSqlite(tickets));
  }

  return replaceAuroraTickets(tickets);
}

export async function enqueueOutboxJob(input: OutboxEnqueueInput): Promise<OutboxJob> {
  if (!isAurora()) {
    return Promise.resolve(enqueueOutboxJobSqlite(input));
  }

  return enqueueAuroraOutboxJob(input);
}

export async function claimOutboxJobs(limit = 10): Promise<OutboxJob[]> {
  if (!isAurora()) {
    return Promise.resolve(claimOutboxJobsSqlite(limit));
  }

  return claimAuroraOutboxJobs(limit);
}

export async function completeOutboxJob(jobId: string): Promise<void> {
  if (!isAurora()) {
    return Promise.resolve(completeOutboxJobSqlite(jobId));
  }

  return completeAuroraOutboxJob(jobId);
}

export async function failOutboxJob(
  jobId: string,
  errorMessage: string,
  retryDelaySeconds = 60
): Promise<void> {
  if (!isAurora()) {
    return Promise.resolve(failOutboxJobSqlite(jobId, errorMessage, retryDelaySeconds));
  }

  return failAuroraOutboxJob(jobId, errorMessage, retryDelaySeconds);
}

export async function listOutboxJobs(limit = 50): Promise<OutboxJob[]> {
  if (!isAurora()) {
    return Promise.resolve(listOutboxJobsSqlite(limit));
  }

  return listAuroraOutboxJobs(limit);
}
