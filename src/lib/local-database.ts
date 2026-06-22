import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import {
  aiIntegration,
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
import type { AdminConfig, GitLabIntegrationConfig, StatusColorConfig, TicketTypeWorkflowConfig } from "./admin-config";
import { extractJiraProjectKey, normalizeJiraBaseUrl } from "./integration-actions";
import { workflowTemplates } from "./nexus-data";
import type { Ticket } from "./types";

type ConfigRow = {
  payload: string;
};

type TicketRow = {
  payload: string;
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
  products: [],
  responsibilityMappings: [],
  requestTypes: [],
  priorities: [],
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
  const defaultStatusKeys = new Set(statusColorOptions.map((statusColor) => normalizeStatusLabel(statusColor.status)));
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

  return normalizedBaseUrl && normalizedProjectKey ? `${normalizedBaseUrl}/projects/${normalizedProjectKey}` : "";
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
    projectUrl: getJiraProjectUrl(mergedConfig.projectUrl || apiBaseUrl, defaultProjectKey) || mergedConfig.projectUrl
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
    apiBaseUrl: !apiBaseUrl || isUnsavedLegacyDefault ? gitlabIntegration.apiBaseUrl : apiBaseUrl ?? gitlabIntegration.apiBaseUrl,
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

function normalizeStoredFunctionMappingReviews(ticket: Ticket): NonNullable<Ticket["functionMappingReviews"]> {
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
            ownerName: step.ownerRole === "solution_architect" && step.ownerName ? step.ownerName : "Solution Architect",
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
  return `"${identifier.replace(/"/g, "\"\"")}"`;
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

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeDatabaseValue(value)])
  );
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
    throw new Error("Write, schema, attachment, and extension operations are not allowed from the admin query console.");
  }

  if (/^pragma\b/i.test(normalizedSql)) {
    const safePragmaPattern =
      /^pragma\s+(table_info|table_xinfo|index_list|foreign_key_list)\s*\(\s*["'`]?[\w-]+["'`]?\s*\)$|^pragma\s+(table_list|database_list)\s*$/i;

    if (!safePragmaPattern.test(normalizedSql)) {
      throw new Error("Only table_info, table_xinfo, index_list, foreign_key_list, table_list, and database_list PRAGMA queries are allowed.");
    }
  }

  return normalizedSql;
}

function normalizeStoredAdminConfig(config: AdminConfig): AdminConfig {
  const roleDomains = Array.isArray(config.roleDomains)
    ? config.roleDomains.map((roleDomain) => ({
        ...roleDomain,
        active: roleDomain.active ?? true
      }))
    : [];
  const rawPriorities = Array.isArray(config.priorities) ? config.priorities : [];
  const shouldMigrateLegacyPriorities = isLegacyDefaultPriorityConfig(rawPriorities);
  const priorities = shouldMigrateLegacyPriorities ? getJiraPriorityOptions() : rawPriorities;

  return {
    ...emptyAdminConfig,
    ...config,
    users: Array.isArray(config.users) ? config.users.map((user) => normalizeAdminUser(user)) : [],
    customRoles: Array.isArray(config.customRoles) ? config.customRoles : [],
    roleDomains,
    deletedRoleKeys: Array.isArray(config.deletedRoleKeys) ? config.deletedRoleKeys : [],
    regionSites: Array.isArray(config.regionSites) ? config.regionSites : [],
    products: Array.isArray(config.products) ? config.products.map((product) => normalizeProductConfig(product)) : [],
    responsibilityMappings: Array.isArray(config.responsibilityMappings) ? config.responsibilityMappings : [],
    requestTypes: Array.isArray(config.requestTypes) ? config.requestTypes : [],
    priorities,
    riskOptions: Array.isArray(config.riskOptions) ? config.riskOptions : [],
    statusColors: mergeDefaultStatusColors(Array.isArray(config.statusColors) ? config.statusColors : []),
    requestCategories: Array.isArray(config.requestCategories) ? config.requestCategories : [],
    slaRules: shouldMigrateLegacyPriorities
      ? migrateLegacyPriorityReferences(Array.isArray(config.slaRules) ? config.slaRules : [])
      : Array.isArray(config.slaRules)
        ? config.slaRules
        : [],
    escalationPolicies: shouldMigrateLegacyPriorities
      ? migrateLegacyPriorityReferences(Array.isArray(config.escalationPolicies) ? config.escalationPolicies : [])
      : Array.isArray(config.escalationPolicies)
        ? config.escalationPolicies
        : [],
    leadTimeStatusRules: normalizeLeadTimeStatusRules(config.leadTimeStatusRules),
    leadTimeTransitionRules: normalizeLeadTimeTransitionRules(config.leadTimeTransitionRules),
    notificationTemplates: Array.isArray(config.notificationTemplates) ? config.notificationTemplates : [],
    formTemplates: Array.isArray(config.formTemplates) ? config.formTemplates : [],
    ticketTypeWorkflows: Array.isArray(config.ticketTypeWorkflows)
      ? config.ticketTypeWorkflows.map((workflow) => normalizeStoredTicketTypeWorkflow(workflow))
      : [],
    integrations: {
      jira: normalizeStoredJiraIntegration(config.integrations?.jira),
      smtp: {
        ...smtpConfig,
        ...(config.integrations?.smtp ?? {})
      },
      ai: {
        ...aiIntegration,
        ...(config.integrations?.ai ?? {})
      },
      gitlab: normalizeStoredGitLabIntegration(config.integrations?.gitlab)
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
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_updated_at ON notification_deliveries(updated_at);
  `);
}

function seedDefaults(db: DatabaseSync) {
  const existingConfig = db
    .prepare("SELECT payload FROM app_config WHERE key = ?")
    .get(adminConfigKey) as ConfigRow | undefined;

  if (!existingConfig) {
    db.prepare("INSERT INTO app_config (key, payload, updated_at) VALUES (?, ?, ?)").run(
      adminConfigKey,
      serializeJson(emptyAdminConfig),
      nowIso()
    );
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
      (db.prepare(`SELECT COUNT(*) AS count FROM ${quotedTableName}`).get() as CountRow | undefined)?.count ?? 0;
    const columns = (db.prepare(`PRAGMA table_info(${quotedTableName})`).all() as ColumnInfoRow[]).map((column) => ({
      name: column.name,
      type: column.type || "ANY",
      nullable: column.notnull === 0,
      primaryKey: column.pk > 0,
      defaultValue: normalizeDatabaseValue(column.dflt_value)
    }));
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

export function clearLocalTicketsForDevelopment(options: { allowProduction?: boolean } = {}): DatabaseTableSummary[] {
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
  const row = getDatabase()
    .prepare("SELECT payload FROM app_config WHERE key = ?")
    .get(adminConfigKey) as ConfigRow | undefined;

  if (!row) {
    saveAdminConfig(emptyAdminConfig);
    return emptyAdminConfig;
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

export function claimNotificationDelivery(idempotencyKey: string, recipientCount: number): NotificationDeliveryClaim {
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

export function listTickets(): Ticket[] {
  const rows = getDatabase()
    .prepare("SELECT payload FROM tickets ORDER BY updated_at DESC, key DESC")
    .all() as TicketRow[];

  return rows.map((row) => normalizeStoredTicket(parseJson<Ticket>(row.payload, "ticket")));
}

export function getTicketByKeyFromDatabase(ticketKey: string): Ticket | undefined {
  const row = getDatabase()
    .prepare("SELECT payload FROM tickets WHERE key = ?")
    .get(ticketKey) as TicketRow | undefined;

  return row ? normalizeStoredTicket(parseJson<Ticket>(row.payload, `ticket-${ticketKey}`)) : undefined;
}

export function saveTicket(ticket: Ticket): void {
  getDatabase()
    .prepare(
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
    )
    .run(
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

export function replaceTickets(tickets: Ticket[]): void {
  const db = getDatabase();
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

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM tickets").run();

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

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
