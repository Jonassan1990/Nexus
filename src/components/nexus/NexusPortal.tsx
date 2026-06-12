"use client";

import type {
  ClipboardEvent,
  Dispatch,
  FocusEvent as ReactFocusEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  CSSProperties,
  SetStateAction,
  SyntheticEvent as ReactSyntheticEvent
} from "react";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getTicketTypeLabel,
  roles,
  ticketTypes,
  workflowTemplates
} from "@/lib/nexus-data";
import {
  TdsHeader,
  TdsHeaderBrandSymbol,
  TdsHeaderHamburger,
  TdsHeaderItem,
  TdsHeaderLauncherButton,
  TdsHeaderTitle,
  TdsSideMenu,
  TdsSideMenuCloseButton,
  TdsSideMenuItem,
  TdsSideMenuOverlay
} from "@scania/tegel-react";
import {
  adminConfig,
  getAdminRoleLabel,
  getJiraPriorityOptions,
  isLegacyDefaultPriorityConfig,
  migrateLegacyPriorityReferences,
  normalizeProductConfig,
  notificationTemplates as defaultNotificationTemplates,
  statusColorOptions
} from "@/lib/admin-config";
import type {
  AdminConfig,
  AdminUser,
  ConfigOption,
  FormComponentType,
  FormFieldType,
  FormTemplateField,
  FormTemplateOptionSource,
  JiraApiVersion,
  JiraAuthMode,
  JiraIntegrationConfig,
  NotificationDeliveryMode,
  NotificationEventType,
  NotificationSeverity,
  NotificationTemplate,
  ProductConfig,
  ProductFormTemplate,
  ProductModuleConfig,
  ProductPruConfig,
  RegionSiteConfig,
  ResponsibilityMappingConfig,
  RoleDomain,
  RoleDomainConfig,
  SlaRule,
  SmtpConfig,
  StatusColorConfig,
  TegelTagVariant,
  TicketTypeWorkflowConfig
} from "@/lib/admin-config";
import { canView, filterVisible } from "@/lib/rbac";
import type {
  CommentItem,
  EscalationActionItem,
  EscalationPerson,
  JiraFollowUpStatus,
  NotificationItem,
  RoleKey,
  SlaPolicy,
  SlaState,
  Ticket,
  TicketState,
  VisibilityLevel,
  WorkflowRoleType,
  WorkflowStepStatus,
  WorkflowTemplateStep
} from "@/lib/types";
import {
  extractJiraIssueKey,
  extractJiraProjectKey,
  normalizeJiraBaseUrl,
  type JiraActionConfig
} from "@/lib/integration-actions";
import type { JiraIssueAttachmentInput } from "@/lib/jira-attachments";
import { nextActionLabel, summarizeWorkflowHealth } from "@/lib/workflow-engine";
import { TegelIcon } from "./TegelIcon";
import type { TegelIconName } from "./TegelIcon";

const ALL_SCOPE_VALUE = "__all__";
const ALL_SCOPE_LABEL = "All";

const allRoles = [
  "requester",
  "local_product_owner",
  "global_product_owner",
  "business_architect",
  "software_architect",
  "release_manager",
  "developer",
  "it_reviewer",
  "security_reviewer",
  "admin"
] as const satisfies readonly RoleKey[];

const approverRoles = [
  "local_product_owner",
  "global_product_owner",
  "business_architect",
  "software_architect",
  "release_manager",
  "developer",
  "it_reviewer",
  "security_reviewer",
  "admin"
] as const satisfies readonly RoleKey[];

const governanceRoles = [
  "local_product_owner",
  "global_product_owner",
  "business_architect",
  "software_architect",
  "release_manager",
  "it_reviewer",
  "security_reviewer",
  "admin"
] as const satisfies readonly RoleKey[];

const ticketReopenRoles = [
  "local_product_owner",
  "global_product_owner",
  "software_architect",
  "admin"
] as const satisfies readonly RoleKey[];

const ticketEditorRoles = [
  "local_product_owner",
  "global_product_owner",
  "software_architect",
  "admin"
] as const satisfies readonly RoleKey[];

const executionRoles = [
  "local_product_owner",
  "global_product_owner",
  "software_architect",
  "release_manager",
  "developer",
  "it_reviewer",
  "security_reviewer",
  "admin"
] as const satisfies readonly RoleKey[];

const builtInRoleKeys = new Set<RoleKey>(roles.map((role) => role.key));

function isBuiltInRole(role: RoleKey): boolean {
  return builtInRoleKeys.has(role);
}

function normalizeRoleKey(value: string): RoleKey {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (normalized || `role_${Date.now()}`) as RoleKey;
}

function getRoleOptions(config?: AdminConfig) {
  const deletedRoleKeys = new Set(config?.deletedRoleKeys ?? []);
  const customRoles = (config?.customRoles ?? []).filter((role) => role.key && role.label);
  const mergedRoles = [...roles, ...customRoles];
  const seenRoleKeys = new Set<RoleKey>();

  return mergedRoles.filter((role) => {
    if (deletedRoleKeys.has(role.key) || seenRoleKeys.has(role.key)) {
      return false;
    }

    seenRoleKeys.add(role.key);
    return true;
  });
}

function getConfigRoleLabel(config: AdminConfig, roleKey: RoleKey): string {
  const role = getRoleOptions(config).find((item) => item.key === roleKey);

  if (role) {
    return role.label;
  }

  return (roleKey ? roleKey.replace(/_/g, " ") : "Deleted role").replace(/\b\w/g, (character) =>
    character.toUpperCase()
  );
}

function getConfiguredWorkflowSteps(config: AdminConfig, workflow: Ticket["workflow"]): Ticket["workflow"] {
  const configuredRoleKeys = new Set(getRoleOptions(config).map((role) => role.key));

  return workflow.filter((step) => configuredRoleKeys.has(step.ownerRole));
}

type RolePersonaAssignment = "primary" | "acting" | "fallback";

interface RolePersonaOption {
  id: string;
  userId?: string;
  role: RoleKey;
  roleLabel: string;
  displayName: string;
  email: string;
  initials: string;
  assignment: RolePersonaAssignment;
  region: string;
  site: string;
  productIds: string[];
  pruNames: string[];
}

function getPersonaInitials(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "NA";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function getUserRolesForPersonas(user: AdminUser): { role: RoleKey; assignment: RolePersonaAssignment }[] {
  const roleAssignments = new Map<RoleKey, RolePersonaAssignment>();

  roleAssignments.set(user.primaryRole, "primary");

  for (const actionRole of user.actionRoles) {
    if (!roleAssignments.has(actionRole)) {
      roleAssignments.set(actionRole, "acting");
    }
  }

  return Array.from(roleAssignments, ([role, assignment]) => ({ role, assignment }));
}

function createFallbackRolePersona(role: { key: RoleKey; label: string }): RolePersonaOption {
  return {
    id: `${role.key}:role`,
    role: role.key,
    roleLabel: role.label,
    displayName: role.label,
    email: "",
    initials: getPersonaInitials(role.label),
    assignment: "fallback",
    region: ALL_SCOPE_LABEL,
    site: ALL_SCOPE_LABEL,
    productIds: [ALL_SCOPE_VALUE],
    pruNames: [ALL_SCOPE_VALUE]
  };
}

function buildRolePersonaOptions(config: AdminConfig): RolePersonaOption[] {
  const roleOptions = getRoleOptions(config);
  const roleOptionMap = new Map(roleOptions.map((role) => [role.key, role]));
  const activeUsers = config.users.filter((user) => user.active);
  const personasByRole = new Map<RoleKey, RolePersonaOption[]>();

  for (const user of activeUsers) {
    for (const assignment of getUserRolesForPersonas(user)) {
      const roleOption = roleOptionMap.get(assignment.role);

      if (!roleOption) {
        continue;
      }

      const persona: RolePersonaOption = {
        id: `${assignment.role}:${user.id}:${assignment.assignment}`,
        userId: user.id,
        role: assignment.role,
        roleLabel: roleOption.label,
        displayName: user.displayName,
        email: user.email,
        initials: getPersonaInitials(user.displayName),
        assignment: assignment.assignment,
        region: user.region,
        site: user.site,
        productIds: [...user.productIds],
        pruNames: [...user.pruNames]
      };

      personasByRole.set(assignment.role, [...(personasByRole.get(assignment.role) ?? []), persona]);
    }
  }

  return roleOptions.flatMap((roleOption) => {
    const rolePersonas = (personasByRole.get(roleOption.key) ?? []).sort((left, right) => {
      if (left.assignment !== right.assignment) {
        return left.assignment === "primary" ? -1 : 1;
      }

      return left.displayName.localeCompare(right.displayName);
    });

    return rolePersonas.length ? rolePersonas : [createFallbackRolePersona(roleOption)];
  });
}

function formatPersonaOptionLabel(persona: RolePersonaOption): string {
  const actingSuffix = persona.assignment === "acting" ? " (acting)" : "";

  return `${persona.displayName} - ${persona.roleLabel}${actingSuffix}`;
}

function formatPersonaAuditActor(persona: RolePersonaOption): string {
  return `${persona.displayName} (${persona.roleLabel})`;
}

const navItems = [
  { key: "dashboard", label: "Dashboard", iconName: "dashboard", visibleTo: allRoles },
  { key: "tickets", label: "Ticket List", iconName: "folder", visibleTo: allRoles },
  { key: "releasePlan", label: "Release Plan", iconName: "calendar", visibleTo: allRoles },
  { key: "approvals", label: "Approvals", iconName: "document_check", visibleTo: approverRoles },
  { key: "clarifications", label: "Clarifications", iconName: "message", visibleTo: allRoles },
  { key: "jira", label: "Jira Sync", iconName: "route", visibleTo: executionRoles },
  { key: "escalations", label: "Escalations", iconName: "warning", visibleTo: governanceRoles },
  { key: "notifications", label: "Notifications", iconName: "notification", visibleTo: allRoles },
  { key: "audit", label: "Audit", iconName: "history", visibleTo: governanceRoles },
  { key: "attachments", label: "Attachments", iconName: "paperclip", visibleTo: allRoles },
  { key: "integrations", label: "Integrations", iconName: "link", visibleTo: ["admin"] as const },
  { key: "admin", label: "Admin", iconName: "configurator", visibleTo: ["admin"] as const },
  { key: "reports", label: "Reports", iconName: "report", visibleTo: governanceRoles },
  { key: "sla", label: "SLA", iconName: "timer", visibleTo: governanceRoles }
] as const satisfies readonly {
  key: string;
  label: string;
  iconName: TegelIconName;
  visibleTo: readonly RoleKey[];
}[];

type ModuleKey = (typeof navItems)[number]["key"];
type NavItem = (typeof navItems)[number];

interface HeaderAttentionItem {
  id: string;
  module: ModuleKey;
  title: string;
  meta: string;
  count: number;
  tone: "danger" | "warning" | "info";
}

type QueueStatusFilter = "all" | "open" | "ongoing" | "blocked" | "done";
type QueueTicketBucket = Exclude<QueueStatusFilter, "all">;
type ApprovalDecisionAction = "approve" | "reject" | "clarification";
type ApprovalDecisionPayload = string | ApprovalClarificationRequest;
type TicketListSortKey = "updatedAt" | "ticketKey" | "priority" | "status";

type ApprovalQueueItem = {
  id: string;
  ticket: Ticket;
  step: Ticket["workflow"][number];
  stepIndex: number;
  actionable: boolean;
};

interface ApprovalClarificationRequest {
  question: string;
  workflowTargetRoles: RoleKey[];
  pullInTargetRole?: RoleKey;
  pullInActionType?: PullInActionType;
  temporary?: boolean;
}

interface ApprovalClarificationDraft {
  question: string;
  workflowTargetRoles: RoleKey[];
  includePullIn: boolean;
  pullInTargetRole: RoleKey;
  pullInActionType: PullInActionType;
  temporary: boolean;
}

interface ApprovalClarificationTargetOption {
  key: RoleKey;
  label: string;
  detail: string;
}

interface NotificationEmailRecipient {
  name: string;
  email: string;
}

interface NotificationEmailEnvelope {
  id: string;
  eventType: NotificationEventType;
  ticketKey: string;
  recipients: NotificationEmailRecipient[];
  subject: string;
  body: string;
  htmlBody: string;
}

type TicketListRow = {
  ticket: Ticket;
  statusLabel: string;
  statusBucket: QueueTicketBucket;
  submitter: string;
  typeLabel: string;
};
type AnalyticsReportFilters = {
  region: string;
  site: string;
  product: string;
  pru: string;
  typeId: string;
  state: string;
  priority: string;
  slaState: string;
};
type AnalyticsReportSnapshot = {
  filters: AnalyticsReportFilters;
  generatedAt: string;
};
type ReportOption = {
  value: string;
  label: string;
};
type ReportBucket = {
  label: string;
  value: number;
  percentage: number;
  color: string;
};
type ReleasePlanDateKey = "preprod" | "prod";
type ReleasePlanVersionDate = {
  name: string;
  startDate: string;
  releaseDate: string;
};
type ReleasePlanVersionDateLookup = Map<string, ReleasePlanVersionDate>;
type ReleasePlanSprintMetadata = {
  id: string;
  name: string;
  state: string;
  boardId: string;
  boardName: string;
  startDate: string;
  endDate: string;
};
type ReleasePlanJiraMetadata = {
  versionDateLookup: ReleasePlanVersionDateLookup;
  boards: JiraBoardMetadataOption[];
  sprints: ReleasePlanSprintMetadata[];
};
type ReleasePlanTicket = {
  ticket: Ticket;
  releaseVersion: string;
  preprodDate: string;
  prodDate: string;
  sprint: string;
  sprintStatus: JiraFollowUpStatus;
  sprintStatusLabel: string;
  sprintStatusTone: "info" | "warning" | "critical" | "success";
};
type ReleasePlanGroup = {
  id: string;
  releaseVersion: string;
  preprodDate: string;
  prodDate: string;
  sortDate: number;
  tickets: ReleasePlanTicket[];
  sprintNames: string[];
  statusCounts: Array<{ label: string; value: number; tone: "info" | "warning" | "critical" | "success" }>;
};
type ReleasePlanTab = "releases" | "sprintPlanning";
type SprintPlanLaneKey = "planning" | "current" | "business_test" | "feature";
type SprintPlanLane = {
  key: SprintPlanLaneKey;
  label: string;
  description: string;
  tickets: ReleasePlanTicket[];
  totalEstimateHours: number;
  remainingHours: number;
  resources: string[];
};
type SprintPlanGroup = {
  id: string;
  sprint: string;
  boardNames: string[];
  state: string;
  startDate: string;
  endDate: string;
  releaseVersions: string[];
  totalEstimateHours: number;
  remainingHours: number;
  taskCount: number;
  resources: string[];
  lanes: SprintPlanLane[];
};
type TicketLifecycleStepState = "complete" | "active" | "waiting" | "blocked" | "rejected";
type TicketLifecycleStep = {
  label: string;
  detail: string;
  status: string;
  state: TicketLifecycleStepState;
};
type WorkflowCurrentPositionSummary = {
  label: string;
  detail: string;
  tone: "active" | "critical" | "waiting" | "complete";
};
type SelectableJiraFollowUpStatus = Exclude<JiraFollowUpStatus, "not_created" | "testing">;

const queueStatusFilters = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "ongoing", label: "Ongoing" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" }
] as const satisfies readonly { key: QueueStatusFilter; label: string }[];

function roleCanAccessNavItem(role: RoleKey, item: NavItem): boolean {
  if (!isBuiltInRole(role)) {
    return item.visibleTo === allRoles;
  }

  return (item.visibleTo as readonly RoleKey[]).includes(role);
}

function canAccessModule(role: RoleKey, moduleKey: ModuleKey): boolean {
  const item = navItems.find((candidate) => candidate.key === moduleKey);

  return item ? roleCanAccessNavItem(role, item) : false;
}

function canOperateJira(role?: RoleKey): boolean {
  return role ? canAccessModule(role, "jira") : false;
}

function workflowStepMatchesConfiguredStepId(step: Ticket["workflow"][number], configuredStepId: string): boolean {
  return step.id === configuredStepId || step.id.startsWith(`${configuredStepId}-`);
}

function getDefaultRoleDomain(role: RoleKey): RoleDomain {
  if (role === "admin") {
    return "Admin";
  }

  if (
    role === "developer" ||
    role === "it_reviewer" ||
    role === "security_reviewer" ||
    role === "software_architect" ||
    role === "release_manager"
  ) {
    return "IT";
  }

  return "Business";
}

function getConfiguredRoleDomain(config: AdminConfig, role: RoleKey): RoleDomain {
  return config.roleDomains.find((roleDomain) => roleDomain.role === role)?.domain ?? getDefaultRoleDomain(role);
}

function roleCanCreateJira(config: AdminConfig, role: RoleKey): boolean {
  return getConfiguredRoleDomain(config, role) === "IT";
}

function getJiraCreatorStepIds(
  workflow?: Pick<TicketTypeWorkflowConfig, "jiraCreatorStepId" | "jiraCreatorStepIds" | "stepIds">
): string[] {
  if (!workflow) {
    return [];
  }

  const configuredStepIds = Array.isArray(workflow.jiraCreatorStepIds) && workflow.jiraCreatorStepIds.length > 0
    ? workflow.jiraCreatorStepIds
    : workflow.jiraCreatorStepId
      ? [workflow.jiraCreatorStepId]
      : [];
  const routeStepIds = new Set(workflow.stepIds ?? []);

  return Array.from(new Set(configuredStepIds.filter((stepId) => routeStepIds.has(stepId))));
}

function getJiraCreatorRolesForTicket(config: AdminConfig, ticket: Ticket): RoleKey[] {
  const route = getWorkflowRouteForConfig(config, ticket.typeId);
  const configuredCreatorStepIds = getJiraCreatorStepIds(route);

  if (!configuredCreatorStepIds.length) {
    return [];
  }

  const configuredCreatorSteps = getConfiguredWorkflowStepsForRoute(route, config).filter((step) =>
    configuredCreatorStepIds.includes(step.id)
  );
  const configuredCreatorRoles = configuredCreatorSteps
    .map((step) => step.ownerRole)
    .filter((role) => roleCanCreateJira(config, role));

  if (configuredCreatorRoles.length > 0) {
    return Array.from(new Set(configuredCreatorRoles));
  }

  return Array.from(
    new Set(
      ticket.workflow
        .filter((step) => configuredCreatorStepIds.some((stepId) => workflowStepMatchesConfiguredStepId(step, stepId)))
        .map((step) => step.ownerRole)
        .filter((role) => roleCanCreateJira(config, role))
    )
  );
}

function canManageJiraForTicket(config: AdminConfig, persona: RolePersonaOption, ticket: Ticket): boolean {
  if (!canOperateJira(persona.role)) {
    return false;
  }

  if (persona.role === "admin") {
    return true;
  }

  if (
    canCreateJiraForTicket(ticket) &&
    isJiraReadyToCreateNotificationRole(persona.role) &&
    roleHasTicketAccess(ticket, persona.role, config)
  ) {
    return true;
  }

  const jiraCreatorRoles = getJiraCreatorRolesForTicket(config, ticket);

  return Boolean(
    jiraCreatorRoles.includes(persona.role) &&
      personaCanActOnTicket(persona, ticket, config)
  );
}

function canCommentOnJiraForTicket(config: AdminConfig, persona: RolePersonaOption, ticket: Ticket): boolean {
  if (!getValidJiraIssueKey(ticket.relatedJiraKey)) {
    return false;
  }

  return (
    persona.role === "admin" ||
    ticketWasSubmittedByPersona(ticket, persona) ||
    personaCanActOnTicket(persona, ticket, config) ||
    roleHasTicketAccess(ticket, persona.role, config)
  );
}

function getTicketSearchText(ticket: Ticket, config: AdminConfig): string {
  return [
    ticket.key,
    ticket.title,
    ticket.product,
    ticket.module,
    ticket.site,
    getConfigTicketTypeLabel(config, ticket.typeId)
  ]
    .join(" ")
    .toLowerCase();
}

function firstAccessibleModule(role: RoleKey): ModuleKey {
  return navItems.find((item) => roleCanAccessNavItem(role, item))?.key ?? "dashboard";
}

function parseStringListRecord(value: string | null): Record<string, string[]> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, items]) => [
        key,
        Array.isArray(items) ? items.filter((item): item is string => typeof item === "string") : []
      ])
    );
  } catch (error) {
    console.error("Failed to parse local read-state record.", {
      error: getErrorMessage(error)
    });
    return {};
  }
}

function parseStringList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch (error) {
    console.error("Failed to parse local string list.", {
      error: getErrorMessage(error)
    });
    return [];
  }
}

function getJiraAttentionId(ticket: Ticket): string | null {
  const followUpStatus = getTicketJiraFollowUpStatus(ticket);
  const needsJiraAttention =
    ticket.jiraDraft.status !== "synced" ||
    (followUpStatus !== "not_created" && followUpStatus !== "done" && followUpStatus !== "rejected");

  if (!needsJiraAttention) {
    return null;
  }

  return [
    "jira",
    ticket.key,
    ticket.relatedJiraKey ?? "",
    ticket.jiraDraft.status,
    ticket.jiraDraft.syncedStatus ?? "",
    followUpStatus,
    ticket.jiraDraft.followUpUpdatedAt ?? ""
  ].join(":");
}

function getJiraAttentionIds(tickets: Ticket[]): string[] {
  return tickets.map(getJiraAttentionId).filter((id): id is string => Boolean(id));
}

function buildHeaderAttentionItems({
  config,
  checkedJiraItemIds,
  role,
  selectedPersona,
  tickets,
  visibleNotifications
}: {
  config: AdminConfig;
  checkedJiraItemIds: Set<string>;
  role: RoleKey;
  selectedPersona: RolePersonaOption;
  tickets: Ticket[];
  visibleNotifications: NotificationItem[];
}): HeaderAttentionItem[] {
  const canShow = (module: ModuleKey) => canAccessModule(role, module);
  const items: HeaderAttentionItem[] = [];
  const unreadNotifications = visibleNotifications.filter((item) => item.unread).length;
  const approvalTickets = getApprovalQueueItems(tickets, config, selectedPersona).filter(
    (item) => item.actionable && item.step.status !== "blocked"
  ).length;
  const clarificationAttentionCount = getClarificationAttentionCount(tickets, role);
  const openEscalations = tickets.flatMap((ticket) => ticket.escalations).filter(
    (escalation) => escalation.status !== "resolved"
  ).length;
  const slaBreaches = tickets.filter((ticket) => ticket.slaState === "breach").length;
  const jiraItems = getJiraAttentionIds(tickets).filter((id) => !checkedJiraItemIds.has(id)).length;

  if (unreadNotifications > 0 && canShow("notifications")) {
    items.push({
      id: "notifications",
      module: "notifications",
      title: "Unread notifications",
      meta: "New role-visible pings",
      count: unreadNotifications,
      tone: "info"
    });
  }

  if (approvalTickets > 0 && canShow("approvals")) {
    items.push({
      id: "approvals",
      module: "approvals",
      title: "Approval actions",
      meta: "Workflow gates owned by this role",
      count: approvalTickets,
      tone: "warning"
    });
  }

  if (clarificationAttentionCount > 0 && canShow("clarifications")) {
    items.push({
      id: "clarifications",
      module: "clarifications",
      title: "Clarification follow-up",
      meta: "Threads waiting for this role",
      count: clarificationAttentionCount,
      tone: "warning"
    });
  }

  if (openEscalations > 0 && canShow("escalations")) {
    items.push({
      id: "escalations",
      module: "escalations",
      title: "Active escalations",
      meta: "Escalation branches need follow-up",
      count: openEscalations,
      tone: "danger"
    });
  }

  if (slaBreaches > 0 && canShow("sla")) {
    items.push({
      id: "sla",
      module: "sla",
      title: "SLA breaches",
      meta: "Operational targets are breached",
      count: slaBreaches,
      tone: "danger"
    });
  }

  if (jiraItems > 0 && canShow("jira")) {
    items.push({
      id: "jira",
      module: "jira",
      title: "Jira follow-up",
      meta: "Drafts, created issues, or active Jira states",
      count: jiraItems,
      tone: "info"
    });
  }

  return items;
}

const tabItems = [
  "Overview",
  "Workflow",
  "Clarifications",
  "Comments",
  "Jira",
  "Escalations",
  "Audit",
  "Attachments"
] as const;

type DetailTab = (typeof tabItems)[number];

const hiddenTicketDynamicFieldLabels = new Set(["Startup Sync", "Connect"]);

interface NewTicketFormState {
  title: string;
  typeId: string;
  region: string;
  pru: string;
  site: string;
  product: string;
  module: string;
  priority: Ticket["priority"] | "";
  risk: Ticket["risk"] | "";
  description: string;
  businessImpact: string;
  labels: string;
  expectedCompletionDate: string;
  attachments: NewTicketAttachmentInput[];
  dynamicAnswers: Record<string, string>;
}

interface NewTicketAttachmentInput {
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentDataUrl?: string;
}

interface NewClarificationThreadInput {
  level: string;
  question: string;
  assignedTo: string;
  actionType: PullInActionType;
  targetRole: RoleKey;
  temporary: boolean;
}

type PullInActionType = "clarification" | "approval" | "review" | "inform";

type ClarificationThreadRecord = Ticket["clarifications"][number];
type ClarificationTimelineMessage = ClarificationThreadRecord["messages"][number];

interface ClarificationTimelineEntry {
  thread: ClarificationThreadRecord;
  message: ClarificationTimelineMessage;
  createdAtMs: number;
}

interface ClarificationThreadGroup {
  id: string;
  level: string;
  status: ClarificationThreadRecord["status"];
  dueAt: string;
  latestUpdatedAt: string;
  threads: ClarificationThreadRecord[];
  timeline: ClarificationTimelineEntry[];
}

interface AttachmentLibraryTicketNode {
  ticket: Ticket;
  attachments: Ticket["attachments"];
}

interface AttachmentLibraryProductNode {
  label: string;
  attachmentCount: number;
  tickets: AttachmentLibraryTicketNode[];
}

interface AttachmentLibraryPruNode {
  label: string;
  attachmentCount: number;
  products: AttachmentLibraryProductNode[];
}

interface AttachmentLibrarySiteNode {
  label: string;
  attachmentCount: number;
  prus: AttachmentLibraryPruNode[];
}

type EscalationType = Ticket["escalations"][number]["type"];
type EscalationSeverity = Ticket["escalations"][number]["severity"];
type EscalationStatus = Ticket["escalations"][number]["status"];
type EscalationManagerInviteStatus = NonNullable<Ticket["escalations"][number]["managerInviteStatus"]>;

interface EscalationPersonInput {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface EscalationActionItemInput {
  id: string;
  label: string;
  done: boolean;
}

interface NewEscalationInput {
  type: EscalationType;
  severity: EscalationSeverity;
  reason: string;
  impact: string;
  urgency: string;
  requestedAction: string;
  mitigationPlan: string;
  actionPlan: string;
  actionItems: EscalationActionItemInput[];
  meetingSeries: string;
  decisionMaker: string;
  managerName: string;
  managerEmail: string;
  people: EscalationPersonInput[];
  sendManagerInvite: boolean;
  dueAt: string;
}

interface EscalationStatusUpdateDetails {
  actionPlan?: string;
  actionItems?: EscalationActionItemInput[];
  meetingSeries?: string;
  managerName?: string;
  managerEmail?: string;
  people?: EscalationPersonInput[];
  sendManagerInvite?: boolean;
}

interface JiraDraftUpdateInput {
  summary?: string;
  description?: string;
  releaseNote?: string;
  project: string;
  board: string;
  backlog: string;
  sprint?: string;
  fixVersion?: string;
  fixVersionStartDate?: string;
  fixVersionReleaseDate?: string;
  components: string[];
  labels: string[];
  priority: string;
  estimateHours?: number;
  remainingHours?: number;
  storyPoints?: number;
  assignee?: string;
}

interface CreateJiraOptions {
  replaceExisting?: boolean;
}

type JiraSyncedCommentInput = {
  id: string;
  author: string;
  role?: string;
  body: string;
  createdAt: string;
  updatedAt?: string | null;
};

type JiraSyncedFixVersionInput = {
  id?: string;
  name?: string;
  archived?: boolean;
  overdue?: boolean;
  released?: boolean;
  startDate?: string;
  userStartDate?: string;
  releaseDate?: string;
  userReleaseDate?: string;
};

type JiraSyncedIssueFieldsInput = {
  fixVersions?: JiraSyncedFixVersionInput[];
  estimateHours?: number;
  remainingHours?: number;
};

type JiraActivitySyncResult = {
  statusChanged: boolean;
  jiraStatusChanged: boolean;
  jiraFieldsChanged: boolean;
  importedComments: number;
  updatedComments: number;
};

interface WorkflowStatusUpdateInput {
  stepId: string;
  status: WorkflowStepStatus;
  reason: string;
}

interface TicketUpdateInput {
  title: string;
  state: TicketState;
  priority: string;
  risk: string;
  description: string;
  businessImpact: string;
  requesterNote: string;
}

interface TicketUpdateChange {
  field: string;
  oldValue: string;
  newValue: string;
}

type CreateJiraHandler = (
  ticketKey: string,
  draftUpdate?: JiraDraftUpdateInput,
  options?: CreateJiraOptions
) => Promise<void>;
type UpdateJiraIssueHandler = (ticketKey: string, draftUpdate?: JiraDraftUpdateInput) => Promise<void>;
type UpdateJiraLinkHandler = (ticketKey: string, jiraKey: string) => Promise<void>;
type PostJiraCommentHandler = (ticketKey: string, body: string) => Promise<void>;
type UpdateJiraStatusHandler = (ticketKey: string, status: JiraFollowUpStatus, note: string) => void;
type SyncJiraActivityHandler = (
  ticketKey: string,
  status: JiraFollowUpStatus,
  note: string,
  comments: JiraSyncedCommentInput[],
  jiraStatusName?: string,
  issueFields?: JiraSyncedIssueFieldsInput
) => JiraActivitySyncResult;
type UpdateWorkflowStatusHandler = (ticketKey: string, input: WorkflowStatusUpdateInput) => void;
type UpdateTicketHandler = (ticketKey: string, input: TicketUpdateInput) => void;

interface JiraDraftFormState {
  summary: string;
  description: string;
  releaseNote: string;
  project: string;
  board: string;
  backlog: string;
  sprint: string;
  fixVersion: string;
  fixVersionStartDate: string;
  fixVersionReleaseDate: string;
  components: string;
  labels: string;
  priority: string;
  estimateHours: string;
  storyPoints: string;
  assignee: string;
}

interface JiraMetadataOption {
  id: string;
  name: string;
}

interface JiraVersionMetadataOption extends JiraMetadataOption {
  archived?: boolean;
  overdue?: boolean;
  released?: boolean;
  startDate?: string;
  userStartDate?: string;
  releaseDate?: string;
  userReleaseDate?: string;
}

interface JiraProjectMetadataOption {
  key: string;
  name: string;
}

interface JiraBoardMetadataOption extends JiraMetadataOption {
  type: string;
}

interface JiraSprintMetadataOption extends JiraMetadataOption {
  state: string;
  boardId: string;
  boardName: string;
  startDate?: string;
  endDate?: string;
}

interface JiraAssignableUserMetadataOption extends JiraMetadataOption {
  email: string;
  active: boolean;
}

interface JiraStatusMetadataOption extends JiraMetadataOption {
  categoryKey: string;
  categoryName: string;
  colorName: string;
  issueTypes: string[];
}

interface JiraFieldMetadata {
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  message: string;
  warnings: string[];
  project?: JiraProjectMetadataOption;
  components: JiraMetadataOption[];
  versions: JiraVersionMetadataOption[];
  priorities: JiraMetadataOption[];
  statuses: JiraStatusMetadataOption[];
  boards: JiraBoardMetadataOption[];
  sprints: JiraSprintMetadataOption[];
  assignableUsers: JiraAssignableUserMetadataOption[];
}

type JiraSyncMetadataPayload = {
  data?: {
    project?: JiraProjectMetadataOption;
    components?: JiraMetadataOption[];
    versions?: JiraVersionMetadataOption[];
    priorities?: JiraMetadataOption[];
    statuses?: JiraStatusMetadataOption[];
    boards?: JiraBoardMetadataOption[];
    sprints?: JiraSprintMetadataOption[];
    assignableUsers?: JiraAssignableUserMetadataOption[];
    warnings?: string[];
  };
};

type AdminConfigUpdater = Dispatch<SetStateAction<AdminConfig>>;

const adminConfigStorageKey = "nexus-admin-config-v1";
const localIntegrationSecretsStorageKey = "nexus-integration-secrets-v1";
const notificationReadStorageKey = "nexus-notification-read-state-v1";
const jiraCheckedStorageKey = "nexus-jira-checked-state-v1";
const sentEmailNotificationStorageKey = "nexus-email-notification-sent-v1";
const persistenceDebounceMs = 400;
const ticketStateOptions = [
  { value: "intake", label: "Intake" },
  { value: "clarification", label: "Clarification" },
  { value: "approval", label: "Approval" },
  { value: "jira_draft", label: "Jira draft" },
  { value: "jira_synced", label: "Jira synced" },
  { value: "escalated", label: "Escalated" },
  { value: "closed", label: "Closed" }
] as const satisfies readonly { value: TicketState; label: string }[];
const REPORT_ALL_VALUE = "all";
const reportChartColors = [
  "var(--accent-2)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
  "var(--neutral)",
  "#546a8a",
  "#287d88",
  "#7c5f17"
];

const emptyAnalyticsReportFilters: AnalyticsReportFilters = {
  region: REPORT_ALL_VALUE,
  site: REPORT_ALL_VALUE,
  product: REPORT_ALL_VALUE,
  pru: REPORT_ALL_VALUE,
  typeId: REPORT_ALL_VALUE,
  state: REPORT_ALL_VALUE,
  priority: REPORT_ALL_VALUE,
  slaState: REPORT_ALL_VALUE
};
const releasePlanUnplannedLabel = "Unplanned release";
const releasePlanPreprodFieldLabels = [
  "preprod release date",
  "pre-prod release date",
  "pre prod release date",
  "preproduction release date",
  "pre-production release date",
  "preproduction date",
  "pre-prod date",
  "preprod date",
  "release start date",
  "start release date",
  "start date"
];
const releasePlanProdFieldLabels = [
  "prod release date",
  "production release date",
  "production date",
  "release date",
  "prod date"
];
const releasePlanVersionFieldLabels = [
  "target release version",
  "release version",
  "fix version",
  "target fix version"
];

function getTicketStateLabel(state: TicketState): string {
  return ticketStateOptions.find((option) => option.value === state)?.label ?? state.replace("_", " ");
}

function getTicketUpdateOptionLabels(options: ConfigOption[], currentValue: string): string[] {
  const labels = options
    .filter((option) => option.active)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((option) => option.label)
    .filter(Boolean);
  const uniqueLabels = Array.from(new Set(labels));

  if (currentValue && !uniqueLabels.includes(currentValue)) {
    uniqueLabels.push(currentValue);
  }

  return uniqueLabels;
}

function normalizeTicketUpdateOptionValue(value: string, currentValue: string, allowedValues: string[]): string {
  const trimmedValue = value.trim();

  return trimmedValue && allowedValues.includes(trimmedValue) ? trimmedValue : currentValue;
}

function canEditTicketForPersona(config: AdminConfig, persona: RolePersonaOption, ticket: Ticket): boolean {
  if (!(ticketEditorRoles as readonly RoleKey[]).includes(persona.role)) {
    return false;
  }

  if (persona.role === "admin") {
    return true;
  }

  return personaCanActOnTicket(persona, ticket, config) || roleHasTicketAccess(ticket, persona.role, config);
}

function buildTicketUpdateForm(ticket: Ticket): TicketUpdateInput {
  return {
    title: ticket.title,
    state: ticket.state,
    priority: ticket.priority,
    risk: ticket.risk,
    description: ticket.description,
    businessImpact: getEditableTicketBusinessImpact(ticket),
    requesterNote: ""
  };
}

function getEditableTicketBusinessImpact(ticket: Ticket): string {
  const value = ticket.dynamicFields["Business impact"] ?? "";

  return richTextComparableValue(value) === "not provided" ? "" : value;
}

function summarizeTicketUpdateValue(value: string, maxLength = 90): string {
  const plainText = htmlToPlainTextFallback(value).replace(/\s+/g, " ").trim();

  if (plainText) {
    return plainText.length <= maxLength ? plainText : `${plainText.slice(0, maxLength - 3).trim()}...`;
  }

  if (/<img\b/i.test(value)) {
    return "Image content";
  }

  return "Blank";
}

function buildRequesterTicketUpdateComment(
  changes: TicketUpdateChange[],
  requesterNote: string,
  actor: RolePersonaOption
): string {
  const changeMarkup =
    changes.length > 0
      ? `<ul>${changes
          .map(
            (change) =>
              `<li><strong>${escapeHtml(change.field)}:</strong> ${escapeHtml(change.oldValue)} -&gt; ${escapeHtml(
                change.newValue
              )}</li>`
          )
          .join("")}</ul>`
      : "<p>No ticket fields changed.</p>";
  const noteMarkup = requesterNote
    ? `<p><strong>Requester note</strong></p>${requesterNote}`
    : "";

  return normalizeRichTextForStorage(
    `<p><strong>${escapeHtml(actor.displayName)}</strong> updated the ticket as ${escapeHtml(
      actor.roleLabel
    )}.</p>${changeMarkup}${noteMarkup}`,
    "html"
  );
}

const initialTickets: Ticket[] = [];
const initialNotifications: NotificationItem[] = [];
const pullInActionOptions = [
  { value: "clarification", label: "Clarification", level: "Role clarification" },
  { value: "approval", label: "Approval", level: "Temporary approval" },
  { value: "review", label: "Review", level: "Temporary review" },
  { value: "inform", label: "Inform", level: "Inform only" }
] as const satisfies readonly { value: PullInActionType; label: string; level: string }[];

function getPullInActionOption(actionType: PullInActionType) {
  return pullInActionOptions.find((option) => option.value === actionType) ?? pullInActionOptions[0];
}

function getPullInRoleOptions(config: AdminConfig, actionType: PullInActionType) {
  const roleOptions = getRoleOptions(config);

  if (actionType === "approval" || actionType === "review") {
    const approvalRoles = roleOptions.filter((option) => canAccessModule(option.key, "approvals"));

    return approvalRoles.length ? approvalRoles : roleOptions;
  }

  return roleOptions;
}

function getDefaultPullInRole(
  config: AdminConfig,
  currentRole?: RoleKey,
  actionType: PullInActionType = "clarification"
): RoleKey {
  const roleOptions = getPullInRoleOptions(config, actionType);
  const preferredRole =
    currentRole === "requester"
      ? roleOptions.find((option) => option.key === "local_product_owner")
      : roleOptions.find((option) => option.key === "requester");

  return preferredRole?.key ?? roleOptions.find((option) => option.key !== currentRole)?.key ?? roleOptions[0]?.key ?? "requester";
}

function createDefaultPullInRequest(
  config: AdminConfig,
  currentRole?: RoleKey,
  actionType: PullInActionType = "clarification"
): NewClarificationThreadInput {
  const defaultAction = getPullInActionOption(actionType);
  const targetRole = getDefaultPullInRole(config, currentRole, defaultAction.value);

  return {
    level: defaultAction.level,
    actionType: defaultAction.value,
    targetRole,
    assignedTo: getConfigRoleLabel(config, targetRole),
    temporary: true,
    question: ""
  };
}

function getPullInAccessLevel(actionType: PullInActionType): Ticket["participants"][number]["accessLevel"] {
  if (actionType === "approval") {
    return "temporary_approver";
  }

  if (actionType === "review") {
    return "reviewer";
  }

  if (actionType === "inform") {
    return "viewer";
  }

  return "contributor";
}

function getPullInWorkflowStepLabel(actionType: PullInActionType, roleLabel: string): string {
  if (actionType === "approval") {
    return `${roleLabel} Approval`;
  }

  return `${roleLabel} Review`;
}

function roleUsesStructuredAttachmentLibrary(config: AdminConfig, role: RoleKey): boolean {
  if (["admin", "software_architect", "global_product_owner", "release_manager"].includes(role)) {
    return true;
  }

  return normalizeRoleToneText(getConfigRoleLabel(config, role)).includes("manager");
}

const commentVisibilityOptions = [
  { value: "public", label: "Public" },
  { value: "approvers_only", label: "Approvers only" },
  { value: "it_only", label: "IT only" },
  { value: "architecture_only", label: "Architecture only" },
  { value: "admin_only", label: "Admin only" }
] as const satisfies readonly { value: VisibilityLevel; label: string }[];
const escalationTypeOptions = [
  { value: "sla", label: "SLA" },
  { value: "technical", label: "Technical" },
  { value: "business", label: "Business" },
  { value: "management", label: "Management" }
] as const satisfies readonly { value: EscalationType; label: string }[];
const escalationSeverityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" }
] as const satisfies readonly { value: EscalationSeverity; label: string }[];
const escalationStatusOptions = [
  { value: "open", label: "New" },
  { value: "decision_pending", label: "Ongoing - decision" },
  { value: "mitigating", label: "Ongoing - fixing" },
  { value: "resolved", label: "Closed" }
] as const satisfies readonly { value: EscalationStatus; label: string }[];
const escalationBoardColumns = [
  {
    id: "new",
    title: "New",
    statuses: ["open"],
    empty: "No new escalations"
  },
  {
    id: "ongoing",
    title: "Ongoing",
    statuses: ["decision_pending", "mitigating"],
    empty: "No escalation in progress"
  },
  {
    id: "closed",
    title: "Closed",
    statuses: ["resolved"],
    empty: "No closed escalations"
  }
] as const satisfies readonly {
  id: string;
  title: string;
  statuses: readonly EscalationStatus[];
  empty: string;
}[];
const jiraDraftStageOptions = [
  { value: "metadata_loaded", label: "Metadata loaded" },
  { value: "estimation_review", label: "Estimation review" },
  { value: "release_gate", label: "Release gate" },
  { value: "ready_to_create", label: "Ready to create" },
  { value: "synced", label: "Jira created" }
] as const satisfies readonly { value: Ticket["jiraDraft"]["status"]; label: string }[];
const jiraFollowUpStatusOptions = [
  { value: "created", label: "Planning", tone: "info" },
  { value: "in_progress", label: "In progress", tone: "info" },
  { value: "it_test", label: "IT Test", tone: "warning" },
  { value: "business_test", label: "Business Test", tone: "warning" },
  { value: "blocked", label: "Blocked", tone: "critical" },
  { value: "done", label: "Done", tone: "success" },
  { value: "rejected", label: "Rejected", tone: "critical" }
] as const satisfies readonly { value: SelectableJiraFollowUpStatus; label: string; tone: "info" | "warning" | "critical" | "success" }[];
const jiraPortalStatusTimelineOptions = [
  { value: "not_created", label: "New", tone: "neutral" },
  ...jiraFollowUpStatusOptions
] as const satisfies readonly {
  value: JiraFollowUpStatus;
  label: string;
  tone: "info" | "warning" | "critical" | "success" | "neutral";
}[];
const jiraReadyToCreateNotificationRoles = ["software_architect", "release_manager"] as const satisfies readonly RoleKey[];
function isJiraReadyToCreateNotificationRole(role: RoleKey): boolean {
  return jiraReadyToCreateNotificationRoles.some((candidate) => candidate === role);
}
const notificationEventOptions = [
  { value: "ticketSubmitted", label: "Ticket submitted" },
  { value: "approvalRequested", label: "Approval requested" },
  { value: "clarificationRequested", label: "Clarification requested" },
  { value: "clarificationAnswered", label: "Clarification answered" },
  { value: "decisionMade", label: "Decision made" },
  { value: "ticketApproved", label: "Ticket approved" },
  { value: "ticketRejected", label: "Ticket rejected" },
  { value: "jiraReadyToCreate", label: "Jira ready to create" },
  { value: "jiraCreated", label: "Jira created" },
  { value: "slaBreach", label: "SLA breach" },
  { value: "escalationTriggered", label: "Escalation triggered" },
  { value: "participantAdded", label: "Participant added" }
] as const satisfies readonly { value: NotificationEventType; label: string }[];
const notificationDeliveryModeOptions = [
  { value: "inAppOnly", label: "In-app only" },
  { value: "emailOnly", label: "Email only" },
  { value: "inAppAndEmail", label: "In-app and email" }
] as const satisfies readonly { value: NotificationDeliveryMode; label: string }[];
const notificationSeverityOptions = [
  { value: "info", label: "INFO" },
  { value: "warning", label: "WARNING" },
  { value: "critical", label: "CRITICAL" },
  { value: "success", label: "SUCCESS" }
] as const satisfies readonly { value: NotificationSeverity; label: string }[];
const notificationTokenSamples = {
  ticketKey: "SUP-1042",
  ticketTitle: "Production deployment approval missing",
  jiraKey: "SCANIA-12345",
  participantName: "Yoones",
  priority: "1 - High",
  ticketStatus: "Waiting for clarification",
  createdBy: "Maja Lind",
  assignedTo: "Local Product Owner",
  environment: "Production",
  dueDate: "2026-06-05 16:00",
  releaseVersion: "2026.06",
  requestedByRole: "Release Manager",
  portalHomeUrl: "https://support.scania.com",
  portalUrl: "https://support.scania.com/?ticket=SUP-1042",
  ticketUrl: "https://support.scania.com/?ticket=SUP-1042"
} as const satisfies Record<string, string>;
const notificationTokenList = Object.keys(notificationTokenSamples);
const legacyNotificationTemplateDefaults: Record<
  string,
  Pick<NotificationTemplate, "subject" | "body" | "deliveryMode">
> = {
  "tpl-approval-requested": {
    subject: "Approval required: {{ticketKey}}",
    body: "{{ticketTitle}} is waiting for your review.",
    deliveryMode: "inAppAndEmail"
  },
  "tpl-clarification-requested": {
    subject: "Clarification requested: {{ticketKey}}",
    body: "A reviewer requested more information before the ticket can continue.",
    deliveryMode: "inAppAndEmail"
  },
  "tpl-jira-created": {
    subject: "Jira created for {{ticketKey}}",
    body: "The execution-layer Jira issue {{jiraKey}} has been created.",
    deliveryMode: "inAppOnly"
  },
  "tpl-sla-breach": {
    subject: "SLA breach: {{ticketKey}}",
    body: "{{ticketKey}} has breached its configured SLA rule and needs escalation review.",
    deliveryMode: "inAppAndEmail"
  },
  "tpl-participant-added": {
    subject: "Participant added: {{ticketKey}}",
    body: "{{participantName}} received temporary ticket-scoped access.",
    deliveryMode: "inAppOnly"
  }
};
const smtpSecurityOptions = [
  { value: "none", label: "None" },
  { value: "starttls", label: "STARTTLS" },
  { value: "sslTls", label: "SSL/TLS" }
] as const satisfies readonly { value: SmtpConfig["security"]; label: string }[];
const jiraApiVersionOptions = [
  { value: "rest/api/2", label: "Jira REST API v2" },
  { value: "rest/api/3", label: "Jira REST API v3" }
] as const satisfies readonly { value: JiraApiVersion; label: string }[];
const jiraAuthModeOptions = [
  { value: "personalAccessToken", label: "Personal access token" },
  { value: "emailApiToken", label: "Email + API token" },
  { value: "oauth2ClientCredentials", label: "OAuth client credentials" }
] as const satisfies readonly { value: JiraAuthMode; label: string }[];

function cloneAdminConfig(config: AdminConfig): AdminConfig {
  return JSON.parse(JSON.stringify(config)) as AdminConfig;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createEmptyAdminConfig(): AdminConfig {
  return {
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
    notificationTemplates: [],
    formTemplates: [],
    ticketTypeWorkflows: [],
    integrations: cloneAdminConfig(adminConfig).integrations
  };
}

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

function isDefaultStatusColor(statusLabel: string): boolean {
  const normalizedLabel = normalizeStatusLabel(statusLabel);

  return statusColorOptions.some((statusColor) => normalizeStatusLabel(statusColor.status) === normalizedLabel);
}

function normalizeTicketTypeWorkflow(workflow: TicketTypeWorkflowConfig): TicketTypeWorkflowConfig {
  const template = getWorkflowTemplateById(workflow.workflowTemplateId);
  const templateStepIds = template?.steps.map((step) => step.id) ?? [];
  const stepOverrideIds = new Set(Object.keys(workflow.stepOverrides ?? {}));
  const stepIds = workflow.stepIds?.length
    ? workflow.stepIds.filter((stepId) => templateStepIds.includes(stepId) || stepOverrideIds.has(stepId))
    : templateStepIds;
  const jiraCreatorStepIds = getJiraCreatorStepIds({
    stepIds,
    jiraCreatorStepId: workflow.jiraCreatorStepId,
    jiraCreatorStepIds: workflow.jiraCreatorStepIds
  }).filter((stepId) => stepIds.includes(stepId));
  const fallbackJiraCreatorStepId = stepIds.includes(workflow.jiraCreatorStepId)
    ? workflow.jiraCreatorStepId
    : stepIds[0] ?? "";
  const normalizedJiraCreatorStepIds = jiraCreatorStepIds.length > 0
    ? jiraCreatorStepIds
    : fallbackJiraCreatorStepId
      ? [fallbackJiraCreatorStepId]
      : [];

  return {
    ...workflow,
    escalationPolicyId: workflow.escalationPolicyId ?? template?.escalationPolicyId ?? "",
    stepIds,
    jiraCreatorStepId: normalizedJiraCreatorStepIds[0] ?? "",
    jiraCreatorStepIds: normalizedJiraCreatorStepIds,
    stepOverrides: workflow.stepOverrides ?? {}
  };
}

function getDefaultWorkflowRoleType(role: RoleKey): WorkflowRoleType {
  if (role === "local_product_owner" || role === "global_product_owner" || role === "release_manager") {
    return "approval";
  }

  if (role === "requester" || role === "admin") {
    return "inform";
  }

  return "review";
}

function normalizeRoleDomainConfig(roleDomain: RoleDomainConfig): RoleDomainConfig {
  return {
    ...roleDomain,
    workflowType: roleDomain.workflowType ?? getDefaultWorkflowRoleType(roleDomain.role)
  };
}

function getDefaultNotificationSeverity(eventType: NotificationEventType): NotificationSeverity {
  if (eventType === "jiraCreated") {
    return "success";
  }

  if (eventType === "slaBreach" || eventType === "escalationTriggered") {
    return "critical";
  }

  if (eventType === "clarificationRequested" || eventType === "approvalRequested" || eventType === "jiraReadyToCreate") {
    return "warning";
  }

  return "info";
}

function normalizeNotificationTemplate(template: NotificationTemplate): NotificationTemplate {
  return {
    ...template,
    severity: template.severity ?? getDefaultNotificationSeverity(template.eventType),
    enabledRoles: Array.isArray(template.enabledRoles) ? template.enabledRoles : [],
    active: template.active ?? true
  };
}

function isLegacyDefaultNotificationTemplate(template: NotificationTemplate): boolean {
  const legacyTemplate = legacyNotificationTemplateDefaults[template.id];

  return Boolean(
    legacyTemplate &&
      template.subject === legacyTemplate.subject &&
      template.body === legacyTemplate.body &&
      template.deliveryMode === legacyTemplate.deliveryMode
  );
}

function normalizeNotificationTemplates(templates: NotificationTemplate[]): NotificationTemplate[] {
  const normalizedTemplates = templates.map((template) => {
    const normalizedTemplate = normalizeNotificationTemplate(template);
    const defaultTemplate = defaultNotificationTemplates.find(
      (item) => item.id === normalizedTemplate.id || item.eventType === normalizedTemplate.eventType
    );

    if (!defaultTemplate || !isLegacyDefaultNotificationTemplate(normalizedTemplate)) {
      return normalizedTemplate;
    }

    return {
      ...defaultTemplate,
      id: normalizedTemplate.id,
      active: normalizedTemplate.active
    };
  });
  const existingDefaultEvents = new Set(
    normalizedTemplates
      .filter((template) => defaultNotificationTemplates.some((defaultTemplate) => defaultTemplate.eventType === template.eventType))
      .map((template) => template.eventType)
  );

  for (const defaultTemplate of defaultNotificationTemplates) {
    if (!existingDefaultEvents.has(defaultTemplate.eventType)) {
      normalizedTemplates.push(defaultTemplate);
      existingDefaultEvents.add(defaultTemplate.eventType);
    }
  }

  return normalizedTemplates;
}

function normalizePruSite(regionSites: RegionSiteConfig[], site?: string): string {
  const trimmedSite = site?.trim() ?? "";

  if (trimmedSite && trimmedSite !== ALL_SCOPE_LABEL && trimmedSite !== ALL_SCOPE_VALUE) {
    return trimmedSite;
  }

  return regionSites.find((regionSite) => regionSite.active)?.site ?? regionSites[0]?.site ?? "";
}

function normalizeProductConfigForSinglePruSites(
  product: ProductConfig,
  regionSites: RegionSiteConfig[]
): ProductConfig {
  const normalizedProduct = normalizeProductConfig(product);

  return {
    ...normalizedProduct,
    prus: normalizedProduct.prus.map((pru) => ({
      ...pru,
      site: normalizePruSite(regionSites, pru.site)
    }))
  };
}

function normalizeAdminConfig(config: AdminConfig): AdminConfig {
  const emptyConfig = createEmptyAdminConfig();
  const regionSites = Array.isArray(config.regionSites) ? config.regionSites : [];
  const rawPriorities = Array.isArray(config.priorities) ? config.priorities : [];
  const shouldMigrateLegacyPriorities = isLegacyDefaultPriorityConfig(rawPriorities);
  const priorities = shouldMigrateLegacyPriorities ? getJiraPriorityOptions() : rawPriorities;
  const roleDomains = Array.isArray(config.roleDomains)
    ? config.roleDomains.map((roleDomain) => normalizeRoleDomainConfig(roleDomain))
    : [];

  return {
    ...emptyConfig,
    ...config,
    users: Array.isArray(config.users) ? config.users : [],
    customRoles: Array.isArray(config.customRoles) ? config.customRoles : [],
    roleDomains,
    regionSites,
    products: Array.isArray(config.products)
      ? config.products.map((product) => normalizeProductConfigForSinglePruSites(product, regionSites))
      : [],
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
    notificationTemplates: normalizeNotificationTemplates(
      Array.isArray(config.notificationTemplates) ? config.notificationTemplates : []
    ),
    formTemplates: Array.isArray(config.formTemplates) ? config.formTemplates : [],
    deletedRoleKeys: Array.isArray(config.deletedRoleKeys) ? config.deletedRoleKeys : [],
    ticketTypeWorkflows: (Array.isArray(config.ticketTypeWorkflows) ? config.ticketTypeWorkflows : []).map((workflow) =>
      normalizeTicketTypeWorkflow(workflow)
    ),
    responsibilityMappings: dedupeResponsibilityMappings(
      Array.isArray(config.responsibilityMappings) ? config.responsibilityMappings : []
    ),
    integrations: {
      jira: {
        ...emptyConfig.integrations.jira,
        ...(config.integrations?.jira ?? {})
      },
      smtp: {
        ...emptyConfig.integrations.smtp,
        ...(config.integrations?.smtp ?? {})
      }
    }
  };
}

function getVisibleVisibilityOptions(role: RoleKey) {
  return commentVisibilityOptions.filter((option) => canView(role, option.value));
}

function formatLocalDateTime(date: Date): string {
  return formatLocalTimestamp(date);
}

function parseDateTimeValue(value: string): number {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return 0;
  }

  const normalizedValue = trimmedValue.includes("T")
    ? trimmedValue
    : /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)
      ? `${trimmedValue}T00:00:00`
      : trimmedValue.replace(" ", "T");
  const parsed = Date.parse(normalizedValue);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateTimeDisplay(value: string): string {
  const parsed = parseDateTimeValue(value);

  return parsed ? formatLocalTimestamp(new Date(parsed)) : value;
}

function formatReleaseDate(value?: string): string {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const parsedDate = Date.parse(trimmedValue);

  return Number.isNaN(parsedDate) ? trimmedValue : new Date(parsedDate).toISOString().slice(0, 10);
}

function formatReleaseDateDisplay(value?: string): string {
  const normalizedDate = formatReleaseDate(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return normalizedDate;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${normalizedDate}T00:00:00Z`));
}

function formatDateTimeLocalValue(date: Date): string {
  return date.toISOString().slice(0, 16);
}

function formatEscalationDueDate(value: string): string {
  return formatDateTimeDisplay(value);
}

function createEscalationDraftId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyEscalationPersonInput(): EscalationPersonInput {
  return {
    id: createEscalationDraftId("person"),
    name: "",
    email: "",
    role: "Manager"
  };
}

function createEmptyEscalationActionItemInput(): EscalationActionItemInput {
  return {
    id: createEscalationDraftId("action"),
    label: "",
    done: false
  };
}

function stripEscalationChecklistPrefix(value: string): string {
  return value.replace(/^\s*\[(?:x|X| )\]\s*/, "").trim();
}

function parseEscalationActionPlanItems(value?: string): EscalationActionItem[] {
  return htmlToPlainTextFallback(value ?? "")
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((line, index) => ({
      id: `action-${index}`,
      label: stripEscalationChecklistPrefix(line),
      done: /^\s*\[(?:x|X)\]/.test(line)
    }))
    .filter((item) => item.label);
}

function normalizeEscalationActionItems(
  actionItems?: EscalationActionItemInput[] | EscalationActionItem[],
  fallbackPlan?: string
): EscalationActionItem[] {
  const normalizedItems = (actionItems ?? [])
    .map((item, index) => ({
      id: item.id || `action-${index}`,
      label: stripEscalationChecklistPrefix(item.label),
      done: Boolean(item.done)
    }))
    .filter((item) => item.label);

  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  return parseEscalationActionPlanItems(fallbackPlan);
}

function formatEscalationActionItemsForStorage(items: EscalationActionItem[]): string {
  return items.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.label}`).join("\n");
}

function getEscalationActionItems(escalation: Ticket["escalations"][number]): EscalationActionItem[] {
  return normalizeEscalationActionItems(escalation.actionItems, escalation.actionPlan || escalation.mitigationPlan);
}

function normalizeEscalationPeople(
  people?: EscalationPersonInput[] | EscalationPerson[],
  managerName?: string,
  managerEmail?: string
): EscalationPerson[] {
  const seenKeys = new Set<string>();
  const normalizedPeople = [
    ...(people ?? []),
    managerName?.trim() || managerEmail?.trim()
      ? {
          id: "manager-primary",
          name: managerName?.trim() ?? "",
          email: managerEmail?.trim() ?? "",
          role: "Manager"
        }
      : undefined
  ]
    .filter((person): person is EscalationPersonInput | EscalationPerson => Boolean(person))
    .map((person, index) => ({
      id: person.id || `person-${index}`,
      name: person.name.trim(),
      email: person.email?.trim() ?? "",
      role: person.role?.trim() ?? ""
    }))
    .filter((person) => person.name || person.email)
    .filter((person) => {
      const key = (person.email || person.name).toLowerCase();

      if (seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    });

  return normalizedPeople;
}

function getEscalationPeople(escalation: Ticket["escalations"][number]): EscalationPerson[] {
  return normalizeEscalationPeople(escalation.people, escalation.managerName, escalation.managerEmail);
}

function getPrimaryEscalationPerson(people: EscalationPerson[]): EscalationPerson | undefined {
  return people.find((person) => person.email) ?? people[0];
}

function createDefaultEscalationInput(): NewEscalationInput {
  return {
    type: "technical",
    severity: "high",
    reason: "",
    impact: "",
    urgency: "",
    requestedAction: "",
    mitigationPlan: "",
    actionPlan: "",
    actionItems: [createEmptyEscalationActionItemInput()],
    meetingSeries: "",
    decisionMaker: "",
    managerName: "",
    managerEmail: "",
    people: [createEmptyEscalationPersonInput()],
    sendManagerInvite: false,
    dueAt: formatDateTimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000))
  };
}

function getEscalationStatusLabel(status: EscalationStatus): string {
  return escalationStatusOptions.find((option) => option.value === status)?.label ?? status.replace("_", " ");
}

function getEscalationStatusLane(status: EscalationStatus): (typeof escalationBoardColumns)[number]["id"] {
  const column = escalationBoardColumns.find((candidate) =>
    (candidate.statuses as readonly EscalationStatus[]).includes(status)
  );

  return column?.id ?? "new";
}

function getEscalationStatusTimestampLabel(value?: string): string {
  if (!value) {
    return "";
  }

  const parsed = parseDateTimeValue(value);

  if (!parsed) {
    return "";
  }

  return formatLocalTimestamp(new Date(parsed));
}

function normalizeId(value: string, prefix: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${prefix}-${normalized || Date.now()}`;
}

function getConfigProduct(config: AdminConfig, productName: string): ProductConfig | undefined {
  return config.products.find((product) => product.productName === productName && product.active);
}

function getConfigModuleForTicket(
  config: AdminConfig,
  productName: string,
  pruName: string,
  moduleName: string
): ProductModuleConfig | undefined {
  const normalizedPruName = pruName.trim().toLowerCase();
  const normalizedModuleName = moduleName.trim().toLowerCase();
  const pru = getConfigProduct(config, productName)?.prus.find(
    (candidate) => candidate.active && candidate.name.trim().toLowerCase() === normalizedPruName
  );

  return pru?.modules.find(
    (candidate) => candidate.active && candidate.name.trim().toLowerCase() === normalizedModuleName
  );
}

function getConfigProductById(config: AdminConfig, productId: string): ProductConfig | undefined {
  return config.products.find((product) => product.id === productId);
}

function getConfigUserName(config: AdminConfig, userId: string): string {
  return config.users.find((user) => user.id === userId)?.displayName ?? "Unassigned";
}

function getConfigProductName(config: AdminConfig, productId: string): string {
  if (productId === ALL_SCOPE_VALUE) {
    return "All products";
  }

  return getConfigProductById(config, productId)?.productName ?? productId;
}

function getConfigRegionSiteLabel(config: AdminConfig, siteId: string): string {
  if (siteId === ALL_SCOPE_VALUE) {
    return "All regions / sites";
  }

  return config.regionSites.find((site) => site.id === siteId)?.label ?? siteId;
}

function getConfigTicketTypeLabel(config: AdminConfig, typeId: string): string {
  return config.requestTypes.find((type) => type.id === typeId)?.label ?? getTicketTypeLabel(typeId);
}

function getWorkflowTemplateById(templateId: string): (typeof workflowTemplates)[number] | undefined {
  return workflowTemplates.find((template) => template.id === templateId);
}

function getWorkflowRouteForConfig(config: AdminConfig, ticketTypeId: string) {
  return config.ticketTypeWorkflows.find((item) => item.ticketTypeId === ticketTypeId && item.active);
}

function resolveWorkflowStepConfig(
  step: WorkflowTemplateStep,
  workflow?: { stepOverrides?: Record<string, Partial<WorkflowTemplateStep>> }
): WorkflowTemplateStep {
  const override = workflow?.stepOverrides?.[step.id] ?? {};

  return {
    ...step,
    ...override,
    label: override.label?.trim() || step.label,
    parallelGroup: override.parallelGroup?.trim() || undefined,
    workflowType: override.workflowType ?? step.workflowType ?? getDefaultWorkflowRoleType(override.ownerRole ?? step.ownerRole),
    slaHours: Number.isFinite(override.slaHours) ? Number(override.slaHours) : step.slaHours
  };
}

function buildDynamicWorkflowStepConfig(
  stepId: string,
  override?: Partial<WorkflowTemplateStep>
): WorkflowTemplateStep | undefined {
  if (!override) {
    return undefined;
  }

  const ownerRole = override.ownerRole ?? "requester";
  const workflowType = override.workflowType ?? getDefaultWorkflowRoleType(ownerRole);

  return {
    id: stepId,
    label: override.label?.trim() || `${getAdminRoleLabel(ownerRole)} ${getWorkflowRoleTypeLabel(workflowType)}`,
    ownerRole,
    workflowType,
    required: override.required ?? workflowType === "approval",
    parallelGroup: override.parallelGroup?.trim() || undefined,
    slaHours: Number.isFinite(override.slaHours) ? Number(override.slaHours) : 24,
    allowDelegation: override.allowDelegation ?? workflowType !== "inform",
    allowClarification: override.allowClarification ?? workflowType !== "inform"
  };
}

function getConfiguredWorkflowStepsForRoute(
  workflow?: {
    workflowTemplateId: string;
    stepIds: string[];
    stepOverrides?: Record<string, Partial<WorkflowTemplateStep>>;
  },
  config?: AdminConfig
): WorkflowTemplateStep[] {
  const route = workflow;
  const template = route ? getWorkflowTemplateById(route.workflowTemplateId) : undefined;

  if (!route || !template) {
    return [];
  }

  const configuredStepIds = route.stepIds?.length ? route.stepIds : template.steps.map((step) => step.id);

  const configuredSteps = configuredStepIds
    .map((stepId) => {
      const templateStep = template.steps.find((step) => step.id === stepId);

      return templateStep
        ? resolveWorkflowStepConfig(templateStep, route)
        : buildDynamicWorkflowStepConfig(stepId, route.stepOverrides?.[stepId]);
    })
    .filter((step): step is WorkflowTemplateStep => Boolean(step));

  if (!config) {
    return configuredSteps;
  }

  const configuredRoleKeys = new Set(getRoleOptions(config).map((role) => role.key));

  return configuredSteps.filter((step) => configuredRoleKeys.has(step.ownerRole));
}

function getConfiguredWorkflowStepsForTicketType(
  config: AdminConfig,
  ticketTypeId: string
): WorkflowTemplateStep[] {
  return getConfiguredWorkflowStepsForRoute(getWorkflowRouteForConfig(config, ticketTypeId), config);
}

function getDefaultWorkflowTemplateForConfig(
  config: AdminConfig,
  ticketTypeId: string
): (typeof workflowTemplates)[number] | undefined {
  const workflow = getWorkflowRouteForConfig(config, ticketTypeId);

  return workflow ? getWorkflowTemplateById(workflow.workflowTemplateId) : undefined;
}

function getSlaPolicyForConfig(config: AdminConfig, ticketTypeId: string) {
  const route = getWorkflowRouteForConfig(config, ticketTypeId);
  const template = getDefaultWorkflowTemplateForConfig(config, ticketTypeId);
  const escalationPolicyId = route?.escalationPolicyId ?? template?.escalationPolicyId;

  return config.escalationPolicies.find((policy) => policy.id === escalationPolicyId);
}

function getRegionForSite(config: AdminConfig, siteName: string): string {
  if (siteName === ALL_SCOPE_LABEL) {
    return ALL_SCOPE_LABEL;
  }

  return config.regionSites.find((site) => site.site === siteName && site.active)?.region ?? "";
}

function getReportRegionForTicket(config: AdminConfig, ticket: Ticket): string {
  return getRegionForSite(config, ticket.site) || "Unassigned region";
}

function getReportTicketTypeLabel(config: AdminConfig, ticket: Ticket): string {
  return getConfigTicketTypeLabel(config, ticket.typeId) || "Unassigned type";
}

function getReportValue(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function uniqueSortedReportValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function buildReportOptions(values: string[], allLabel: string): ReportOption[] {
  return [
    { value: REPORT_ALL_VALUE, label: allLabel },
    ...uniqueSortedReportValues(values).map((value) => ({ value, label: value }))
  ];
}

function buildReportBuckets(tickets: Ticket[], getLabel: (ticket: Ticket) => string): ReportBucket[] {
  const counts = new Map<string, number>();

  for (const ticket of tickets) {
    const label = getReportValue(getLabel(ticket), "Unassigned");

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const total = Math.max(tickets.length, 1);

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, value], index) => ({
      label,
      value,
      percentage: (value / total) * 100,
      color: reportChartColors[index % reportChartColors.length]
    }));
}

function filterAnalyticsReportTickets(
  tickets: Ticket[],
  config: AdminConfig,
  filters: AnalyticsReportFilters
): Ticket[] {
  return tickets.filter((ticket) => {
    if (filters.region !== REPORT_ALL_VALUE && getReportRegionForTicket(config, ticket) !== filters.region) {
      return false;
    }

    if (filters.site !== REPORT_ALL_VALUE && ticket.site !== filters.site) {
      return false;
    }

    if (filters.product !== REPORT_ALL_VALUE && ticket.product !== filters.product) {
      return false;
    }

    if (filters.pru !== REPORT_ALL_VALUE && ticket.pru !== filters.pru) {
      return false;
    }

    if (filters.typeId !== REPORT_ALL_VALUE && ticket.typeId !== filters.typeId) {
      return false;
    }

    if (filters.state !== REPORT_ALL_VALUE && ticket.state !== filters.state) {
      return false;
    }

    if (filters.priority !== REPORT_ALL_VALUE && ticket.priority !== filters.priority) {
      return false;
    }

    if (filters.slaState !== REPORT_ALL_VALUE && ticket.slaState !== filters.slaState) {
      return false;
    }

    return true;
  });
}

function analyticsReportFiltersMatch(left: AnalyticsReportFilters, right: AnalyticsReportFilters): boolean {
  return (
    left.region === right.region &&
    left.site === right.site &&
    left.product === right.product &&
    left.pru === right.pru &&
    left.typeId === right.typeId &&
    left.state === right.state &&
    left.priority === right.priority &&
    left.slaState === right.slaState
  );
}

function isBugReportTicket(config: AdminConfig, ticket: Ticket): boolean {
  return ticket.typeId === "bug" || getReportTicketTypeLabel(config, ticket).trim().toLowerCase() === "bug";
}

function getReportFilterLabel(options: ReportOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function getReportPieGradient(buckets: ReportBucket[]): string {
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);

  if (total === 0) {
    return "var(--surface-muted)";
  }

  let position = 0;
  const slices = buckets.map((bucket) => {
    const start = position;
    position += (bucket.value / total) * 100;

    return `${bucket.color} ${start.toFixed(2)}% ${position.toFixed(2)}%`;
  });

  return `conic-gradient(${slices.join(", ")})`;
}

function normalizeReleasePlanFieldLabel(value: string): string {
  return value
    .replace(/\s*\(template\)\s*$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isMissingReleasePlanValue(value?: string): boolean {
  const normalizedValue = value?.trim().toLowerCase() ?? "";

  return (
    !normalizedValue ||
    normalizedValue === "not provided" ||
    normalizedValue === "not selected" ||
    normalizedValue === "none" ||
    normalizedValue === "n/a"
  );
}

function getTicketDynamicFieldByLabels(ticket: Ticket, labels: string[]): string {
  const normalizedLabels = new Set(labels.map((label) => normalizeReleasePlanFieldLabel(label)));
  const matchedEntry = Object.entries(ticket.dynamicFields).find(([label, value]) => {
    return normalizedLabels.has(normalizeReleasePlanFieldLabel(label)) && !isMissingReleasePlanValue(value);
  });

  return matchedEntry?.[1]?.trim() ?? "";
}

function getReleasePlanVersion(ticket: Ticket): string {
  const fixVersion = ticket.jiraDraft.fixVersion?.trim() ?? "";

  if (fixVersion) {
    return fixVersion;
  }

  return getTicketDynamicFieldByLabels(ticket, releasePlanVersionFieldLabels) || releasePlanUnplannedLabel;
}

function getReleasePlanVersionDateLookupKey(projectKey: string, versionName: string): string {
  return `${projectKey.trim().toUpperCase()}::${normalizeMetadataName(versionName)}`;
}

function getReleasePlanVersionDate(
  ticket: Ticket,
  versionDateLookup?: ReleasePlanVersionDateLookup,
  config?: AdminConfig
): ReleasePlanVersionDate | undefined {
  const versionName = getReleasePlanVersion(ticket);

  if (!versionDateLookup || versionName === releasePlanUnplannedLabel) {
    return undefined;
  }

  const projectKey =
    getValidJiraProjectKey(ticket.jiraDraft.project) ||
    getValidJiraProjectKey(config?.integrations.jira.defaultProjectKey);

  if (projectKey) {
    const projectVersionDate = versionDateLookup.get(getReleasePlanVersionDateLookupKey(projectKey, versionName));

    if (projectVersionDate) {
      return projectVersionDate;
    }
  }

  return versionDateLookup.get(getReleasePlanVersionDateLookupKey("*", versionName));
}

function getReleasePlanDateValue(
  ticket: Ticket,
  dateKey: ReleasePlanDateKey,
  versionDateLookup?: ReleasePlanVersionDateLookup,
  config?: AdminConfig
): string {
  const versionDate = getReleasePlanVersionDate(ticket, versionDateLookup, config);

  if (dateKey === "preprod") {
    const dynamicPreprodDate = getTicketDynamicFieldByLabels(ticket, releasePlanPreprodFieldLabels);

    return dynamicPreprodDate || ticket.jiraDraft.fixVersionStartDate?.trim() || versionDate?.startDate || "";
  }

  const dynamicProdDate = getTicketDynamicFieldByLabels(ticket, releasePlanProdFieldLabels);

  return dynamicProdDate || ticket.jiraDraft.fixVersionReleaseDate?.trim() || versionDate?.releaseDate || "";
}

function formatReleasePlanDate(value: string): string {
  return isMissingReleasePlanValue(value) ? "Not planned" : formatReleaseDateDisplay(value);
}

function getReleasePlanSortDate(value: string): number {
  if (isMissingReleasePlanValue(value)) {
    return Number.MAX_SAFE_INTEGER;
  }

  const normalizedDate = formatReleaseDate(value);
  const parsedDate = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) ? `${normalizedDate}T00:00:00Z` : normalizedDate);

  return Number.isNaN(parsedDate) ? Number.MAX_SAFE_INTEGER : parsedDate;
}

function selectEarliestReleasePlanDate(values: string[]): string {
  const validValues = values.filter((value) => !isMissingReleasePlanValue(value));

  if (!validValues.length) {
    return "";
  }

  return [...validValues].sort((left, right) => getReleasePlanSortDate(left) - getReleasePlanSortDate(right))[0];
}

function getReleasePlanTicket(
  ticket: Ticket,
  versionDateLookup?: ReleasePlanVersionDateLookup,
  config?: AdminConfig
): ReleasePlanTicket {
  const sprintStatus = getTicketJiraFollowUpStatus(ticket);

  return {
    ticket,
    releaseVersion: getReleasePlanVersion(ticket),
    preprodDate: getReleasePlanDateValue(ticket, "preprod", versionDateLookup, config),
    prodDate: getReleasePlanDateValue(ticket, "prod", versionDateLookup, config),
    sprint: ticket.jiraDraft.sprint?.trim() || "No sprint",
    sprintStatus,
    sprintStatusLabel: getJiraFollowUpStatusLabel(sprintStatus),
    sprintStatusTone: getJiraFollowUpStatusTone(sprintStatus)
  };
}

function getTicketEstimateHours(ticket: Ticket): number {
  const estimateHours = ticket.jiraDraft.estimateHours;

  if (typeof estimateHours === "number" && Number.isFinite(estimateHours) && estimateHours > 0) {
    return estimateHours;
  }

  const storyPoints = ticket.jiraDraft.storyPoints;

  if (typeof storyPoints === "number" && Number.isFinite(storyPoints) && storyPoints > 0) {
    return storyPoints * 6;
  }

  return 0;
}

function getTicketRemainingHours(ticket: Ticket): number {
  const syncedRemainingHours = ticket.jiraDraft.remainingHours;

  if (typeof syncedRemainingHours === "number" && Number.isFinite(syncedRemainingHours) && syncedRemainingHours >= 0) {
    return syncedRemainingHours;
  }

  const estimateHours = getTicketEstimateHours(ticket);
  const status = getTicketJiraFollowUpStatus(ticket);

  if (estimateHours <= 0 || status === "done" || status === "rejected") {
    return 0;
  }

  if (status === "business_test") {
    return Math.ceil(estimateHours * 0.2);
  }

  if (status === "in_progress" || status === "it_test") {
    return Math.ceil(estimateHours * 0.5);
  }

  return estimateHours;
}

function getTicketResourceName(ticket: Ticket): string {
  const assignee = ticket.jiraDraft.assignee?.trim();

  if (assignee) {
    return assignee;
  }

  const activeStep = ticket.workflow.find((step) => step.status === "active" || step.status === "delegated");

  return activeStep?.ownerName?.trim() || "Unassigned";
}

function getSprintPlanLaneKey(item: ReleasePlanTicket): SprintPlanLaneKey {
  if (item.ticket.typeId === "feature_request") {
    return "feature";
  }

  if (item.sprintStatus === "business_test") {
    return "business_test";
  }

  if (item.sprintStatus === "in_progress" || item.sprintStatus === "it_test") {
    return "current";
  }

  return "planning";
}

function buildSprintPlanLane(key: SprintPlanLaneKey, tickets: ReleasePlanTicket[]): SprintPlanLane {
  const labels: Record<SprintPlanLaneKey, { label: string; description: string }> = {
    planning: {
      label: "Planning",
      description: "Backlog, ready, or waiting for work to start."
    },
    current: {
      label: "Current",
      description: "Implementation or IT validation is active."
    },
    business_test: {
      label: "Business test",
      description: "Business validation and acceptance are active."
    },
    feature: {
      label: "Feature sprint",
      description: "Feature requests planned for sprint delivery."
    }
  };

  return {
    key,
    label: labels[key].label,
    description: labels[key].description,
    tickets,
    totalEstimateHours: tickets.reduce((sum, item) => sum + getTicketEstimateHours(item.ticket), 0),
    remainingHours: tickets.reduce((sum, item) => sum + getTicketRemainingHours(item.ticket), 0),
    resources: uniqueSortedReportValues(tickets.map((item) => getTicketResourceName(item.ticket)))
  };
}

function buildSprintPlanGroups(
  tickets: Ticket[],
  versionDateLookup?: ReleasePlanVersionDateLookup,
  config?: AdminConfig,
  metadataSprints: ReleasePlanSprintMetadata[] = []
): SprintPlanGroup[] {
  const releaseTickets = tickets.map((ticket) => getReleasePlanTicket(ticket, versionDateLookup, config));
  const groups = new Map<string, { sprint: string; boardName: string; metadata?: ReleasePlanSprintMetadata; items: ReleasePlanTicket[] }>();

  for (const sprint of metadataSprints) {
    const boardName = sprint.boardName || "No product board";
    const groupKey = `${boardName}::${sprint.name}`;

    groups.set(groupKey, {
      sprint: sprint.name,
      boardName,
      metadata: sprint,
      items: groups.get(groupKey)?.items ?? []
    });
  }

  for (const item of releaseTickets) {
    const boardName = item.ticket.jiraDraft.board?.trim() || "No product board";
    const groupKey = `${boardName}::${item.sprint}`;
    const current = groups.get(groupKey) ?? {
      sprint: item.sprint,
      boardName,
      items: []
    };

    groups.set(groupKey, {
      ...current,
      items: [...current.items, item]
    });
  }

  return Array.from(groups.values())
    .map(({ sprint, boardName, metadata, items }) => {
      const laneKeys: SprintPlanLaneKey[] = ["planning", "current", "business_test", "feature"];
      const lanes = laneKeys.map((laneKey) =>
        buildSprintPlanLane(
          laneKey,
          items.filter((item) => getSprintPlanLaneKey(item) === laneKey)
        )
      );

      return {
        id: normalizeId(`${boardName}-${sprint}`, "sprint"),
        sprint,
        boardNames: uniqueSortedReportValues([boardName]),
        state: metadata?.state ?? "",
        startDate: metadata?.startDate ? formatDateTimeDisplay(metadata.startDate) : "",
        endDate: metadata?.endDate ? formatDateTimeDisplay(metadata.endDate) : "",
        releaseVersions: uniqueSortedReportValues(items.map((item) => item.releaseVersion)),
        totalEstimateHours: items.reduce((sum, item) => sum + getTicketEstimateHours(item.ticket), 0),
        remainingHours: items.reduce((sum, item) => sum + getTicketRemainingHours(item.ticket), 0),
        taskCount: items.length,
        resources: uniqueSortedReportValues(items.map((item) => getTicketResourceName(item.ticket))),
        lanes
      };
    })
    .sort((left, right) => {
      if (left.sprint === "No sprint") {
        return 1;
      }

      if (right.sprint === "No sprint") {
        return -1;
      }

      const boardCompare = left.boardNames.join(", ").localeCompare(right.boardNames.join(", "), undefined, { numeric: true });
      return boardCompare || left.sprint.localeCompare(right.sprint, undefined, { numeric: true });
    });
}

function buildReleasePlanGroups(
  tickets: Ticket[],
  versionDateLookup?: ReleasePlanVersionDateLookup,
  config?: AdminConfig
): ReleasePlanGroup[] {
  const groups = new Map<string, ReleasePlanTicket[]>();

  for (const ticket of tickets) {
    const releaseTicket = getReleasePlanTicket(ticket, versionDateLookup, config);
    const groupKey = releaseTicket.releaseVersion;

    groups.set(groupKey, [...(groups.get(groupKey) ?? []), releaseTicket]);
  }

  return Array.from(groups.entries())
    .map(([releaseVersion, releaseTickets]) => {
      const preprodDate = selectEarliestReleasePlanDate(releaseTickets.map((item) => item.preprodDate));
      const prodDate = selectEarliestReleasePlanDate(releaseTickets.map((item) => item.prodDate));
      const statusCounts = Array.from(
        releaseTickets.reduce((counts, item) => {
          const current = counts.get(item.sprintStatusLabel) ?? {
            label: item.sprintStatusLabel,
            value: 0,
            tone: item.sprintStatusTone
          };

          counts.set(item.sprintStatusLabel, { ...current, value: current.value + 1 });

          return counts;
        }, new Map<string, { label: string; value: number; tone: "info" | "warning" | "critical" | "success" }>())
      )
        .map(([, value]) => value)
        .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));

      return {
        id: normalizeId(releaseVersion, "release"),
        releaseVersion,
        preprodDate,
        prodDate,
        sortDate: Math.min(getReleasePlanSortDate(preprodDate), getReleasePlanSortDate(prodDate)),
        tickets: [...releaseTickets].sort((left, right) => {
          const statusCompare = left.sprintStatusLabel.localeCompare(right.sprintStatusLabel);

          return statusCompare || right.ticket.key.localeCompare(left.ticket.key, undefined, { numeric: true });
        }),
        sprintNames: uniqueSortedReportValues(releaseTickets.map((item) => item.sprint)),
        statusCounts
      };
    })
    .sort((left, right) => {
      if (left.sortDate !== right.sortDate) {
        return left.sortDate - right.sortDate;
      }

      if (left.releaseVersion === releasePlanUnplannedLabel) {
        return 1;
      }

      if (right.releaseVersion === releasePlanUnplannedLabel) {
        return -1;
      }

      return left.releaseVersion.localeCompare(right.releaseVersion, undefined, { numeric: true });
    });
}

function getFormTemplateForTicket(
  config: AdminConfig,
  productName: string,
  requestTypeId: string
): ProductFormTemplate | undefined {
  return config.formTemplates.find(
    (template) =>
      template.active &&
      template.productName === productName &&
      template.requestTypeId === requestTypeId
  );
}

function buildDefaultNewTicketForm(): NewTicketFormState {
  return {
    title: "",
    typeId: "",
    region: "",
    pru: "",
    site: "",
    product: "",
    module: "",
    priority: "",
    risk: "",
    description: "",
    businessImpact: "",
    labels: "",
    expectedCompletionDate: "",
    attachments: [],
    dynamicAnswers: {}
  };
}

function toClassName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function toJiraLabelValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function getSlaLabel(state: SlaState): string {
  if (state === "healthy") {
    return "Healthy";
  }

  if (state === "watch") {
    return "Watch";
  }

  if (state === "breach") {
    return "Breach";
  }

  return "Paused";
}

function parseTicketTimestamp(value: string): number {
  return parseDateTimeValue(value);
}

function formatTicketListDate(value: string): string {
  return formatDateTimeDisplay(value);
}

function formatTicketCommentTimestamp(value: string): string {
  return formatDateTimeDisplay(value);
}

function getTicketSubmitter(ticket: Ticket): string {
  return (
    ticket.comments.find((comment) => comment.source === "portal")?.author ??
    ticket.comments[0]?.author ??
    ticket.audit.find((entry) => entry.eventType === "Ticket created")?.actor ??
    ticket.audit[0]?.actor ??
    ticket.dynamicFields["User role"] ??
    "Unknown"
  );
}

function personaTextMatchesCandidate(persona: RolePersonaOption, candidate?: string): boolean {
  const normalizedCandidate = candidate?.trim().toLowerCase() ?? "";

  if (!normalizedCandidate) {
    return false;
  }

  return [persona.displayName, persona.email, persona.initials]
    .filter(Boolean)
    .some((value) => {
      const normalizedValue = value.trim().toLowerCase();

      return (
        normalizedCandidate === normalizedValue ||
        normalizedCandidate.startsWith(`${normalizedValue} (`)
      );
    });
}

function ticketWasSubmittedByPersona(ticket: Ticket, persona: RolePersonaOption): boolean {
  const createdComment = ticket.comments.find((comment) => comment.source === "portal");
  const createdAudit = ticket.audit.find((entry) => entry.eventType === "Ticket created");

  return [
    getTicketSubmitter(ticket),
    createdComment?.author,
    createdAudit?.actor
  ].some((candidate) => personaTextMatchesCandidate(persona, candidate));
}

function normalizeRoleText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRoleToneText(value: string): string {
  return normalizeRoleText(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizeClarificationRoleText(value: string): string {
  const normalized = normalizeRoleToneText(value);

  return normalized === "requester" ? "user" : normalized;
}

function roleTextMatches(roleLabel: string, value?: string): boolean {
  return Boolean(value && normalizeRoleText(value) === normalizeRoleText(roleLabel));
}

function scopeMatchesValue(values: string[], candidate?: string): boolean {
  if (!values.length || values.includes(ALL_SCOPE_VALUE)) {
    return true;
  }

  return Boolean(candidate && values.includes(candidate));
}

function scopeMatchesAnyValue(values: string[], candidates: Array<string | undefined>): boolean {
  if (!values.length || values.includes(ALL_SCOPE_VALUE)) {
    return true;
  }

  const normalizedCandidates = new Set(candidates.filter(Boolean));

  return values.some((value) => normalizedCandidates.has(value));
}

function isGlobalScopeText(value?: string): boolean {
  const normalized = value?.trim().toLowerCase();

  return !normalized || normalized === ALL_SCOPE_LABEL.toLowerCase() || normalized === ALL_SCOPE_VALUE || normalized === "global";
}

type TicketScope = Pick<Ticket, "product" | "pru" | "site">;

function getTicketSiteConfig(config: AdminConfig, ticket: Pick<Ticket, "site">): RegionSiteConfig | undefined {
  return config.regionSites.find(
    (site) =>
      site.site === ticket.site ||
      site.label === ticket.site ||
      `${site.region} - ${site.site}` === ticket.site
  );
}

function getTicketProductScopeCandidates(config: AdminConfig, ticket: Pick<Ticket, "product">): string[] {
  const product = getConfigProduct(config, ticket.product) ?? getConfigProductById(config, ticket.product);

  return [product?.id, product?.productName, ticket.product].filter((value): value is string => Boolean(value));
}

function getTicketSiteScopeCandidates(config: AdminConfig, ticket: Pick<Ticket, "site">): string[] {
  const siteConfig = getTicketSiteConfig(config, ticket);

  return [
    ticket.site,
    siteConfig?.site,
    siteConfig?.label,
    siteConfig ? `${siteConfig.region} - ${siteConfig.site}` : undefined
  ].filter((value): value is string => Boolean(value));
}

function adminUserHasRole(user: AdminUser, role: RoleKey): boolean {
  return user.primaryRole === role || user.actionRoles.includes(role);
}

function adminUserScopeMatchesTicket(user: AdminUser, ticket: TicketScope, config: AdminConfig): boolean {
  const productMatches = scopeMatchesAnyValue(user.productIds, getTicketProductScopeCandidates(config, ticket));
  const pruMatches = scopeMatchesValue(user.pruNames, ticket.pru);
  const hasSpecificPruScope = Boolean(user.pruNames.length && !user.pruNames.includes(ALL_SCOPE_VALUE));

  if (!productMatches || !pruMatches) {
    return false;
  }

  if (hasSpecificPruScope || isGlobalScopeText(user.site)) {
    return true;
  }

  return scopeMatchesAnyValue([user.site], getTicketSiteScopeCandidates(config, ticket));
}

function getAdminUserScopeScore(user: AdminUser, ticket: TicketScope, config: AdminConfig, role: RoleKey): number {
  const productCandidates = getTicketProductScopeCandidates(config, ticket);
  const siteCandidates = getTicketSiteScopeCandidates(config, ticket);
  const hasProductSpecificScope =
    user.productIds.length > 0 &&
    !user.productIds.includes(ALL_SCOPE_VALUE) &&
    user.productIds.some((productId) => productCandidates.includes(productId));
  const hasPruSpecificScope =
    user.pruNames.length > 0 &&
    !user.pruNames.includes(ALL_SCOPE_VALUE) &&
    user.pruNames.includes(ticket.pru);
  const hasSiteSpecificScope = !isGlobalScopeText(user.site) && siteCandidates.includes(user.site);

  return (
    (hasProductSpecificScope ? 100 : 0) +
    (hasPruSpecificScope ? 30 : 0) +
    (hasSiteSpecificScope ? 10 : 0) +
    (user.primaryRole === role ? 1 : 0)
  );
}

function getMappedWorkflowOwnerName(
  config: AdminConfig,
  ticket: TicketScope,
  ownerRole: RoleKey
): string | undefined {
  const product = getConfigProduct(config, ticket.product) ?? getConfigProductById(config, ticket.product);

  if (ownerRole === "local_product_owner") {
    const pru = product?.prus.find((candidate) => candidate.name === ticket.pru && candidate.active);
    const localOwnerName = pru?.localProductOwnerId ? getConfigUserName(config, pru.localProductOwnerId) : "";

    if (localOwnerName && localOwnerName !== "Unassigned") {
      return localOwnerName;
    }
  }

  const matchingUsers = config.users
    .filter((user) => user.active && adminUserHasRole(user, ownerRole) && adminUserScopeMatchesTicket(user, ticket, config))
    .sort((left, right) => {
      const scoreDifference =
        getAdminUserScopeScore(right, ticket, config, ownerRole) -
        getAdminUserScopeScore(left, ticket, config, ownerRole);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.displayName.localeCompare(right.displayName);
    });

  if (matchingUsers[0]) {
    return matchingUsers[0].displayName;
  }

  if (ownerRole === "global_product_owner" && product?.productOwnerName.trim()) {
    return product.productOwnerName.trim();
  }

  return undefined;
}

function personaDirectScopeMatchesTicket(
  persona: RolePersonaOption,
  ticket: Ticket,
  config: AdminConfig
): boolean {
  const productMatches = scopeMatchesAnyValue(persona.productIds, getTicketProductScopeCandidates(config, ticket));
  const hasSpecificPruScope = Boolean(persona.pruNames.length && !persona.pruNames.includes(ALL_SCOPE_VALUE));
  const pruMatches = scopeMatchesValue(persona.pruNames, ticket.pru);

  if (!productMatches || !pruMatches) {
    return false;
  }

  if (hasSpecificPruScope || isGlobalScopeText(persona.site)) {
    return true;
  }

  return scopeMatchesAnyValue([persona.site], getTicketSiteScopeCandidates(config, ticket));
}

function personaMappingScopeMatchesTicket(
  persona: RolePersonaOption,
  ticket: Ticket,
  config: AdminConfig
): boolean {
  if (!persona.userId) {
    return false;
  }

  return config.responsibilityMappings.some(
    (mapping) =>
      mapping.active &&
      mapping.userIds.includes(persona.userId as string) &&
      getResponsibilityMappingRoles(mapping).includes(persona.role) &&
      responsibilityMappingMatchesTicket(mapping, ticket, config)
  );
}

function personaCanActOnTicket(
  persona: RolePersonaOption,
  ticket: Ticket,
  config: AdminConfig
): boolean {
  if (persona.role === "admin" || persona.assignment === "fallback") {
    return true;
  }

  return (
    personaDirectScopeMatchesTicket(persona, ticket, config) ||
    personaMappingScopeMatchesTicket(persona, ticket, config)
  );
}

function responsibilityMappingMatchesTicket(
  mapping: ResponsibilityMappingConfig,
  ticket: Ticket,
  config: AdminConfig
): boolean {
  const productId = getConfigProduct(config, ticket.product)?.id;
  const siteId = getTicketSiteConfig(config, ticket)?.id;

  return (
    scopeMatchesValue(mapping.productIds, productId) &&
    scopeMatchesValue(mapping.regionSiteIds, siteId) &&
    scopeMatchesValue(mapping.pruNames, ticket.pru)
  );
}

function roleHasConfiguredTicketScope(ticket: Ticket, role: RoleKey, config: AdminConfig): boolean {
  return config.responsibilityMappings.some(
    (mapping) =>
      mapping.active &&
      getResponsibilityMappingRoles(mapping).includes(role) &&
      responsibilityMappingMatchesTicket(mapping, ticket, config)
  );
}

function roleHasParticipantAccess(ticket: Ticket, roleLabel: string): boolean {
  return ticket.participants.some(
    (participant) =>
      roleTextMatches(roleLabel, participant.role) || roleTextMatches(roleLabel, participant.name)
  );
}

function roleHasTicketAccess(ticket: Ticket, role: RoleKey, config: AdminConfig): boolean {
  if (role === "admin") {
    return true;
  }

  const roleLabel = getConfigRoleLabel(config, role);

  return (
    roleTextMatches(roleLabel, getTicketSubmitter(ticket)) ||
    roleTextMatches(roleLabel, ticket.dynamicFields["User role"]) ||
    ticket.workflow.some((step) => step.ownerRole === role) ||
    ticket.clarifications.some(
      (thread) => roleMatchesClarificationAssignee(role, thread.assignedTo) || roleMatchesClarificationRequester(role, thread)
    ) ||
    ticket.escalations.some((escalation) => roleTextMatches(roleLabel, escalation.decisionMaker)) ||
    (canCreateJiraForTicket(ticket) && isJiraReadyToCreateNotificationRole(role)) ||
    roleHasParticipantAccess(ticket, roleLabel) ||
    roleHasConfiguredTicketScope(ticket, role, config)
  );
}

function getRoleScopedTickets(tickets: Ticket[], role: RoleKey, config: AdminConfig): Ticket[] {
  return tickets.filter((ticket) => roleHasTicketAccess(ticket, role, config));
}

function getClarificationRequesterRole(thread: Ticket["clarifications"][number]): string {
  return thread.messages[0]?.role ?? thread.requestedBy;
}

function getLastClarificationMessage(thread: Ticket["clarifications"][number]) {
  return thread.messages[thread.messages.length - 1];
}

function getRoleToneClass(roleLabel: string): string {
  const normalized = normalizeRoleToneText(roleLabel);

  switch (normalized) {
    case "requester":
    case "user":
      return "role-user";
    case "local product owner":
      return "role-local-product-owner";
    case "global product owner":
      return "role-global-product-owner";
    case "business architect":
      return "role-business-architect";
    case "software architect":
      return "role-software-architect";
    case "release manager":
      return "role-release-manager";
    case "developer":
      return "role-developer";
    case "it reviewer":
      return "role-it-reviewer";
    case "security reviewer":
      return "role-security-reviewer";
    case "admin":
      return "role-admin";
    default: {
      const hash = Array.from(normalized || "custom-role").reduce((sum, character) => sum + character.charCodeAt(0), 0);

      return `role-tone-${hash % 6}`;
    }
  }
}

function getClarificationMessageActionLabel(
  thread: ClarificationThreadRecord,
  message: ClarificationTimelineMessage
): "Asked by" | "Answered by" {
  const messageRole = normalizeClarificationRoleText(message.role);
  const requesterRole = normalizeClarificationRoleText(getClarificationRequesterRole(thread));

  if (messageRole === requesterRole) {
    return "Asked by";
  }

  return "Answered by";
}

function getClarificationThreadUpdatedAt(thread: ClarificationThreadRecord): number {
  const lastMessage = getLastClarificationMessage(thread);

  return parseTicketTimestamp(lastMessage?.createdAt ?? thread.dueAt);
}

function compareClarificationTimelineEntriesNewestFirst(
  left: ClarificationTimelineEntry,
  right: ClarificationTimelineEntry
): number {
  const createdAtDifference = right.createdAtMs - left.createdAtMs;

  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return right.message.id.localeCompare(left.message.id);
}

function getClarificationGroupStatus(threads: ClarificationThreadRecord[]): ClarificationThreadRecord["status"] {
  if (threads.some((thread) => thread.status === "reopened")) {
    return "reopened";
  }

  if (threads.some((thread) => thread.status === "open")) {
    return "open";
  }

  return "answered";
}

function getClarificationGroupDueAt(threads: ClarificationThreadRecord[]): string {
  const activeThreads = threads.filter((thread) => thread.status !== "answered");
  const candidateThreads = activeThreads.length > 0 ? activeThreads : threads;

  return [...candidateThreads].sort(
    (left, right) => parseTicketTimestamp(left.dueAt) - parseTicketTimestamp(right.dueAt)
  )[0]?.dueAt ?? "";
}

function buildClarificationThreadGroups(ticket: Ticket): ClarificationThreadGroup[] {
  const groupedThreads = new Map<string, ClarificationThreadRecord[]>();

  for (const thread of ticket.clarifications) {
    const groupId = normalizeRoleText(thread.level || "Clarification");
    groupedThreads.set(groupId, [...(groupedThreads.get(groupId) ?? []), thread]);
  }

  return Array.from(groupedThreads.entries())
    .map(([groupId, threads]) => {
      const sortedThreads = [...threads].sort(
        (left, right) => getClarificationThreadUpdatedAt(right) - getClarificationThreadUpdatedAt(left)
      );
      const timeline = sortedThreads
        .flatMap((thread) =>
          thread.messages.map((message) => ({
            thread,
            message,
            createdAtMs: parseTicketTimestamp(message.createdAt)
          }))
        )
        .sort(compareClarificationTimelineEntriesNewestFirst);
      const visibleTimeline = timeline.filter(
        (entry) => !isDuplicateInitialClarificationMessage(entry.thread, entry.message)
      );
      const latestTimelineEntry = visibleTimeline[0] ?? timeline[0];

      return {
        id: `${ticket.key}-${groupId}`,
        level: sortedThreads[0]?.level ?? "Clarification",
        status: getClarificationGroupStatus(sortedThreads),
        dueAt: getClarificationGroupDueAt(sortedThreads),
        latestUpdatedAt: latestTimelineEntry?.message.createdAt ?? sortedThreads[0]?.dueAt ?? ticket.updatedAt,
        threads: sortedThreads,
        timeline
      };
    })
    .sort((left, right) => parseTicketTimestamp(right.latestUpdatedAt) - parseTicketTimestamp(left.latestUpdatedAt));
}

function formatClarificationTimestamp(value: string): string {
  const parsed = parseTicketTimestamp(value);

  if (!parsed) {
    return value;
  }

  return formatLocalDateTime(new Date(parsed));
}

function getPlainTextSnippet(value: string, maxLength = 70): string {
  const plainText = htmlToPlainTextFallback(value).replace(/\s+/g, " ").trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength - 3).trim()}...`;
}

function isApprovalClarificationThread(thread: ClarificationThreadRecord): boolean {
  return normalizeRoleText(thread.level) === normalizeRoleText("Approval clarification");
}

function stripGeneratedApprovalClarificationContext(value: string): string {
  const html = normalizeRichTextForStorage(value, "html");
  const plainText = htmlToPlainTextFallback(html);

  if (!html || !plainText.includes("Approval context")) {
    return html;
  }

  const markerMatch = /question\s*\/\s*approval need:/i.exec(plainText);

  if (!markerMatch) {
    return html;
  }

  const tail = plainText
    .slice(markerMatch.index + markerMatch[0].length)
    .trim()
    .replace(/^Please provide the missing information needed to decide this approval\./i, "")
    .trim();

  return normalizeRichTextForStorage(tail);
}

function getClarificationDisplayBody(thread: ClarificationThreadRecord, value: string): string {
  return isApprovalClarificationThread(thread) ? stripGeneratedApprovalClarificationContext(value) || value : value;
}

function richTextComparableValue(value: string): string {
  return htmlToPlainTextFallback(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function isDuplicateInitialClarificationMessage(
  thread: ClarificationThreadRecord,
  message: ClarificationTimelineMessage
): boolean {
  const initialMessage = thread.messages[0];

  if (message.id !== initialMessage?.id) {
    return false;
  }

  return (
    richTextComparableValue(getClarificationDisplayBody(thread, message.body)) ===
    richTextComparableValue(getClarificationDisplayBody(thread, thread.question))
  );
}

function getClarificationReplyTargetLabel(thread: ClarificationThreadRecord, index: number): string {
  const question = getPlainTextSnippet(getClarificationDisplayBody(thread, thread.question));
  const latestMessage = getLastClarificationMessage(thread);
  const timestamp = latestMessage ? formatClarificationTimestamp(latestMessage.createdAt) : formatDateTimeDisplay(thread.dueAt);
  const requesterRole = getClarificationRequesterRole(thread);
  const latestRole = latestMessage?.role ?? requesterRole;

  return `${index + 1}. ${thread.status} · asked by ${requesterRole} · latest ${latestRole} · ${question || thread.level} · ${timestamp}`;
}

function getClarificationAssigneeLabels(assignedTo: string): string[] {
  const labels = assignedTo
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

  return labels.length > 0 ? labels : assignedTo.trim() ? [assignedTo.trim()] : [];
}

function getUniqueClarificationAssigneeLabels(labels: string[]): string[] {
  const seenLabels = new Set<string>();
  const uniqueLabels: string[] = [];

  for (const label of labels) {
    const normalizedLabel = normalizeClarificationRoleText(label);

    if (!normalizedLabel || seenLabels.has(normalizedLabel)) {
      continue;
    }

    seenLabels.add(normalizedLabel);
    uniqueLabels.push(label);
  }

  return uniqueLabels;
}

function roleMatchesClarificationAssignee(role: RoleKey, assignedTo: string): boolean {
  if (role === "admin") {
    return true;
  }

  const roleLabel = normalizeClarificationRoleText(getAdminRoleLabel(role));

  return getClarificationAssigneeLabels(assignedTo).some(
    (assignee) => normalizeClarificationRoleText(assignee) === roleLabel
  );
}

function clarificationRoleHasAnswered(thread: Ticket["clarifications"][number], role: RoleKey): boolean {
  const roleLabel = normalizeClarificationRoleText(getAdminRoleLabel(role));

  return thread.messages
    .slice(1)
    .some((message) => normalizeClarificationRoleText(message.role) === roleLabel);
}

function allClarificationAssigneesAnswered(
  thread: Ticket["clarifications"][number],
  replyingRole: RoleKey
): boolean {
  const answeredRoles = new Set(
    thread.messages.slice(1).map((message) => normalizeClarificationRoleText(message.role))
  );
  answeredRoles.add(normalizeClarificationRoleText(getAdminRoleLabel(replyingRole)));

  return getClarificationAssigneeLabels(thread.assignedTo).every((assignee) =>
    answeredRoles.has(normalizeClarificationRoleText(assignee))
  );
}

function roleMatchesClarificationRequester(role: RoleKey, thread: Ticket["clarifications"][number]): boolean {
  if (role === "admin") {
    return true;
  }

  return normalizeRoleText(getClarificationRequesterRole(thread)) === normalizeRoleText(getAdminRoleLabel(role));
}

function clarificationNeedsRoleAttention(thread: Ticket["clarifications"][number], role: RoleKey): boolean {
  if (thread.status === "answered") {
    return false;
  }

  return roleMatchesClarificationAssignee(role, thread.assignedTo) && !clarificationRoleHasAnswered(thread, role);
}

function getClarificationAttentionCount(tickets: Ticket[], role: RoleKey): number {
  return tickets.reduce(
    (count, ticket) =>
      count + buildClarificationThreadGroups(ticket).filter((group) =>
        group.threads.some((clarification) => clarificationNeedsRoleAttention(clarification, role))
      ).length,
    0
  );
}

function clarificationNotificationTargetsRole(
  thread: Ticket["clarifications"][number],
  role: RoleKey
): boolean {
  const latestMessage = getLastClarificationMessage(thread);

  if (!latestMessage) {
    return false;
  }

  const latestRole = normalizeClarificationRoleText(latestMessage.role);
  const requesterRole = normalizeClarificationRoleText(getClarificationRequesterRole(thread));
  const latestMessageIsFromRequester = latestRole === requesterRole;

  if (thread.status !== "answered" && roleMatchesClarificationAssignee(role, thread.assignedTo)) {
    return !clarificationRoleHasAnswered(thread, role);
  }

  return latestMessageIsFromRequester
    ? roleMatchesClarificationAssignee(role, thread.assignedTo)
    : roleMatchesClarificationRequester(role, thread);
}

function personaCanReceiveClarificationNotification(
  config: AdminConfig,
  persona: RolePersonaOption,
  ticket: Ticket,
  thread: Ticket["clarifications"][number]
): boolean {
  if (!clarificationNotificationTargetsRole(thread, persona.role)) {
    return false;
  }

  if (persona.role === "requester" || persona.role === "admin") {
    return true;
  }

  return personaCanActOnTicket(persona, ticket, config);
}

function buildClarificationNotifications(
  tickets: Ticket[],
  role: RoleKey,
  selectedPersona: RolePersonaOption,
  config: AdminConfig
): NotificationItem[] {
  return tickets
    .filter((ticket) => ticket.state !== "closed")
    .flatMap((ticket) =>
      ticket.clarifications.flatMap((thread) => {
        const latestMessage = getLastClarificationMessage(thread);

        if (!latestMessage || !personaCanReceiveClarificationNotification(config, selectedPersona, ticket, thread)) {
          return [];
        }

        const messageRoleMatchesCurrentRole =
          normalizeClarificationRoleText(latestMessage.role) ===
          normalizeClarificationRoleText(getConfigRoleLabel(config, role));

        if (messageRoleMatchesCurrentRole) {
          return [];
        }

        const isInformThread = normalizeRoleText(thread.level) === normalizeRoleText(getPullInActionOption("inform").level);
        const latestRole = normalizeClarificationRoleText(latestMessage.role);
        const requesterRole = normalizeClarificationRoleText(getClarificationRequesterRole(thread));
        const latestMessageIsFromRequester = latestRole === requesterRole;
        const title = isInformThread
          ? "Information shared"
          : thread.status === "open" && latestMessageIsFromRequester
            ? "Clarification requested"
            : thread.status === "answered"
              ? "Clarification answered"
              : "Clarification updated";

        return [
          {
            id: `notification-${ticket.key}-${latestMessage.id}`,
            title,
            body: `${latestMessage.author} ${isInformThread ? "shared" : "replied"}: ${getPlainTextSnippet(latestMessage.body, 110)}`,
            ticketKey: ticket.key,
            actionLabel: "Open clarification",
            visibility: "public" as VisibilityLevel,
            createdAt: formatClarificationTimestamp(latestMessage.createdAt),
            unread: true
          }
        ];
      })
    )
    .sort((left, right) => parseTicketTimestamp(right.createdAt) - parseTicketTimestamp(left.createdAt));
}

function personaCanReceiveJiraReadyNotification(
  config: AdminConfig,
  persona: RolePersonaOption,
  ticket: Ticket
): boolean {
  return (
    isJiraReadyToCreateNotificationRole(persona.role) &&
    roleHasTicketAccess(ticket, persona.role, config)
  );
}

function buildJiraReadyToCreateNotifications(
  tickets: Ticket[],
  selectedPersona: RolePersonaOption,
  config: AdminConfig
): NotificationItem[] {
  return tickets
    .filter((ticket) => canCreateJiraForTicket(ticket))
    .filter((ticket) => personaCanReceiveJiraReadyNotification(config, selectedPersona, ticket))
    .map((ticket) => ({
      id: `notification-${ticket.key}-jira-ready-to-create`,
      title: "Jira creation ready",
      body: `${ticket.key} is approved and ready for Jira creation.`,
      ticketKey: ticket.key,
      actionLabel: "Create Jira",
      visibility: "architecture_only" as VisibilityLevel,
      createdAt: ticket.updatedAt,
      unread: true
    }))
    .sort((left, right) => parseTicketTimestamp(right.createdAt) - parseTicketTimestamp(left.createdAt));
}

function notificationDeliveryModeSendsEmail(deliveryMode: NotificationDeliveryMode): boolean {
  return deliveryMode === "emailOnly" || deliveryMode === "inAppAndEmail";
}

function renderNotificationTemplateWithContext(value: string, context: Record<string, string>): string {
  return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, token: string) => context[token] ?? match);
}

function escapeNotificationHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSafeNotificationLinkUrl(value?: string): string {
  const trimmedValue = value?.trim() ?? "";

  if (!trimmedValue) {
    return "";
  }

  try {
    const url = new URL(trimmedValue);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function linkNotificationText(value: string, links: Array<{ text: string; url: string }>): string {
  const validLinks = links
    .map((link) => ({
      text: link.text.trim(),
      url: getSafeNotificationLinkUrl(link.url)
    }))
    .filter((link) => link.text && link.url)
    .sort((left, right) => right.text.length - left.text.length);

  if (!validLinks.length) {
    return escapeNotificationHtml(value);
  }

  const linkPattern = new RegExp(validLinks.map((link) => escapeRegExp(link.text)).join("|"), "gi");
  let html = "";
  let previousIndex = 0;

  for (const match of value.matchAll(linkPattern)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? 0;
    const link = validLinks.find((candidate) => candidate.text.toLowerCase() === matchedText.toLowerCase());

    if (!link) {
      continue;
    }

    html += escapeNotificationHtml(value.slice(previousIndex, matchIndex));
    html += `<a href="${escapeNotificationHtml(link.url)}">${escapeNotificationHtml(matchedText)}</a>`;
    previousIndex = matchIndex + matchedText.length;
  }

  html += escapeNotificationHtml(value.slice(previousIndex));

  return html;
}

function renderNotificationEmailHtmlBody(
  body: string,
  context: Record<string, string>
): string {
  const ticketUrl = getSafeNotificationLinkUrl(context.ticketUrl || context.portalUrl);
  const portalHomeUrl = getSafeNotificationLinkUrl(context.portalHomeUrl);
  const links = [
    { text: context.ticketKey, url: ticketUrl },
    { text: "Support Portal", url: portalHomeUrl },
    { text: context.ticketUrl, url: ticketUrl },
    { text: context.portalUrl, url: ticketUrl },
    { text: context.portalHomeUrl, url: portalHomeUrl }
  ];
  const bodyHtml = body
    .split(/\r?\n/)
    .map((line) =>
      line.trim()
        ? `<p style="margin:0 0 14px 0;">${linkNotificationText(line, links)}</p>`
        : `<div style="height:8px;line-height:8px;">&nbsp;</div>`
    )
    .join("\n");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2933;">
    ${bodyHtml}
  </body>
</html>`;
}

function getWorkflowStepEmailRecipients(
  config: AdminConfig,
  ticket: Ticket,
  step: Ticket["workflow"][number]
): NotificationEmailRecipient[] {
  const specificRecipients = new Map<string, NotificationEmailRecipient>();
  const fallbackRecipients = new Map<string, NotificationEmailRecipient>();
  const product = getConfigProduct(config, ticket.product) ?? getConfigProductById(config, ticket.product);

  function addUser(target: Map<string, NotificationEmailRecipient>, user?: AdminUser) {
    const email = user?.email.trim();

    if (!user?.active || !email || !isValidEmailAddress(email)) {
      return;
    }

    target.set(email.toLowerCase(), {
      name: user.displayName,
      email
    });
  }

  if (step.ownerRole === "local_product_owner") {
    const pru = product?.prus.find((candidate) => candidate.name === ticket.pru && candidate.active);
    addUser(specificRecipients, config.users.find((user) => user.id === pru?.localProductOwnerId));
  }

  if (step.ownerRole === "global_product_owner" && product?.productOwnerName.trim()) {
    addUser(specificRecipients, config.users.find((user) => user.displayName === product.productOwnerName.trim()));
  }

  if (step.ownerName && step.ownerName !== "Unassigned") {
    addUser(specificRecipients, config.users.find((user) => user.displayName === step.ownerName));
  }

  if (specificRecipients.size > 0) {
    return Array.from(specificRecipients.values());
  }

  config.users
    .filter((user) => user.active && adminUserHasRole(user, step.ownerRole) && adminUserScopeMatchesTicket(user, ticket, config))
    .sort((left, right) => {
      const scoreDifference =
        getAdminUserScopeScore(right, ticket, config, step.ownerRole) -
        getAdminUserScopeScore(left, ticket, config, step.ownerRole);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.displayName.localeCompare(right.displayName);
    })
    .forEach((user) => addUser(fallbackRecipients, user));

  return Array.from(fallbackRecipients.values());
}

function getJiraReadyToCreateEmailRecipients(
  config: AdminConfig,
  ticket: Ticket,
  enabledRoles: RoleKey[]
): NotificationEmailRecipient[] {
  const allowedRoles = Array.from(
    new Set(enabledRoles.filter((role) => isJiraReadyToCreateNotificationRole(role)))
  );
  const recipients = new Map<string, NotificationEmailRecipient>();

  function addUser(user: AdminUser) {
    const email = user.email.trim();

    if (!user.active || !email || !isValidEmailAddress(email)) {
      return;
    }

    recipients.set(email.toLowerCase(), {
      name: user.displayName,
      email
    });
  }

  allowedRoles.forEach((role) => {
    const roleUsers = config.users
      .filter((user) => user.active && adminUserHasRole(user, role))
      .sort((left, right) => {
        const scoreDifference =
          getAdminUserScopeScore(right, ticket, config, role) -
          getAdminUserScopeScore(left, ticket, config, role);

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return left.displayName.localeCompare(right.displayName);
      });
    const scopedRoleUsers = roleUsers.filter((user) => adminUserScopeMatchesTicket(user, ticket, config));

    (scopedRoleUsers.length > 0 ? scopedRoleUsers : roleUsers).forEach((user) => {
      addUser(user);
    });
  });

  return Array.from(recipients.values());
}

function buildNotificationTemplateContext({
  config,
  participantName,
  portalOrigin,
  step,
  ticket
}: {
  config: AdminConfig;
  participantName: string;
  portalOrigin: string;
  step?: Ticket["workflow"][number];
  ticket: Ticket;
}): Record<string, string> {
  const dueDate = step?.dueAt ? new Date(step.dueAt) : undefined;
  const dueDateLabel =
    dueDate && Number.isFinite(dueDate.getTime())
      ? formatLocalDateTime(dueDate)
      : step?.dueAt || "Not scheduled";
  const portalHomeUrl = portalOrigin || "";
  const ticketUrl = portalHomeUrl ? `${portalHomeUrl}/?ticket=${encodeURIComponent(ticket.key)}` : "";
  const assignedTo = step?.ownerName && step.ownerName !== "Unassigned"
    ? step.ownerName
    : step
      ? getConfigRoleLabel(config, step.ownerRole)
      : "Software Architect / Release Manager";
  const requestedByRole = step ? getConfigRoleLabel(config, step.ownerRole) : "Jira creator";

  return {
    ticketKey: ticket.key,
    ticketTitle: ticket.title,
    jiraKey: ticket.relatedJiraKey ?? "Not linked",
    participantName,
    priority: ticket.priority,
    ticketStatus: getTicketCurrentStatusLabel(ticket),
    createdBy: getTicketSubmitter(ticket),
    assignedTo,
    environment: ticket.dynamicFields.Environment ?? ticket.dynamicFields.environment ?? "Production",
    dueDate: dueDateLabel,
    releaseVersion: ticket.jiraDraft.fixVersion ?? "Not selected",
    requestedByRole,
    portalHomeUrl,
    portalUrl: ticketUrl,
    ticketUrl
  };
}

function getNotificationEmailDeliveryFingerprint(parts: string[]): string {
  const source = parts.map((part) => part.trim().replace(/\s+/g, " ")).join("\u001f");
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }

  return (hash >>> 0).toString(36);
}

function dedupeNotificationEmailEnvelopes(envelopes: NotificationEmailEnvelope[]): NotificationEmailEnvelope[] {
  const seenEnvelopeIds = new Set<string>();

  return envelopes.filter((envelope) => {
    if (seenEnvelopeIds.has(envelope.id)) {
      return false;
    }

    seenEnvelopeIds.add(envelope.id);
    return true;
  });
}

function buildApprovalRequestedEmailEnvelopes(
  config: AdminConfig,
  tickets: Ticket[],
  portalOrigin: string
): NotificationEmailEnvelope[] {
  const smtp = config.integrations.smtp;

  if (!smtp.enabled || !notificationDeliveryModeSendsEmail(smtp.deliveryMode)) {
    return [];
  }

  const template = config.notificationTemplates.find(
    (candidate) =>
      candidate.active &&
      candidate.eventType === "approvalRequested" &&
      notificationDeliveryModeSendsEmail(candidate.deliveryMode)
  );

  if (!template) {
    return [];
  }

  const envelopes = tickets
    .filter((ticket) => ticket.state !== "closed")
    .flatMap((ticket) =>
      ticket.workflow.flatMap((step) => {
        const workflowType = step.workflowType ?? getRoleWorkflowType(config, step.ownerRole);
        const isApprovalAction =
          workflowType !== "inform" &&
          (step.status === "active" || step.status === "delegated") &&
          template.enabledRoles.includes(step.ownerRole);

        if (!isApprovalAction) {
          return [];
        }

        const recipients = getWorkflowStepEmailRecipients(config, ticket, step);

        if (!recipients.length) {
          console.warn("No email recipients found for active approval gate.", {
            ticketKey: ticket.key,
            stepId: step.id,
            ownerRole: step.ownerRole
          });
          return [];
        }

        return recipients.map((recipient) => {
          const context = buildNotificationTemplateContext({
            config,
            participantName: recipient.name,
            portalOrigin,
            step,
            ticket
          });
          const subject = renderNotificationTemplateWithContext(template.subject, context);
          const body = renderNotificationTemplateWithContext(template.body, context);
          const htmlBody = renderNotificationEmailHtmlBody(body, context);
          const deliveryFingerprint = getNotificationEmailDeliveryFingerprint([
            "approvalRequested",
            ticket.key,
            template.id,
            recipient.email.toLowerCase(),
            subject,
            body
          ]);

          return {
            id: [
              "email",
              "approvalRequested",
              ticket.key,
              template.id,
              recipient.email.toLowerCase(),
              deliveryFingerprint
            ].join(":"),
            eventType: "approvalRequested" as NotificationEventType,
            ticketKey: ticket.key,
            recipients: [recipient],
            subject,
            body,
            htmlBody
          };
        });
      })
    );

  return dedupeNotificationEmailEnvelopes(envelopes);
}

function buildJiraReadyToCreateEmailEnvelopes(
  config: AdminConfig,
  tickets: Ticket[],
  portalOrigin: string
): NotificationEmailEnvelope[] {
  const smtp = config.integrations.smtp;

  if (!smtp.enabled || !notificationDeliveryModeSendsEmail(smtp.deliveryMode)) {
    return [];
  }

  const template = config.notificationTemplates.find(
    (candidate) =>
      candidate.active &&
      candidate.eventType === "jiraReadyToCreate" &&
      notificationDeliveryModeSendsEmail(candidate.deliveryMode)
  );

  if (!template) {
    return [];
  }

  const envelopes = tickets
    .filter((ticket) => canCreateJiraForTicket(ticket))
    .flatMap((ticket) => {
      const recipients = getJiraReadyToCreateEmailRecipients(config, ticket, template.enabledRoles);

      if (!recipients.length) {
        console.warn("No email recipients found for ready Jira creation.", {
          ticketKey: ticket.key,
          enabledRoles: template.enabledRoles
        });
        return [];
      }

      return recipients.map((recipient) => {
        const context = buildNotificationTemplateContext({
          config,
          participantName: recipient.name,
          portalOrigin,
          ticket
        });
        const subject = renderNotificationTemplateWithContext(template.subject, context);
        const body = renderNotificationTemplateWithContext(template.body, context);
        const htmlBody = renderNotificationEmailHtmlBody(body, context);
        const deliveryFingerprint = getNotificationEmailDeliveryFingerprint([
          "jiraReadyToCreate",
          ticket.key,
          template.id,
          recipient.email.toLowerCase(),
          subject,
          body
        ]);

        return {
          id: [
            "email",
            "jiraReadyToCreate",
            ticket.key,
            template.id,
            recipient.email.toLowerCase(),
            deliveryFingerprint
          ].join(":"),
          eventType: "jiraReadyToCreate" as NotificationEventType,
          ticketKey: ticket.key,
          recipients: [recipient],
          subject,
          body,
          htmlBody
        };
      });
    });

  return dedupeNotificationEmailEnvelopes(envelopes);
}

function getNextClarificationReplyStatus(
  thread: Ticket["clarifications"][number],
  role: RoleKey
): Ticket["clarifications"][number]["status"] {
  const isRequesterReplying = normalizeRoleText(getAdminRoleLabel(role)) === normalizeRoleText(getClarificationRequesterRole(thread));

  if (isRequesterReplying && thread.status === "answered") {
    return "reopened";
  }

  if (isRequesterReplying) {
    return thread.status;
  }

  if (getClarificationAssigneeLabels(thread.assignedTo).length > 1) {
    return allClarificationAssigneesAnswered(thread, role) ? "answered" : "open";
  }

  return "answered";
}

function workflowStepMatchesClarificationRequester(
  config: AdminConfig,
  step: Ticket["workflow"][number],
  thread: Ticket["clarifications"][number]
): boolean {
  const requesterRole = normalizeClarificationRoleText(getClarificationRequesterRole(thread));

  if (!requesterRole) {
    return false;
  }

  return (
    normalizeClarificationRoleText(getConfigRoleLabel(config, step.ownerRole)) === requesterRole ||
    normalizeClarificationRoleText(getAdminRoleLabel(step.ownerRole)) === requesterRole ||
    normalizeClarificationRoleText(step.ownerName) === requesterRole
  );
}

function hasAnsweredClarificationForWorkflowStep(
  config: AdminConfig,
  ticket: Ticket,
  step: Ticket["workflow"][number]
): boolean {
  return ticket.clarifications.some(
    (thread) => thread.status === "answered" && workflowStepMatchesClarificationRequester(config, step, thread)
  );
}

function hasOpenClarificationForWorkflowStep(
  config: AdminConfig,
  ticket: Ticket,
  step: Ticket["workflow"][number]
): boolean {
  return ticket.clarifications.some(
    (thread) => thread.status !== "answered" && workflowStepMatchesClarificationRequester(config, step, thread)
  );
}

function getTicketStateAfterClarificationResolution(
  ticket: Ticket,
  workflow: Ticket["workflow"]
): Ticket["state"] {
  if (ticket.state === "closed" || ticket.state === "escalated" || ticket.state === "jira_synced") {
    return ticket.state;
  }

  if (workflow.some((step) => step.status === "blocked")) {
    return "clarification";
  }

  if (hasCompletedRequiredWorkflow(workflow)) {
    return "jira_draft";
  }

  if (workflow.some((step) => step.status === "active" || step.status === "delegated" || step.status === "waiting")) {
    return "approval";
  }

  return ticket.state;
}

function normalizeAnsweredClarificationWorkflow(ticket: Ticket, config: AdminConfig): Ticket {
  if (ticket.state === "closed") {
    return ticket;
  }

  let changed = false;
  const workflow = ticket.workflow.map((step) => {
    if (step.status !== "blocked") {
      return step;
    }

    if (
      !hasAnsweredClarificationForWorkflowStep(config, ticket, step) ||
      hasOpenClarificationForWorkflowStep(config, ticket, step)
    ) {
      return step;
    }

    changed = true;

    return {
      ...step,
      status: "active" as WorkflowStepStatus,
      slaState: "healthy" as SlaState
    };
  });

  if (!changed) {
    return ticket;
  }

  const state = getTicketStateAfterClarificationResolution(ticket, workflow);

  return {
    ...ticket,
    workflow,
    state,
    jiraDraft:
      state === "jira_draft"
        ? {
            ...ticket.jiraDraft,
            status: "ready_to_create"
          }
        : ticket.jiraDraft
    };
}

function normalizeApprovalClarificationAssignees(ticket: Ticket): Ticket {
  let changed = false;
  const clarifications: Ticket["clarifications"] = [];
  const mergedClarificationIndexByKey = new Map<string, number>();

  for (const thread of ticket.clarifications) {
    const isApprovalClarification = normalizeRoleText(thread.level) === normalizeRoleText("Approval clarification");
    const mergeKey = isApprovalClarification
      ? [
          normalizeRoleText(thread.level),
          normalizeClarificationRoleText(getClarificationRequesterRole(thread)),
          richTextComparableValue(getClarificationDisplayBody(thread, thread.question)),
          thread.dueAt
        ].join("|")
      : "";
    const existingIndex = mergeKey ? mergedClarificationIndexByKey.get(mergeKey) : undefined;

    if (!mergeKey || existingIndex === undefined) {
      if (mergeKey) {
        mergedClarificationIndexByKey.set(mergeKey, clarifications.length);
      }

      clarifications.push(thread);
      continue;
    }

    const existingThread = clarifications[existingIndex];
    const mergedMessages = [...existingThread.messages, ...thread.messages]
      .filter(
        (message, index, messages) =>
          messages.findIndex(
            (candidate) =>
              normalizeClarificationRoleText(candidate.role) === normalizeClarificationRoleText(message.role) &&
              richTextComparableValue(candidate.body) === richTextComparableValue(message.body) &&
              candidate.createdAt === message.createdAt
          ) === index
      )
      .sort((left, right) => {
        const createdAtDifference = parseTicketTimestamp(left.createdAt) - parseTicketTimestamp(right.createdAt);

        return createdAtDifference || left.id.localeCompare(right.id);
      });
    const statuses = [existingThread.status, thread.status];
    const mergedStatus = statuses.includes("reopened")
      ? "reopened"
      : statuses.includes("open")
        ? "open"
        : "answered";
    const mergedAssignees = getUniqueClarificationAssigneeLabels([
      ...getClarificationAssigneeLabels(existingThread.assignedTo),
      ...getClarificationAssigneeLabels(thread.assignedTo)
    ]);

    clarifications[existingIndex] = {
      ...existingThread,
      status: mergedStatus,
      assignedTo: mergedAssignees.join(", ") || existingThread.assignedTo || thread.assignedTo,
      messages: mergedMessages
    };
    changed = true;
  }

  return changed ? { ...ticket, clarifications } : ticket;
}

function shouldReplaceWorkflowOwnerName(step: Ticket["workflow"][number], config: AdminConfig): boolean {
  const genericRoleLabel = getConfigRoleLabel(config, step.ownerRole);

  return (
    step.status !== "complete" &&
    step.status !== "optional" &&
    (step.ownerName === "Unassigned" ||
      step.ownerName === genericRoleLabel ||
      normalizeRoleText(step.ownerName) === normalizeRoleText(genericRoleLabel))
  );
}

function normalizeMappedWorkflowOwners(ticket: Ticket, config: AdminConfig): Ticket {
  let changed = false;
  const workflow = ticket.workflow.map((step) => {
    if (!shouldReplaceWorkflowOwnerName(step, config)) {
      return step;
    }

    const ownerName = getMappedWorkflowOwnerName(config, ticket, step.ownerRole);

    if (!ownerName || ownerName === step.ownerName) {
      return step;
    }

    changed = true;

    return {
      ...step,
      ownerName
    };
  });

  return changed ? { ...ticket, workflow } : ticket;
}

function normalizeSequentialWorkflowAdvance(ticket: Ticket): Ticket {
  if (ticket.state === "closed" || ticket.state === "escalated" || ticket.state === "jira_synced") {
    return ticket;
  }

  const workflow = getWorkflowWithNextWaitingGateActivated(ticket.workflow);

  if (workflow === ticket.workflow) {
    return ticket;
  }

  const state = getTicketStateAfterClarificationResolution(ticket, workflow);

  return {
    ...ticket,
    workflow,
    state,
    jiraDraft:
      state === "jira_draft"
        ? {
            ...ticket.jiraDraft,
            status: "ready_to_create"
          }
        : ticket.jiraDraft
  };
}

function normalizeClarificationWorkflowState(ticket: Ticket, config: AdminConfig): Ticket {
  return normalizeSequentialWorkflowAdvance(
    normalizeAnsweredClarificationWorkflow(
      normalizeMappedWorkflowOwners(normalizeApprovalClarificationAssignees(ticket), config),
      config
    )
  );
}

function getTicketListStatusLabel(ticket: Ticket): string {
  return getTicketCurrentStatusLabel(ticket);
}

function getStatusColorVariant(config: AdminConfig, statusLabel: string): TegelTagVariant {
  const normalizedLabel = normalizeStatusLabel(statusLabel);
  const configuredStatus = config.statusColors.find(
    (statusColor) => normalizeStatusLabel(statusColor.status) === normalizedLabel
  );
  const defaultStatus = statusColorOptions.find(
    (statusColor) => normalizeStatusLabel(statusColor.status) === normalizedLabel
  );

  return configuredStatus?.color ?? defaultStatus?.color ?? "neutral";
}

function ticketHasOpenClarification(ticket: Ticket): boolean {
  return ticket.clarifications.some((thread) => thread.status !== "answered");
}

function ticketHasBlockingSignal(ticket: Ticket): boolean {
  return (
    ticket.state === "clarification" ||
    ticketHasOpenClarification(ticket) ||
    ticket.workflow.some((step) => step.status === "blocked") ||
    ticket.slaState === "breach" ||
    ticket.escalations.some((escalation) => escalation.status !== "resolved") ||
    getTicketJiraFollowUpStatus(ticket) === "blocked"
  );
}

function getTicketCloseStatusLabel(ticket: Ticket): string {
  const followUpStatus = getTicketJiraFollowUpStatus(ticket);

  if (followUpStatus === "rejected") {
    return "Rejected close";
  }

  if (followUpStatus === "done" || ticket.state === "closed") {
    return "Completed close";
  }

  return "Closed";
}

function getTicketCurrentStatusLabel(ticket: Ticket): string {
  const followUpStatus = getTicketJiraFollowUpStatus(ticket);

  if (followUpStatus === "done" || followUpStatus === "rejected" || ticket.state === "closed") {
    return getTicketCloseStatusLabel(ticket);
  }

  if (followUpStatus === "blocked" || ticket.state === "escalated") {
    return "Blocked";
  }

  if (followUpStatus === "business_test") {
    return "Business Test";
  }

  if (followUpStatus === "it_test") {
    return "IT Test";
  }

  if (followUpStatus === "in_progress") {
    return "In progress";
  }

  if (followUpStatus === "created" || ticket.relatedJiraKey) {
    return "Planning";
  }

  if (ticketHasBlockingSignal(ticket)) {
    return "Blocked";
  }

  if (ticket.state === "jira_draft") {
    return ticket.jiraDraft.status === "ready_to_create" ? "Planning" : "Jira draft";
  }

  if (ticket.state === "clarification") {
    return "Blocked";
  }

  if (ticket.state === "approval") {
    return "Review";
  }

  if (ticket.state === "intake") {
    return "New";
  }

  return "Planning";
}

function getTicketCurrentLocationLabel(ticket: Ticket): string {
  const lifecycleSteps = getTicketLifecycleSteps(ticket);
  const currentStep =
    lifecycleSteps.find((step) => step.state === "active" || step.state === "blocked" || step.state === "rejected") ??
    lifecycleSteps.find((step) => step.state === "waiting") ??
    lifecycleSteps[lifecycleSteps.length - 1];

  if (!currentStep) {
    return getWorkflowActionSummary(ticket).label;
  }

  return `${currentStep.label} · ${getLifecycleStepStatusLabel(currentStep.state)}`;
}

function getLifecycleStepStatusLabel(state: TicketLifecycleStepState): string {
  switch (state) {
    case "complete":
      return "Done";
    case "active":
      return "Current";
    case "blocked":
      return "Blocked";
    case "rejected":
      return "Rejected";
    case "waiting":
    default:
      return "Waiting";
  }
}

function getWorkflowStepProgressLabel(status: WorkflowStepStatus): string {
  switch (status) {
    case "complete":
      return "Done";
    case "active":
    case "delegated":
      return "Current";
    case "blocked":
      return "Blocked";
    case "optional":
      return "Not required";
    case "waiting":
    default:
      return "Waiting";
  }
}

function getWorkflowCurrentPositionSummary(ticket: Ticket, configuredTicket: Ticket): WorkflowCurrentPositionSummary {
  const blockedSteps = configuredTicket.workflow.filter((step) => step.status === "blocked");
  const activeSteps = configuredTicket.workflow.filter((step) => step.status === "active" || step.status === "delegated");
  const waitingStep = configuredTicket.workflow.find((step) => step.status === "waiting");
  const workflowComplete = hasCompletedRequiredWorkflow(configuredTicket.workflow);
  const currentStatus = getTicketCurrentStatusLabel(ticket);
  const followUpStatus = getTicketJiraFollowUpStatus(ticket);

  if (blockedSteps.length > 0) {
    return {
      label: `Blocked at ${blockedSteps.map((step) => step.label).join(" + ")}`,
      detail: blockedSteps.map((step) => step.ownerName).join(" + "),
      tone: "critical"
    };
  }

  if (activeSteps.length > 0) {
    return {
      label: `Current gate: ${activeSteps.map((step) => step.label).join(" + ")}`,
      detail: activeSteps.map((step) => `${step.ownerName} · ${getWorkflowStepProgressLabel(step.status)}`).join(" · "),
      tone: "active"
    };
  }

  if (workflowComplete && !ticket.relatedJiraKey && ticket.state === "jira_draft") {
    return {
      label: "Current stage: Planning",
      detail: "Workflow gates are done; create the Jira issue before work starts.",
      tone: "active"
    };
  }

  if (ticket.relatedJiraKey && followUpStatus === "created") {
    return {
      label: "Current stage: Planning",
      detail: `Linked to ${ticket.relatedJiraKey}; waiting for sprint planning.`,
      tone: "waiting"
    };
  }

  if (ticket.relatedJiraKey && followUpStatus !== "done" && followUpStatus !== "rejected") {
    return {
      label: `Current stage: ${currentStatus}`,
      detail: `Linked to ${ticket.relatedJiraKey}.`,
      tone: followUpStatus === "blocked" ? "critical" : "active"
    };
  }

  if (ticket.state === "closed" || followUpStatus === "done" || followUpStatus === "rejected") {
    return {
      label: `Current stage: ${currentStatus}`,
      detail: followUpStatus === "rejected" ? "Jira follow-up is rejected." : "Ticket workflow is complete.",
      tone: followUpStatus === "rejected" ? "critical" : "complete"
    };
  }

  if (waitingStep) {
    return {
      label: `Next gate: ${waitingStep.label}`,
      detail: "Waiting for earlier gates to finish.",
      tone: "waiting"
    };
  }

  return {
    label: `Current stage: ${currentStatus}`,
    detail: `State ${ticket.state.replace("_", " ")}.`,
    tone: "waiting"
  };
}

function getTicketLifecycleSteps(ticket: Ticket): TicketLifecycleStep[] {
  const health = summarizeWorkflowHealth(ticket);
  const workflowComplete = hasCompletedRequiredWorkflow(ticket.workflow);
  const followUpStatus = getTicketJiraFollowUpStatus(ticket);
  const hasJira = Boolean(ticket.relatedJiraKey);
  const terminalFollowUp = followUpStatus === "done" || followUpStatus === "rejected";
  const isClosed = ticket.state === "closed" || terminalFollowUp;
  const isBlocked = ticketHasBlockingSignal(ticket) || ticket.state === "escalated";
  const jiraWorkStarted = followUpStatus === "in_progress";
  const jiraWorkPastProgress = followUpStatus === "it_test" || followUpStatus === "business_test" || followUpStatus === "done";
  const planningComplete = jiraWorkStarted || jiraWorkPastProgress || isClosed;
  const reviewState: TicketLifecycleStepState = isBlocked && !workflowComplete
    ? "blocked"
    : workflowComplete || hasJira || isClosed
      ? "complete"
      : ticket.state === "approval" || ticket.state === "clarification"
        ? "active"
        : "waiting";
  const planningState: TicketLifecycleStepState = followUpStatus === "rejected"
    ? "rejected"
    : followUpStatus === "blocked"
      ? "blocked"
      : planningComplete
        ? "complete"
        : workflowComplete || hasJira
          ? "active"
          : "waiting";
  const progressState: TicketLifecycleStepState = followUpStatus === "rejected"
    ? "rejected"
    : followUpStatus === "blocked"
      ? "blocked"
      : jiraWorkStarted
        ? "active"
        : jiraWorkPastProgress || isClosed
          ? "complete"
          : "waiting";
  const itTestState: TicketLifecycleStepState = followUpStatus === "rejected"
    ? "rejected"
    : followUpStatus === "blocked"
      ? "blocked"
      : followUpStatus === "it_test"
        ? "active"
        : followUpStatus === "business_test" || followUpStatus === "done" || isClosed
          ? "complete"
          : "waiting";
  const businessTestState: TicketLifecycleStepState = followUpStatus === "rejected"
    ? "rejected"
    : followUpStatus === "business_test"
      ? "active"
      : followUpStatus === "done" || isClosed
        ? "complete"
        : "waiting";
  const closeState: TicketLifecycleStepState = followUpStatus === "rejected"
    ? "rejected"
    : followUpStatus === "done" || isClosed
      ? "complete"
      : "waiting";
  const plannedReleaseState: TicketLifecycleStepState = followUpStatus === "rejected"
    ? "rejected"
    : closeState === "complete"
      ? "active"
      : "waiting";
  const planningDetail = !hasJira
    ? workflowComplete && ticket.state === "jira_draft"
      ? "Ready to create Jira issue"
      : "Waiting for review"
    : followUpStatus === "created"
      ? "Waiting for sprint planning"
      : planningState === "complete"
        ? "Planning complete"
        : getJiraFollowUpStatusLabel(followUpStatus);
  const progressDetail = followUpStatus === "in_progress"
    ? "Work started"
    : progressState === "complete"
      ? "Work complete"
      : getJiraFollowUpStatusLabel(followUpStatus);
  const sprintDetail = ticket.jiraDraft.sprint?.trim()
    ? `Sprint ${ticket.jiraDraft.sprint.trim()}`
    : "";
  const withSprintDetail = (detail: string) => sprintDetail ? `${detail} · ${sprintDetail}` : detail;
  const itTestDetail = followUpStatus === "it_test"
    ? "IT validation active"
    : itTestState === "complete"
      ? "IT validation complete"
      : "Waiting";
  const releasePlanDetail = getReleasePlanDetail(ticket, plannedReleaseState);
  return [
    {
      label: "New request",
      detail: `${getTicketTypeLabel(ticket.typeId)} · ${getTicketSubmitter(ticket)}`,
      status: getLifecycleStepStatusLabel(ticket.state === "intake" && !isClosed ? "active" : "complete"),
      state: ticket.state === "intake" && !isClosed ? "active" : "complete"
    },
    {
      label: "Review",
      detail: `${health.completed}/${health.total} gates complete`,
      status: getLifecycleStepStatusLabel(reviewState),
      state: reviewState
    },
    {
      label: "Planning",
      detail: planningDetail,
      status: getLifecycleStepStatusLabel(planningState),
      state: planningState
    },
    {
      label: "In progress",
      detail: withSprintDetail(progressState === "waiting" ? "Waiting to start work" : progressDetail),
      status: getLifecycleStepStatusLabel(progressState),
      state: progressState
    },
    {
      label: "IT Test",
      detail: withSprintDetail(itTestDetail),
      status: getLifecycleStepStatusLabel(itTestState),
      state: itTestState
    },
    {
      label: "Business Test",
      detail:
        followUpStatus === "business_test"
          ? "Business validation active"
          : businessTestState === "complete"
            ? "Business validation complete"
            : "Waiting",
      status: getLifecycleStepStatusLabel(businessTestState),
      state: businessTestState
    },
    {
      label: "Close",
      detail:
        closeState === "waiting"
          ? "Open"
          : followUpStatus === "not_created"
            ? getTicketCloseStatusLabel(ticket)
            : getJiraFollowUpStatusLabel(followUpStatus),
      status: getLifecycleStepStatusLabel(closeState),
      state: closeState
    },
    {
      label: "Planned release",
      detail: releasePlanDetail,
      status: getLifecycleStepStatusLabel(plannedReleaseState),
      state: plannedReleaseState
    }
  ];
}

function getPriorityNumber(priority: Ticket["priority"]): number | undefined {
  const numericMatch = priority.trim().match(/^([0-4])(?:\s|$|[-:])/);

  return numericMatch ? Number(numericMatch[1]) : undefined;
}

function normalizePriorityLabel(priority: Ticket["priority"]): string {
  return priority.trim().replace(/^\d+\s*[-:]\s*/, "").toLowerCase();
}

function getPriorityWeight(priority: Ticket["priority"]): number {
  const priorityNumber = getPriorityNumber(priority);

  if (priorityNumber !== undefined) {
    return 5 - priorityNumber;
  }

  const normalizedPriority = normalizePriorityLabel(priority);

  if (["critical", "urgent", "blocker", "highest"].includes(normalizedPriority)) {
    return 5;
  }

  if (normalizedPriority === "high") {
    return 4;
  }

  if (normalizedPriority === "medium") {
    return 3;
  }

  if (normalizedPriority === "low") {
    return 2;
  }

  return 1;
}

function getPriorityToneClassName(priority: Ticket["priority"]): string {
  const priorityNumber = getPriorityNumber(priority);

  if (priorityNumber === 0) {
    return "critical";
  }

  if (priorityNumber === 1) {
    return "high";
  }

  if (priorityNumber === 2) {
    return "medium";
  }

  const normalizedPriority = normalizePriorityLabel(priority);

  if (["critical", "urgent", "blocker", "highest"].includes(normalizedPriority)) {
    return "critical";
  }

  if (normalizedPriority === "high") {
    return "high";
  }

  if (normalizedPriority === "medium") {
    return "medium";
  }

  return "low";
}

function getTicketWorkflowTemplateName(ticket: Ticket): string {
  const ticketType = ticketTypes.find((type) => type.id === ticket.typeId);
  const template = workflowTemplates.find(
    (workflow) => workflow.id === ticketType?.defaultWorkflowTemplateId
  );

  return template?.name ?? getTicketTypeLabel(ticket.typeId);
}

function isActionableWorkflowStep(step: Ticket["workflow"][number]): boolean {
  return step.status === "active" || step.status === "blocked" || step.status === "delegated";
}

function isBlockingSequentialAdvance(step: Ticket["workflow"][number]): boolean {
  return isActionableWorkflowStep(step) && !step.parallelGroup;
}

function getWorkflowWithNextWaitingGateActivated(workflow: Ticket["workflow"]): Ticket["workflow"] {
  if (workflow.some((step) => isBlockingSequentialAdvance(step))) {
    return workflow;
  }

  const nextWaitingIndex = workflow.findIndex((step) => step.status === "waiting");

  if (nextWaitingIndex < 0) {
    return workflow;
  }

  return workflow.map((step, index) =>
    index === nextWaitingIndex ? { ...step, status: "active" as WorkflowStepStatus } : step
  );
}

function getWorkflowStatusOverrideLabel(status: WorkflowStepStatus): string {
  return workflowStatusOverrideOptions.find((option) => option.value === status)?.label ?? nextActionLabel(status);
}

function getDefaultWorkflowOverrideStepId(workflow: Ticket["workflow"]): string {
  return (
    workflow.find((step) => step.status === "active" || step.status === "blocked")?.id ??
    workflow.find((step) => step.status !== "optional")?.id ??
    workflow[0]?.id ??
    ""
  );
}

function getTicketStateAfterWorkflowOverride(ticket: Ticket, workflow: Ticket["workflow"]): TicketState {
  if (hasCompletedRequiredWorkflow(workflow)) {
    return ticket.relatedJiraKey ? "jira_synced" : "jira_draft";
  }

  if (ticket.relatedJiraKey) {
    return "jira_synced";
  }

  if (workflow.some((step) => step.status === "blocked")) {
    return "clarification";
  }

  return "approval";
}

function applyWorkflowStatusOverride(
  workflow: Ticket["workflow"],
  input: WorkflowStatusUpdateInput,
  actorName: string,
  timestamp: string
): Ticket["workflow"] {
  const updatedWorkflow = workflow.map((step) =>
    step.id === input.stepId
      ? {
          ...step,
          status: input.status,
          ownerName: actorName,
          slaState: input.status === "blocked" ? ("paused" as SlaState) : ("healthy" as SlaState),
          statusReason: input.reason,
          statusUpdatedAt: timestamp
        }
      : step
  );

  return input.status === "complete" || input.status === "optional"
    ? getWorkflowWithNextWaitingGateActivated(updatedWorkflow)
    : updatedWorkflow;
}

function isApprovalVisibleForRole(role: RoleKey, step: Ticket["workflow"][number]): boolean {
  return role === "admin" || step.ownerRole === role;
}

function isApprovalVisibleForPersona(
  config: AdminConfig,
  persona: RolePersonaOption,
  ticket: Ticket,
  step: Ticket["workflow"][number]
): boolean {
  return isApprovalVisibleForRole(persona.role, step) && personaCanActOnTicket(persona, ticket, config);
}

function getApprovalQueueItems(
  tickets: Ticket[],
  config: AdminConfig,
  persona: RolePersonaOption
): ApprovalQueueItem[] {
  return tickets
    .filter((ticket) => ticket.state !== "closed")
    .flatMap((ticket) =>
      ticket.workflow.flatMap((step, stepIndex) => {
        const isDecisionGate = step.status !== "complete" && step.status !== "optional";

        if (!isDecisionGate || !isApprovalVisibleForPersona(config, persona, ticket, step)) {
          return [];
        }

        return [
          {
            id: `${ticket.key}-${step.id}`,
            ticket,
            step,
            stepIndex,
            actionable: isActionableWorkflowStep(step)
          }
        ];
      })
    )
    .sort((left, right) => {
      if (left.actionable !== right.actionable) {
        return left.actionable ? -1 : 1;
      }

      return new Date(right.ticket.updatedAt).getTime() - new Date(left.ticket.updatedAt).getTime();
    });
}

function getNextWorkflowAfterApproval(
  workflow: Ticket["workflow"],
  stepId: string,
  ownerName: string
): Ticket["workflow"] {
  const completedWorkflow = workflow.map((step) =>
    step.id === stepId
      ? {
          ...step,
          status: "complete" as WorkflowStepStatus,
          ownerName,
          slaState: "healthy" as SlaState
        }
      : step
  );

  return getWorkflowWithNextWaitingGateActivated(completedWorkflow);
}

function hasCompletedRequiredWorkflow(workflow: Ticket["workflow"]): boolean {
  return workflow.every((step) => step.status === "complete" || step.status === "optional");
}

function getJiraFollowUpActionSummary(
  followUpStatus: JiraFollowUpStatus,
  jiraKey: string
): {
  label: string;
  detail: string;
  tone: "active" | "critical" | "waiting" | "complete";
} {
  switch (followUpStatus) {
    case "blocked":
      return {
        label: "Resolve Jira blocker",
        detail: `Linked to ${jiraKey}; Jira is blocked before work can continue.`,
        tone: "critical"
      };
    case "in_progress":
      return {
        label: "Complete implementation",
        detail: `Linked to ${jiraKey}; work is in progress.`,
        tone: "active"
      };
    case "it_test":
      return {
        label: "Complete IT Testing",
        detail: `Linked to ${jiraKey}; Jira Review means IT validation in the portal.`,
        tone: "active"
      };
    case "business_test":
      return {
        label: "Complete Business Testing",
        detail: `Linked to ${jiraKey}; Jira Test or Approved means Business validation in the portal.`,
        tone: "active"
      };
    case "done":
      return {
        label: "Close portal ticket",
        detail: `Linked to ${jiraKey}; Jira is done.`,
        tone: "complete"
      };
    case "created":
      return {
        label: "Wait for sprint planning",
        detail: `Linked to ${jiraKey}; waiting for sprint planning before implementation starts.`,
        tone: "waiting"
      };
    case "not_created":
    case "testing":
    default:
      return {
        label: "Start Jira work",
        detail: `Linked to ${jiraKey}; move Jira into progress when implementation starts.`,
        tone: "active"
      };
  }
}

function getWorkflowActionSummary(ticket: Ticket): {
  label: string;
  detail: string;
  tone: "active" | "critical" | "waiting" | "complete";
} {
  const blockedSteps = ticket.workflow.filter((step) => step.status === "blocked");
  const activeSteps = ticket.workflow.filter((step) => step.status === "active" || step.status === "delegated");
  const waitingStep = ticket.workflow.find((step) => step.status === "waiting");
  const actionSteps = blockedSteps.length > 0 ? blockedSteps : activeSteps;

  if (actionSteps.length > 0) {
    return {
      label: actionSteps.map((step) => step.label).join(" + "),
      detail: actionSteps.map((step) => `${step.ownerName} due ${formatDateTimeDisplay(step.dueAt)}`).join(" · "),
      tone: blockedSteps.length > 0 || ticket.slaState === "breach" ? "critical" : "active"
    };
  }

  if (hasCompletedRequiredWorkflow(ticket.workflow)) {
    const followUpStatus = getTicketJiraFollowUpStatus(ticket);

    if (!ticket.relatedJiraKey && ticket.state === "jira_draft") {
      return {
        label: "Create Jira ticket",
        detail: "Workflow gates are done; Jira issue is ready to be created.",
        tone: "active"
      };
    }

    if (ticket.relatedJiraKey && followUpStatus !== "done" && followUpStatus !== "rejected") {
      return getJiraFollowUpActionSummary(followUpStatus, ticket.relatedJiraKey);
    }

    return {
      label: "Workflow complete",
      detail: "All required gates are done.",
      tone: "complete"
    };
  }

  if (waitingStep) {
    return {
      label: waitingStep.label,
      detail: `${waitingStep.ownerName} is queued after active gates`,
      tone: "waiting"
    };
  }

  return {
    label: "No open gates",
    detail: "Workflow is ready for Jira handoff or closure.",
    tone: "complete"
  };
}

function getWorkflowStepWaitReason(ticket: Ticket, step: Ticket["workflow"][number]): string | undefined {
  if (step.status === "blocked") {
    const openClarification = ticket.clarifications.find((thread) => thread.status !== "answered");

    return openClarification
      ? `Blocked until ${openClarification.assignedTo} answers the clarification.`
      : "Blocked until the approval owner requests or clears the missing information.";
  }

  if (step.status !== "waiting") {
    return undefined;
  }

  const activeBlockers = ticket.workflow.filter(
    (candidate) => candidate.id !== step.id && isBlockingSequentialAdvance(candidate)
  );

  if (!activeBlockers.length) {
    return "Queued after earlier workflow gates.";
  }

  const blockerLabels = activeBlockers.map((candidate) => candidate.label).join(" + ");

  return `Waiting for ${blockerLabels} before this approval becomes active.`;
}

function getApprovalQueueWaitReason(item: ApprovalQueueItem): string {
  return getWorkflowStepWaitReason(item.ticket, item.step) ?? "Waiting for earlier workflow gates.";
}

function getUniqueRoleKeys(roleKeys: RoleKey[]): RoleKey[] {
  const seen = new Set<RoleKey>();

  return roleKeys.filter((roleKey) => {
    if (seen.has(roleKey)) {
      return false;
    }

    seen.add(roleKey);
    return true;
  });
}

function getApprovalClarificationTargetOptions(
  config: AdminConfig,
  item: ApprovalQueueItem
): ApprovalClarificationTargetOption[] {
  const options = new Map<RoleKey, ApprovalClarificationTargetOption>();
  const submitter = getTicketSubmitter(item.ticket);

  options.set("requester", {
    key: "requester",
    label: "User / requester",
    detail: submitter
  });

  for (const step of item.ticket.workflow) {
    if (step.status === "optional") {
      continue;
    }

    const roleLabel = getConfigRoleLabel(config, step.ownerRole);
    const ownerDetail = step.ownerName && step.ownerName !== roleLabel ? step.ownerName : "workflow role";

    options.set(step.ownerRole, {
      key: step.ownerRole,
      label: roleLabel,
      detail: step.id === item.step.id ? `${ownerDetail} · current approval` : ownerDetail
    });
  }

  return Array.from(options.values());
}

function createDefaultApprovalClarificationDraft(
  config: AdminConfig,
  item: ApprovalQueueItem
): ApprovalClarificationDraft {
  const pullInActionType = "clarification" as PullInActionType;
  const pullInTargetRole = getDefaultPullInRole(config, item.step.ownerRole, pullInActionType);

  return {
    question: "",
    workflowTargetRoles: ["requester"],
    includePullIn: false,
    pullInTargetRole,
    pullInActionType,
    temporary: true
  };
}

function getJiraFollowUpStatusLabel(status: JiraFollowUpStatus): string {
  if (status === "not_created") {
    return "New";
  }

  if (status === "testing") {
    return "IT Test";
  }

  return jiraFollowUpStatusOptions.find((option) => option.value === status)?.label ?? status.replaceAll("_", " ");
}

function getJiraFollowUpStatusTone(status: JiraFollowUpStatus): "info" | "warning" | "critical" | "success" {
  if (status === "not_created") {
    return "info";
  }

  if (status === "testing") {
    return "warning";
  }

  return jiraFollowUpStatusOptions.find((option) => option.value === status)?.tone ?? "info";
}

function getSelectableJiraFollowUpStatus(status: JiraFollowUpStatus): SelectableJiraFollowUpStatus {
  if (status === "not_created") {
    return "created";
  }

  if (status === "testing") {
    return "it_test";
  }

  return status;
}

function normalizeJiraStatusToken(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function jiraStatusTokenIncludes(token: string, values: string[]): boolean {
  return values.some((value) => token.includes(value));
}

function jiraStatusTokenEquals(token: string, values: string[]): boolean {
  return values.some((value) => token === value);
}

function getJiraFollowUpStatusFromIssueStatus(
  status: JiraIssueStatusDetails | undefined,
  fallbackStatus: JiraFollowUpStatus
): JiraFollowUpStatus {
  const statusName = normalizeJiraStatusToken(status?.name);
  const categoryKey = normalizeJiraStatusToken(status?.categoryKey);
  const categoryName = normalizeJiraStatusToken(status?.categoryName);
  const resolutionName = normalizeJiraStatusToken(status?.resolutionName);
  const combinedStatus = [statusName, categoryKey, categoryName, resolutionName].join(" ");

  if (!statusName && !categoryKey && !categoryName && !resolutionName) {
    return fallbackStatus === "not_created" ? "created" : fallbackStatus;
  }

  if (jiraStatusTokenIncludes(combinedStatus, ["reject", "declin", "cancel"])) {
    return "rejected";
  }

  if (jiraStatusTokenEquals(statusName, ["approved"])) {
    return "business_test";
  }

  if (
    categoryKey === "done" ||
    Boolean(resolutionName) ||
    jiraStatusTokenIncludes(combinedStatus, ["done", "closed", "resolved", "complete"])
  ) {
    return "done";
  }

  if (jiraStatusTokenIncludes(combinedStatus, ["block", "impediment", "on hold", "hold"])) {
    return "blocked";
  }

  if (
    jiraStatusTokenIncludes(combinedStatus, ["business test", "uat", "user acceptance"]) ||
    jiraStatusTokenEquals(statusName, ["test"])
  ) {
    return "business_test";
  }

  if (
    jiraStatusTokenIncludes(combinedStatus, ["it test", "qa", "verification", "validation"]) ||
    jiraStatusTokenEquals(statusName, ["review", "in review"])
  ) {
    return "it_test";
  }

  if (
    categoryKey === "indeterminate" ||
    jiraStatusTokenIncludes(combinedStatus, ["in progress", "progress", "development", "doing", "active"])
  ) {
    return "in_progress";
  }

  if (
    categoryKey === "new" ||
    jiraStatusTokenIncludes(combinedStatus, ["created", "open", "new", "to do", "todo", "backlog"])
  ) {
    return "created";
  }

  return fallbackStatus === "not_created" ? "created" : fallbackStatus;
}

function getTicketStateForJiraFollowUpStatus(status: JiraFollowUpStatus): Ticket["state"] {
  return status === "done" || status === "rejected" ? "closed" : "jira_synced";
}

function getJiraIssueStatusSummary(status?: JiraIssueStatusDetails): string {
  if (!status?.name) {
    return "Jira status unavailable";
  }

  const category = status.categoryName || status.categoryKey;
  const resolution = status.resolutionName ? `, resolution ${status.resolutionName}` : "";

  return category ? `${status.name} (${category}${resolution})` : `${status.name}${resolution}`;
}

function getJiraStatusDisplayName(ticket: Ticket, followUpStatus: JiraFollowUpStatus): string {
  return ticket.jiraDraft.syncedStatus?.trim() || getJiraFollowUpStatusLabel(followUpStatus);
}

function getJiraStatusTimelineSteps(
  _statuses: JiraStatusMetadataOption[],
  _currentStatusName: string,
  followUpStatus: JiraFollowUpStatus
): Array<{
  key: string;
  label: string;
  tone: "info" | "warning" | "critical" | "success" | "neutral";
  title: string;
  isCurrent: boolean;
}> {
  const normalizedFollowUpStatus = followUpStatus === "testing" ? "it_test" : followUpStatus;

  return jiraPortalStatusTimelineOptions.map((option) => ({
    key: option.value,
    label: option.label,
    tone: option.tone,
    title: "Portal Jira status. Jira raw statuses are mapped into this ticket lifecycle.",
    isCurrent: normalizedFollowUpStatus === option.value
  }));
}

function getTicketJiraFollowUpStatus(ticket: Ticket): JiraFollowUpStatus {
  if (!ticket.relatedJiraKey) {
    return "not_created";
  }

  const followUpStatus = ticket.jiraDraft.followUpStatus;
  const syncedStatus = ticket.jiraDraft.syncedStatus?.trim();

  if (syncedStatus) {
    return getJiraFollowUpStatusFromIssueStatus(
      {
        name: syncedStatus,
        categoryKey: "",
        categoryName: "",
        resolutionName: null
      },
      followUpStatus ?? "created"
    );
  }

  if (
    followUpStatus &&
    followUpStatus === "testing"
  ) {
    return "it_test";
  }

  if (
    followUpStatus &&
    (followUpStatus === "created" ||
      followUpStatus === "in_progress" ||
      followUpStatus === "blocked" ||
      followUpStatus === "it_test" ||
      followUpStatus === "business_test" ||
      followUpStatus === "done" ||
      followUpStatus === "rejected")
  ) {
    return followUpStatus;
  }

  return "created";
}

function getImportedJiraCommentId(ticketKey: string, jiraCommentId: string): string {
  return `comment-${ticketKey}-jira-import-${jiraCommentId}`;
}

function buildImportedJiraComment(ticketKey: string, comment: JiraSyncedCommentInput): CommentItem {
  return {
    id: getImportedJiraCommentId(ticketKey, comment.id),
    author: comment.author || "Jira user",
    role: comment.role || "Jira",
    body: comment.body,
    createdAt: comment.createdAt,
    visibility: "public",
    source: "jira"
  };
}

function isPortalAuthoredImportedJiraComment(comment: CommentItem): boolean {
  return comment.source === "jira" && comment.id.includes("-jira-import-") && comment.role !== "Jira";
}

function formatPortalAuthoredJiraComment(actor: RolePersonaOption, body: string): string {
  return `${actor.displayName} via NEXUS Portal:\n\n${body}`;
}

function mergeImportedJiraComments(
  ticket: Ticket,
  jiraComments: JiraSyncedCommentInput[]
): {
  comments: Ticket["comments"];
  importedComments: number;
  updatedComments: number;
} {
  const incomingComments = jiraComments.map((comment) => buildImportedJiraComment(ticket.key, comment));
  const incomingById = new Map(incomingComments.map((comment) => [comment.id, comment]));
  let updatedComments = 0;
  const mergedComments = ticket.comments.map((comment) => {
    const incomingComment = incomingById.get(comment.id);

    if (!incomingComment) {
      return comment;
    }

    const shouldPreservePortalAuthor = isPortalAuthoredImportedJiraComment(comment);
    const nextAuthor = shouldPreservePortalAuthor ? comment.author : incomingComment.author;
    const nextRole = shouldPreservePortalAuthor ? comment.role : incomingComment.role;
    const nextBody = shouldPreservePortalAuthor ? comment.body : incomingComment.body;

    if (
      comment.author === nextAuthor &&
      comment.role === nextRole &&
      comment.body === nextBody &&
      comment.createdAt === incomingComment.createdAt
    ) {
      return comment;
    }

    updatedComments += 1;
    return {
      ...comment,
      author: nextAuthor,
      body: nextBody,
      createdAt: incomingComment.createdAt,
      role: nextRole,
      source: incomingComment.source,
      visibility: incomingComment.visibility
    };
  });
  const existingIds = new Set(mergedComments.map((comment) => comment.id));
  const newComments = incomingComments.filter((comment) => !existingIds.has(comment.id));

  return {
    comments: [...mergedComments, ...newComments],
    importedComments: newComments.length,
    updatedComments
  };
}

function canCreateJiraForTicket(ticket: Ticket): boolean {
  return !ticket.relatedJiraKey && ticket.state === "jira_draft" && hasCompletedRequiredWorkflow(ticket.workflow);
}

function canReplaceJiraForTicket(ticket: Ticket): boolean {
  return Boolean(ticket.relatedJiraKey) && ticket.state !== "closed" && hasCompletedRequiredWorkflow(ticket.workflow);
}

function canReopenTicketForRole(ticket: Ticket, role: RoleKey): boolean {
  const canReopenState = ticket.state === "closed" || getTicketJiraFollowUpStatus(ticket) === "rejected";

  return canReopenState && ticketReopenRoles.some((allowedRole) => allowedRole === role);
}

function getReopenedWorkflow(workflow: Ticket["workflow"]): Ticket["workflow"] {
  return workflow.map((step) =>
    step.status === "blocked"
      ? {
          ...step,
          status: "active" as WorkflowStepStatus,
          slaState: "healthy" as SlaState
        }
      : step
  );
}

function getReopenedTicketState(ticket: Ticket, workflow: Ticket["workflow"]): Ticket["state"] {
  if (workflow.some((step) => isActionableWorkflowStep(step) || step.status === "waiting")) {
    return "approval";
  }

  if (ticket.relatedJiraKey) {
    return "jira_synced";
  }

  if (hasCompletedRequiredWorkflow(workflow)) {
    return "jira_draft";
  }

  return "approval";
}

function parseCommaSeparatedValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalText(value: string): string | undefined {
  const trimmedValue = value.trim();

  return trimmedValue || undefined;
}

function optionalPositiveNumber(value: string): number | undefined {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
}

const emptyJiraFieldMetadata: JiraFieldMetadata = {
  status: "idle",
  message: "",
  warnings: [],
  components: [],
  versions: [],
  priorities: [],
  statuses: [],
  boards: [],
  sprints: [],
  assignableUsers: []
};

function appendUniqueOption(options: string[], value?: string): string[] {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return options;
  }

  return options.some((option) => option.toLowerCase() === trimmedValue.toLowerCase())
    ? options
    : [...options, trimmedValue];
}

function getUniqueOptionValues(values: Array<string | undefined>): string[] {
  return values.reduce<string[]>((options, value) => appendUniqueOption(options, value), []);
}

function getJiraLabelsWithModule(labels: string[], moduleName: string): string[] {
  return getUniqueOptionValues([...labels, toJiraLabelValue(moduleName) || undefined]);
}

function getJiraMetadataNames(options: JiraMetadataOption[]): string[] {
  return getUniqueOptionValues(options.map((option) => option.name));
}

function getTemplateOptionSourceLabel(source?: FormTemplateOptionSource): string {
  const optionSource = source ?? "manual";

  return templateFieldOptionSourceOptions.find((option) => option.value === optionSource)?.label ?? "Manual options";
}

function isChoiceTemplateField(field: Pick<FormTemplateField, "type" | "component">): boolean {
  return (
    field.type === "singleSelect" ||
    field.type === "multiSelect" ||
    field.type === "yesNo" ||
    field.component === "dropdown" ||
    field.component === "radioGroup" ||
    field.component === "checkboxGroup"
  );
}

function isJiraTemplateOptionSource(source?: FormTemplateOptionSource): boolean {
  return Boolean(source && jiraTemplateOptionSources.has(source));
}

function templateHasJiraOptionSource(fields: FormTemplateField[]): boolean {
  return fields.some((field) => isJiraTemplateOptionSource(field.optionSource));
}

function getPortalModuleOptionValues(config: AdminConfig, form?: NewTicketFormState): string[] {
  if (form?.product) {
    const product = getConfigProduct(config, form.product);
    const prus = product?.prus.filter((pru) => pru.active && (!form.pru || pru.name === form.pru)) ?? [];
    const modules = prus.flatMap((pru) => pru.modules.filter((module) => module.active).map((module) => module.name));

    return uniqueSortedValues(modules);
  }

  return uniqueSortedValues(getAllConfigModules(config).filter((module) => module.active).map((module) => module.name));
}

function getPortalPruOptionValues(config: AdminConfig, form?: NewTicketFormState): string[] {
  if (form?.product) {
    const product = getConfigProduct(config, form.product);

    return uniqueSortedValues((product?.prus ?? []).filter((pru) => pru.active).map((pru) => pru.name));
  }

  return uniqueSortedValues(getAllConfigPrus(config).filter((pru) => pru.active).map((pru) => pru.name));
}

function getTemplateFieldOptions(
  field: FormTemplateField,
  config: AdminConfig,
  context: {
    form?: NewTicketFormState;
    jiraFieldMetadata?: JiraFieldMetadata;
  } = {}
): string[] {
  const manualOptions = field.options.length > 0 ? field.options : defaultOptionsByFieldType[field.type] ?? [];
  const optionSource = field.optionSource ?? "manual";
  const jiraFieldMetadata = context.jiraFieldMetadata ?? emptyJiraFieldMetadata;
  const sourceOptions =
    optionSource === "portalProducts"
      ? uniqueSortedValues(config.products.filter((product) => product.active).map((product) => product.productName))
      : optionSource === "portalPrus"
        ? getPortalPruOptionValues(config, context.form)
        : optionSource === "portalModules"
          ? getPortalModuleOptionValues(config, context.form)
          : optionSource === "jiraUnreleasedVersions"
            ? getJiraMetadataNames(jiraFieldMetadata.versions.filter((version) => version.released !== true))
            : optionSource === "jiraVersions"
              ? getJiraMetadataNames(jiraFieldMetadata.versions)
              : optionSource === "jiraSprints"
                ? getUniqueOptionValues(jiraFieldMetadata.sprints.map((sprint) => sprint.name))
                : optionSource === "jiraComponents"
                  ? getJiraMetadataNames(jiraFieldMetadata.components)
                  : optionSource === "jiraBoards"
                    ? getUniqueOptionValues(jiraFieldMetadata.boards.map((board) => board.name))
                    : optionSource === "jiraPriorities"
                      ? getJiraMetadataNames(jiraFieldMetadata.priorities)
                      : manualOptions;

  return sourceOptions.length > 0 ? sourceOptions : manualOptions;
}

function useJiraTemplateFieldMetadata(
  config: AdminConfig,
  enabled: boolean,
  projectKey?: string
): JiraFieldMetadata {
  const [metadata, setMetadata] = useState<JiraFieldMetadata>(emptyJiraFieldMetadata);
  const integration = config.integrations.jira;
  const metadataProjectKey = getValidJiraProjectKey(projectKey) || getValidJiraProjectKey(integration.defaultProjectKey);

  useEffect(() => {
    if (!enabled) {
      setMetadata(emptyJiraFieldMetadata);
      return;
    }

    if (!integration.enabled) {
      setMetadata({
        ...emptyJiraFieldMetadata,
        status: "unavailable",
        message: "Jira integration is disabled."
      });
      return;
    }

    if (!metadataProjectKey) {
      setMetadata({
        ...emptyJiraFieldMetadata,
        status: "unavailable",
        message: "Select a Jira project key to load dynamic Jira options."
      });
      return;
    }

    const localToken = readLocalIntegrationSecrets().jiraToken?.trim() ?? "";

    if (!localToken) {
      setMetadata({
        ...emptyJiraFieldMetadata,
        status: "unavailable",
        message: integration.tokenConfigured
          ? "Jira metadata needs the token available in this browser."
          : "Configure a Jira token in Admin > Integrations to load Jira options."
      });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setMetadata({
      ...emptyJiraFieldMetadata,
      status: "loading",
      message: `Loading Jira options for ${metadataProjectKey}...`
    });

    async function loadMetadata() {
      try {
        const response = await fetch("/api/integrations/jira/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            config: {
              enabled: integration.enabled,
              apiBaseUrl: integration.apiBaseUrl,
              apiVersion: integration.apiVersion,
              authMode: integration.authMode,
              username: integration.username,
              token: localToken,
              defaultProjectKey: metadataProjectKey,
              defaultIssueType: integration.defaultIssueType
            }
          }),
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => null)) as
          | IntegrationApiErrorPayload
          | JiraSyncMetadataPayload
          | null;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setMetadata({
            ...emptyJiraFieldMetadata,
            status: "error",
            message: formatIntegrationApiError(
              payload as IntegrationApiErrorPayload | null,
              "Could not load Jira dynamic options."
            )
          });
          return;
        }

        const data = (payload as JiraSyncMetadataPayload | null)?.data;

        setMetadata({
          status: "ready",
          message: `Loaded Jira options for ${data?.project?.key ?? metadataProjectKey}.`,
          warnings: data?.warnings ?? [],
          project: data?.project,
          components: data?.components ?? [],
          versions: data?.versions ?? [],
          priorities: data?.priorities ?? [],
          statuses: data?.statuses ?? [],
          boards: data?.boards ?? [],
          sprints: data?.sprints ?? [],
          assignableUsers: data?.assignableUsers ?? []
        });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        setMetadata({
          ...emptyJiraFieldMetadata,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown Jira metadata load failure."
        });
      }
    }

    void loadMetadata();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    enabled,
    integration.apiBaseUrl,
    integration.apiVersion,
    integration.authMode,
    integration.defaultIssueType,
    integration.defaultProjectKey,
    integration.enabled,
    integration.tokenConfigured,
    integration.username,
    metadataProjectKey
  ]);

  return metadata;
}

function normalizeJiraPriorityLabel(value: string): string {
  return normalizePriorityLabel(value);
}

function getJiraPriorityAliases(value: string): string[] {
  const normalizedValue = normalizeJiraPriorityLabel(value);
  const aliasesByPortalPriority: Record<string, string[]> = {
    critical: ["critical", "urgent", "blocker", "highest"],
    highest: ["highest", "critical", "urgent", "blocker"],
    high: ["high"],
    medium: ["medium"],
    low: ["low"],
    lowest: ["lowest", "very low"],
    "very low": ["very low", "lowest"]
  };

  return aliasesByPortalPriority[normalizedValue] ?? [normalizedValue];
}

function getJiraPriorityName(value: string, options?: JiraMetadataOption[]): string {
  const trimmedValue = value.trim();

  if (!trimmedValue || !options?.length) {
    return trimmedValue;
  }

  const exactMatch = options.find((option) => option.name.trim().toLowerCase() === trimmedValue.toLowerCase());

  if (exactMatch) {
    return exactMatch.name;
  }

  const aliases = new Set(getJiraPriorityAliases(trimmedValue));
  const aliasMatch = options.find((option) => aliases.has(normalizeJiraPriorityLabel(option.name)));

  return aliasMatch?.name ?? trimmedValue;
}

function getJiraBacklogOptions(board: string, backlog: string): string[] {
  return getUniqueOptionValues([
    backlog,
    board ? `${board} backlog` : undefined,
    "Governance intake",
    "Product backlog"
  ]);
}

function getGeneratedTicketJiraDescription(ticket: Ticket): string {
  const userRequest = htmlToPlainTextFallback(ticket.description).trim() || "Not provided";
  const businessImpact = htmlToPlainTextFallback(ticket.dynamicFields["Business impact"] ?? "").trim();
  const lines = [
    `Portal ticket: ${ticket.key}`,
    `Product / PRU / Module: ${[ticket.product, ticket.pru, ticket.module].filter(Boolean).join(" / ") || "Not set"}`,
    `Priority: ${ticket.priority}`,
    `Risk: ${ticket.risk}`,
    "",
    "User request:",
    userRequest,
    businessImpact ? "" : undefined,
    businessImpact ? "Business impact:" : undefined,
    businessImpact || undefined
  ].filter((line): line is string => line !== undefined);

  return lines.join("\n");
}

function getTicketJiraSummary(ticket: Ticket): string {
  return ticket.jiraDraft.summary?.trim() || ticket.title.trim() || ticket.key;
}

function composeJiraDescription(description: string, releaseNote?: string): string {
  const baseDescription = description.trim();
  const releaseNoteText = releaseNote?.trim();

  if (!releaseNoteText) {
    return baseDescription;
  }

  return [baseDescription, "", "Release note:", releaseNoteText].join("\n");
}

function getTicketJiraDescription(ticket: Ticket): string {
  const baseDescription = ticket.jiraDraft.description?.trim() || getGeneratedTicketJiraDescription(ticket);
  return composeJiraDescription(baseDescription, ticket.jiraDraft.releaseNote);
}

function getJiraDraftFormState(ticket: Ticket): JiraDraftFormState {
  const draft = ticket.jiraDraft;

  return {
    summary: getTicketJiraSummary(ticket),
    description: draft.description?.trim() || getGeneratedTicketJiraDescription(ticket),
    releaseNote: draft.releaseNote ?? "",
    project: getValidJiraProjectKey(draft.project),
    board: draft.board,
    backlog: draft.backlog,
    sprint: draft.sprint ?? "",
    fixVersion: draft.fixVersion ?? "",
    fixVersionStartDate: formatReleaseDate(draft.fixVersionStartDate),
    fixVersionReleaseDate: formatReleaseDate(draft.fixVersionReleaseDate),
    components: draft.components.join(", "),
    labels: draft.labels.join(", "),
    priority: draft.priority,
    estimateHours: draft.estimateHours ? String(draft.estimateHours) : "",
    storyPoints: draft.storyPoints ? String(draft.storyPoints) : "",
    assignee: draft.assignee ?? ""
  };
}

function normalizeMetadataName(value: string): string {
  return value.trim().toLowerCase();
}

function getValidJiraMetadataSelections(values: string[], options: JiraMetadataOption[]): string[] {
  const optionNamesByNormalizedValue = new Map(
    options.map((option) => [normalizeMetadataName(option.name), option.name])
  );

  return getUniqueOptionValues(
    values
      .map((value) => optionNamesByNormalizedValue.get(normalizeMetadataName(value)))
      .filter((value): value is string => Boolean(value))
  );
}

function getInvalidJiraMetadataSelections(values: string[], options: JiraMetadataOption[]): string[] {
  const validOptionNames = new Set(options.map((option) => normalizeMetadataName(option.name)));

  return values.filter((value) => !validOptionNames.has(normalizeMetadataName(value)));
}

function getJiraVersionMetadataByName(
  versions: JiraVersionMetadataOption[],
  versionName: string
): JiraVersionMetadataOption | undefined {
  const normalizedVersionName = normalizeMetadataName(versionName);

  if (!normalizedVersionName) {
    return undefined;
  }

  return versions.find((version) => normalizeMetadataName(version.name) === normalizedVersionName);
}

function getReleasePlanDetail(ticket: Ticket, plannedReleaseState: TicketLifecycleStepState): string {
  const fixVersion = ticket.jiraDraft.fixVersion?.trim() ?? "";
  const releaseDate = formatReleaseDateDisplay(ticket.jiraDraft.fixVersionReleaseDate);
  const sprint = ticket.jiraDraft.sprint?.trim() ?? "";

  if (fixVersion && releaseDate) {
    return `${fixVersion} · ${releaseDate}`;
  }

  if (fixVersion) {
    return fixVersion;
  }

  if (sprint) {
    return `Sprint ${sprint}`;
  }

  return plannedReleaseState === "waiting" ? "After close" : "Release not selected";
}

function getSyncedJiraDraftFieldUpdate(
  issueFields?: JiraSyncedIssueFieldsInput
): Pick<Ticket["jiraDraft"], "fixVersion" | "fixVersionStartDate" | "fixVersionReleaseDate" | "estimateHours" | "remainingHours"> | undefined {
  if (!issueFields) {
    return undefined;
  }

  const primaryFixVersion = issueFields.fixVersions?.find((version) => version.name?.trim());
  const startDate = formatReleaseDate(primaryFixVersion?.startDate || primaryFixVersion?.userStartDate);
  const releaseDate = formatReleaseDate(primaryFixVersion?.releaseDate || primaryFixVersion?.userReleaseDate);
  const estimateHours =
    typeof issueFields.estimateHours === "number" && Number.isFinite(issueFields.estimateHours) && issueFields.estimateHours >= 0
      ? issueFields.estimateHours
      : undefined;
  const remainingHours =
    typeof issueFields.remainingHours === "number" && Number.isFinite(issueFields.remainingHours) && issueFields.remainingHours >= 0
      ? issueFields.remainingHours
      : undefined;

  if (!primaryFixVersion && estimateHours === undefined && remainingHours === undefined) {
    return undefined;
  }

  return {
    fixVersion: primaryFixVersion?.name?.trim() || undefined,
    fixVersionStartDate: startDate || undefined,
    fixVersionReleaseDate: releaseDate || undefined,
    estimateHours,
    remainingHours
  };
}

function jiraDraftFieldsChanged(
  draft: Ticket["jiraDraft"],
  update?: Pick<Ticket["jiraDraft"], "fixVersion" | "fixVersionStartDate" | "fixVersionReleaseDate" | "estimateHours" | "remainingHours">
): boolean {
  if (!update) {
    return false;
  }

  return (
    (draft.fixVersion ?? "") !== (update.fixVersion ?? "") ||
    (formatReleaseDate(draft.fixVersionStartDate) || "") !== (formatReleaseDate(update.fixVersionStartDate) || "") ||
    (formatReleaseDate(draft.fixVersionReleaseDate) || "") !== (formatReleaseDate(update.fixVersionReleaseDate) || "") ||
    (draft.estimateHours ?? undefined) !== (update.estimateHours ?? undefined) ||
    (draft.remainingHours ?? undefined) !== (update.remainingHours ?? undefined)
  );
}

function formatSyncedJiraFieldSummary(
  update?: Pick<Ticket["jiraDraft"], "fixVersion" | "fixVersionStartDate" | "fixVersionReleaseDate" | "estimateHours" | "remainingHours">
): string {
  if (!update) {
    return "";
  }

  const startDate = formatReleaseDateDisplay(update.fixVersionStartDate);
  const releaseDate = formatReleaseDateDisplay(update.fixVersionReleaseDate);
  const dateSummary = [
    startDate ? `start ${startDate}` : "",
    releaseDate ? `release ${releaseDate}` : ""
  ].filter(Boolean).join(", ");

  const releaseSummary = update.fixVersion
    ? dateSummary
      ? `Jira fix version synced: ${update.fixVersion} (${dateSummary}).`
      : `Jira fix version synced: ${update.fixVersion}.`
    : "";
  const timeSummary = [
    typeof update.estimateHours === "number" ? `estimate ${formatCount(update.estimateHours)}h` : "",
    typeof update.remainingHours === "number" ? `remaining ${formatCount(update.remainingHours)}h` : ""
  ].filter(Boolean).join(", ");

  return [
    releaseSummary,
    timeSummary ? `Jira time synced: ${timeSummary}.` : ""
  ].filter(Boolean).join(" ");
}

function getJiraDraftUpdateInput(
  form: JiraDraftFormState,
  validComponentOptions?: JiraMetadataOption[],
  validPriorityOptions?: JiraMetadataOption[]
): JiraDraftUpdateInput {
  const parsedComponents = parseCommaSeparatedValues(form.components);

  return {
    summary: optionalText(form.summary),
    description: optionalText(form.description),
    releaseNote: optionalText(form.releaseNote),
    project: getValidJiraProjectKey(form.project),
    board: form.board.trim(),
    backlog: form.backlog.trim(),
    sprint: optionalText(form.sprint),
    fixVersion: optionalText(form.fixVersion),
    fixVersionStartDate: optionalText(form.fixVersionStartDate),
    fixVersionReleaseDate: optionalText(form.fixVersionReleaseDate),
    components: validComponentOptions
      ? getValidJiraMetadataSelections(parsedComponents, validComponentOptions)
      : parsedComponents,
    labels: parseCommaSeparatedValues(form.labels),
    priority: getJiraPriorityName(form.priority, validPriorityOptions),
    estimateHours: optionalPositiveNumber(form.estimateHours),
    remainingHours: undefined,
    storyPoints: optionalPositiveNumber(form.storyPoints),
    assignee: optionalText(form.assignee)
  };
}

function applyJiraDraftUpdate(
  draft: Ticket["jiraDraft"],
  update?: JiraDraftUpdateInput
): Ticket["jiraDraft"] {
  if (!update) {
    return draft;
  }

  return {
    ...draft,
    summary: update.summary,
    description: update.description,
    releaseNote: update.releaseNote,
    project: update.project || getValidJiraProjectKey(draft.project) || draft.project,
    board: update.board || draft.board,
    backlog: update.backlog || draft.backlog,
    sprint: update.sprint,
    fixVersion: update.fixVersion,
    fixVersionStartDate: update.fixVersionStartDate,
    fixVersionReleaseDate: update.fixVersionReleaseDate,
    components: update.components,
    labels: update.labels,
    priority: update.priority || draft.priority,
    estimateHours: update.estimateHours,
    remainingHours: update.remainingHours ?? draft.remainingHours,
    storyPoints: update.storyPoints,
    assignee: update.assignee,
    linkedEpic: undefined
  };
}

function createJiraDraftAuditChanges(ticket: Ticket, nextDraft: Ticket["jiraDraft"]): TicketUpdateChange[] {
  const previousDraft = ticket.jiraDraft;
  const nextTicket = {
    ...ticket,
    jiraDraft: nextDraft
  };
  const generatedDescription = getGeneratedTicketJiraDescription(ticket);
  const fields: Array<{
    field: string;
    previousValue: string;
    nextValue: string;
    summarize?: boolean;
  }> = [
    {
      field: "Jira title",
      previousValue: getTicketJiraSummary(ticket),
      nextValue: getTicketJiraSummary(nextTicket),
      summarize: true
    },
    {
      field: "Jira description",
      previousValue: previousDraft.description?.trim() || generatedDescription,
      nextValue: nextDraft.description?.trim() || generatedDescription,
      summarize: true
    },
    {
      field: "Release note",
      previousValue: previousDraft.releaseNote ?? "",
      nextValue: nextDraft.releaseNote ?? "",
      summarize: true
    },
    { field: "Project", previousValue: previousDraft.project, nextValue: nextDraft.project },
    { field: "Board", previousValue: previousDraft.board, nextValue: nextDraft.board },
    { field: "Backlog", previousValue: previousDraft.backlog, nextValue: nextDraft.backlog },
    { field: "Sprint", previousValue: previousDraft.sprint ?? "", nextValue: nextDraft.sprint ?? "" },
    { field: "Fix version", previousValue: previousDraft.fixVersion ?? "", nextValue: nextDraft.fixVersion ?? "" },
    {
      field: "Fix version start date",
      previousValue: previousDraft.fixVersionStartDate ?? "",
      nextValue: nextDraft.fixVersionStartDate ?? ""
    },
    {
      field: "Fix version release date",
      previousValue: previousDraft.fixVersionReleaseDate ?? "",
      nextValue: nextDraft.fixVersionReleaseDate ?? ""
    },
    {
      field: "Components",
      previousValue: previousDraft.components.join(", "),
      nextValue: nextDraft.components.join(", ")
    },
    { field: "Labels", previousValue: previousDraft.labels.join(", "), nextValue: nextDraft.labels.join(", ") },
    { field: "Priority", previousValue: previousDraft.priority, nextValue: nextDraft.priority },
    {
      field: "Estimate hours",
      previousValue: previousDraft.estimateHours ? String(previousDraft.estimateHours) : "",
      nextValue: nextDraft.estimateHours ? String(nextDraft.estimateHours) : ""
    },
    {
      field: "Remaining hours",
      previousValue: typeof previousDraft.remainingHours === "number" ? String(previousDraft.remainingHours) : "",
      nextValue: typeof nextDraft.remainingHours === "number" ? String(nextDraft.remainingHours) : ""
    },
    {
      field: "Story points",
      previousValue: previousDraft.storyPoints ? String(previousDraft.storyPoints) : "",
      nextValue: nextDraft.storyPoints ? String(nextDraft.storyPoints) : ""
    },
    { field: "Assignee", previousValue: previousDraft.assignee ?? "", nextValue: nextDraft.assignee ?? "" }
  ];

  return fields
    .filter(({ previousValue, nextValue }) => previousValue !== nextValue)
    .map(({ field, previousValue, nextValue, summarize }) => ({
      field,
      oldValue: summarize ? summarizeTicketUpdateValue(previousValue) : previousValue || "Blank",
      newValue: summarize ? summarizeTicketUpdateValue(nextValue) : nextValue || "Blank"
    }));
}

function getValidJiraProjectKey(value?: string): string {
  return extractJiraProjectKey(value);
}

function getValidJiraIssueKey(value?: string): string {
  return extractJiraIssueKey(value);
}

function buildTicketJiraActionConfig(
  ticket: Ticket,
  draft: Ticket["jiraDraft"],
  config: AdminConfig,
  token: string
): JiraActionConfig {
  const integration = config.integrations.jira;
  const productProjectKey = getConfigProduct(config, ticket.product)?.jiraProjectKey;
  const projectKey =
    getValidJiraProjectKey(draft.project) ||
    getValidJiraProjectKey(productProjectKey) ||
    getValidJiraProjectKey(integration.defaultProjectKey);

  return {
    enabled: integration.enabled,
    apiBaseUrl: getJiraApiBaseUrl(integration),
    apiVersion: integration.apiVersion ?? "rest/api/2",
    authMode: integration.authMode ?? "personalAccessToken",
    username: integration.username,
    token,
    defaultProjectKey: projectKey,
    defaultIssueType: integration.defaultIssueType.trim()
  };
}

function buildTicketJiraAttachmentPayloads(ticket: Ticket): JiraIssueAttachmentInput[] {
  return ticket.attachments.map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    contentDataUrl: attachment.contentDataUrl
  }));
}

function buildTicketJiraIssuePayload(ticket: Ticket) {
  return {
    summary: getTicketJiraSummary(ticket),
    description: getTicketJiraDescription(ticket),
    sourceTicketKey: ticket.key,
    labels: getJiraLabelsWithModule(ticket.jiraDraft.labels, ticket.module),
    components: ticket.jiraDraft.components,
    fixVersion: ticket.jiraDraft.fixVersion,
    priority: ticket.jiraDraft.priority || ticket.priority,
    estimateHours: ticket.jiraDraft.estimateHours,
    attachments: buildTicketJiraAttachmentPayloads(ticket)
  };
}

function getJiraIssueUrl(config: AdminConfig, jiraKey?: string): string {
  const normalizedKey = jiraKey?.trim();
  const jiraBaseUrl = getJiraApiBaseUrl(config.integrations.jira);

  if (!normalizedKey || !jiraBaseUrl) {
    return "";
  }

  return `${jiraBaseUrl}/browse/${encodeURIComponent(normalizedKey)}`;
}

function JiraIssueLink({
  config,
  jiraKey,
  className = "jira-issue-link"
}: {
  config: AdminConfig;
  jiraKey?: string;
  className?: string;
}) {
  if (!jiraKey) {
    return <span className="jira-issue-empty">Not linked</span>;
  }

  const normalizedJiraKey = getValidJiraIssueKey(jiraKey);

  if (!normalizedJiraKey) {
    return <span className={className}>{jiraKey}</span>;
  }

  const jiraIssueUrl = getJiraIssueUrl(config, normalizedJiraKey);

  if (!jiraIssueUrl) {
    return <span className={className}>{normalizedJiraKey}</span>;
  }

  return (
    <a className={className} href={jiraIssueUrl} rel="noreferrer" target="_blank">
      {normalizedJiraKey}
      <TegelIcon name="link" size="14px" />
    </a>
  );
}

function getTicketQueueBucket(ticket: Ticket): QueueTicketBucket {
  const allRequiredGatesComplete = ticket.workflow.every(
    (step) => step.status === "complete" || step.status === "optional"
  );
  const followUpStatus = getTicketJiraFollowUpStatus(ticket);
  const hasBlockingSignal = ticketHasBlockingSignal(ticket);
  const hasActiveGate = ticket.workflow.some((step) =>
    ["active", "delegated"].includes(step.status)
  );

  if (ticket.state === "closed" || followUpStatus === "done" || followUpStatus === "rejected") {
    return "done";
  }

  if (ticket.relatedJiraKey) {
    return followUpStatus === "blocked" || ticket.state === "escalated" ? "blocked" : "ongoing";
  }

  if (hasBlockingSignal) {
    return "blocked";
  }

  if (
    ticket.relatedJiraKey ||
    allRequiredGatesComplete ||
    hasActiveGate ||
    ["approval", "clarification", "jira_draft", "jira_synced", "escalated"].includes(ticket.state)
  ) {
    return "ongoing";
  }

  return "open";
}

function ticketMatchesQueueFilter(ticket: Ticket, filter: QueueStatusFilter): boolean {
  const bucket = getTicketQueueBucket(ticket);

  if (filter === "all") {
    return true;
  }

  if (filter === "open") {
    return bucket !== "done";
  }

  return bucket === filter;
}

function getQueueBucketLabel(bucket: QueueTicketBucket): string {
  if (bucket === "ongoing") {
    return "Ongoing";
  }

  if (bucket === "blocked") {
    return "Blocked";
  }

  if (bucket === "done") {
    return "Done";
  }

  return "Open";
}

function AppIcon({
  status,
  className = ""
}: {
  status: WorkflowStepStatus | SlaState;
  className?: string;
}) {
  if (status === "complete" || status === "healthy") {
    return <TegelIcon className={className} name="tick" size="24px" />;
  }

  if (status === "active" || status === "watch") {
    return <TegelIcon className={className} name="info" size="24px" />;
  }

  if (status === "blocked" || status === "breach") {
    return <TegelIcon className={className} name="warning" size="24px" />;
  }

  return <TegelIcon className={className} name="clock" size="24px" />;
}

function getNextTicketKey(ticketList: Ticket[]): string {
  const maxTicketNumber = ticketList.reduce((max, ticket) => {
    const match = /^NEX-(\d+)$/.exec(ticket.key);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 2400);

  return `NEX-${maxTicketNumber + 1}`;
}

function formatLocalTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatByteSize(byteSize: number): string {
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (byteSize >= 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${byteSize} B`;
}

const attachmentMaxLocalContentBytes = 50 * 1024 * 1024;

type AttachmentLike = Pick<Ticket["attachments"][number], "fileName" | "mimeType" | "contentDataUrl">;
type AttachmentPreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "office" | "unsupported" | "metadata";

const attachmentMimeTypeByExtension: Record<string, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  md: "text/markdown",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odt: "application/vnd.oasis.opendocument.text",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  svg: "image/svg+xml",
  txt: "text/plain",
  wav: "audio/wav",
  webm: "video/webm",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xml: "application/xml",
  yaml: "application/x-yaml",
  yml: "application/x-yaml"
};

const textAttachmentExtensions = new Set([
  "cfg",
  "conf",
  "css",
  "csv",
  "env",
  "ini",
  "js",
  "json",
  "log",
  "md",
  "markdown",
  "sql",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml"
]);

const officeAttachmentExtensions = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";

  return extension === fileName.toLowerCase() ? "" : extension;
}

function inferAttachmentMimeType(fileName: string, mimeType: string): string {
  const normalizedMimeType = mimeType.trim();

  if (normalizedMimeType) {
    return normalizedMimeType;
  }

  return attachmentMimeTypeByExtension[getFileExtension(fileName)] ?? "application/octet-stream";
}

function getAttachmentPreviewKind(attachment: AttachmentLike): AttachmentPreviewKind {
  if (!attachment.contentDataUrl) {
    return "metadata";
  }

  const mimeType = inferAttachmentMimeType(attachment.fileName, attachment.mimeType).toLowerCase();
  const extension = getFileExtension(attachment.fileName);

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType === "application/pdf") {
    return "pdf";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (officeAttachmentExtensions.has(extension)) {
    return "office";
  }

  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("yaml") ||
    textAttachmentExtensions.has(extension)
  ) {
    return "text";
  }

  return "unsupported";
}

function getAttachmentKindLabel(attachment: AttachmentLike): string {
  const extension = getFileExtension(attachment.fileName);
  const previewKind = getAttachmentPreviewKind(attachment);

  if (previewKind === "metadata") {
    return extension ? `${extension.toUpperCase()} metadata` : "File metadata";
  }

  if (previewKind === "office") {
    return "Office document";
  }

  if (previewKind === "text" && (extension === "yaml" || extension === "yml")) {
    return "YAML";
  }

  if (previewKind === "text" && (extension === "md" || extension === "markdown")) {
    return "Markdown";
  }

  return previewKind === "pdf" ? "PDF" : `${previewKind[0].toUpperCase()}${previewKind.slice(1)}`;
}

function attachmentHasInlinePreview(attachment: AttachmentLike): boolean {
  return ["image", "pdf", "video", "audio", "text"].includes(getAttachmentPreviewKind(attachment));
}

function readAttachmentFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}.`));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error(`Failed to read ${file.name} as a browser-safe data URL.`));
    };
    reader.readAsDataURL(file);
  });
}

async function buildAttachmentInputsFromFiles(files: File[]): Promise<{
  attachments: NewTicketAttachmentInput[];
  rejectedFileNames: string[];
}> {
  const acceptedFiles = files.filter((file) => file.size <= attachmentMaxLocalContentBytes);
  const rejectedFileNames = files
    .filter((file) => file.size > attachmentMaxLocalContentBytes)
    .map((file) => file.name);
  const attachments = await Promise.all(
    acceptedFiles.map(async (file) => ({
      fileName: file.name,
      mimeType: inferAttachmentMimeType(file.name, file.type),
      byteSize: file.size,
      contentDataUrl: await readAttachmentFileAsDataUrl(file)
    }))
  );

  return { attachments, rejectedFileNames };
}

function getAttachmentLimitError(rejectedFileNames: string[]): string {
  if (!rejectedFileNames.length) {
    return "";
  }

  return `Skipped ${rejectedFileNames.join(", ")} because local attachment storage is limited to ${formatByteSize(
    attachmentMaxLocalContentBytes
  )} per file. Use object storage for larger files.`;
}

function createAttachmentRecord(
  ticketKey: string,
  attachment: NewTicketAttachmentInput,
  index: number,
  actor: RolePersonaOption,
  now: Date
): Ticket["attachments"][number] {
  const mimeType = inferAttachmentMimeType(attachment.fileName, attachment.mimeType);
  const attachmentForPreview = {
    fileName: attachment.fileName,
    mimeType,
    contentDataUrl: attachment.contentDataUrl
  };

  return {
    id: `attachment-${ticketKey}-${now.getTime()}-${index}`,
    fileName: attachment.fileName,
    mimeType,
    byteSize: attachment.byteSize,
    sizeLabel: formatByteSize(attachment.byteSize),
    relation: "ticket_information",
    uploadedBy: actor.displayName,
    uploadedAt: formatLocalTimestamp(now),
    storageProvider: "local",
    previewAvailable: attachmentHasInlinePreview(attachmentForPreview),
    contentDataUrl: attachment.contentDataUrl
  };
}

function updateAttachmentRecordContent(
  currentAttachment: Ticket["attachments"][number],
  attachment: NewTicketAttachmentInput,
  actor: RolePersonaOption,
  now: Date
): Ticket["attachments"][number] {
  const mimeType = inferAttachmentMimeType(attachment.fileName, attachment.mimeType);
  const attachmentForPreview = {
    fileName: attachment.fileName,
    mimeType,
    contentDataUrl: attachment.contentDataUrl
  };

  return {
    ...currentAttachment,
    fileName: attachment.fileName,
    mimeType,
    byteSize: attachment.byteSize,
    sizeLabel: formatByteSize(attachment.byteSize),
    uploadedBy: actor.displayName,
    uploadedAt: formatLocalTimestamp(now),
    storageProvider: "local",
    previewAvailable: attachmentHasInlinePreview(attachmentForPreview),
    contentDataUrl: attachment.contentDataUrl
  };
}

const richTextImageMaxBytes = 3 * 1024 * 1024;
const richTextImageMinResizePixels = 48;
const richTextImageMaxResizePixels = 1600;
const richTextImageMinResizePercent = 15;
const richTextImageMaxResizePercent = 100;
const richTextImageResizeStepPercent = 5;
const richTextAllowedTags = new Set([
  "a",
  "blockquote",
  "br",
  "em",
  "h3",
  "h4",
  "img",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "u",
  "ul"
]);

interface SelectedRichTextImageState {
  widthPercent: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToRichHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function isLikelyHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function htmlToPlainTextFallback(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'");
}

function isSafeRichTextLink(value: string): boolean {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return false;
  }

  if (trimmedValue.startsWith("/") || trimmedValue.startsWith("#")) {
    return true;
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    return ["http:", "https:", "mailto:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function isSafeRichTextImageSource(value: string): boolean {
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

function sanitizeRichTextImageDimension(value: string): string {
  const trimmedValue = value.trim();
  const pixelMatch = /^(\d{1,4})(?:px)?$/i.exec(trimmedValue);

  if (pixelMatch) {
    const pixels = Number(pixelMatch[1]);

    if (Number.isFinite(pixels)) {
      return `${Math.min(Math.max(Math.round(pixels), richTextImageMinResizePixels), richTextImageMaxResizePixels)}px`;
    }
  }

  const percentMatch = /^(\d{1,3})(?:\.\d+)?%$/.exec(trimmedValue);

  if (percentMatch) {
    const percent = Number.parseFloat(trimmedValue);

    if (Number.isFinite(percent)) {
      return `${Math.min(Math.max(percent, 5), 100)}%`;
    }
  }

  return "";
}

function getSanitizedRichTextImageDimension(
  element: HTMLElement,
  styleProperty: "width" | "height",
  attributeName: "width" | "height"
): string {
  return sanitizeRichTextImageDimension(element.style[styleProperty] || element.getAttribute(attributeName) || "");
}

function sanitizeCssColor(value: string): string {
  const trimmedValue = value.trim();

  if (
    /^#[0-9a-f]{3,8}$/i.test(trimmedValue) ||
    /^rgba?\([\d\s,.%]+\)$/i.test(trimmedValue) ||
    /^[a-z]+$/i.test(trimmedValue)
  ) {
    return trimmedValue;
  }

  return "";
}

function sanitizeRichTextNode(node: Node, outputDocument: Document): Node {
  if (node.nodeType === Node.TEXT_NODE) {
    return outputDocument.createTextNode(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return outputDocument.createDocumentFragment();
  }

  const element = node as HTMLElement;
  const rawTagName = element.tagName.toLowerCase();
  const tagName =
    rawTagName === "b"
      ? "strong"
      : rawTagName === "i"
        ? "em"
        : rawTagName === "font"
          ? "span"
          : rawTagName === "div"
            ? "p"
            : rawTagName;

  if (!richTextAllowedTags.has(tagName)) {
    const fragment = outputDocument.createDocumentFragment();

    for (const child of Array.from(element.childNodes)) {
      fragment.appendChild(sanitizeRichTextNode(child, outputDocument));
    }

    return fragment;
  }

  if (tagName === "br") {
    return outputDocument.createElement("br");
  }

  if (tagName === "img") {
    const source = element.getAttribute("src") ?? "";

    if (!isSafeRichTextImageSource(source)) {
      return outputDocument.createDocumentFragment();
    }

    const image = outputDocument.createElement("img");
    const width = getSanitizedRichTextImageDimension(element, "width", "width");
    const height = getSanitizedRichTextImageDimension(element, "height", "height");

    image.setAttribute("src", source);
    image.setAttribute("alt", element.getAttribute("alt")?.slice(0, 120) || "Embedded image");

    if (width) {
      image.style.width = width;
    }

    if (height) {
      image.style.height = height;
    }

    return image;
  }

  const cleanElement = outputDocument.createElement(tagName);

  if (tagName === "a") {
    const href = element.getAttribute("href") ?? "";

    if (isSafeRichTextLink(href)) {
      cleanElement.setAttribute("href", href);
      cleanElement.setAttribute("rel", "noreferrer");
      cleanElement.setAttribute("target", "_blank");
    }
  }

  if (tagName === "span") {
    const color = sanitizeCssColor(element.style.color || element.getAttribute("color") || "");

    if (color) {
      cleanElement.style.color = color;
    }
  }

  for (const child of Array.from(element.childNodes)) {
    cleanElement.appendChild(sanitizeRichTextNode(child, outputDocument));
  }

  return cleanElement;
}

function sanitizeRichText(value: string, sourceMode: "auto" | "html" = "auto"): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return textToRichHtml(htmlToPlainTextFallback(trimmedValue));
  }

  const source =
    sourceMode === "html" || isLikelyHtml(trimmedValue) || /&(?:[a-z]+|#[0-9]+);/i.test(trimmedValue)
      ? trimmedValue
      : textToRichHtml(trimmedValue);
  const parsedDocument = new DOMParser().parseFromString(source, "text/html");
  const container = window.document.createElement("div");

  for (const child of Array.from(parsedDocument.body.childNodes)) {
    container.appendChild(sanitizeRichTextNode(child, window.document));
  }

  return container.innerHTML.trim();
}

function isRichTextBlank(value: string): boolean {
  const sanitizedValue = sanitizeRichText(value);

  if (!sanitizedValue) {
    return true;
  }

  if (/<img\b/i.test(sanitizedValue)) {
    return false;
  }

  if (typeof window === "undefined") {
    return !htmlToPlainTextFallback(sanitizedValue).trim();
  }

  const container = window.document.createElement("div");
  container.innerHTML = sanitizedValue;

  return !container.textContent?.trim();
}

function normalizeRichTextForStorage(value: string, sourceMode: "auto" | "html" = "auto"): string {
  const sanitizedValue = sanitizeRichText(value, sourceMode);

  return isRichTextBlank(sanitizedValue) ? "" : sanitizedValue;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error(`Could not read ${file.name || "image file"}.`));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

function selectionIsInsideElement(element: HTMLElement): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  const anchorNode = selection?.anchorNode;

  if (!selection || !anchorNode) {
    return false;
  }

  return element.contains(anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement);
}

function buildWorkflowForTicket(form: NewTicketFormState, config: AdminConfig): Ticket["workflow"] {
  const steps = getConfiguredWorkflowStepsForTicketType(config, form.typeId);
  const ticketScope = {
    product: form.product,
    pru: form.pru,
    site: form.site
  };

  return steps.map((step, index) => {
    const ownerName = step.required
      ? getMappedWorkflowOwnerName(config, ticketScope, step.ownerRole) ?? "Unassigned"
      : "Optional";

    return {
      id: `${step.id}-${Date.now()}-${index}`,
      label: step.label,
      ownerRole: step.ownerRole,
      workflowType: step.workflowType,
      ownerName,
      status: step.required ? (index === 0 ? "active" : "waiting") : "optional",
      slaState: "healthy",
      dueAt: "Not scheduled",
      parallelGroup: step.parallelGroup
    };
  });
}

function buildTicketDynamicFields(
  form: NewTicketFormState,
  config: AdminConfig,
  roleLabel: string
): Record<string, string> {
  const formTemplate = getFormTemplateForTicket(config, form.product, form.typeId);
  const businessImpact = normalizeRichTextForStorage(form.businessImpact);
  const dynamicFields: Record<string, string> = {
    Region: form.region || "Not selected",
    "Business impact": businessImpact || "Not provided",
    Labels: form.labels.trim() || "Not provided",
    "Expected completion date": form.expectedCompletionDate || "Not provided",
    "Form template": formTemplate?.title ?? "No product-specific template matched",
    "User role": roleLabel,
    "Created from": "NEXUS Portal intake form"
  };

  const templateFields = [...(formTemplate?.fields ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);

  for (const field of templateFields) {
    const answer = normalizeRichTextForStorage(form.dynamicAnswers[field.id] ?? "");
    const label = dynamicFields[field.label] ? `${field.label} (template)` : field.label;

    dynamicFields[label] = answer || "Not provided";
  }

  return dynamicFields;
}

function getFirstTemplateAnswerByOptionSource(
  form: NewTicketFormState,
  formTemplate: ProductFormTemplate | undefined,
  optionSources: FormTemplateOptionSource[]
): string {
  const sourceSet = new Set<FormTemplateOptionSource>(optionSources);
  const matchingField = [...(formTemplate?.fields ?? [])]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .find((field) => field.optionSource && sourceSet.has(field.optionSource));
  const answer = matchingField ? form.dynamicAnswers[matchingField.id] ?? "" : "";

  return answer
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0] ?? "";
}

function createTicketFromForm(
  form: NewTicketFormState,
  ticketList: Ticket[],
  actor: RolePersonaOption,
  config: AdminConfig
): Ticket {
  const now = new Date();
  const timestamp = formatLocalTimestamp(now);
  const ticketKey = getNextTicketKey(ticketList);
  const roleLabel = actor.roleLabel;
  const productConfig = getConfigProduct(config, form.product);
  const slaPolicy = getSlaPolicyForConfig(config, form.typeId);
  const moduleName = form.module.trim();
  const moduleConfig = getConfigModuleForTicket(config, form.product, form.pru, moduleName);
  const jiraComponent = moduleConfig?.jiraComponent?.trim();
  const formTemplate = getFormTemplateForTicket(config, form.product, form.typeId);
  const selectedFixVersion = getFirstTemplateAnswerByOptionSource(form, formTemplate, [
    "jiraUnreleasedVersions",
    "jiraVersions"
  ]);
  const selectedSprint = getFirstTemplateAnswerByOptionSource(form, formTemplate, ["jiraSprints"]);
  const priority = form.priority || "2 - Medium";
  const risk = form.risk || "Medium";
  const labels = form.labels
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  const jiraLabels = getJiraLabelsWithModule(labels.length ? labels : ["nexus-draft"], moduleName);

  return {
    id: `ticket-${now.getTime()}`,
    key: ticketKey,
    title: form.title.trim(),
    typeId: form.typeId,
    state: "intake",
    pru: form.pru,
    site: form.site,
    product: form.product,
    module: form.module.trim(),
    priority,
    risk,
    slaLabel: slaPolicy ? `${slaPolicy.responseHours}h response target` : "Pending SLA",
    slaState: "healthy",
    description: normalizeRichTextForStorage(form.description),
    dynamicFields: buildTicketDynamicFields(form, config, roleLabel),
    workflow: buildWorkflowForTicket(form, config),
    participants: [],
    clarifications: [],
    escalations: [],
    jiraDraft: {
      summary: form.title.trim(),
      project: productConfig?.jiraProjectKey ?? config.integrations.jira.defaultProjectKey,
      board: "Draft board",
      backlog: "Governance intake",
      sprint: selectedSprint || undefined,
      fixVersion: selectedFixVersion || undefined,
      components: jiraComponent ? [jiraComponent] : [],
      labels: jiraLabels,
      priority,
      status: "metadata_loaded",
      followUpStatus: "not_created"
    },
    attachments: form.attachments.map((attachment, index) =>
      createAttachmentRecord(ticketKey, attachment, index, actor, now)
    ),
    audit: [
      {
        id: `audit-${ticketKey}-created`,
        eventType: "Ticket created",
        actor: formatPersonaAuditActor(actor),
        createdAt: timestamp,
        visibility: "admin_only",
        newValue: ticketKey,
        reason: "Created from NEXUS Portal intake form."
      }
    ],
    comments: [
      {
        id: `comment-${ticketKey}-created`,
        author: actor.displayName,
        role: roleLabel,
        body: "Ticket created and ready for governed intake.",
        createdAt: timestamp,
        visibility: "public",
        source: "portal"
      }
    ],
    updatedAt: timestamp
  };
}

export function NexusPortal() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [config, setConfig] = useState<AdminConfig>(() => createEmptyAdminConfig());
  const [hasLoadedConfig, setHasLoadedConfig] = useState(false);
  const [canPersistConfig, setCanPersistConfig] = useState(false);
  const [isTegelShellMounted, setIsTegelShellMounted] = useState(false);
  const [ticketList, setTicketList] = useState<Ticket[]>(() => initialTickets);
  const [hasLoadedTickets, setHasLoadedTickets] = useState(false);
  const [canPersistTickets, setCanPersistTickets] = useState(false);
  const [selectedTicketKey, setSelectedTicketKey] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("Overview");
  const [isTicketDetailOpen, setIsTicketDetailOpen] = useState(false);
  const [role, setRole] = useState<RoleKey>("requester");
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [query, setQuery] = useState("");
  const [isCreateTicketOpen, setIsCreateTicketOpen] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [readNotificationIdsByPersona, setReadNotificationIdsByPersona] = useState<Record<string, string[]>>({});
  const [checkedJiraIdsByPersona, setCheckedJiraIdsByPersona] = useState<Record<string, string[]>>({});
  const [sentEmailNotificationIds, setSentEmailNotificationIds] = useState<string[]>([]);
  const [jiraCreationInFlightTicketKeys, setJiraCreationInFlightTicketKeys] = useState<string[]>([]);
  const [jiraUpdateInFlightTicketKeys, setJiraUpdateInFlightTicketKeys] = useState<string[]>([]);
  const [jiraBulkSyncState, setJiraBulkSyncState] = useState<"idle" | "syncing">("idle");
  const [jiraBulkSyncMessage, setJiraBulkSyncMessage] = useState("");
  const [jiraBulkSyncError, setJiraBulkSyncError] = useState("");
  const emailNotificationsInFlightRef = useRef<Set<string>>(new Set());
  const initialTicketLinkHandledRef = useRef(false);
  const startupJiraSyncHandledRef = useRef(false);

  const roleOptions = useMemo(() => getRoleOptions(config), [config]);
  const rolePersonaOptions = useMemo(() => buildRolePersonaOptions(config), [config]);
  const selectedPersona =
    rolePersonaOptions.find((option) => option.id === selectedPersonaId && option.role === role) ??
    rolePersonaOptions.find((option) => option.role === role) ??
    rolePersonaOptions[0] ??
    createFallbackRolePersona({ key: "requester", label: "User" });
  const roleScopedTickets = useMemo(
    () => getRoleScopedTickets(ticketList, role, config),
    [config, role, ticketList]
  );
  const ticketListTickets = useMemo(
    () => (role === "requester" ? ticketList : roleScopedTickets),
    [role, roleScopedTickets, ticketList]
  );
  const dashboardTickets = useMemo(
    () =>
      role === "requester"
        ? ticketList.filter((ticket) => ticketWasSubmittedByPersona(ticket, selectedPersona))
        : roleScopedTickets,
    [role, roleScopedTickets, selectedPersona, ticketList]
  );
  const clarificationTickets = useMemo(
    () => roleScopedTickets.filter((ticket) => ticketHasOpenClarification(ticket)),
    [roleScopedTickets]
  );
  const activeModuleTickets =
    activeModule === "dashboard"
      ? dashboardTickets
      : activeModule === "tickets"
        ? ticketListTickets
        : activeModule === "clarifications"
          ? clarificationTickets
          : roleScopedTickets;
  const selectedTicket =
    activeModuleTickets.find((ticket) => ticket.key === selectedTicketKey) ?? activeModuleTickets[0];
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => roleCanAccessNavItem(role, item)),
    [role]
  );

  const filteredTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return dashboardTickets;
    }

    return dashboardTickets.filter((ticket) => getTicketSearchText(ticket, config).includes(normalizedQuery));
  }, [config, dashboardTickets, query]);

  const readNotificationIds = useMemo(
    () => new Set(readNotificationIdsByPersona[selectedPersona.id] ?? []),
    [readNotificationIdsByPersona, selectedPersona.id]
  );
  const checkedJiraItemIds = useMemo(
    () => new Set(checkedJiraIdsByPersona[selectedPersona.id] ?? []),
    [checkedJiraIdsByPersona, selectedPersona.id]
  );
  const currentJiraAttentionIds = useMemo(() => getJiraAttentionIds(roleScopedTickets), [roleScopedTickets]);
  const visibleNotifications = useMemo(
    () =>
      [
        ...filterVisible(initialNotifications, role),
        ...buildJiraReadyToCreateNotifications(ticketList, selectedPersona, config),
        ...buildClarificationNotifications(ticketList, role, selectedPersona, config)
      ]
        .filter((item) => !readNotificationIds.has(item.id))
        .sort((left, right) => parseTicketTimestamp(right.createdAt) - parseTicketTimestamp(left.createdAt))
        .map((item) => ({
          ...item,
          unread: item.unread
        })),
    [config, readNotificationIds, role, selectedPersona, ticketList]
  );
  const visibleAudit = selectedTicket ? filterVisible(selectedTicket.audit, role) : [];
  const visibleComments = selectedTicket ? filterVisible(selectedTicket.comments, role) : [];
  const headerAttentionItems = useMemo(
    () =>
      buildHeaderAttentionItems({
        config,
        checkedJiraItemIds,
        role,
        selectedPersona,
        tickets: roleScopedTickets,
        visibleNotifications
      }),
    [checkedJiraItemIds, config, role, roleScopedTickets, selectedPersona, visibleNotifications]
  );
  const attentionCountsByModule = useMemo(
    () =>
      headerAttentionItems.reduce((counts, item) => {
        counts[item.module] = (counts[item.module] ?? 0) + item.count;

        return counts;
      }, {} as Partial<Record<ModuleKey, number>>),
    [headerAttentionItems]
  );

  useEffect(() => {
    let animationFrame = 0;
    let isCancelled = false;

    function mountShellAfterThemeIsReady(attempt = 0) {
      const rootStyles = window.getComputedStyle(document.documentElement);
      const hasBrand = rootStyles.getPropertyValue("--tds-brand-name").trim();
      const hasHeaderIcons = rootStyles.getPropertyValue("--tds-icon-burger-exists").trim();

      if ((hasBrand && hasHeaderIcons) || attempt >= 30) {
        animationFrame = window.requestAnimationFrame(() => {
          if (!isCancelled) {
            setIsTegelShellMounted(true);
          }
        });
        return;
      }

      animationFrame = window.requestAnimationFrame(() => mountShellAfterThemeIsReady(attempt + 1));
    }

    mountShellAfterThemeIsReady();

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    try {
      setReadNotificationIdsByPersona(parseStringListRecord(window.localStorage.getItem(notificationReadStorageKey)));
      setCheckedJiraIdsByPersona(parseStringListRecord(window.localStorage.getItem(jiraCheckedStorageKey)));
      setSentEmailNotificationIds(parseStringList(window.localStorage.getItem(sentEmailNotificationStorageKey)));
    } catch (error) {
      console.error("Failed to load local read-state records.", {
        error: getErrorMessage(error)
      });
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(notificationReadStorageKey, JSON.stringify(readNotificationIdsByPersona));
    } catch (error) {
      console.error("Failed to persist notification read-state.", {
        error: getErrorMessage(error)
      });
    }
  }, [readNotificationIdsByPersona]);

  useEffect(() => {
    try {
      window.localStorage.setItem(jiraCheckedStorageKey, JSON.stringify(checkedJiraIdsByPersona));
    } catch (error) {
      console.error("Failed to persist Jira checked-state.", {
        error: getErrorMessage(error)
      });
    }
  }, [checkedJiraIdsByPersona]);

  useEffect(() => {
    try {
      window.localStorage.setItem(sentEmailNotificationStorageKey, JSON.stringify(sentEmailNotificationIds));
    } catch (error) {
      console.error("Failed to persist sent email notification state.", {
        error: getErrorMessage(error)
      });
    }
  }, [sentEmailNotificationIds]);

  useEffect(() => {
    if (!hasLoadedConfig || !hasLoadedTickets) {
      return;
    }

    const smtp = config.integrations.smtp;

    if (!smtp.enabled || !notificationDeliveryModeSendsEmail(smtp.deliveryMode)) {
      return;
    }

    const localSecrets = readLocalIntegrationSecrets();
    const portalOrigin = typeof window === "undefined" ? "" : window.location.origin;
    const pendingEmails = [
      ...buildApprovalRequestedEmailEnvelopes(config, ticketList, portalOrigin),
      ...buildJiraReadyToCreateEmailEnvelopes(config, ticketList, portalOrigin)
    ].filter(
      (email) =>
        !sentEmailNotificationIds.includes(email.id) &&
        !emailNotificationsInFlightRef.current.has(email.id)
    );

    if (!pendingEmails.length) {
      return;
    }

    pendingEmails.forEach((email) => {
      emailNotificationsInFlightRef.current.add(email.id);

      fetch("/api/integrations/smtp/send-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: {
            enabled: smtp.enabled,
            host: smtp.host,
            port: smtp.port,
            security: smtp.security,
            fromName: smtp.fromName,
            fromEmail: smtp.fromEmail,
            username: localSecrets.smtpUsername?.trim() || "",
            password: localSecrets.smtpPassword || ""
          },
          idempotencyKey: email.id,
          message: {
            to: email.recipients,
            subject: email.subject,
            body: email.body,
            htmlBody: email.htmlBody
          }
        })
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as
            | IntegrationApiErrorPayload
            | { data?: { accepted?: string[]; deduplicated?: boolean; deliveryStatus?: string; rejected?: string[] } }
            | null;

          if (!response.ok) {
            console.error("Email notification failed.", {
              ticketKey: email.ticketKey,
              eventType: email.eventType,
              error: formatIntegrationApiError(payload as IntegrationApiErrorPayload | null, "SMTP notification failed.")
            });
            return;
          }

          const data = (
            payload as { data?: { accepted?: string[]; deduplicated?: boolean; deliveryStatus?: string } } | null
          )?.data;
          const accepted = data?.accepted ?? [];
          const duplicateSent = data?.deduplicated === true && data.deliveryStatus === "sent";

          if (accepted.length > 0 || duplicateSent) {
            setSentEmailNotificationIds((current) =>
              current.includes(email.id) ? current : [...current, email.id]
            );
          }
        })
        .catch((error) => {
          console.error("Email notification request failed.", {
            ticketKey: email.ticketKey,
            eventType: email.eventType,
            error: getErrorMessage(error)
          });
        })
        .finally(() => {
          emailNotificationsInFlightRef.current.delete(email.id);
        });
    });
  }, [config, hasLoadedConfig, hasLoadedTickets, sentEmailNotificationIds, ticketList]);

  useEffect(() => {
    if (activeModule !== "jira" || !currentJiraAttentionIds.length) {
      return;
    }

    setCheckedJiraIdsByPersona((current) => ({
      ...current,
      [selectedPersona.id]: Array.from(new Set([...(current[selectedPersona.id] ?? []), ...currentJiraAttentionIds]))
    }));
  }, [activeModule, currentJiraAttentionIds, selectedPersona.id]);

  useEffect(() => {
    if (!roleOptions.some((item) => item.key === role)) {
      const fallbackPersona =
        rolePersonaOptions.find((option) => option.role === "requester") ?? rolePersonaOptions[0];

      if (fallbackPersona) {
        setRole(fallbackPersona.role);
        setSelectedPersonaId(fallbackPersona.id);
      }

      return;
    }

    const currentPersona = rolePersonaOptions.find((option) => option.id === selectedPersonaId && option.role === role);

    if (!currentPersona) {
      const fallbackPersona = rolePersonaOptions.find((option) => option.role === role) ?? rolePersonaOptions[0];

      if (fallbackPersona) {
        setSelectedPersonaId(fallbackPersona.id);

        if (fallbackPersona.role !== role) {
          setRole(fallbackPersona.role);
        }
      }
    }

    if (!canAccessModule(role, activeModule)) {
      setActiveModule(firstAccessibleModule(role));
    }
  }, [activeModule, role, roleOptions, rolePersonaOptions, selectedPersonaId]);

  useEffect(() => {
    let isCancelled = false;

    async function loadConfig() {
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { data?: AdminConfig } | null;

        if (!response.ok || !payload?.data) {
          throw new Error("Local config database returned an invalid response.");
        }

        if (!isCancelled) {
          setConfig(normalizeAdminConfig(payload.data));
          setCanPersistConfig(true);
        }
      } catch (error) {
        console.error("Failed to load local config database; falling back to browser config.", {
          error: getErrorMessage(error)
        });

        try {
          const savedConfig = window.localStorage.getItem(adminConfigStorageKey);

          if (savedConfig && !isCancelled) {
            setConfig(normalizeAdminConfig(JSON.parse(savedConfig) as AdminConfig));
          }
        } catch (storageError) {
          console.error("Failed to load fallback config from localStorage.", {
            error: getErrorMessage(storageError)
          });

          if (!isCancelled) {
            setConfig(createEmptyAdminConfig());
          }
        } finally {
          if (!isCancelled) {
            setCanPersistConfig(true);
          }
        }
      } finally {
        if (!isCancelled) {
          setHasLoadedConfig(true);
        }
      }
    }

    void loadConfig();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedConfig || !canPersistConfig) {
      return;
    }

    try {
      window.localStorage.setItem(adminConfigStorageKey, JSON.stringify(config));
    } catch (error) {
      console.error("Failed to persist fallback config to localStorage.", {
        error: getErrorMessage(error)
      });
    }

    const controller = new AbortController();

    fetch("/api/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ config }),
      signal: controller.signal
    })
      .then(async (response) => {
        if (response.ok) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? `Local config database returned ${response.status}.`);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("Failed to persist config to local database.", {
            error: getErrorMessage(error)
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [canPersistConfig, config, hasLoadedConfig]);

  useEffect(() => {
    let isCancelled = false;

    async function loadTickets() {
      try {
        const response = await fetch("/api/tickets?role=admin", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { data?: Ticket[] } | null;

        if (!response.ok || !Array.isArray(payload?.data)) {
          throw new Error("Local ticket database returned an invalid response.");
        }

        if (!isCancelled) {
          setTicketList(payload.data);
          setCanPersistTickets(true);
        }
      } catch (error) {
        console.error("Failed to load tickets from local database.", {
          error: getErrorMessage(error)
        });
      } finally {
        if (!isCancelled) {
          setHasLoadedTickets(true);
        }
      }
    }

    void loadTickets();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedTickets || initialTicketLinkHandledRef.current || typeof window === "undefined") {
      return;
    }

    try {
      const linkedTicketKey = new URLSearchParams(window.location.search).get("ticket")?.trim() ?? "";

      if (!linkedTicketKey) {
        initialTicketLinkHandledRef.current = true;
        return;
      }

      if (!ticketList.length) {
        return;
      }

      const linkedTicket = ticketList.find(
        (ticket) => ticket.key.toLowerCase() === linkedTicketKey.toLowerCase()
      );
      const ticketKey = linkedTicket?.key ?? linkedTicketKey;

      initialTicketLinkHandledRef.current = true;
      setQuery(ticketKey);
      setSelectedTicketKey(ticketKey);
      setActiveModule("tickets");
      setActiveTab("Overview");
      setIsTicketDetailOpen(Boolean(linkedTicket));
    } catch (error) {
      console.error("Failed to open ticket deep link.", {
        error: getErrorMessage(error)
      });
    }
  }, [hasLoadedTickets, ticketList]);

  useEffect(() => {
    if (!hasLoadedConfig || !hasLoadedTickets) {
      return;
    }

    setTicketList((currentTickets) => {
      let changed = false;
      const normalizedTickets = currentTickets.map((ticket) => {
        const normalizedTicket = normalizeClarificationWorkflowState(ticket, config);

        if (normalizedTicket !== ticket) {
          changed = true;
        }

        return normalizedTicket;
      });

      return changed ? normalizedTickets : currentTickets;
    });
  }, [config, hasLoadedConfig, hasLoadedTickets]);

  useEffect(() => {
    if (!hasLoadedTickets || !canPersistTickets) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetch("/api/tickets", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ tickets: ticketList }),
        signal: controller.signal
      }).catch((error) => {
        if (!controller.signal.aborted) {
          console.error("Failed to persist tickets to local database.", {
            error: getErrorMessage(error)
          });
        }
      });
    }, persistenceDebounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [canPersistTickets, hasLoadedTickets, ticketList]);

  function selectTicket(ticketKey: string) {
    setSelectedTicketKey(ticketKey);
    setActiveModule("tickets");
    setActiveTab("Overview");
    setIsTicketDetailOpen(true);
  }

  function focusTicketOnJira(ticketKey: string) {
    setSelectedTicketKey(ticketKey);
    setActiveModule("jira");
    setActiveTab("Jira");
  }

  function searchAndOpenTicket(searchValue: string) {
    const normalizedSearch = searchValue.trim().toLowerCase();
    setQuery(searchValue);

    if (!normalizedSearch) {
      return;
    }

    const exactMatch = ticketListTickets.find((ticket) => ticket.key.toLowerCase() === normalizedSearch);
    const fuzzyMatch = ticketListTickets.find((ticket) => getTicketSearchText(ticket, config).includes(normalizedSearch));
    const matchingTicket = exactMatch ?? fuzzyMatch;

    if (matchingTicket) {
      selectTicket(matchingTicket.key);
      return;
    }

    setActiveModule("tickets");
    setActiveTab("Overview");
    setIsTicketDetailOpen(false);
  }

  function openTicketModule(ticketKey: string, module: ModuleKey, tab?: DetailTab) {
    setSelectedTicketKey(ticketKey);
    setActiveModule(module);

    if (tab) {
      setActiveTab(tab);
      setIsTicketDetailOpen(module === "tickets");
      return;
    }

    if (module === "tickets") {
      setActiveTab("Overview");
      setIsTicketDetailOpen(true);
    }
  }

  function openModule(module: ModuleKey) {
    setActiveModule(module);

    if (module === "tickets") {
      setIsTicketDetailOpen(false);
      setActiveTab("Overview");
    }
  }

function openNotificationItem(notification: NotificationItem) {
  setReadNotificationIdsByPersona((current) => ({
    ...current,
    [selectedPersona.id]: Array.from(new Set([...(current[selectedPersona.id] ?? []), notification.id]))
  }));

  if (notification.actionLabel.toLowerCase().includes("jira")) {
    openTicketModule(notification.ticketKey, "jira");
    return;
  }

  openTicketModule(notification.ticketKey, "tickets", "Clarifications");
}

  function changePersona(nextPersonaId: string) {
    const nextPersona = rolePersonaOptions.find((option) => option.id === nextPersonaId);

    if (!nextPersona) {
      return;
    }

    setSelectedPersonaId(nextPersona.id);
    setRole(nextPersona.role);

    if (!canAccessModule(nextPersona.role, activeModule)) {
      setActiveModule(firstAccessibleModule(nextPersona.role));
    }
  }

  function goToDashboard() {
    setActiveModule("dashboard");
    setActiveTab("Overview");
    setIsTicketDetailOpen(false);
    setQuery("");
  }

  function createTicket(form: NewTicketFormState) {
    setTicketList((currentTickets) => {
      const newTicket = createTicketFromForm(form, currentTickets, selectedPersona, config);
      setSelectedTicketKey(newTicket.key);
      return [newTicket, ...currentTickets];
    });
    setQuery("");
    setActiveModule("tickets");
    setActiveTab("Overview");
    setIsCreateTicketOpen(false);
  }

  function addTicketAttachments(ticketKey: string, attachments: NewTicketAttachmentInput[]) {
    if (!attachments.length) {
      return;
    }

    const now = new Date();
    const actor = selectedPersona;

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        const nextAttachments = attachments.map((attachment, index) =>
          createAttachmentRecord(ticket.key, attachment, ticket.attachments.length + index, actor, now)
        );

        return {
          ...ticket,
          updatedAt: now.toISOString(),
          attachments: [...ticket.attachments, ...nextAttachments],
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-attachments-${now.getTime()}`,
              eventType: "Attachments added",
              actor: formatPersonaAuditActor(actor),
              createdAt: now.toISOString(),
              visibility: "public",
              reason: `Added ${nextAttachments.length} attachment${nextAttachments.length === 1 ? "" : "s"}.`
            }
          ]
        };
      })
    );
  }

  function replaceTicketAttachmentContent(
    ticketKey: string,
    attachmentId: string,
    attachment: NewTicketAttachmentInput
  ) {
    const now = new Date();
    const actor = selectedPersona;

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        const existingAttachment = ticket.attachments.find((candidate) => candidate.id === attachmentId);

        if (!existingAttachment) {
          return ticket;
        }

        const updatedAttachment = updateAttachmentRecordContent(existingAttachment, attachment, actor, now);

        return {
          ...ticket,
          updatedAt: now.toISOString(),
          attachments: ticket.attachments.map((candidate) =>
            candidate.id === attachmentId ? updatedAttachment : candidate
          ),
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-attachment-content-${now.getTime()}`,
              eventType: "Attachment content updated",
              actor: formatPersonaAuditActor(actor),
              createdAt: now.toISOString(),
              visibility: "public",
              oldValue: existingAttachment.fileName,
              newValue: updatedAttachment.fileName,
              reason: `Stored browser-downloadable content for ${updatedAttachment.fileName}.`
            }
          ]
        };
      })
    );
  }

  function addClarificationReply(ticketKey: string, threadId: string, body: string) {
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return;
    }

    const now = new Date();
    const actor = selectedPersona;
    const roleLabel = actor.roleLabel;

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        const nextTicket = {
          ...ticket,
          updatedAt: now.toISOString(),
          clarifications: ticket.clarifications.map((thread) => {
            if (thread.id !== threadId) {
              return thread;
            }

            const nextStatus = getNextClarificationReplyStatus(thread, role);

            return {
              ...thread,
              status: nextStatus,
              messages: [
                ...thread.messages,
                {
                  id: `message-${threadId}-${now.getTime()}`,
                  author: actor.displayName,
                  role: roleLabel,
                  body: trimmedBody,
                  createdAt: now.toISOString(),
                  visibility: "public" as VisibilityLevel
                }
              ]
            };
          }),
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-clarification-${now.getTime()}`,
              eventType: "Clarification updated",
              actor: formatPersonaAuditActor(actor),
              createdAt: now.toISOString(),
              visibility: "public" as VisibilityLevel,
              reason: `Replied to clarification ${threadId}`
            }
          ]
        };

        return normalizeClarificationWorkflowState(nextTicket, config);
      })
    );
  }

  function createClarificationThread(ticketKey: string, input: NewClarificationThreadInput) {
    const question = input.question.trim();

    if (!question) {
      return;
    }

    const now = new Date();
    const dueAt = formatLocalDateTime(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    const actor = selectedPersona;
    const roleLabel = actor.roleLabel;
    const actionType = input.actionType;
    const actionOption = getPullInActionOption(actionType);
    const targetRole = input.targetRole;
    const targetRoleLabel = getConfigRoleLabel(config, targetRole);
    const shouldCreateWorkflowGate = actionType === "approval" || actionType === "review";
    const shouldCreateThread = actionType === "clarification" || actionType === "inform";
    const participantAccessLevel = getPullInAccessLevel(actionType);

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) =>
        {
          if (ticket.key !== ticketKey) {
            return ticket;
          }

          const workflowStepLabel = getPullInWorkflowStepLabel(actionType, targetRoleLabel);
          const workflowGateAlreadyExists = ticket.workflow.some(
            (step) =>
              step.ownerRole === targetRole &&
              step.label === workflowStepLabel &&
              step.status !== "complete"
          );
          const nextWorkflow =
            shouldCreateWorkflowGate && !workflowGateAlreadyExists
              ? [
                  ...ticket.workflow,
                  {
                    id: `pull-in-${ticket.key}-${actionType}-${targetRole}-${now.getTime()}`,
                    label: workflowStepLabel,
                    ownerRole: targetRole,
                    workflowType: getRoleWorkflowType(config, targetRole),
                    ownerName: targetRoleLabel,
                    status: "active" as WorkflowStepStatus,
                    slaState: "healthy" as SlaState,
                    dueAt,
                    parallelGroup: "Temporary pull-in"
                  }
                ]
              : ticket.workflow;
          const participantExists = ticket.participants.some(
            (participant) =>
              normalizeRoleText(participant.role) === normalizeRoleText(targetRoleLabel) &&
              participant.accessLevel === participantAccessLevel
          );
          const nextParticipants = participantExists
            ? ticket.participants
            : [
                ...ticket.participants,
                {
                  id: `participant-${ticket.key}-${actionType}-${targetRole}-${now.getTime()}`,
                  name: targetRoleLabel,
                  role: targetRoleLabel,
                  accessLevel: participantAccessLevel,
                  expiresAt: input.temporary ? dueAt : undefined
                }
              ];
          const pullInThread = shouldCreateThread
            ? [
                {
                  id: `clarification-${ticket.key}-${now.getTime()}`,
                  level: input.level,
                  question,
                  status: actionType === "inform" ? ("answered" as const) : ("open" as const),
                  requestedBy: actor.displayName,
                  assignedTo: input.assignedTo.trim() || targetRoleLabel,
                  dueAt,
                  messages: [
                    {
                      id: `message-${ticket.key}-${now.getTime()}`,
                      author: actor.displayName,
                      role: roleLabel,
                      body: question,
                      createdAt: now.toISOString(),
                      visibility: "public" as VisibilityLevel
                    }
                  ]
                }
              ]
            : [];

          return {
            ...ticket,
            state:
              ticket.state === "closed"
                ? ticket.state
                : shouldCreateWorkflowGate
                  ? "approval"
                  : actionType === "clarification"
                    ? "clarification"
                    : ticket.state,
            updatedAt: now.toISOString(),
            workflow: nextWorkflow,
            participants: nextParticipants,
            clarifications: [...ticket.clarifications, ...pullInThread],
            comments: shouldCreateThread
              ? ticket.comments
              : [
                  ...ticket.comments,
                  {
                    id: `comment-${ticket.key}-pull-in-${now.getTime()}`,
                    author: actor.displayName,
                    role: roleLabel,
                    body: question,
                    createdAt: now.toISOString(),
                    visibility: "public",
                    source: "portal"
                  }
                ],
            audit: [
              ...ticket.audit,
              {
                id: `audit-${ticket.key}-role-pull-in-${now.getTime()}`,
                eventType: `${actionOption.label} role pull-in`,
                actor: formatPersonaAuditActor(actor),
                createdAt: now.toISOString(),
                visibility: "public",
                newValue: targetRoleLabel,
                reason: question
              }
            ]
          };
        }
      )
    );
  }

  function addTicketComment(ticketKey: string, body: string, visibility: VisibilityLevel) {
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return;
    }

    const now = new Date();
    const actor = selectedPersona;
    const roleLabel = actor.roleLabel;

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) =>
        ticket.key === ticketKey
          ? {
              ...ticket,
              updatedAt: now.toISOString(),
              comments: [
                ...ticket.comments,
                {
                  id: `comment-${ticket.key}-${now.getTime()}`,
                  author: actor.displayName,
                  role: roleLabel,
                  body: trimmedBody,
                  createdAt: now.toISOString(),
                  visibility,
                  source: "portal"
                }
              ],
              audit: [
                ...ticket.audit,
                {
                  id: `audit-${ticket.key}-comment-${now.getTime()}`,
                  eventType: "Comment added",
                  actor: formatPersonaAuditActor(actor),
                  createdAt: now.toISOString(),
                  visibility,
                  reason: "Portal comment"
                }
              ]
            }
          : ticket
      )
    );
  }

  function updateTicket(ticketKey: string, input: TicketUpdateInput) {
    const now = new Date();
    const timestamp = formatLocalTimestamp(now);
    const actor = selectedPersona;
    const title = input.title.trim();
    const requestedState = ticketStateOptions.some((option) => option.value === input.state) ? input.state : undefined;
    const normalizedDescription = normalizeRichTextForStorage(input.description);
    const normalizedBusinessImpact = normalizeRichTextForStorage(input.businessImpact);
    const requesterNote = normalizeRichTextForStorage(input.requesterNote);

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        if (!canEditTicketForPersona(config, actor, ticket)) {
          console.warn("Ticket update rejected by role scope.", {
            ticketKey,
            role: actor.role
          });
          return ticket;
        }

        const priorityOptions = getTicketUpdateOptionLabels(config.priorities, ticket.priority);
        const riskOptions = getTicketUpdateOptionLabels(config.riskOptions, ticket.risk);
        const currentDescription = normalizeRichTextForStorage(ticket.description);
        const currentBusinessImpact = normalizeRichTextForStorage(getEditableTicketBusinessImpact(ticket));
        const nextTitle = title || ticket.title;
        const nextState = requestedState ?? ticket.state;
        const nextPriority = normalizeTicketUpdateOptionValue(input.priority, ticket.priority, priorityOptions);
        const nextRisk = normalizeTicketUpdateOptionValue(input.risk, ticket.risk, riskOptions);
        const changes: TicketUpdateChange[] = [];

        if (nextTitle !== ticket.title) {
          changes.push({
            field: "Title",
            oldValue: ticket.title,
            newValue: nextTitle
          });
        }

        if (nextState !== ticket.state) {
          changes.push({
            field: "Lifecycle status",
            oldValue: getTicketStateLabel(ticket.state),
            newValue: getTicketStateLabel(nextState)
          });
        }

        if (nextPriority !== ticket.priority) {
          changes.push({
            field: "Priority",
            oldValue: ticket.priority,
            newValue: nextPriority
          });
        }

        if (nextRisk !== ticket.risk) {
          changes.push({
            field: "Risk",
            oldValue: ticket.risk,
            newValue: nextRisk
          });
        }

        if (normalizedDescription !== currentDescription) {
          changes.push({
            field: "Description",
            oldValue: summarizeTicketUpdateValue(currentDescription),
            newValue: summarizeTicketUpdateValue(normalizedDescription)
          });
        }

        if (normalizedBusinessImpact !== currentBusinessImpact) {
          changes.push({
            field: "Business impact",
            oldValue: summarizeTicketUpdateValue(currentBusinessImpact),
            newValue: summarizeTicketUpdateValue(normalizedBusinessImpact)
          });
        }

        if (changes.length === 0 && !requesterNote) {
          return ticket;
        }

        const requesterComment = buildRequesterTicketUpdateComment(changes, requesterNote, actor);
        const noteSummary = requesterNote ? summarizeTicketUpdateValue(requesterNote, 140) : "";
        const auditReason =
          noteSummary || `Ticket corrected by ${actor.roleLabel}. Requester-visible copy was added.`;
        const auditEntries: Ticket["audit"] =
          changes.length > 0
            ? changes.map((change, index) => ({
                id: `audit-${ticket.key}-ticket-update-${now.getTime()}-${index}`,
                eventType: `Ticket ${change.field.toLowerCase()} updated`,
                actor: formatPersonaAuditActor(actor),
                createdAt: timestamp,
                visibility: "public" as VisibilityLevel,
                oldValue: change.oldValue,
                newValue: change.newValue,
                reason: auditReason
              }))
            : [
                {
                  id: `audit-${ticket.key}-ticket-update-note-${now.getTime()}`,
                  eventType: "Ticket update note added",
                  actor: formatPersonaAuditActor(actor),
                  createdAt: timestamp,
                  visibility: "public" as VisibilityLevel,
                  reason: auditReason
                }
              ];

        return {
          ...ticket,
          title: nextTitle,
          state: nextState,
          priority: nextPriority,
          risk: nextRisk,
          description: normalizedDescription,
          dynamicFields: {
            ...ticket.dynamicFields,
            "Business impact": normalizedBusinessImpact
          },
          updatedAt: timestamp,
          comments: [
            ...ticket.comments,
            {
              id: `comment-${ticket.key}-ticket-update-${now.getTime()}`,
              author: actor.displayName,
              role: actor.roleLabel,
              body: requesterComment,
              createdAt: timestamp,
              visibility: "public",
              source: "portal"
            }
          ],
          audit: [...ticket.audit, ...auditEntries]
        };
      })
    );
  }

  function markEscalationManagerInviteDelivery({
    error,
    escalationId,
    managerEmail,
    status,
    statusUpdateId,
    ticketKey
  }: {
    error?: string;
    escalationId: string;
    managerEmail: string;
    status: Extract<EscalationManagerInviteStatus, "sent" | "failed">;
    statusUpdateId?: string;
    ticketKey: string;
  }) {
    const now = new Date();
    const timestamp = now.toISOString();
    const actor = selectedPersona;

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        const escalation = ticket.escalations.find((candidate) => candidate.id === escalationId);

        if (!escalation) {
          return ticket;
        }

        const eventType =
          status === "sent" ? "Escalation manager invited" : "Escalation manager invite failed";
        const reason =
          status === "sent"
            ? `Manager invite sent to ${managerEmail}.`
            : `Manager invite to ${managerEmail} failed. ${error ?? ""}`.trim();

        return {
          ...ticket,
          updatedAt: timestamp,
          escalations: ticket.escalations.map((candidate) =>
            candidate.id === escalationId
              ? {
                  ...candidate,
                  managerInviteStatus: status,
                  managerInvitedAt: status === "sent" ? timestamp : candidate.managerInvitedAt,
                  managerInviteError: status === "failed" ? error ?? "Manager invite failed." : undefined,
                  statusUpdates: candidate.statusUpdates?.map((statusUpdate) =>
                    statusUpdateId && statusUpdate.id === statusUpdateId && statusUpdate.managerInvite
                      ? {
                          ...statusUpdate,
                          managerInvite: {
                            ...statusUpdate.managerInvite,
                            status,
                            sentAt: status === "sent" ? timestamp : statusUpdate.managerInvite.sentAt,
                            error: status === "failed" ? error ?? "Manager invite failed." : undefined
                          }
                        }
                      : statusUpdate
                  )
                }
              : candidate
          ),
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-escalation-manager-${status}-${now.getTime()}`,
              eventType,
              actor: formatPersonaAuditActor(actor),
              createdAt: timestamp,
              visibility: "approvers_only",
              reason,
              newValue: escalation.reason
            }
          ]
        };
      })
    );
  }

  async function sendEscalationManagerInviteEmail({
    actionPlan,
    escalation,
    managerEmail,
    managerName,
    meetingSeries,
    statusNote,
    statusUpdateId,
    ticket
  }: {
    actionPlan: string;
    escalation: Ticket["escalations"][number];
    managerEmail: string;
    managerName: string;
    meetingSeries: string;
    statusNote: string;
    statusUpdateId?: string;
    ticket: Ticket;
  }) {
    const email = managerEmail.trim();
    const name = managerName.trim() || email;

    if (!email || !isValidEmailAddress(email)) {
      markEscalationManagerInviteDelivery({
        escalationId: escalation.id,
        managerEmail: email || "missing email",
        status: "failed",
        statusUpdateId,
        ticketKey: ticket.key,
        error: "Enter a valid manager email address before sending the invite."
      });
      return;
    }

    const smtp = config.integrations.smtp;

    if (!smtp.enabled || !notificationDeliveryModeSendsEmail(smtp.deliveryMode)) {
      markEscalationManagerInviteDelivery({
        escalationId: escalation.id,
        managerEmail: email,
        status: "failed",
        statusUpdateId,
        ticketKey: ticket.key,
        error: "SMTP email delivery is not enabled."
      });
      return;
    }

    const portalHomeUrl = typeof window === "undefined" ? "" : window.location.origin;
    const ticketUrl = portalHomeUrl ? `${portalHomeUrl}/?ticket=${encodeURIComponent(ticket.key)}` : "";
    const actionPlanText =
      htmlToPlainTextFallback(actionPlan || escalation.actionPlan || escalation.mitigationPlan).trim() ||
      "Action plan pending.";
    const statusUpdateText =
      htmlToPlainTextFallback(statusNote || escalation.statusNote || "").trim() || "No status update added.";
    const meetingSeriesText = meetingSeries.trim() || escalation.meetingSeries?.trim() || "Not scheduled.";
    const jiraLabel = ticket.relatedJiraKey ? `Jira: ${ticket.relatedJiraKey}` : "Jira: Not linked";
    const body = [
      `Manager invite for escalation on ${ticket.key} - ${ticket.title}`,
      "",
      `${selectedPersona.displayName} (${selectedPersona.roleLabel}) invited you to this escalation follow-up.`,
      "",
      `Ticket: ${ticket.key} - ${ticket.title}`,
      jiraLabel,
      `Current portal status: ${getTicketCurrentStatusLabel(ticket)}`,
      `Escalation status: ${getEscalationStatusLabel(escalation.status)}`,
      `Severity: ${escalation.severity}`,
      `Due target: ${formatDateTimeDisplay(escalation.dueAt)}`,
      "",
      "Requested action:",
      htmlToPlainTextFallback(escalation.requestedAction).trim() || "No requested action provided.",
      "",
      "Action plan:",
      actionPlanText,
      "",
      "Meeting series:",
      meetingSeriesText,
      "",
      "Latest status update:",
      statusUpdateText,
      "",
      ticketUrl ? `Open ticket: ${ticketUrl}` : "Open the ticket in NEXUS Portal."
    ].join("\n");
    const localSecrets = readLocalIntegrationSecrets();
    const idempotencyKey = [
      "email",
      "escalationManagerInvite",
      ticket.key,
      escalation.id,
      statusUpdateId ?? "create",
      email.toLowerCase(),
      getNotificationEmailDeliveryFingerprint([body, email.toLowerCase()])
    ].join(":");

    try {
      const response = await fetch("/api/integrations/smtp/send-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: {
            enabled: smtp.enabled,
            host: smtp.host,
            port: smtp.port,
            security: smtp.security,
            fromName: smtp.fromName,
            fromEmail: smtp.fromEmail,
            username: localSecrets.smtpUsername?.trim() || "",
            password: localSecrets.smtpPassword || ""
          },
          idempotencyKey,
          message: {
            to: [{ name, email }],
            subject: `Escalation follow-up: ${ticket.key} - ${ticket.title}`,
            body,
            htmlBody: renderNotificationEmailHtmlBody(body, {
              ticketKey: ticket.key,
              ticketTitle: ticket.title,
              portalHomeUrl,
              portalUrl: ticketUrl,
              ticketUrl
            })
          }
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | IntegrationApiErrorPayload
        | { data?: { accepted?: string[]; deduplicated?: boolean; deliveryStatus?: string; rejected?: string[] } }
        | null;

      if (!response.ok) {
        throw new Error(formatIntegrationApiError(payload as IntegrationApiErrorPayload | null, "SMTP manager invite failed."));
      }

      const data = (
        payload as { data?: { accepted?: string[]; deduplicated?: boolean; deliveryStatus?: string; rejected?: string[] } } | null
      )?.data;
      const accepted = data?.accepted ?? [];
      const duplicateSent = data?.deduplicated === true && data.deliveryStatus === "sent";

      if (accepted.length === 0 && !duplicateSent) {
        const rejected = data?.rejected?.filter(Boolean).join(", ");
        throw new Error(rejected ? `SMTP did not accept the manager invite. Rejected: ${rejected}.` : "SMTP did not accept the manager invite.");
      }

      markEscalationManagerInviteDelivery({
        escalationId: escalation.id,
        managerEmail: email,
        status: "sent",
        statusUpdateId,
        ticketKey: ticket.key
      });
    } catch (error) {
      const message = getErrorMessage(error);

      console.error("Escalation manager invite failed.", {
        ticketKey: ticket.key,
        escalationId: escalation.id,
        managerEmail: email,
        error: message
      });
      markEscalationManagerInviteDelivery({
        escalationId: escalation.id,
        managerEmail: email,
        status: "failed",
        statusUpdateId,
        ticketKey: ticket.key,
        error: message
      });
    }
  }

  function createEscalation(ticketKey: string, input: NewEscalationInput) {
    const reason = input.reason.trim();
    const impact = normalizeRichTextForStorage(input.impact);
    const requestedAction = normalizeRichTextForStorage(input.requestedAction);

    if (!reason || !impact || !requestedAction) {
      return;
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const actor = selectedPersona;
    const roleLabel = actor.roleLabel;
    const sourceTicket = ticketList.find((ticket) => ticket.key === ticketKey);
    const actionItems = normalizeEscalationActionItems(input.actionItems, input.actionPlan || input.mitigationPlan);
    const actionPlanText =
      formatEscalationActionItemsForStorage(actionItems) ||
      htmlToPlainTextFallback(input.actionPlan || input.mitigationPlan).trim() ||
      "Action plan pending.";
    const actionPlan = normalizeRichTextForStorage(actionPlanText);
    const meetingSeries = input.meetingSeries.trim();
    const people = normalizeEscalationPeople(input.people, input.managerName, input.managerEmail);
    const primaryPerson = getPrimaryEscalationPerson(people);
    const managerName = primaryPerson?.name.trim() || input.managerName.trim();
    const managerEmail = primaryPerson?.email?.trim() || input.managerEmail.trim();
    const managerInviteStatus: EscalationManagerInviteStatus =
      input.sendManagerInvite ? "pending" : "not_sent";
    const newEscalation: Ticket["escalations"][number] = {
      id: `escalation-${ticketKey}-${now.getTime()}`,
      type: input.type,
      severity: input.severity,
      reason,
      impact,
      urgency: input.urgency.trim() || "Needs prioritization",
      requestedAction,
      mitigationPlan: actionPlan,
      actionPlan,
      actionItems,
      meetingSeries,
      decisionMaker: input.decisionMaker.trim() || roleLabel,
      managerName,
      managerEmail,
      people,
      managerInviteStatus,
      dueAt: formatEscalationDueDate(input.dueAt),
      status: "open",
      statusUpdates: []
    };

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) =>
        ticket.key === ticketKey
          ? {
              ...ticket,
              state: ticket.state === "closed" ? ticket.state : "escalated",
              updatedAt: timestamp,
              escalations: [...ticket.escalations, newEscalation],
              audit: [
                ...ticket.audit,
                {
                  id: `audit-${ticket.key}-escalation-${now.getTime()}`,
                  eventType: "Escalation opened",
                  actor: formatPersonaAuditActor(actor),
                  createdAt: timestamp,
                  visibility: "approvers_only",
                  reason,
                  newValue: `${input.type} escalation`
                }
              ]
            }
          : ticket
      )
    );

    if (input.sendManagerInvite && sourceTicket) {
      void sendEscalationManagerInviteEmail({
        actionPlan,
        escalation: newEscalation,
        managerEmail,
        managerName,
        meetingSeries,
        statusNote: "Escalation opened.",
        ticket: {
          ...sourceTicket,
          state: sourceTicket.state === "closed" ? sourceTicket.state : "escalated",
          updatedAt: timestamp,
          escalations: [...sourceTicket.escalations, newEscalation]
        }
      });
    }
  }

  function updateEscalationStatus(
    ticketKey: string,
    escalationId: string,
    status: EscalationStatus,
    decisionNote: string,
    details: EscalationStatusUpdateDetails = {}
  ) {
    const now = new Date();
    const timestamp = now.toISOString();
    const actor = selectedPersona;
    const trimmedNote = normalizeRichTextForStorage(decisionNote);
    const actionItems = normalizeEscalationActionItems(details.actionItems, details.actionPlan);
    const actionPlanText = formatEscalationActionItemsForStorage(actionItems);
    const actionPlan = normalizeRichTextForStorage(actionPlanText || details.actionPlan || "");
    const meetingSeries = details.meetingSeries?.trim() ?? "";
    const people = normalizeEscalationPeople(details.people, details.managerName, details.managerEmail);
    const primaryPerson = getPrimaryEscalationPerson(people);
    const managerName = primaryPerson?.name.trim() || details.managerName?.trim() || "";
    const managerEmail = primaryPerson?.email?.trim() || details.managerEmail?.trim() || "";
    const sendManagerInvite = Boolean(details.sendManagerInvite);
    const sourceTicket = ticketList.find((ticket) => ticket.key === ticketKey);
    const sourceEscalation = sourceTicket?.escalations.find((candidate) => candidate.id === escalationId);
    const statusUpdateId = `escalation-update-${ticketKey}-${now.getTime()}`;

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        const escalation = ticket.escalations.find((candidate) => candidate.id === escalationId);

        if (!escalation) {
          return ticket;
        }

        const nextActionPlan = actionPlan || escalation.actionPlan || escalation.mitigationPlan;
        const nextMeetingSeries = meetingSeries || escalation.meetingSeries || "";
        const nextPeople = people.length > 0 ? people : getEscalationPeople(escalation);
        const nextPrimaryPerson = getPrimaryEscalationPerson(nextPeople);
        const nextManagerName = managerName || nextPrimaryPerson?.name || escalation.managerName || "";
        const nextManagerEmail = managerEmail || nextPrimaryPerson?.email || escalation.managerEmail || "";
        const statusUpdate = {
          id: statusUpdateId,
          author: actor.displayName,
          role: actor.roleLabel,
          status,
          note: trimmedNote || escalation.statusNote || "",
          actionPlan: nextActionPlan,
          actionItems: actionItems.length > 0 ? actionItems : getEscalationActionItems(escalation),
          meetingSeries: nextMeetingSeries,
          people: nextPeople,
          createdAt: timestamp,
          managerInvite:
            sendManagerInvite && nextManagerEmail
              ? {
                  name: nextManagerName || nextManagerEmail,
                  email: nextManagerEmail,
                  status: "pending" as const
                }
              : undefined
        };

        return {
          ...ticket,
          updatedAt: timestamp,
          escalations: ticket.escalations.map((candidate) =>
            candidate.id === escalationId
              ? {
                  ...candidate,
                  status,
                  actionPlan: nextActionPlan,
                  actionItems: actionItems.length > 0 ? actionItems : candidate.actionItems,
                  mitigationPlan: nextActionPlan || candidate.mitigationPlan,
                  meetingSeries: nextMeetingSeries,
                  managerName: nextManagerName,
                  managerEmail: nextManagerEmail,
                  people: nextPeople,
                  managerInviteStatus: sendManagerInvite ? "pending" : candidate.managerInviteStatus,
                  managerInviteError: sendManagerInvite ? undefined : candidate.managerInviteError,
                  statusNote: trimmedNote || candidate.statusNote,
                  statusUpdatedAt: timestamp,
                  statusUpdates: [statusUpdate, ...(candidate.statusUpdates ?? [])]
                }
              : candidate
          ),
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-escalation-decision-${now.getTime()}`,
              eventType: "Escalation status updated",
              actor: formatPersonaAuditActor(actor),
              createdAt: timestamp,
              visibility: "approvers_only",
              reason: trimmedNote || `Updated ${escalation.reason}`,
              oldValue: escalation.status.replace("_", " "),
              newValue: status.replace("_", " ")
            }
          ]
        };
      })
    );

    if (sendManagerInvite && sourceTicket && sourceEscalation) {
      const nextEscalation = {
        ...sourceEscalation,
        status,
        actionPlan: actionPlan || sourceEscalation.actionPlan || sourceEscalation.mitigationPlan,
        actionItems: actionItems.length > 0 ? actionItems : sourceEscalation.actionItems,
        mitigationPlan: actionPlan || sourceEscalation.actionPlan || sourceEscalation.mitigationPlan,
        meetingSeries: meetingSeries || sourceEscalation.meetingSeries || "",
        managerName: managerName || sourceEscalation.managerName || "",
        managerEmail: managerEmail || sourceEscalation.managerEmail || "",
        people: people.length > 0 ? people : sourceEscalation.people,
        managerInviteStatus: "pending" as EscalationManagerInviteStatus,
        statusNote: trimmedNote || sourceEscalation.statusNote,
        statusUpdatedAt: timestamp
      };

      void sendEscalationManagerInviteEmail({
        actionPlan: nextEscalation.actionPlan ?? nextEscalation.mitigationPlan,
        escalation: nextEscalation,
        managerEmail: nextEscalation.managerEmail ?? "",
        managerName: nextEscalation.managerName ?? "",
        meetingSeries: nextEscalation.meetingSeries ?? "",
        statusNote: trimmedNote || nextEscalation.statusNote || "",
        statusUpdateId,
        ticket: {
          ...sourceTicket,
          updatedAt: timestamp,
          escalations: sourceTicket.escalations.map((candidate) =>
            candidate.id === escalationId ? nextEscalation : candidate
          )
        }
      });
    }
  }

  async function createJiraForTicket(
    ticketKey: string,
    draftUpdate?: JiraDraftUpdateInput,
    options?: CreateJiraOptions
  ) {
    if (jiraCreationInFlightTicketKeys.includes(ticketKey)) {
      throw new Error(`Jira creation is already in progress for ${ticketKey}.`);
    }

    const ticket = ticketList.find((candidate) => candidate.key === ticketKey);

    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} was not found.`);
    }

    if (!canManageJiraForTicket(config, selectedPersona, ticket)) {
      throw new Error("Your role is not allowed to create Jira issues for this ticket.");
    }

    const updatedDraftFromInput = applyJiraDraftUpdate(ticket.jiraDraft, draftUpdate);
    const updatedDraft = {
      ...updatedDraftFromInput,
      labels: getJiraLabelsWithModule(updatedDraftFromInput.labels, ticket.module)
    };
    const ticketForCreation = { ...ticket, jiraDraft: updatedDraft };
    const previousJiraKey = ticket.relatedJiraKey?.trim() ?? "";
    const replaceExisting = Boolean(options?.replaceExisting && previousJiraKey);

    if (previousJiraKey && !replaceExisting) {
      throw new Error(`Ticket ${ticket.key} is already linked to Jira issue ${ticket.relatedJiraKey}.`);
    }

    if (
      (!replaceExisting && !canCreateJiraForTicket(ticketForCreation)) ||
      (replaceExisting && !canReplaceJiraForTicket(ticketForCreation))
    ) {
      throw new Error("Complete required workflow gates before creating the Jira issue.");
    }

    const localJiraToken = readLocalIntegrationSecrets().jiraToken?.trim() ?? "";

    if (!localJiraToken) {
      throw new Error(
        config.integrations.jira.tokenConfigured
          ? "Jira token is not available in this browser. Open Admin > Integrations and paste the token before creating Jira issues."
          : "Configure a Jira token in Admin > Integrations before creating Jira issues."
      );
    }

    setJiraCreationInFlightTicketKeys((current) =>
      current.includes(ticketKey) ? current : [...current, ticketKey]
    );

    try {
      const response = await fetch("/api/integrations/jira/create-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: buildTicketJiraActionConfig(ticketForCreation, updatedDraft, config, localJiraToken),
          issue: buildTicketJiraIssuePayload(ticketForCreation)
        })
      });
      const payload = (await response.json().catch(() => null)) as JiraCreateTaskPayload | null;

      if (!response.ok) {
        throw new Error(
          formatIntegrationApiError(payload as IntegrationApiErrorPayload | null, "Jira issue creation failed.")
        );
      }

      const jiraIssueKey = (
        payload as { data?: { jiraKey?: string } } | null
      )?.data?.jiraKey?.trim();
      const jiraIssueStatus = (payload as { data?: { jiraStatus?: JiraIssueStatusDetails } } | null)?.data?.jiraStatus;
      const jiraAttachmentResult = (payload as { data?: { attachments?: JiraAttachmentActionPayload } } | null)
        ?.data?.attachments;
      const jiraWarnings = (payload as { data?: { warnings?: string[] } } | null)?.data?.warnings ?? [];

      if (!jiraIssueKey) {
        throw new Error("Jira create response did not include an issue key.");
      }

      const now = new Date();
      const timestamp = now.toISOString();
      const actor = selectedPersona;
      const nextFollowUpStatus = getJiraFollowUpStatusFromIssueStatus(jiraIssueStatus, "created");
      const nextFollowUpLabel = getJiraFollowUpStatusLabel(nextFollowUpStatus);
      const nextSyncedStatus = jiraIssueStatus?.name?.trim() || nextFollowUpLabel;

      setTicketList((currentTickets) =>
        currentTickets.map((currentTicket) => {
          if (currentTicket.key !== ticketKey) {
            return currentTicket;
          }

          if (currentTicket.relatedJiraKey && !replaceExisting) {
            return currentTicket;
          }

          const currentUpdatedDraftFromInput = applyJiraDraftUpdate(currentTicket.jiraDraft, draftUpdate);
          const currentUpdatedDraft = {
            ...currentUpdatedDraftFromInput,
            labels: getJiraLabelsWithModule(currentUpdatedDraftFromInput.labels, currentTicket.module)
          };
          const currentPreviousJiraKey = currentTicket.relatedJiraKey?.trim() ?? "";
          const baseCommentBody = currentPreviousJiraKey
            ? `Jira issue ${jiraIssueKey} created and linked to ${currentTicket.key}, replacing ${currentPreviousJiraKey}.`
            : `Jira issue ${jiraIssueKey} created and linked to ${currentTicket.key}.`;
          const commentBody = `${baseCommentBody}${formatJiraAttachmentActionComment(
            jiraAttachmentResult
          )}${formatJiraActionWarningComment(jiraWarnings)}`;

          return {
            ...currentTicket,
            state: getTicketStateForJiraFollowUpStatus(nextFollowUpStatus),
            relatedJiraKey: jiraIssueKey,
            updatedAt: timestamp,
            jiraDraft: {
              ...currentUpdatedDraft,
              status: "synced",
              syncedStatus: nextSyncedStatus,
              followUpStatus: nextFollowUpStatus,
              followUpUpdatedAt: timestamp
            },
            audit: [
              ...currentTicket.audit,
              {
                id: `audit-${currentTicket.key}-jira-created-${now.getTime()}`,
                eventType: "Jira created",
                actor: formatPersonaAuditActor(actor),
                createdAt: timestamp,
                visibility: "approvers_only",
                oldValue: currentPreviousJiraKey || currentTicket.jiraDraft.status,
                newValue: jiraIssueKey,
                reason: currentPreviousJiraKey
                  ? "Jira issue recreated from Support Portal handoff."
                  : "Jira issue created from Support Portal handoff."
              }
            ],
            comments: [
              ...currentTicket.comments,
              {
                id: `comment-${currentTicket.key}-jira-created-${now.getTime()}`,
                author: actor.displayName,
                role: actor.roleLabel,
                body: commentBody,
                createdAt: timestamp,
                visibility: "public",
                source: "jira"
              }
            ]
          };
        })
      );
    } catch (error) {
      console.error("Failed to create Jira issue.", {
        error: getErrorMessage(error),
        ticketKey
      });
      throw error;
    } finally {
      setJiraCreationInFlightTicketKeys((current) => current.filter((key) => key !== ticketKey));
    }
  }

  async function updateJiraIssueForTicket(ticketKey: string, draftUpdate?: JiraDraftUpdateInput) {
    if (jiraUpdateInFlightTicketKeys.includes(ticketKey)) {
      throw new Error(`Jira update is already in progress for ${ticketKey}.`);
    }

    const ticket = ticketList.find((candidate) => candidate.key === ticketKey);

    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} was not found.`);
    }

    if (!canManageJiraForTicket(config, selectedPersona, ticket)) {
      throw new Error("Your role is not allowed to update Jira issues for this ticket.");
    }

    const jiraIssueKey = getValidJiraIssueKey(ticket.relatedJiraKey);

    if (!jiraIssueKey) {
      throw new Error("Link the portal ticket to a valid Jira issue before updating Jira.");
    }

    const updatedDraftFromInput = applyJiraDraftUpdate(ticket.jiraDraft, draftUpdate);
    const updatedDraft = {
      ...updatedDraftFromInput,
      labels: getJiraLabelsWithModule(updatedDraftFromInput.labels, ticket.module)
    };
    const ticketForUpdate = { ...ticket, relatedJiraKey: jiraIssueKey, jiraDraft: updatedDraft };
    const localJiraToken = readLocalIntegrationSecrets().jiraToken?.trim() ?? "";

    if (!localJiraToken) {
      throw new Error(
        config.integrations.jira.tokenConfigured
          ? "Jira token is not available in this browser. Open Admin > Integrations and paste the token before updating Jira issues."
          : "Configure a Jira token in Admin > Integrations before updating Jira issues."
      );
    }

    setJiraUpdateInFlightTicketKeys((current) =>
      current.includes(ticketKey) ? current : [...current, ticketKey]
    );

    try {
      const response = await fetch("/api/integrations/jira/update-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: buildTicketJiraActionConfig(ticketForUpdate, updatedDraft, config, localJiraToken),
          issueKey: jiraIssueKey,
          issue: buildTicketJiraIssuePayload(ticketForUpdate)
        })
      });
      const payload = (await response.json().catch(() => null)) as JiraCreateTaskPayload | null;

      if (!response.ok) {
        throw createIntegrationActionError(
          payload as IntegrationApiErrorPayload | null,
          "Jira issue update failed."
        );
      }

      const returnedJiraIssueKey =
        (payload as { data?: { jiraKey?: string } } | null)?.data?.jiraKey?.trim() || jiraIssueKey;
      const jiraIssueStatus = (payload as { data?: { jiraStatus?: JiraIssueStatusDetails } } | null)?.data?.jiraStatus;
      const jiraAttachmentResult = (payload as { data?: { attachments?: JiraAttachmentActionPayload } } | null)
        ?.data?.attachments;
      const jiraWarnings = (payload as { data?: { warnings?: string[] } } | null)?.data?.warnings ?? [];
      const now = new Date();
      const timestamp = now.toISOString();
      const actor = selectedPersona;

      setTicketList((currentTickets) =>
        currentTickets.map((currentTicket) => {
          if (currentTicket.key !== ticketKey || !currentTicket.relatedJiraKey) {
            return currentTicket;
          }

          const currentUpdatedDraftFromInput = applyJiraDraftUpdate(currentTicket.jiraDraft, draftUpdate);
          const currentUpdatedDraft = {
            ...currentUpdatedDraftFromInput,
            labels: getJiraLabelsWithModule(currentUpdatedDraftFromInput.labels, currentTicket.module)
          };
          const previousFollowUpStatus = getTicketJiraFollowUpStatus(currentTicket);
          const nextFollowUpStatus = getJiraFollowUpStatusFromIssueStatus(jiraIssueStatus, previousFollowUpStatus);
          const nextFollowUpLabel = getJiraFollowUpStatusLabel(nextFollowUpStatus);
          const nextSyncedStatus = jiraIssueStatus?.name?.trim() || nextFollowUpLabel;
          const followUpStatusChanged = nextFollowUpStatus !== previousFollowUpStatus;

          return {
            ...currentTicket,
            state: getTicketStateForJiraFollowUpStatus(nextFollowUpStatus),
            relatedJiraKey: returnedJiraIssueKey,
            updatedAt: timestamp,
            jiraDraft: {
              ...currentUpdatedDraft,
              status: "synced",
              syncedStatus: nextSyncedStatus,
              followUpStatus: nextFollowUpStatus,
              followUpUpdatedAt: followUpStatusChanged
                ? timestamp
                : currentTicket.jiraDraft.followUpUpdatedAt ?? timestamp
            },
            audit: [
              ...currentTicket.audit,
              {
                id: `audit-${currentTicket.key}-jira-updated-${now.getTime()}`,
                eventType: "Jira issue updated",
                actor: formatPersonaAuditActor(actor),
                createdAt: timestamp,
                visibility: "approvers_only",
                oldValue: currentTicket.relatedJiraKey,
                newValue: returnedJiraIssueKey,
                reason: "Jira issue fields updated from Support Portal."
              }
            ],
            comments: [
              ...currentTicket.comments,
              {
                id: `comment-${currentTicket.key}-jira-updated-${now.getTime()}`,
                author: actor.displayName,
                role: actor.roleLabel,
                body: `Jira issue ${returnedJiraIssueKey} updated from portal Jira fields.${formatJiraAttachmentActionComment(
                  jiraAttachmentResult
                )}${formatJiraActionWarningComment(jiraWarnings)}`,
                createdAt: timestamp,
                visibility: "public",
                source: "jira"
              }
            ]
          };
        })
      );
    } catch (error) {
      console.error("Failed to update Jira issue.", {
        error: getErrorMessage(error),
        ticketKey,
        jiraIssueKey
      });
      throw error;
    } finally {
      setJiraUpdateInFlightTicketKeys((current) => current.filter((key) => key !== ticketKey));
    }
  }

  async function postJiraCommentForTicket(ticketKey: string, body: string) {
    const ticket = ticketList.find((candidate) => candidate.key === ticketKey);

    if (!ticket) {
      throw new Error(`Ticket ${ticketKey} was not found.`);
    }

    if (!canCommentOnJiraForTicket(config, selectedPersona, ticket)) {
      throw new Error("Your role is not allowed to add Jira comments for this ticket.");
    }

    const jiraIssueKey = getValidJiraIssueKey(ticket.relatedJiraKey);

    if (!jiraIssueKey) {
      throw new Error("Link the portal ticket to a valid Jira issue before adding a Jira comment.");
    }

    const commentBody = body.trim();
    const actor = selectedPersona;
    const jiraCommentBody = formatPortalAuthoredJiraComment(actor, commentBody);

    if (!commentBody) {
      throw new Error("Write a Jira comment before sending.");
    }

    const localJiraToken = readLocalIntegrationSecrets().jiraToken?.trim() ?? "";

    if (!localJiraToken) {
      throw new Error(
        config.integrations.jira.tokenConfigured
          ? "Jira token is not available in this browser. Open Admin > Integrations and paste the token before adding Jira comments."
          : "Configure a Jira token in Admin > Integrations before adding Jira comments."
      );
    }

    try {
      const response = await fetch("/api/integrations/jira/comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: buildTicketJiraActionConfig(ticket, ticket.jiraDraft, config, localJiraToken),
          issueKey: jiraIssueKey,
          comment: jiraCommentBody
        })
      });
      const payload = (await response.json().catch(() => null)) as JiraCreateTaskPayload | null;

      if (!response.ok) {
        throw createIntegrationActionError(
          payload as IntegrationApiErrorPayload | null,
          "Jira comment failed."
        );
      }

      const returnedComment = (payload as { data?: { comment?: JiraSyncedCommentInput } } | null)?.data?.comment;

      if (!returnedComment?.id) {
        throw new Error("Jira comment response did not include a comment id.");
      }

      const now = new Date();
      const timestamp = now.toISOString();

      setTicketList((currentTickets) =>
        currentTickets.map((currentTicket) => {
          if (currentTicket.key !== ticketKey || !currentTicket.relatedJiraKey) {
            return currentTicket;
          }

          const commentMerge = mergeImportedJiraComments(currentTicket, [
            {
              id: returnedComment.id,
              author: actor.displayName,
              role: actor.roleLabel,
              body: commentBody,
              createdAt: returnedComment.createdAt || timestamp,
              updatedAt: returnedComment.updatedAt ?? null
            }
          ]);

          return {
            ...currentTicket,
            updatedAt: timestamp,
            audit: [
              ...currentTicket.audit,
              {
                id: `audit-${currentTicket.key}-jira-comment-${now.getTime()}`,
                eventType: "Jira comment added",
                actor: formatPersonaAuditActor(actor),
                createdAt: timestamp,
                visibility: "approvers_only" as VisibilityLevel,
                oldValue: currentTicket.relatedJiraKey,
                newValue: returnedComment.id,
                reason: summarizeTicketUpdateValue(commentBody, 140)
              }
            ],
            comments: commentMerge.comments
          };
        })
      );
    } catch (error) {
      console.error("Failed to add Jira comment.", {
        error: getErrorMessage(error),
        ticketKey,
        jiraIssueKey
      });
      throw error;
    }
  }

  function updateJiraDraft(ticketKey: string, draftUpdate: JiraDraftUpdateInput) {
    const ticketForPermission = ticketList.find((candidate) => candidate.key === ticketKey);

    if (!ticketForPermission) {
      throw new Error(`Ticket ${ticketKey} was not found.`);
    }

    if (!canManageJiraForTicket(config, selectedPersona, ticketForPermission)) {
      throw new Error("Your role is not allowed to update Jira fields for this ticket.");
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const actor = selectedPersona;

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        const updatedDraftFromInput = applyJiraDraftUpdate(ticket.jiraDraft, draftUpdate);
        const updatedDraft = {
          ...updatedDraftFromInput,
          labels: getJiraLabelsWithModule(updatedDraftFromInput.labels, ticket.module)
        };
        const changes = createJiraDraftAuditChanges(ticket, updatedDraft);

        if (changes.length === 0) {
          return ticket;
        }

        const auditReason = ticket.relatedJiraKey
          ? "Jira fields updated for the linked issue."
          : "Jira handoff fields updated before issue creation.";

        return {
          ...ticket,
          jiraDraft: updatedDraft,
          updatedAt: timestamp,
          audit: [
            ...ticket.audit,
            ...changes.map((change, index) => ({
              id: `audit-${ticket.key}-jira-draft-${now.getTime()}-${index}`,
              eventType: change.field.startsWith("Jira ")
                ? `${change.field} updated`
                : `Jira ${change.field.toLowerCase()} updated`,
              actor: formatPersonaAuditActor(actor),
              createdAt: timestamp,
              visibility: "approvers_only" as VisibilityLevel,
              oldValue: change.oldValue,
              newValue: change.newValue,
              reason: auditReason
            }))
          ]
        };
      })
    );
  }

  async function updateJiraIssueLink(ticketKey: string, jiraKey: string) {
    const ticketForPermission = ticketList.find((candidate) => candidate.key === ticketKey);

    if (!ticketForPermission) {
      throw new Error(`Ticket ${ticketKey} was not found.`);
    }

    if (!canManageJiraForTicket(config, selectedPersona, ticketForPermission)) {
      throw new Error("Your role is not allowed to update Jira links for this ticket.");
    }

    const normalizedJiraKey = getValidJiraIssueKey(jiraKey);
    const isClearingLink = !jiraKey.trim();

    if (!normalizedJiraKey && !isClearingLink) {
      throw new Error("Enter a valid Jira issue key or Jira browse URL.");
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const actor = selectedPersona;

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        const previousJiraKey = ticket.relatedJiraKey?.trim() ?? "";
        const nextFollowUpStatus = normalizedJiraKey
          ? getTicketJiraFollowUpStatus({ ...ticket, relatedJiraKey: normalizedJiraKey })
          : "not_created";
        const nextState: Ticket["state"] = normalizedJiraKey
          ? "jira_synced"
          : hasCompletedRequiredWorkflow(ticket.workflow)
            ? "jira_draft"
            : ticket.state;
        const nextDraft: Ticket["jiraDraft"] = normalizedJiraKey
          ? {
              ...ticket.jiraDraft,
              status: "synced",
              syncedStatus: getJiraFollowUpStatusLabel(nextFollowUpStatus),
              followUpStatus: nextFollowUpStatus,
              followUpUpdatedAt: timestamp
            }
          : {
              ...ticket.jiraDraft,
              status: hasCompletedRequiredWorkflow(ticket.workflow) ? "ready_to_create" : ticket.jiraDraft.status,
              syncedStatus: undefined,
              followUpStatus: "not_created",
              followUpUpdatedAt: timestamp
            };
        const commentBody = normalizedJiraKey
          ? `Jira issue link updated to ${normalizedJiraKey}.`
          : `Jira issue link ${previousJiraKey || "not linked"} cleared.`;

        return {
          ...ticket,
          state: nextState,
          relatedJiraKey: normalizedJiraKey || undefined,
          updatedAt: timestamp,
          jiraDraft: nextDraft,
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-jira-link-${now.getTime()}`,
              eventType: normalizedJiraKey ? "Jira link updated" : "Jira link cleared",
              actor: formatPersonaAuditActor(actor),
              createdAt: timestamp,
              visibility: "approvers_only",
              oldValue: previousJiraKey || "Not linked",
              newValue: normalizedJiraKey || "Not linked",
              reason: "Manual Jira link correction."
            }
          ],
          comments: [
            ...ticket.comments,
            {
              id: `comment-${ticket.key}-jira-link-${now.getTime()}`,
              author: actor.displayName,
              role: actor.roleLabel,
              body: commentBody,
              createdAt: timestamp,
              visibility: "public",
              source: "jira"
            }
          ]
        };
      })
    );
  }

  const syncJiraActivityForTicket = useCallback((
    ticketKey: string,
    status: JiraFollowUpStatus,
    note: string,
    jiraComments: JiraSyncedCommentInput[],
    jiraStatusName?: string,
    issueFields?: JiraSyncedIssueFieldsInput
  ): JiraActivitySyncResult => {
    if (status === "not_created") {
      return {
        statusChanged: false,
        jiraStatusChanged: false,
        jiraFieldsChanged: false,
        importedComments: 0,
        updatedComments: 0
      };
    }

    const ticketForSync = ticketList.find((candidate) => candidate.key === ticketKey);

    if (!ticketForSync?.relatedJiraKey) {
      throw new Error(`Ticket ${ticketKey} is not linked to Jira.`);
    }

    const previousStatus = getTicketJiraFollowUpStatus(ticketForSync);
    const normalizedStatus: SelectableJiraFollowUpStatus = status === "testing" ? "it_test" : status;
    const normalizedNote = normalizeRichTextForStorage(note);
    const commentMerge = mergeImportedJiraComments(ticketForSync, jiraComments);
    const syncedJiraDraftFieldUpdate = getSyncedJiraDraftFieldUpdate(issueFields);
    const jiraFieldsChanged = jiraDraftFieldsChanged(ticketForSync.jiraDraft, syncedJiraDraftFieldUpdate);
    const statusChanged = previousStatus !== normalizedStatus;
    const nextSyncedStatus = jiraStatusName?.trim() || getJiraFollowUpStatusLabel(normalizedStatus);
    const syncedStatusChanged =
      normalizeJiraStatusToken(ticketForSync.jiraDraft.syncedStatus) !== normalizeJiraStatusToken(nextSyncedStatus);
    const now = new Date();
    const timestamp = now.toISOString();
    const nextLabel = getJiraFollowUpStatusLabel(normalizedStatus);
    const nextTicketState = getTicketStateForJiraFollowUpStatus(normalizedStatus);
    const shouldAppendSyncComment =
      statusChanged ||
      syncedStatusChanged ||
      jiraFieldsChanged ||
      commentMerge.importedComments > 0 ||
      commentMerge.updatedComments > 0;

    if (!shouldAppendSyncComment) {
      return {
        statusChanged,
        jiraStatusChanged: syncedStatusChanged,
        jiraFieldsChanged,
        importedComments: 0,
        updatedComments: 0
      };
    }

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey || !ticket.relatedJiraKey) {
          return ticket;
        }

        const currentMerge = mergeImportedJiraComments(ticket, jiraComments);
        const currentPreviousStatus = getTicketJiraFollowUpStatus(ticket);
        const currentPreviousLabel = getJiraFollowUpStatusLabel(currentPreviousStatus);
        const currentStatusChanged = currentPreviousStatus !== normalizedStatus;
        const currentSyncedStatusChanged =
          normalizeJiraStatusToken(ticket.jiraDraft.syncedStatus) !== normalizeJiraStatusToken(nextSyncedStatus);
        const currentSyncedJiraDraftFieldUpdate = getSyncedJiraDraftFieldUpdate(issueFields);
        const currentJiraFieldsChanged = jiraDraftFieldsChanged(ticket.jiraDraft, currentSyncedJiraDraftFieldUpdate);
        const currentSyncedJiraFieldSummary = formatSyncedJiraFieldSummary(currentSyncedJiraDraftFieldUpdate);
        const currentImportedCommentText = [
          currentMerge.importedComments ? `${currentMerge.importedComments} Jira comment${currentMerge.importedComments === 1 ? "" : "s"} imported` : "",
          currentMerge.updatedComments ? `${currentMerge.updatedComments} Jira comment${currentMerge.updatedComments === 1 ? "" : "s"} updated` : "",
          currentJiraFieldsChanged ? currentSyncedJiraFieldSummary : ""
        ].filter(Boolean).join(", ");
        const currentReason = normalizedNote || currentImportedCommentText || `Jira status checked: ${nextSyncedStatus}.`;
        const statusAuditOldValue = currentStatusChanged
          ? currentPreviousLabel
          : ticket.jiraDraft.syncedStatus || currentPreviousLabel;
        const statusAuditNewValue = currentStatusChanged ? nextLabel : nextSyncedStatus;
        const syncCommentBody = currentStatusChanged || currentSyncedStatusChanged
          ? currentReason
          : `Synced Jira comments. ${currentReason}`;

        return {
          ...ticket,
          state: nextTicketState,
          updatedAt: timestamp,
          jiraDraft: {
            ...ticket.jiraDraft,
            ...(currentSyncedJiraDraftFieldUpdate ?? {}),
            status: "synced",
            syncedStatus: nextSyncedStatus,
            followUpStatus: normalizedStatus,
            followUpUpdatedAt: timestamp
          },
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-jira-sync-${now.getTime()}`,
              eventType: currentStatusChanged || currentSyncedStatusChanged ? "Jira follow-up synced" : "Jira comments synced",
              actor: "Jira Sync",
              createdAt: timestamp,
              visibility: "approvers_only",
              oldValue: statusAuditOldValue,
              newValue: statusAuditNewValue,
              reason: currentReason
            }
          ],
          comments: [
            ...currentMerge.comments,
            {
              id: `comment-${ticket.key}-jira-sync-${now.getTime()}`,
              author: "Jira Sync",
              role: "System",
              body: syncCommentBody,
              createdAt: timestamp,
              visibility: "public",
              source: "system"
            }
          ]
        };
      })
    );

    return {
      statusChanged,
      jiraStatusChanged: syncedStatusChanged,
      jiraFieldsChanged,
      importedComments: commentMerge.importedComments,
      updatedComments: commentMerge.updatedComments
    };
  }, [ticketList]);

  const syncLinkedJiraTickets = useCallback(async (options: { silent?: boolean } = {}) => {
    const silent = options.silent === true;

    if (jiraBulkSyncState === "syncing") {
      return;
    }

    const linkedTickets = ticketList.filter((ticket) => getValidJiraIssueKey(ticket.relatedJiraKey));

    if (!config.integrations.jira.enabled || linkedTickets.length === 0) {
      if (!silent) {
        setJiraBulkSyncMessage(linkedTickets.length === 0 ? "No linked Jira tickets to sync." : "");
        setJiraBulkSyncError(config.integrations.jira.enabled ? "" : "Jira integration is not enabled.");
      }
      return;
    }

    const localJiraToken = readLocalIntegrationSecrets().jiraToken?.trim() ?? "";

    if (!localJiraToken) {
      if (!silent) {
        setJiraBulkSyncError(
          config.integrations.jira.tokenConfigured
            ? "Jira token is not available in this browser. Open Admin > Integrations and paste the token before syncing Jira data."
            : "Configure a Jira token in Admin > Integrations before syncing Jira data."
        );
        setJiraBulkSyncMessage("");
      }
      return;
    }

    setJiraBulkSyncState("syncing");
    setJiraBulkSyncError("");

    if (!silent) {
      setJiraBulkSyncMessage(`Syncing ${formatCount(linkedTickets.length)} linked Jira ticket${linkedTickets.length === 1 ? "" : "s"}...`);
    }

    let syncedCount = 0;
    let failedCount = 0;

    for (const ticket of linkedTickets) {
      const jiraIssueKey = getValidJiraIssueKey(ticket.relatedJiraKey);

      if (!jiraIssueKey) {
        continue;
      }

      try {
        const response = await fetch("/api/integrations/jira/issue-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            config: buildTicketJiraActionConfig(ticket, ticket.jiraDraft, config, localJiraToken),
            issueKey: jiraIssueKey
          })
        });
        const payload = (await response.json().catch(() => null)) as
          | IntegrationApiErrorPayload
          | {
              data?: {
                jiraStatus?: JiraIssueStatusDetails;
                comments?: JiraSyncedCommentInput[];
                issueFields?: JiraSyncedIssueFieldsInput;
              };
            }
          | null;

        if (!response.ok) {
          throw createIntegrationActionError(payload as IntegrationApiErrorPayload | null, "Jira data sync failed.");
        }

        const data = (
          payload as {
            data?: {
              jiraStatus?: JiraIssueStatusDetails;
              comments?: JiraSyncedCommentInput[];
              issueFields?: JiraSyncedIssueFieldsInput;
            };
          } | null
        )?.data;
        const nextFollowUpStatus = getJiraFollowUpStatusFromIssueStatus(data?.jiraStatus, getTicketJiraFollowUpStatus(ticket));
        const jiraStatusSummary = getJiraIssueStatusSummary(data?.jiraStatus);
        const syncedJiraFieldSummary = formatSyncedJiraFieldSummary(getSyncedJiraDraftFieldUpdate(data?.issueFields));

        syncJiraActivityForTicket(
          ticket.key,
          nextFollowUpStatus,
          [`Synced from Jira. Jira status: ${jiraStatusSummary}.`, syncedJiraFieldSummary].filter(Boolean).join(" "),
          data?.comments ?? [],
          data?.jiraStatus?.name,
          data?.issueFields
        );
        syncedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error("Linked Jira ticket sync failed.", {
          ticketKey: ticket.key,
          jiraIssueKey,
          error: getErrorMessage(error)
        });
      }
    }

    setJiraBulkSyncState("idle");

    if (failedCount > 0) {
      setJiraBulkSyncError(`Synced ${formatCount(syncedCount)} Jira ticket${syncedCount === 1 ? "" : "s"}; ${formatCount(failedCount)} failed.`);
      setJiraBulkSyncMessage("");
      return;
    }

    setJiraBulkSyncError("");
    setJiraBulkSyncMessage(`Synced ${formatCount(syncedCount)} Jira ticket${syncedCount === 1 ? "" : "s"}. Status, release dates, estimate, remaining time, and comments are up to date.`);
  }, [config, jiraBulkSyncState, syncJiraActivityForTicket, ticketList]);

  useEffect(() => {
    if (startupJiraSyncHandledRef.current || !hasLoadedConfig || !hasLoadedTickets) {
      return;
    }

    if (!config.integrations.jira.enabled || !ticketList.some((ticket) => getValidJiraIssueKey(ticket.relatedJiraKey))) {
      startupJiraSyncHandledRef.current = true;
      return;
    }

    const localJiraToken = readLocalIntegrationSecrets().jiraToken?.trim() ?? "";

    if (!localJiraToken) {
      startupJiraSyncHandledRef.current = true;
      return;
    }

    startupJiraSyncHandledRef.current = true;
    void syncLinkedJiraTickets({ silent: true });
  }, [config.integrations.jira.enabled, hasLoadedConfig, hasLoadedTickets, syncLinkedJiraTickets, ticketList]);

  function updateJiraFollowUpStatus(ticketKey: string, status: JiraFollowUpStatus, note: string) {
    if (status === "not_created") {
      return;
    }

    const ticketForPermission = ticketList.find((candidate) => candidate.key === ticketKey);

    if (!ticketForPermission) {
      throw new Error(`Ticket ${ticketKey} was not found.`);
    }

    if (!canManageJiraForTicket(config, selectedPersona, ticketForPermission)) {
      throw new Error("Your role is not allowed to update Jira follow-up status for this ticket.");
    }

    const normalizedStatus: SelectableJiraFollowUpStatus = status === "testing" ? "it_test" : status;
    const now = new Date();
    const timestamp = now.toISOString();
    const actor = selectedPersona;
    const normalizedNote = normalizeRichTextForStorage(note);
    const nextLabel = getJiraFollowUpStatusLabel(normalizedStatus);
    const nextTicketState = getTicketStateForJiraFollowUpStatus(normalizedStatus);

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey || !ticket.relatedJiraKey) {
          return ticket;
        }

        const previousStatus = getTicketJiraFollowUpStatus(ticket);
        const previousLabel = getJiraFollowUpStatusLabel(previousStatus);
        const reason = normalizedNote || `Jira follow-up status changed to ${nextLabel}.`;

        return {
          ...ticket,
          state: nextTicketState,
          updatedAt: timestamp,
          jiraDraft: {
            ...ticket.jiraDraft,
            status: "synced",
            syncedStatus: nextLabel,
            followUpStatus: normalizedStatus,
            followUpUpdatedAt: timestamp
          },
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-jira-follow-up-${now.getTime()}`,
              eventType: "Jira follow-up updated",
              actor: formatPersonaAuditActor(actor),
              createdAt: timestamp,
              visibility: "approvers_only",
              oldValue: previousLabel,
              newValue: nextLabel,
              reason
            }
          ],
          comments: [
            ...ticket.comments,
            {
              id: `comment-${ticket.key}-jira-follow-up-${now.getTime()}`,
              author: actor.displayName,
              role: actor.roleLabel,
              body: reason,
              createdAt: timestamp,
              visibility: "public",
              source: "jira"
            }
          ]
        };
      })
    );
  }

  function updateWorkflowStatus(ticketKey: string, input: WorkflowStatusUpdateInput) {
    const reason = normalizeRichTextForStorage(input.reason).trim();

    if (!reason) {
      return;
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const actor = selectedPersona;
    const nextStatusLabel = getWorkflowStatusOverrideLabel(input.status);

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        const targetStep = ticket.workflow.find((step) => step.id === input.stepId);

        if (!targetStep) {
          return ticket;
        }

        const workflow = applyWorkflowStatusOverride(
          ticket.workflow,
          { ...input, reason },
          actor.displayName,
          timestamp
        );
        const workflowComplete = hasCompletedRequiredWorkflow(workflow);
        const nextState = getTicketStateAfterWorkflowOverride(ticket, workflow);
        const commentBody = `${targetStep.label} changed to ${nextStatusLabel}. Reason: ${htmlToPlainTextFallback(reason)}`;

        return {
          ...ticket,
          workflow,
          state: nextState,
          jiraDraft:
            workflowComplete && !ticket.relatedJiraKey
              ? {
                  ...ticket.jiraDraft,
                  status: "ready_to_create"
                }
              : !workflowComplete && ticket.jiraDraft.status === "ready_to_create"
                ? {
                    ...ticket.jiraDraft,
                    status: "release_gate"
                  }
                : ticket.jiraDraft,
          updatedAt: timestamp,
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-workflow-status-${now.getTime()}`,
              eventType: "Workflow status changed",
              actor: formatPersonaAuditActor(actor),
              createdAt: timestamp,
              visibility: "approvers_only",
              oldValue: `${targetStep.label}: ${nextActionLabel(targetStep.status)}`,
              newValue: `${targetStep.label}: ${nextStatusLabel}`,
              reason
            }
          ],
          comments: [
            ...ticket.comments,
            {
              id: `comment-${ticket.key}-workflow-status-${now.getTime()}`,
              author: actor.displayName,
              role: actor.roleLabel,
              body: commentBody,
              createdAt: timestamp,
              visibility: "approvers_only",
              source: "portal"
            }
          ]
        };
      })
    );
  }

  function reopenTicket(ticketKey: string) {
    const now = new Date();
    const timestamp = now.toISOString();
    const actor = selectedPersona;
    const commentBody = "Ticket reopened for additional workflow follow-up.";

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey || !canReopenTicketForRole(ticket, role)) {
          return ticket;
        }

        const workflow = getReopenedWorkflow(ticket.workflow);
        const nextState = getReopenedTicketState(ticket, workflow);
        const jiraWasRejected = getTicketJiraFollowUpStatus(ticket) === "rejected";

        return {
          ...ticket,
          state: nextState,
          workflow,
          jiraDraft: jiraWasRejected
            ? {
                ...ticket.jiraDraft,
                syncedStatus: getJiraFollowUpStatusLabel("in_progress"),
                followUpStatus: "in_progress",
                followUpUpdatedAt: timestamp
              }
            : ticket.jiraDraft,
          updatedAt: timestamp,
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-reopened-${now.getTime()}`,
              eventType: "Ticket reopened",
              actor: formatPersonaAuditActor(actor),
              createdAt: timestamp,
              visibility: "approvers_only",
              oldValue: "closed",
              newValue: nextState,
              reason: commentBody
            }
          ],
          comments: [
            ...ticket.comments,
            {
              id: `comment-${ticket.key}-reopened-${now.getTime()}`,
              author: actor.displayName,
              role: actor.roleLabel,
              body: commentBody,
              createdAt: timestamp,
              visibility: "public",
              source: "portal"
            }
          ]
        };
      })
    );
  }

  function decideApproval(
    ticketKey: string,
    stepId: string,
    action: ApprovalDecisionAction,
    note: ApprovalDecisionPayload
  ) {
    const now = new Date();
    const actor = selectedPersona;
    const roleLabel = actor.roleLabel;
    const noteText = typeof note === "string" ? note : note.question;
    const trimmedNote = noteText.trim();

    setTicketList((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.key !== ticketKey) {
          return ticket;
        }

        const targetStep = ticket.workflow.find((step) => step.id === stepId);

        if (
          !targetStep ||
          !isApprovalVisibleForPersona(config, actor, ticket, targetStep) ||
          !isActionableWorkflowStep(targetStep)
        ) {
          return ticket;
        }

        if (action === "approve") {
          const workflow = getNextWorkflowAfterApproval(ticket.workflow, stepId, actor.displayName);
          const requiredWorkflowComplete = hasCompletedRequiredWorkflow(workflow);
          const reason = trimmedNote || `Approved ${targetStep.label}.`;

          return {
            ...ticket,
            workflow,
            state: requiredWorkflowComplete ? "jira_draft" : "approval",
            jiraDraft: requiredWorkflowComplete
              ? { ...ticket.jiraDraft, status: "ready_to_create" }
              : ticket.jiraDraft,
            updatedAt: now.toISOString(),
            audit: [
              ...ticket.audit,
              {
                id: `audit-${ticket.key}-approval-${now.getTime()}`,
                eventType: "Approval granted",
                actor: formatPersonaAuditActor(actor),
                createdAt: now.toISOString(),
                visibility: "approvers_only",
                oldValue: targetStep.status,
                newValue: "complete",
                reason
              }
            ],
            comments: [
              ...ticket.comments,
              {
                id: `comment-${ticket.key}-approval-${now.getTime()}`,
                author: actor.displayName,
                role: roleLabel,
                body: reason,
                createdAt: now.toISOString(),
                visibility: "approvers_only",
                source: "portal"
              }
            ]
          };
        }

        if (action === "reject") {
          const reason = trimmedNote || `Rejected ${targetStep.label}.`;

          return {
            ...ticket,
            state: "closed",
            workflow: ticket.workflow.map((step) =>
              step.id === stepId ? { ...step, status: "blocked", ownerName: actor.displayName } : step
            ),
            updatedAt: now.toISOString(),
            audit: [
              ...ticket.audit,
              {
                id: `audit-${ticket.key}-reject-${now.getTime()}`,
                eventType: "Approval rejected",
                actor: formatPersonaAuditActor(actor),
                createdAt: now.toISOString(),
                visibility: "approvers_only",
                oldValue: targetStep.status,
                newValue: "closed",
                reason
              }
            ],
            comments: [
              ...ticket.comments,
              {
                id: `comment-${ticket.key}-reject-${now.getTime()}`,
                author: actor.displayName,
                role: roleLabel,
                body: reason,
                createdAt: now.toISOString(),
                visibility: "approvers_only",
                source: "portal"
              }
            ]
          };
        }

        const clarificationRequest: ApprovalClarificationRequest =
          typeof note === "string"
            ? {
                question: note,
                workflowTargetRoles: ["requester"]
              }
            : note;
        const question = trimmedNote || `Clarification is required before ${targetStep.label} can be approved.`;
        const dueAt = formatLocalDateTime(new Date(now.getTime() + 24 * 60 * 60 * 1000));
        const workflowTargetRoles = getUniqueRoleKeys(
          clarificationRequest.workflowTargetRoles.length > 0 ? clarificationRequest.workflowTargetRoles : ["requester"]
        );
        const workflowClarificationTargets = workflowTargetRoles.map((targetRole) => ({
          role: targetRole,
          assignedTo: targetRole === "requester" ? "Requester" : getConfigRoleLabel(config, targetRole),
          level: "Approval clarification"
        }));
        const pullInActionType = clarificationRequest.pullInActionType ?? "clarification";
        const pullInActionOption = getPullInActionOption(pullInActionType);
        const pullInTargetRole = clarificationRequest.pullInTargetRole;
        const pullInTargetRoleLabel = pullInTargetRole ? getConfigRoleLabel(config, pullInTargetRole) : "";
        const shouldCreatePullInWorkflowGate =
          Boolean(pullInTargetRole) && (pullInActionType === "approval" || pullInActionType === "review");
        const pullInWorkflowStepLabel = pullInTargetRole
          ? getPullInWorkflowStepLabel(pullInActionType, pullInTargetRoleLabel)
          : "";
        const pullInWorkflowGateAlreadyExists =
          shouldCreatePullInWorkflowGate &&
          ticket.workflow.some(
            (step) =>
              step.ownerRole === pullInTargetRole &&
              step.label === pullInWorkflowStepLabel &&
              step.status !== "complete"
          );
        const workflowWithPullIn =
          shouldCreatePullInWorkflowGate && !pullInWorkflowGateAlreadyExists && pullInTargetRole
            ? [
                ...ticket.workflow,
                {
                  id: `pull-in-${ticket.key}-${pullInActionType}-${pullInTargetRole}-${now.getTime()}`,
                  label: pullInWorkflowStepLabel,
                  ownerRole: pullInTargetRole,
                  workflowType: getRoleWorkflowType(config, pullInTargetRole),
                  ownerName: pullInTargetRoleLabel,
                  status: "active" as WorkflowStepStatus,
                  slaState: "healthy" as SlaState,
                  dueAt,
                  parallelGroup: "Temporary pull-in"
                }
              ]
            : ticket.workflow;
        const clarificationTargets = [
          ...workflowClarificationTargets,
          ...(pullInTargetRole
            ? [
                {
                  role: pullInTargetRole,
                  assignedTo: pullInTargetRoleLabel,
                  level: pullInActionOption.level
                }
              ]
            : [])
        ].filter((target, index, targets) =>
          targets.findIndex(
            (candidate) =>
              normalizeRoleText(candidate.assignedTo) === normalizeRoleText(target.assignedTo) &&
              normalizeRoleText(candidate.level) === normalizeRoleText(target.level)
          ) === index
        );
        const clarificationTargetsByLevel = clarificationTargets.reduce((targetsByLevel, target) => {
          const currentTargets = targetsByLevel.get(target.level) ?? [];
          targetsByLevel.set(target.level, [...currentTargets, target]);

          return targetsByLevel;
        }, new Map<string, typeof clarificationTargets>());
        const clarificationThreads = Array.from(clarificationTargetsByLevel.entries()).map(
          ([level, targets], index) => ({
            id: `clarification-${ticket.key}-${now.getTime()}-${index}`,
            level,
            question,
            status: "open" as const,
            requestedBy: actor.displayName,
            assignedTo: getUniqueClarificationAssigneeLabels(targets.map((target) => target.assignedTo)).join(", "),
            dueAt,
            messages: [
              {
                id: `message-${ticket.key}-approval-clarification-${now.getTime()}-${index}`,
                author: actor.displayName,
                role: roleLabel,
                body: question,
                createdAt: now.toISOString(),
                visibility: "public" as VisibilityLevel
              }
            ]
          })
        );
        const participantAccessLevel = getPullInAccessLevel(pullInActionType);
        const participantExists =
          !pullInTargetRole ||
          ticket.participants.some(
            (participant) =>
              normalizeRoleText(participant.role) === normalizeRoleText(pullInTargetRoleLabel) &&
              participant.accessLevel === participantAccessLevel
          );
        const nextParticipants =
          pullInTargetRole && !participantExists
            ? [
                ...ticket.participants,
                {
                  id: `participant-${ticket.key}-${pullInActionType}-${pullInTargetRole}-${now.getTime()}`,
                  name: pullInTargetRoleLabel,
                  role: pullInTargetRoleLabel,
                  accessLevel: participantAccessLevel,
                  expiresAt: clarificationRequest.temporary ?? true ? dueAt : undefined
                }
              ]
            : ticket.participants;
        const targetSummary = clarificationTargets.map((target) => target.assignedTo).join(", ");

        return {
          ...ticket,
          state: "clarification",
          workflow: workflowWithPullIn.map((step) =>
            step.id === stepId ? { ...step, status: "blocked", ownerName: actor.displayName } : step
          ),
          participants: nextParticipants,
          updatedAt: now.toISOString(),
          clarifications: [...ticket.clarifications, ...clarificationThreads],
          audit: [
            ...ticket.audit,
            {
              id: `audit-${ticket.key}-approval-clarification-${now.getTime()}`,
              eventType: "Approval clarification requested",
              actor: formatPersonaAuditActor(actor),
              createdAt: now.toISOString(),
              visibility: "approvers_only",
              oldValue: targetStep.status,
              newValue: "blocked",
              reason: targetSummary ? `${question} Target: ${targetSummary}` : question
            }
          ]
        };
      })
    );
  }

  return (
    <div className="app-frame scania">
      <TopBar
        attentionItems={headerAttentionItems}
        rolePersonaOptions={rolePersonaOptions}
        selectedPersona={selectedPersona}
        selectedPersonaId={selectedPersona.id}
        ticketSearchOptions={ticketListTickets}
        ticketSearchQuery={query}
        onGoDashboard={goToDashboard}
        onPersonaChange={changePersona}
        onOpenModule={openModule}
        onOpenNotifications={() => setActiveModule("notifications")}
        onTicketSearchChange={setQuery}
        onTicketSearchSubmit={searchAndOpenTicket}
        onToggleMenu={() => setIsSideMenuOpen((isOpen) => !isOpen)}
        notificationCount={visibleNotifications.filter((item) => item.unread).length}
        isMounted={isTegelShellMounted}
      />
      <div className="app-shell">
        <Sidebar
          activeModule={activeModule}
          attentionCounts={attentionCountsByModule}
          items={visibleNavItems}
          isOpen={isSideMenuOpen}
          isMounted={isTegelShellMounted}
          onClose={() => setIsSideMenuOpen(false)}
          onSelectModule={openModule}
        />
        <div className="workspace">
          <main className="workspace-main">
            <ModuleHeader
              activeModule={activeModule}
              role={role}
              selectedTicket={selectedTicket}
              query={query}
              onQueryChange={setQuery}
              onNewTicket={() => setIsCreateTicketOpen(true)}
            />
            {renderModule({
              activeModule,
              activeTab,
              allTickets: roleScopedTickets,
              filteredTickets,
              ticketListTickets,
              selectedTicket,
              visibleAudit,
              visibleComments,
              visibleNotifications,
              isTicketDetailOpen,
              role,
              selectedPersona,
              config,
              onConfigChange: setConfig,
              onAddClarificationReply: addClarificationReply,
              onAddAttachments: addTicketAttachments,
              onReplaceAttachmentContent: replaceTicketAttachmentContent,
              onAddComment: addTicketComment,
              onCreateClarification: createClarificationThread,
              onCreateEscalation: createEscalation,
              onCreateJira: createJiraForTicket,
              onPostJiraComment: postJiraCommentForTicket,
              onReopenTicket: reopenTicket,
              onUpdateJiraDraft: updateJiraDraft,
              onUpdateJiraIssue: updateJiraIssueForTicket,
              onUpdateJiraLink: updateJiraIssueLink,
              onUpdateTicket: updateTicket,
              onUpdateWorkflowStatus: updateWorkflowStatus,
              onUpdateEscalationStatus: updateEscalationStatus,
              onUpdateJiraStatus: updateJiraFollowUpStatus,
              onSyncJiraActivity: syncJiraActivityForTicket,
              onSyncLinkedJiraTickets: () => syncLinkedJiraTickets({ silent: false }),
              jiraBulkSyncError,
              jiraBulkSyncMessage,
              jiraBulkSyncState,
              onApprovalDecision: decideApproval,
              onTicketDetailOpenChange: setIsTicketDetailOpen,
              onOpenTicketModule: openTicketModule,
              onOpenNotification: openNotificationItem,
              setActiveTab,
              focusTicketOnJira,
              selectTicket
            })}
          </main>
        </div>
      </div>
      {isCreateTicketOpen ? (
        <NewTicketModal
          config={config}
          onClose={() => setIsCreateTicketOpen(false)}
          onCreateTicket={createTicket}
        />
      ) : null}
    </div>
  );
}

function Sidebar({
  activeModule,
  attentionCounts,
  items,
  isOpen,
  isMounted,
  onClose,
  onSelectModule
}: {
  activeModule: ModuleKey;
  attentionCounts: Partial<Record<ModuleKey, number>>;
  items: readonly NavItem[];
  isOpen: boolean;
  isMounted: boolean;
  onClose: () => void;
  onSelectModule: (module: ModuleKey) => void;
}) {
  if (!isMounted) {
    return <aside className="tegel-side-fallback" aria-hidden="true" />;
  }

  return (
    <aside className="tegel-side-shell" aria-label="Primary navigation">
      <TdsSideMenu id="nexus-side-menu" className="tegel-side-menu" open={isOpen} persistent>
        <TdsSideMenuOverlay slot="overlay" onClick={onClose} />
        <TdsSideMenuCloseButton slot="close-button" onClick={onClose} />
        {items.map((item) => {
          const attentionCount = attentionCounts[item.key] ?? 0;

          return (
            <TdsSideMenuItem
              key={item.key}
              selected={activeModule === item.key}
            >
              <button
                className="tegel-side-menu-button"
                onClick={() => {
                  onSelectModule(item.key);
                  onClose();
                }}
                type="button"
              >
                <TegelIcon name={item.iconName} />
                <span className="tegel-side-menu-label">{item.label}</span>
                {attentionCount > 0 ? (
                  <span
                    aria-label={`${attentionCount} ${item.label} item${attentionCount === 1 ? "" : "s"} need attention`}
                    className="tegel-side-attention-count"
                  >
                    {attentionCount}
                  </span>
                ) : null}
              </button>
            </TdsSideMenuItem>
          );
        })}
      </TdsSideMenu>
    </aside>
  );
}

function TopBar({
  attentionItems,
  rolePersonaOptions,
  selectedPersona,
  selectedPersonaId,
  ticketSearchOptions,
  ticketSearchQuery,
  notificationCount,
  isMounted,
  onGoDashboard,
  onPersonaChange,
  onOpenModule,
  onTicketSearchChange,
  onTicketSearchSubmit,
  onToggleMenu,
  onOpenNotifications
}: {
  attentionItems: HeaderAttentionItem[];
  rolePersonaOptions: RolePersonaOption[];
  selectedPersona: RolePersonaOption;
  selectedPersonaId: string;
  ticketSearchOptions: Ticket[];
  ticketSearchQuery: string;
  notificationCount: number;
  isMounted: boolean;
  onGoDashboard: () => void;
  onPersonaChange: (personaId: string) => void;
  onOpenModule: (module: ModuleKey) => void;
  onTicketSearchChange: (query: string) => void;
  onTicketSearchSubmit: (query: string) => void;
  onToggleMenu: () => void;
  onOpenNotifications: () => void;
}) {
  const [isAttentionOpen, setIsAttentionOpen] = useState(false);
  const [isTicketSearchOpen, setIsTicketSearchOpen] = useState(false);
  const [activeTicketSearchIndex, setActiveTicketSearchIndex] = useState(0);
  const ticketSearchListId = useId();
  const attentionTotal = attentionItems.reduce((total, item) => total + item.count, 0);
  const normalizedTicketSearchQuery = ticketSearchQuery.trim().toLowerCase();
  const visibleTicketSearchOptions = useMemo(() => {
    const source = normalizedTicketSearchQuery
      ? ticketSearchOptions.filter((ticket) =>
          [
            ticket.key,
            ticket.title,
            ticket.product,
            ticket.module,
            ticket.site,
            ticket.priority,
            getTicketCurrentStatusLabel(ticket),
            getTicketCurrentLocationLabel(ticket)
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedTicketSearchQuery)
        )
      : ticketSearchOptions;

    return source.slice(0, 8);
  }, [normalizedTicketSearchQuery, ticketSearchOptions]);
  const shouldShowTicketSearchList = isTicketSearchOpen && visibleTicketSearchOptions.length > 0;

  useEffect(() => {
    setActiveTicketSearchIndex(0);
  }, [normalizedTicketSearchQuery, visibleTicketSearchOptions.length]);

  function openTicketSearchResult(ticket: Ticket) {
    setIsAttentionOpen(false);
    setIsTicketSearchOpen(false);
    onTicketSearchChange(ticket.key);
    onTicketSearchSubmit(ticket.key);
  }

  if (!isMounted) {
    return <div className="tegel-header-fallback" aria-hidden="true" />;
  }

  return (
    <div className="tegel-header-shell">
      <div className="mobile-tegel-header" aria-label="NEXUS Portal mobile header">
        <button
          className="mobile-header-button"
          type="button"
          aria-label="Open navigation"
          onClick={onToggleMenu}
        >
          <span className="mobile-menu-lines" aria-hidden="true" />
        </button>
        <strong>NEXUS PORTAL</strong>
        <button
          className="mobile-header-button"
          type="button"
          aria-label="Application switcher"
        >
          <span className="mobile-launcher-dots" aria-hidden="true" />
        </button>
      </div>
      <TdsHeader aria-label="NEXUS Portal header">
        <TdsHeaderHamburger
          slot="hamburger"
          tdsAriaLabel="Open navigation"
          onClick={onToggleMenu}
        />
        <TdsHeaderTitle slot="title">NEXUS PORTAL</TdsHeaderTitle>
        <TdsHeaderItem className="tegel-header-search-item" slot="end">
          <form
            className={`tegel-header-ticket-search ${shouldShowTicketSearchList ? "is-open" : ""}`}
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setIsAttentionOpen(false);
              setIsTicketSearchOpen(false);
              onTicketSearchSubmit(ticketSearchQuery);
            }}
            onBlur={(event: ReactFocusEvent<HTMLFormElement>) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsTicketSearchOpen(false);
              }
            }}
          >
            <div className="tegel-header-ticket-search-control">
              <TegelIcon name="search" size="16px" />
              <label className="sr-only" htmlFor="header-ticket-search">
                Search tickets
              </label>
              <input
                id="header-ticket-search"
                value={ticketSearchQuery}
                onChange={(event) => {
                  onTicketSearchChange(event.target.value);
                  setIsTicketSearchOpen(true);
                }}
                onFocus={() => setIsTicketSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setIsTicketSearchOpen(true);
                    setActiveTicketSearchIndex((current) =>
                      Math.min(current + 1, Math.max(visibleTicketSearchOptions.length - 1, 0))
                    );
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveTicketSearchIndex((current) => Math.max(current - 1, 0));
                    return;
                  }

                  if (event.key === "Escape") {
                    setIsTicketSearchOpen(false);
                    return;
                  }

                  if (event.key === "Enter" && shouldShowTicketSearchList) {
                    const selectedTicket = visibleTicketSearchOptions[activeTicketSearchIndex];

                    if (selectedTicket) {
                      event.preventDefault();
                      openTicketSearchResult(selectedTicket);
                    }
                  }
                }}
                placeholder="Search ticket"
                autoComplete="off"
                role="combobox"
                aria-expanded={shouldShowTicketSearchList}
                aria-controls={ticketSearchListId}
                aria-activedescendant={
                  shouldShowTicketSearchList
                    ? `${ticketSearchListId}-${visibleTicketSearchOptions[activeTicketSearchIndex]?.key}`
                    : undefined
                }
              />
              <span className="tegel-header-ticket-search-caret" aria-hidden="true" />
              <button type="submit" title="Open matching ticket" aria-label="Open matching ticket">
                Open
              </button>
            </div>
            {shouldShowTicketSearchList ? (
              <div className="tegel-header-ticket-search-list" id={ticketSearchListId} role="listbox">
                {visibleTicketSearchOptions.map((ticket, index) => (
                  <button
                    id={`${ticketSearchListId}-${ticket.key}`}
                    className={`tegel-header-ticket-search-option ${
                      index === activeTicketSearchIndex ? "is-active" : ""
                    }`}
                    key={ticket.key}
                    type="button"
                    role="option"
                    aria-selected={index === activeTicketSearchIndex}
                    onMouseEnter={() => setActiveTicketSearchIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      openTicketSearchResult(ticket);
                    }}
                  >
                    {(() => {
                      const currentStatus = getTicketCurrentStatusLabel(ticket);
                      const currentLocation = getTicketCurrentLocationLabel(ticket);

                      return (
                        <>
                    <span className="tegel-header-ticket-search-option-main">
                      <strong>{ticket.key}</strong>
                      <span>{ticket.title}</span>
                    </span>
                    <span className="tegel-header-ticket-search-option-meta">
                      <span>{currentStatus}</span>
                      <span>{currentLocation}</span>
                      <span>{ticket.product}</span>
                      <span>{ticket.module}</span>
                    </span>
                        </>
                      );
                    })()}
                  </button>
                ))}
              </div>
            ) : null}
          </form>
        </TdsHeaderItem>
        <label className="tegel-header-role" slot="end">
          <span className="tegel-header-role-label">Role</span>
          <span className="sr-only">Current role</span>
          <select
            aria-label="Current test user and role"
            value={selectedPersonaId}
            onChange={(event) => {
              setIsAttentionOpen(false);
              onPersonaChange(event.target.value);
            }}
          >
            {rolePersonaOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {formatPersonaOptionLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <TdsHeaderItem className="tegel-header-notifications" slot="end">
          <button
            className="tegel-header-button"
            type="button"
            aria-label="Notifications"
            onClick={onOpenNotifications}
          >
            <TegelIcon name="notification" />
            {notificationCount > 0 ? (
              <span className="tegel-notification-count">{notificationCount}</span>
            ) : null}
          </button>
        </TdsHeaderItem>
        <TdsHeaderLauncherButton slot="end" tdsAriaLabel="Application switcher" />
        <TdsHeaderItem className="tegel-header-user-item" slot="end">
          <button
            aria-controls="header-attention-panel"
            aria-expanded={isAttentionOpen}
            aria-label={`Signed in user ${selectedPersona.displayName}, ${selectedPersona.roleLabel}. ${attentionTotal} item${attentionTotal === 1 ? "" : "s"} need attention.`}
            className="tegel-user-button"
            type="button"
            onClick={() => setIsAttentionOpen((isOpen) => !isOpen)}
          >
            {selectedPersona.initials}
            {attentionTotal > 0 ? <span className="tegel-user-ping">{attentionTotal}</span> : null}
          </button>
        </TdsHeaderItem>
        <TdsHeaderBrandSymbol slot="end">
          <a
            aria-label="Go to Dashboard"
            href="#dashboard"
            onClick={(event) => {
              event.preventDefault();
              setIsAttentionOpen(false);
              onGoDashboard();
            }}
          />
        </TdsHeaderBrandSymbol>
      </TdsHeader>
      {isAttentionOpen ? (
        <section className="tegel-attention-popover" id="header-attention-panel" aria-label="User attention summary">
          <header>
            <span>{selectedPersona.displayName}</span>
            <strong>Needs attention</strong>
            <small>{selectedPersona.roleLabel}</small>
          </header>
          {attentionItems.length > 0 ? (
            <div className="tegel-attention-list">
              {attentionItems.map((item) => (
                <button
                  className={`tegel-attention-item tone-${item.tone}`}
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setIsAttentionOpen(false);
                    onOpenModule(item.module);
                  }}
                >
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.meta}</small>
                  </span>
                  <em>{item.count}</em>
                </button>
              ))}
            </div>
          ) : (
            <p>No visible modules require attention for this role.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function getModuleHeaderTitle(activeModule: ModuleKey, role: RoleKey, fallbackLabel: string): string {
  if (activeModule === "dashboard" && role === "requester") {
    return "My support dashboard";
  }

  if (activeModule === "tickets" && role === "requester") {
    return "Find support tickets";
  }

  if (activeModule === "releasePlan") {
    return "Release plan";
  }

  return fallbackLabel;
}

function getModuleHeaderDescription(activeModule: ModuleKey, role: RoleKey, selectedTicket?: Ticket): string {
  if (activeModule === "dashboard") {
    return role === "requester"
      ? "High-level view of your tickets, SLA health, clarifications, notifications, and planned releases."
      : "High-level view of role-visible work, SLA health, approvals, clarifications, notifications, and releases.";
  }

  if (activeModule === "integrations") {
    return "Jira API sync and SMTP email delivery configuration.";
  }

  if (activeModule === "admin") {
    return "Master data, responsibility mapping, workflows, notifications, and SLA settings.";
  }

  if (activeModule === "approvals") {
    return "Role-based approval queue with decision actions and ticket context.";
  }

  if (activeModule === "clarifications" && !selectedTicket) {
    return "No open clarification requests for this role.";
  }

  if (activeModule === "tickets") {
    return role === "requester"
      ? "Search across all support tickets. Use My raised tickets when you only want your own requests."
      : "Search, filter, and open the tickets visible to your current role.";
  }

  if (activeModule === "releasePlan") {
    return "See planned releases, tickets per release, pre-prod and production dates, and sprint status.";
  }

  return selectedTicket
    ? `${selectedTicket.key} - ${selectedTicket.title}`
    : "No ticket selected. Create a ticket to populate this workspace.";
}

function ModuleHeader({
  activeModule,
  role,
  selectedTicket,
  query,
  onQueryChange,
  onNewTicket
}: {
  activeModule: ModuleKey;
  role: RoleKey;
  selectedTicket?: Ticket;
  query: string;
  onQueryChange: (query: string) => void;
  onNewTicket: () => void;
}) {
  const item = navItems.find((navItem) => navItem.key === activeModule) ?? navItems[0];

  if (activeModule === "tickets") {
    return (
      <section className="module-header ticket-list-header">
        <div>
          <span className="module-eyebrow">Ticket List</span>
          <h1>{getModuleHeaderTitle(activeModule, role, "Search and filter support tickets")}</h1>
          <p>{getModuleHeaderDescription(activeModule, role, selectedTicket)}</p>
        </div>
        <div className="module-actions">
          <button className="primary-button" type="button" onClick={onNewTicket}>
            Create ticket
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="module-header">
      <div>
        <div className="module-title-row">
          <TegelIcon name={item.iconName} size="26px" />
          <h1>{getModuleHeaderTitle(activeModule, role, item.label)}</h1>
        </div>
        <p>{getModuleHeaderDescription(activeModule, role, selectedTicket)}</p>
      </div>
      <div className="module-actions">
        <label className="module-search">
          <TegelIcon name="search" size="17px" />
          <span className="sr-only">Search tickets</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search tickets, products, modules"
          />
        </label>
        <button className="primary-button" type="button" onClick={onNewTicket}>
          <TegelIcon name="support" size="17px" />
          New ticket
        </button>
      </div>
    </section>
  );
}

function RichTextContent({
  value,
  fallback = "Not provided.",
  compact = false
}: {
  value: string;
  fallback?: string;
  compact?: boolean;
}) {
  const html = normalizeRichTextForStorage(value);

  if (!html) {
    return <p className="rich-text-empty">{fallback}</p>;
  }

  return (
    <div
      className={`rich-text-display ${compact ? "rich-text-display-compact" : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function getJiraWikiImageMarkupPattern(): RegExp {
  return /!([^!\r\n|]+?\.(?:png|jpe?g|gif|webp))(?:\|[^!\r\n]*)?!/gi;
}

function getJiraImageFileNameFromMarkup(value: string): string {
  const trimmedValue = value.trim();

  try {
    const parsedUrl = new URL(trimmedValue);
    const lastPathSegment = parsedUrl.pathname.split("/").filter(Boolean).pop() ?? "";

    return decodeURIComponent(lastPathSegment || trimmedValue).trim();
  } catch {
    try {
      const pathWithoutQuery = trimmedValue.split(/[?#]/)[0] ?? trimmedValue;
      const lastPathSegment = pathWithoutQuery.split(/[\\/]/).filter(Boolean).pop() ?? pathWithoutQuery;

      return decodeURIComponent(lastPathSegment).trim();
    } catch {
      return trimmedValue;
    }
  }
}

function getJiraCommentImageFileNames(value: string): string[] {
  const pattern = getJiraWikiImageMarkupPattern();
  const fileNames: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const fileName = getJiraImageFileNameFromMarkup(match[1] ?? "");

    if (fileName && !fileNames.includes(fileName)) {
      fileNames.push(fileName);
    }
  }

  return fileNames;
}

function stripJiraCommentImageMarkup(value: string): string {
  return value.replace(getJiraWikiImageMarkupPattern(), "").trim();
}

function JiraCommentContent({
  value,
  fallback = "No Jira comment body."
}: {
  value: string;
  fallback?: string;
}) {
  const imageFileNames = getJiraCommentImageFileNames(value);
  const shouldShowImagePlaceholders = imageFileNames.length > 0 && !/<img\b/i.test(value);
  const displayValue = shouldShowImagePlaceholders ? stripJiraCommentImageMarkup(value) : value;

  return (
    <>
      <RichTextContent
        value={displayValue}
        fallback={shouldShowImagePlaceholders ? "Jira image attachment." : fallback}
        compact
      />
      {shouldShowImagePlaceholders ? (
        <div className="jira-comment-image-placeholders" aria-label="Jira image attachments">
          {imageFileNames.map((fileName) => (
            <span key={fileName}>
              <TegelIcon name="image" size="14px" />
              Jira image: {fileName}. Refresh from Jira to load the preview.
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function RichTextEditor({
  label,
  value,
  onChange,
  placeholder,
  rows = 4
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  const editorId = useId();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);
  const [editorError, setEditorError] = useState("");
  const [selectedImageState, setSelectedImageState] = useState<SelectedRichTextImageState | null>(null);
  const isEmpty = isRichTextBlank(value);
  const minHeight = Math.max(112, rows * 34);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const sanitizedValue = sanitizeRichText(value);

    const currentSanitizedValue = normalizeRichTextForStorage(editor.innerHTML, "html");

    if (editor.innerHTML !== sanitizedValue && currentSanitizedValue !== sanitizedValue) {
      editor.innerHTML = sanitizedValue;
    }

    if (selectedImageRef.current && !editor.contains(selectedImageRef.current)) {
      clearSelectedRichTextImage();
    }
  }, [value]);

  function syncEditorValue() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const nextValue = normalizeRichTextForStorage(editor.innerHTML, "html");

    onChange(nextValue);
  }

  function clampRichTextImageWidthPercent(value: number): number {
    if (!Number.isFinite(value)) {
      return richTextImageMaxResizePercent;
    }

    const steppedValue = Math.round(value / richTextImageResizeStepPercent) * richTextImageResizeStepPercent;

    return Math.min(
      Math.max(steppedValue, richTextImageMinResizePercent),
      richTextImageMaxResizePercent
    );
  }

  function getImageWidthPercent(image: HTMLImageElement): number {
    const editor = editorRef.current;
    const inlineWidth = image.style.width.trim();

    if (inlineWidth.endsWith("%")) {
      return clampRichTextImageWidthPercent(Number.parseFloat(inlineWidth));
    }

    if (!editor) {
      return richTextImageMaxResizePercent;
    }

    const editorWidth = Math.max(editor.clientWidth - 22, richTextImageMinResizePixels);
    const imageWidth = image.getBoundingClientRect().width || editorWidth;

    return clampRichTextImageWidthPercent((imageWidth / editorWidth) * 100);
  }

  function clearSelectedRichTextImage() {
    selectedImageRef.current?.classList.remove("is-resize-selected");
    selectedImageRef.current = null;
    setSelectedImageState(null);
  }

  function selectRichTextImage(image: HTMLImageElement) {
    if (!editorRef.current?.contains(image)) {
      clearSelectedRichTextImage();
      return;
    }

    selectedImageRef.current?.classList.remove("is-resize-selected");
    selectedImageRef.current = image;
    image.classList.add("is-resize-selected");
    setSelectedImageState({ widthPercent: getImageWidthPercent(image) });
  }

  function applySelectedImageWidth(widthPercent: number) {
    const editor = editorRef.current;
    const image = selectedImageRef.current;

    if (!editor || !image || !editor.contains(image)) {
      clearSelectedRichTextImage();
      return;
    }

    const nextWidthPercent = clampRichTextImageWidthPercent(widthPercent);

    image.style.width = `${nextWidthPercent}%`;
    image.style.height = "auto";
    image.removeAttribute("width");
    image.removeAttribute("height");
    image.classList.add("is-resize-selected");
    setSelectedImageState({ widthPercent: nextWidthPercent });
    syncEditorValue();
  }

  function resizeSelectedImage(deltaPercent: number) {
    const image = selectedImageRef.current;
    const currentWidthPercent = selectedImageState?.widthPercent ?? (image ? getImageWidthPercent(image) : richTextImageMaxResizePercent);

    applySelectedImageWidth(currentWidthPercent + deltaPercent);
  }

  function persistImageElementSize(image: HTMLImageElement): boolean {
    const editor = editorRef.current;

    if (!editor || !editor.contains(image)) {
      return false;
    }

    const imageRect = image.getBoundingClientRect();

    if (imageRect.width <= 0 || imageRect.height <= 0) {
      return false;
    }

    const editorMaxWidth = Math.max(richTextImageMinResizePixels, editor.clientWidth - 22);
    const width = Math.min(
      Math.max(Math.round(imageRect.width), richTextImageMinResizePixels),
      editorMaxWidth
    );
    const height = Math.min(
      Math.max(Math.round(imageRect.height), richTextImageMinResizePixels),
      richTextImageMaxResizePixels
    );
    const nextWidth = `${width}px`;
    const nextHeight = `${height}px`;
    const changed = image.style.width !== nextWidth || image.style.height !== nextHeight;

    if (changed) {
      image.style.width = nextWidth;
      image.style.height = nextHeight;
    }

    return changed;
  }

  function persistEditorImageSizes(editor: HTMLDivElement): boolean {
    let changed = false;

    Array.from(editor.querySelectorAll("img")).forEach((image) => {
      changed = persistImageElementSize(image) || changed;
    });

    return changed;
  }

  function commitEditorValue() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    persistEditorImageSizes(editor);

    const nextValue = normalizeRichTextForStorage(editor.innerHTML, "html");

    if (editor.innerHTML !== nextValue) {
      editor.innerHTML = nextValue;
    }

    onChange(nextValue);
  }

  function handleEditorBlur(event: ReactFocusEvent<HTMLDivElement>) {
    const nextFocusedElement = event.relatedTarget;

    if (
      nextFocusedElement instanceof Node &&
      event.currentTarget.parentElement?.contains(nextFocusedElement)
    ) {
      return;
    }

    commitEditorValue();
  }

  function saveSelection() {
    const editor = editorRef.current;

    if (!editor || typeof window === "undefined") {
      return;
    }

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0 || !selectionIsInsideElement(editor)) {
      return;
    }

    savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const editor = editorRef.current;
    const savedRange = savedSelectionRef.current;

    if (!editor || !savedRange || typeof window === "undefined") {
      return;
    }

    const rangeRoot =
      savedRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? savedRange.commonAncestorContainer
        : savedRange.commonAncestorContainer.parentElement;

    if (!rangeRoot || !editor.contains(rangeRoot)) {
      return;
    }

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedRange);
  }

  function prepareToolbarAction(event: { preventDefault: () => void }) {
    event.preventDefault();
    saveSelection();
  }

  function wrapSelectedText(tagName: "strong" | "em" | "u"): boolean {
    const editor = editorRef.current;

    if (!editor || typeof window === "undefined") {
      return false;
    }

    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !selectionIsInsideElement(editor)) {
      return false;
    }

    const range = selection.getRangeAt(0);
    const wrapper = window.document.createElement(tagName);
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);

    const nextRange = window.document.createRange();
    nextRange.setStartAfter(wrapper);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedSelectionRef.current = nextRange.cloneRange();
    syncEditorValue();

    return true;
  }

  function insertHtml(html: string) {
    const editor = editorRef.current;

    if (!editor || typeof document === "undefined") {
      return;
    }

    restoreSelection();

    if (!selectionIsInsideElement(editor)) {
      editor.focus();
    }

    document.execCommand("insertHTML", false, sanitizeRichText(html, "html"));
    syncEditorValue();
  }

  function runCommand(command: string, commandValue?: string) {
    const editor = editorRef.current;

    if (!editor || typeof document === "undefined") {
      return;
    }

    restoreSelection();

    if (command === "bold" && wrapSelectedText("strong")) {
      return;
    }

    if (command === "italic" && wrapSelectedText("em")) {
      return;
    }

    if (command === "underline" && wrapSelectedText("u")) {
      return;
    }

    if (!selectionIsInsideElement(editor)) {
      editor.focus();
    }

    document.execCommand(command, false, commandValue);

    if (!isRichTextBlank(editor.innerHTML)) {
      syncEditorValue();
    }
  }

  async function insertImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setEditorError("Only image files can be inserted in this field.");
      return;
    }

    if (file.size > richTextImageMaxBytes) {
      setEditorError(`Image is too large. Maximum inline image size is ${formatByteSize(richTextImageMaxBytes)}.`);
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);

    if (!isSafeRichTextImageSource(dataUrl)) {
      setEditorError("Unsupported image format. Use PNG, JPG, GIF, or WebP.");
      return;
    }

    setEditorError("");
    insertHtml(`<img src="${dataUrl}" alt="${escapeHtml(file.name || "Embedded image")}" />`);
  }

  async function insertImageFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      await insertImageFile(file);
    }
  }

  function addLink() {
    const rawUrl = window.prompt("Link URL");
    const url = rawUrl?.trim() ?? "";

    if (!url) {
      return;
    }

    if (!isSafeRichTextLink(url)) {
      setEditorError("Only HTTP, HTTPS, mailto, relative, and anchor links are allowed.");
      return;
    }

    setEditorError("");
    runCommand("createLink", url);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length > 0) {
      event.preventDefault();
      void insertImageFiles(imageFiles);
      return;
    }

    const html = event.clipboardData.getData("text/html");

    if (html) {
      event.preventDefault();
      setEditorError("");
      insertHtml(html);
      return;
    }

    const text = event.clipboardData.getData("text/plain");

    if (text) {
      event.preventDefault();
      setEditorError("");
      insertHtml(textToRichHtml(text));
    }
  }

  function handleEditorMouseUp(event: ReactMouseEvent<HTMLDivElement>) {
    saveSelection();

    if (event.target instanceof HTMLImageElement) {
      const changed = persistImageElementSize(event.target);

      selectRichTextImage(event.target);

      if (changed) {
        syncEditorValue();
      }

      return;
    }

    if (event.target instanceof HTMLElement && editorRef.current?.contains(event.target)) {
      clearSelectedRichTextImage();
    }
  }

  function handleEditorLoad(event: ReactSyntheticEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLImageElement && persistImageElementSize(event.target)) {
      syncEditorValue();
    }
  }

  return (
    <div className="form-field form-field-wide rich-text-editor">
      <span className="rich-text-editor-label">{label}</span>
      <div className="rich-text-box">
        <div className="rich-text-toolbar" aria-label={`${label} formatting toolbar`}>
          <select
            aria-label={`${label} style`}
            defaultValue="p"
            onChange={(event) => runCommand("formatBlock", event.target.value)}
          >
            <option value="p">Style</option>
            <option value="h3">Heading</option>
            <option value="blockquote">Quote</option>
          </select>
          <button type="button" title="Bold" aria-label="Bold" onMouseDown={prepareToolbarAction} onClick={() => runCommand("bold")}>
            <strong>B</strong>
          </button>
          <button type="button" title="Italic" aria-label="Italic" onMouseDown={prepareToolbarAction} onClick={() => runCommand("italic")}>
            <em>I</em>
          </button>
          <button type="button" title="Underline" aria-label="Underline" onMouseDown={prepareToolbarAction} onClick={() => runCommand("underline")}>
            <u>U</u>
          </button>
          <label className="rich-text-color-tool" title="Text color" aria-label="Text color">
            <span>A</span>
            <input type="color" onChange={(event) => runCommand("foreColor", event.target.value)} />
          </label>
          <button type="button" title="Link" aria-label="Add link" onMouseDown={prepareToolbarAction} onClick={addLink}>
            <TegelIcon name="link" size="16px" />
          </button>
          <button type="button" title="Bulleted list" aria-label="Bulleted list" onMouseDown={prepareToolbarAction} onClick={() => runCommand("insertUnorderedList")}>
            &bull;
          </button>
          <button type="button" title="Numbered list" aria-label="Numbered list" onMouseDown={prepareToolbarAction} onClick={() => runCommand("insertOrderedList")}>
            1.
          </button>
          <button type="button" title="Image" aria-label="Insert image" onMouseDown={prepareToolbarAction} onClick={() => fileInputRef.current?.click()}>
            <TegelIcon name="paperclip" size="16px" />
          </button>
          <button type="button" title="Clear formatting" aria-label="Clear formatting" onMouseDown={prepareToolbarAction} onClick={() => runCommand("removeFormat")}>
            Tx
          </button>
          <input
            ref={fileInputRef}
            className="rich-text-file-input"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            onChange={(event) => {
              void insertImageFiles(event.target.files ?? []);
              event.target.value = "";
            }}
          />
        </div>
        {selectedImageState ? (
          <div className="rich-text-image-toolbar" aria-label={`${label} selected image controls`}>
            <TegelIcon name="image" size="16px" />
            <button
              type="button"
              title="Make image smaller"
              aria-label="Make image smaller"
              onMouseDown={prepareToolbarAction}
              onClick={() => resizeSelectedImage(-10)}
            >
              -
            </button>
            <input
              type="range"
              min={richTextImageMinResizePercent}
              max={richTextImageMaxResizePercent}
              step={richTextImageResizeStepPercent}
              value={selectedImageState.widthPercent}
              aria-label="Image width"
              onChange={(event) => applySelectedImageWidth(Number(event.target.value))}
            />
            <output>{selectedImageState.widthPercent}%</output>
            <button
              type="button"
              title="Make image larger"
              aria-label="Make image larger"
              onMouseDown={prepareToolbarAction}
              onClick={() => resizeSelectedImage(10)}
            >
              +
            </button>
            <button
              type="button"
              title="Reset image width"
              aria-label="Reset image width"
              onMouseDown={prepareToolbarAction}
              onClick={() => applySelectedImageWidth(richTextImageMaxResizePercent)}
            >
              100%
            </button>
          </div>
        ) : null}
        <div
          ref={editorRef}
          id={editorId}
          aria-label={label}
          className={`rich-text-editable ${isEmpty ? "is-empty" : ""}`}
          contentEditable
          data-placeholder={placeholder}
          onBlur={handleEditorBlur}
          onInput={syncEditorValue}
          onKeyUp={saveSelection}
          onLoadCapture={handleEditorLoad}
          onMouseUp={handleEditorMouseUp}
          onPaste={handlePaste}
          role="textbox"
          style={{ minHeight }}
          suppressContentEditableWarning
        />
      </div>
      {editorError ? <p className="rich-text-error">{editorError}</p> : null}
    </div>
  );
}

function NewTicketModal({
  config,
  onClose,
  onCreateTicket
}: {
  config: AdminConfig;
  onClose: () => void;
  onCreateTicket: (form: NewTicketFormState) => void;
}) {
  const [form, setForm] = useState<NewTicketFormState>(() => buildDefaultNewTicketForm());
  const [error, setError] = useState("");
  const [isReadingAttachments, setIsReadingAttachments] = useState(false);
  const activeProducts = config.products.filter((product) => product.active);
  const selectedProduct = getConfigProduct(config, form.product);
  const activeProductPrus = selectedProduct?.prus.filter((pru) => pru.active) ?? [];
  const activeProductPruSites = new Set(activeProductPrus.map((pru) => pru.site).filter(Boolean));
  const regionSitesForSelectedProduct = config.regionSites.filter(
    (site) =>
      site.active &&
      site.region !== ALL_SCOPE_LABEL &&
      site.site !== ALL_SCOPE_LABEL &&
      (!form.product || activeProductPruSites.has(site.site))
  );
  const availablePrus = activeProductPrus.filter((pru) => !form.site || pru.site === form.site);
  const selectedPru = availablePrus.find((pru) => pru.name === form.pru);
  const availableModules = selectedPru?.modules.filter((module) => module.active) ?? [];
  const activeRequestTypes = config.requestTypes.filter((type) => type.active);
  const activePriorities = config.priorities.filter((priority) => priority.active);
  const activeRisks = config.riskOptions.filter((risk) => risk.active);
  const activeRegions = uniqueSortedValues(regionSitesForSelectedProduct.map((site) => site.region));
  const activeRegionSites = regionSitesForSelectedProduct.filter((site) => !form.region || site.region === form.region);
  const selectedFormTemplate = getFormTemplateForTicket(config, form.product, form.typeId);
  const templateFields = [...(selectedFormTemplate?.fields ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);
  const jiraTemplateMetadata = useJiraTemplateFieldMetadata(
    config,
    templateHasJiraOptionSource(templateFields),
    selectedProduct?.jiraProjectKey ?? config.integrations.jira.defaultProjectKey
  );

  function updateForm<K extends keyof NewTicketFormState>(key: K, value: NewTicketFormState[K]) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value
    }));
  }

  function updateType(typeId: string) {
    setForm((currentForm) => ({
      ...currentForm,
      typeId,
      dynamicAnswers: currentForm.typeId === typeId ? currentForm.dynamicAnswers : {}
    }));
  }

  function updateProduct(productName: string) {
    setForm((currentForm) => ({
      ...currentForm,
      product: productName,
      region: "",
      pru: "",
      site: "",
      module: "",
      dynamicAnswers: currentForm.product === productName ? currentForm.dynamicAnswers : {}
    }));
  }

  function updateRegion(region: string) {
    setForm((currentForm) => ({
      ...currentForm,
      region,
      pru: "",
      site: "",
      module: ""
    }));
  }

  function updateSite(siteName: string) {
    const selectedSite = config.regionSites.find((site) => site.active && site.site === siteName);

    setForm((currentForm) => ({
      ...currentForm,
      region: selectedSite?.region ?? currentForm.region,
      pru: "",
      site: siteName,
      module: ""
    }));
  }

  function updatePru(pruName: string) {
    const nextPru = availablePrus.find((pru) => pru.name === pruName);
    const nextSite = nextPru?.site ?? "";

    setForm((currentForm) => ({
      ...currentForm,
      pru: pruName,
      region: getRegionForSite(config, nextSite) || currentForm.region,
      site: nextSite || currentForm.site,
      module: ""
    }));
  }

  async function updateAttachmentFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);

    if (!selectedFiles.length) {
      updateForm("attachments", []);
      return;
    }

    setIsReadingAttachments(true);

    try {
      const { attachments, rejectedFileNames } = await buildAttachmentInputsFromFiles(selectedFiles);
      updateForm("attachments", attachments);
      setError(getAttachmentLimitError(rejectedFileNames));
    } catch (readError) {
      console.error("Failed to read selected attachments.", {
        error: getErrorMessage(readError)
      });
      setError("Could not read the selected attachment files.");
    } finally {
      setIsReadingAttachments(false);
    }
  }

  function updateDynamicAnswer(fieldId: string, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      dynamicAnswers: {
        ...currentForm.dynamicAnswers,
        [fieldId]: value
      }
    }));
  }

  function toggleDynamicOption(fieldId: string, option: string, checked: boolean) {
    const currentValues = new Set(
      (form.dynamicAnswers[fieldId] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    );

    if (checked) {
      currentValues.add(option);
    } else {
      currentValues.delete(option);
    }

    updateDynamicAnswer(fieldId, Array.from(currentValues).join(", "));
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      setError("Ticket title is required.");
      return;
    }

    if (!form.typeId.trim()) {
      setError("Ticket type is required.");
      return;
    }

    if (!form.priority) {
      setError("Priority is required.");
      return;
    }

    if (!form.product.trim()) {
      setError("Product is required.");
      return;
    }

    if (!form.region.trim()) {
      setError("Region is required.");
      return;
    }

    if (!form.site.trim()) {
      setError("Site is required.");
      return;
    }

    if (!form.pru.trim()) {
      setError("PRU is required.");
      return;
    }

    if (!form.module.trim()) {
      setError("Module is required.");
      return;
    }

    if (!form.risk) {
      setError("Risk is required.");
      return;
    }

    if (isRichTextBlank(form.description)) {
      setError("Description is required.");
      return;
    }

    const missingTemplateField = templateFields.find((field) => {
      if (!field.required) {
        return false;
      }

      return isRichTextBlank(form.dynamicAnswers[field.id] ?? "");
    });

    if (missingTemplateField) {
      setError(`${missingTemplateField.label} is required.`);
      return;
    }

    setError("");
    onCreateTicket(form);
  }

  function renderTemplateField(field: FormTemplateField) {
    const value = form.dynamicAnswers[field.id] ?? "";
    const label = `${field.label}${field.required ? " *" : ""}`;
    const options = getTemplateFieldOptions(field, config, {
      form,
      jiraFieldMetadata: jiraTemplateMetadata
    });

    if (field.component === "textArea" || field.type === "longText") {
      return (
        <RichTextEditor
          key={field.id}
          label={label}
          value={value}
          onChange={(nextValue) => updateDynamicAnswer(field.id, nextValue)}
          placeholder={field.helperText || "Add details"}
          rows={3}
        />
      );
    }

    if (field.component === "numberField" || field.type === "number") {
      return (
        <label className="form-field" key={field.id}>
          <span>{label}</span>
          <input
            type="number"
            value={value}
            onChange={(event) => updateDynamicAnswer(field.id, event.target.value)}
            placeholder={field.helperText}
          />
        </label>
      );
    }

    if (field.component === "datePicker" || field.type === "date") {
      return (
        <label className="form-field" key={field.id}>
          <span>{label}</span>
          <input
            type="date"
            value={value}
            onChange={(event) => updateDynamicAnswer(field.id, event.target.value)}
          />
        </label>
      );
    }

    if (field.component === "checkboxGroup" || field.type === "multiSelect") {
      const selectedValues = new Set(
        value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      );

      return (
        <fieldset className="form-field dynamic-checkbox-group form-field-wide" key={field.id}>
          <legend>{label}</legend>
          <div>
            {options.map((option) => (
              <label key={`${field.id}-${option}`}>
                <input
                  checked={selectedValues.has(option)}
                  type="checkbox"
                  onChange={(event) => toggleDynamicOption(field.id, option, event.target.checked)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          {!options.length ? <p>No options available for this field yet.</p> : null}
          {field.helperText ? <p>{field.helperText}</p> : null}
        </fieldset>
      );
    }

    if (field.component === "dropdown" || field.component === "radioGroup" || field.type === "singleSelect" || field.type === "yesNo") {
      return (
        <label className="form-field" key={field.id}>
          <span>{label}</span>
          <select value={value} onChange={(event) => updateDynamicAnswer(field.id, event.target.value)}>
            <option value="">{options.length ? "Select" : "No options available"}</option>
            {options.map((option) => (
              <option key={`${field.id}-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
          {field.helperText ? <small>{field.helperText}</small> : null}
        </label>
      );
    }

    return (
      <label className="form-field" key={field.id}>
        <span>{label}</span>
        <input
          value={value}
          onChange={(event) => updateDynamicAnswer(field.id, event.target.value)}
          placeholder={field.helperText}
        />
      </label>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="ticket-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-ticket-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="new-ticket-title">Create ticket</h2>
            <p>Start a governed intake item with configurable type, master data, and SLA context.</p>
          </div>
          <button className="icon-button quiet" type="button" onClick={onClose} aria-label="Close">
            <TegelIcon name="cross" />
          </button>
        </header>
        <form className="ticket-form" onSubmit={submitForm}>
          <label className="form-field form-field-wide">
            <span>Title</span>
            <input
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
              placeholder="Short business-readable ticket title"
            />
          </label>
          <label className="form-field">
            <span>Type</span>
            <select
              value={form.typeId}
              onChange={(event) => updateType(event.target.value)}
            >
              <option value="">Select type</option>
              {activeRequestTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Priority</span>
            <select
              value={form.priority}
              onChange={(event) => updateForm("priority", event.target.value as NewTicketFormState["priority"])}
            >
              <option value="">Select priority</option>
              {activePriorities.map((priority) => (
                <option key={priority.id} value={priority.label}>
                  {priority.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Product</span>
            <select
              value={form.product}
              onChange={(event) => updateProduct(event.target.value)}
            >
              <option value="">Select product</option>
              {activeProducts.map((item) => (
                <option key={item.id} value={item.productName}>
                  {item.productName}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Region</span>
            <select
              value={form.region}
              onChange={(event) => updateRegion(event.target.value)}
              disabled={!form.product || !activeRegions.length}
            >
              <option value="">
                {!form.product ? "Select product first" : activeRegions.length ? "Select region" : "No active regions"}
              </option>
              {activeRegions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Site</span>
            <select
              value={form.site}
              onChange={(event) => updateSite(event.target.value)}
              disabled={!form.product || !form.region || !activeRegionSites.length}
            >
              <option value="">
                {!form.product
                  ? "Select product first"
                  : !form.region
                    ? "Select region first"
                    : activeRegionSites.length
                      ? "Select site"
                      : "No active sites"}
              </option>
              {activeRegionSites.map((item) => (
                <option key={item.id} value={item.site}>
                  {item.site}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>PRU</span>
            <select
              value={form.pru}
              onChange={(event) => updatePru(event.target.value)}
              disabled={!form.product || !form.region || !form.site || !availablePrus.length}
            >
              <option value="">
                {!form.product
                  ? "Select product first"
                  : !form.region
                    ? "Select region first"
                    : !form.site
                      ? "Select site first"
                      : availablePrus.length
                        ? "Select PRU"
                        : "No active PRUs for site"}
              </option>
              {availablePrus.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Module</span>
            <select
              value={form.module}
              onChange={(event) => updateForm("module", event.target.value)}
              disabled={!form.pru || !availableModules.length}
            >
              <option value="">
                {!form.pru ? "Select PRU first" : availableModules.length ? "Select module" : "No active modules"}
              </option>
              {availableModules.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Risk</span>
            <select
              value={form.risk}
              onChange={(event) => updateForm("risk", event.target.value as NewTicketFormState["risk"])}
            >
              <option value="">Select risk</option>
              {activeRisks.map((risk) => (
                <option key={risk.id} value={risk.label}>
                  {risk.label}
                </option>
              ))}
            </select>
          </label>
          <RichTextEditor
            label="Description"
            value={form.description}
            onChange={(value) => updateForm("description", value)}
            placeholder="Describe the request, current impact, and expected outcome."
            rows={4}
          />
          <RichTextEditor
            label="Business impact"
            value={form.businessImpact}
            onChange={(value) => updateForm("businessImpact", value)}
            placeholder="Optional impact, urgency, or governance context."
            rows={3}
          />
          <label className="form-field">
            <span>Labels</span>
            <input
              value={form.labels}
              onChange={(event) => updateForm("labels", event.target.value)}
              placeholder="Comma-separated labels"
            />
          </label>
          <label className="form-field">
            <span>Expected date to be done</span>
            <input
              type="date"
              value={form.expectedCompletionDate}
              onChange={(event) => updateForm("expectedCompletionDate", event.target.value)}
            />
          </label>
          <label className="form-field form-field-wide">
            <span>Attachments</span>
            <input
              multiple
              type="file"
              onChange={(event) => {
                void updateAttachmentFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {form.attachments.length > 0 ? (
            <div className="ticket-attachment-summary form-field-wide" aria-label="Selected attachments">
              {form.attachments.map((attachment) => (
                <span key={`${attachment.fileName}-${attachment.byteSize}`}>
                  {attachment.fileName} · {getAttachmentKindLabel(attachment)} · {formatByteSize(attachment.byteSize)}
                </span>
              ))}
            </div>
          ) : null}
          <section className="ticket-template-section form-field-wide" aria-label="Additional form questions">
            <div>
              <h3>{selectedFormTemplate?.title ?? "Additional questions"}</h3>
              <p>
                {selectedFormTemplate
                  ? selectedFormTemplate.description
                  : "No extra questions are configured for this product and request type."}
              </p>
              {templateHasJiraOptionSource(templateFields) ? (
                <small>
                  {jiraTemplateMetadata.status === "ready"
                    ? jiraTemplateMetadata.message
                    : jiraTemplateMetadata.message || "Jira-backed fields use fallback options until metadata is loaded."}
                </small>
              ) : null}
            </div>
            {templateFields.length > 0 ? (
              <div className="ticket-template-fields">
                {templateFields.map((field) => renderTemplateField(field))}
              </div>
            ) : null}
          </section>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={isReadingAttachments}>
              {isReadingAttachments ? "Reading files..." : "Create ticket"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function renderModule({
  activeModule,
  activeTab,
  allTickets,
  filteredTickets,
  ticketListTickets,
  selectedTicket,
  visibleAudit,
  visibleComments,
  visibleNotifications,
  isTicketDetailOpen,
  role,
  selectedPersona,
  config,
  onConfigChange,
  onAddClarificationReply,
  onAddAttachments,
  onReplaceAttachmentContent,
  onAddComment,
  onCreateClarification,
  onCreateEscalation,
  onCreateJira,
  onPostJiraComment,
  onReopenTicket,
  onUpdateJiraDraft,
  onUpdateJiraIssue,
  onUpdateJiraLink,
  onUpdateTicket,
  onUpdateWorkflowStatus,
  onUpdateEscalationStatus,
  onUpdateJiraStatus,
  onSyncJiraActivity,
  onSyncLinkedJiraTickets,
  jiraBulkSyncError,
  jiraBulkSyncMessage,
  jiraBulkSyncState,
  onApprovalDecision,
  onTicketDetailOpenChange,
  onOpenTicketModule,
  onOpenNotification,
  setActiveTab,
  focusTicketOnJira,
  selectTicket
}: {
  activeModule: ModuleKey;
  activeTab: DetailTab;
  allTickets: Ticket[];
  filteredTickets: Ticket[];
  ticketListTickets: Ticket[];
  selectedTicket?: Ticket;
  visibleAudit: Ticket["audit"];
  visibleComments: Ticket["comments"];
  visibleNotifications: NotificationItem[];
  isTicketDetailOpen: boolean;
  role: RoleKey;
  selectedPersona: RolePersonaOption;
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
  onAddClarificationReply: (ticketKey: string, threadId: string, body: string) => void;
  onAddAttachments: (ticketKey: string, attachments: NewTicketAttachmentInput[]) => void;
  onReplaceAttachmentContent: (ticketKey: string, attachmentId: string, attachment: NewTicketAttachmentInput) => void;
  onAddComment: (ticketKey: string, body: string, visibility: VisibilityLevel) => void;
  onCreateClarification: (ticketKey: string, input: NewClarificationThreadInput) => void;
  onCreateEscalation: (ticketKey: string, input: NewEscalationInput) => void;
  onCreateJira: CreateJiraHandler;
  onPostJiraComment: PostJiraCommentHandler;
  onReopenTicket: (ticketKey: string) => void;
  onUpdateJiraDraft: (ticketKey: string, draftUpdate: JiraDraftUpdateInput) => void;
  onUpdateJiraIssue: UpdateJiraIssueHandler;
  onUpdateJiraLink: UpdateJiraLinkHandler;
  onUpdateTicket: UpdateTicketHandler;
  onUpdateWorkflowStatus: UpdateWorkflowStatusHandler;
  onUpdateEscalationStatus: (
    ticketKey: string,
    escalationId: string,
    status: EscalationStatus,
    decisionNote: string,
    details?: EscalationStatusUpdateDetails
  ) => void;
  onUpdateJiraStatus: UpdateJiraStatusHandler;
  onSyncJiraActivity: SyncJiraActivityHandler;
  onSyncLinkedJiraTickets: () => Promise<void>;
  jiraBulkSyncError: string;
  jiraBulkSyncMessage: string;
  jiraBulkSyncState: "idle" | "syncing";
  onApprovalDecision: (
    ticketKey: string,
    stepId: string,
    action: ApprovalDecisionAction,
    note: ApprovalDecisionPayload
  ) => void;
  onTicketDetailOpenChange: (isOpen: boolean) => void;
  onOpenTicketModule: (ticketKey: string, module: ModuleKey, tab?: DetailTab) => void;
  onOpenNotification: (notification: NotificationItem) => void;
  setActiveTab: (tab: DetailTab) => void;
  focusTicketOnJira: (ticketKey: string) => void;
  selectTicket: (ticketKey: string) => void;
}) {
  if (!canAccessModule(role, activeModule)) {
    return <AccessRestrictedPanel activeModule={activeModule} role={role} />;
  }

  if (activeModule === "dashboard") {
    return (
      <DashboardOverview
        config={config}
        notifications={visibleNotifications}
        role={role}
        selectedPersona={selectedPersona}
        tickets={filteredTickets}
        onOpenNotification={onOpenNotification}
        onOpenTicketModule={onOpenTicketModule}
      />
    );
  }

  if (activeModule === "tickets") {
    return (
      <TicketListWorkspace
        activeTab={activeTab}
        config={config}
        role={role}
        selectedPersona={selectedPersona}
        selectedTicket={selectedTicket}
        selectedTicketKey={selectedTicket?.key ?? ""}
        isDetailOpen={isTicketDetailOpen}
        tickets={ticketListTickets}
        visibleAudit={visibleAudit}
        visibleComments={visibleComments}
        onAddClarificationReply={onAddClarificationReply}
        onAddAttachments={onAddAttachments}
        onReplaceAttachmentContent={onReplaceAttachmentContent}
        onAddComment={onAddComment}
        onCreateClarification={onCreateClarification}
        onCreateEscalation={onCreateEscalation}
        onPostJiraComment={onPostJiraComment}
        onOpenTicket={selectTicket}
        onDetailOpenChange={onTicketDetailOpenChange}
        onReopenTicket={onReopenTicket}
        onTabChange={setActiveTab}
        onUpdateTicket={onUpdateTicket}
        onUpdateWorkflowStatus={onUpdateWorkflowStatus}
        onUpdateEscalationStatus={onUpdateEscalationStatus}
        onSyncJiraActivity={onSyncJiraActivity}
      />
    );
  }

  if (activeModule === "approvals") {
    return (
      <ApprovalCenter
        tickets={allTickets}
        role={role}
        selectedPersona={selectedPersona}
        config={config}
        onApprovalDecision={onApprovalDecision}
        onOpenTicket={selectTicket}
      />
    );
  }

  if (activeModule === "releasePlan") {
    return (
      <ReleasePlanBoard
        config={config}
        tickets={allTickets}
        jiraBulkSyncError={jiraBulkSyncError}
        jiraBulkSyncMessage={jiraBulkSyncMessage}
        jiraBulkSyncState={jiraBulkSyncState}
        onOpenTicket={(ticketKey) => onOpenTicketModule(ticketKey, "tickets", "Overview")}
        onSyncLinkedJiraTickets={onSyncLinkedJiraTickets}
      />
    );
  }

  if (!selectedTicket) {
    if (activeModule === "clarifications") {
      return <ClarificationsEmptyPanel />;
    }

    if (activeModule === "notifications") {
      return (
        <NotificationCenter
          items={visibleNotifications}
          onOpenNotification={onOpenNotification}
        />
      );
    }

    if (activeModule === "integrations") {
      return (
        <IntegrationAdminWorkspace
          config={config}
          onConfigChange={onConfigChange}
          role={role}
        />
      );
    }

    if (activeModule === "admin") {
      return <AdminConfigPanel config={config} onConfigChange={onConfigChange} role={role} />;
    }

    if (activeModule === "reports") {
      return (
        <div className="focused-layout report-layout">
          <AnalyticsPanel tickets={allTickets} expanded config={config} selectedPersona={selectedPersona} />
          <SlaBoard tickets={allTickets} />
        </div>
      );
    }

    if (activeModule === "sla") {
      return <SlaRulesManager config={config} onConfigChange={onConfigChange} />;
    }

    if (activeModule === "attachments" && roleUsesStructuredAttachmentLibrary(config, role)) {
      return (
        <AttachmentLibraryPanel
          tickets={allTickets}
          expanded
          onOpenTicket={selectTicket}
          onReplaceAttachmentContent={onReplaceAttachmentContent}
        />
      );
    }

    return <WorkspaceEmptyPanel />;
  }

  if (activeModule === "clarifications") {
    return (
      <div className="focused-layout">
        <ClarificationPanel
          ticket={selectedTicket}
          config={config}
          expanded
          onCreateClarification={onCreateClarification}
          onReply={onAddClarificationReply}
          role={role}
        />
        <CommentPanel
          ticket={selectedTicket}
          comments={visibleComments}
          onAddComment={onAddComment}
          role={role}
        />
      </div>
    );
  }

  if (activeModule === "jira") {
    return (
      <JiraWorkspace
        config={config}
        tickets={allTickets}
        selectedTicket={selectedTicket}
        selectedTicketKey={selectedTicket?.key ?? ""}
        role={role}
        selectedPersona={selectedPersona}
        onCreateJira={onCreateJira}
        onPostJiraComment={onPostJiraComment}
        onReopenTicket={onReopenTicket}
        onSelectTicket={focusTicketOnJira}
        onUpdateJiraDraft={onUpdateJiraDraft}
        onUpdateJiraIssue={onUpdateJiraIssue}
        onUpdateJiraLink={onUpdateJiraLink}
        onUpdateJiraStatus={onUpdateJiraStatus}
        onSyncJiraActivity={onSyncJiraActivity}
      />
    );
  }

  if (activeModule === "escalations") {
    return (
      <div className="focused-layout">
        <EscalationPanel
          ticket={selectedTicket}
          expanded
          onCreateEscalation={onCreateEscalation}
          onUpdateEscalationStatus={onUpdateEscalationStatus}
          role={role}
        />
        <SlaBoard tickets={allTickets} onOpenTicket={selectTicket} />
      </div>
    );
  }

  if (activeModule === "notifications") {
    return (
      <NotificationCenter
        items={visibleNotifications}
        onOpenNotification={onOpenNotification}
      />
    );
  }

  if (activeModule === "audit") {
    return <AuditTimeline entries={visibleAudit} expanded />;
  }

  if (activeModule === "attachments") {
    if (roleUsesStructuredAttachmentLibrary(config, role)) {
      return (
        <AttachmentLibraryPanel
          tickets={allTickets}
          expanded
          onOpenTicket={selectTicket}
          onReplaceAttachmentContent={onReplaceAttachmentContent}
        />
      );
    }

    return (
      <AttachmentPanel
        ticket={selectedTicket}
        expanded
        onAddAttachments={onAddAttachments}
        onReplaceAttachmentContent={onReplaceAttachmentContent}
      />
    );
  }

  if (activeModule === "integrations") {
    return (
      <IntegrationAdminWorkspace
        config={config}
        onConfigChange={onConfigChange}
        role={role}
      />
    );
  }

  if (activeModule === "admin") {
    return <AdminConfigPanel config={config} onConfigChange={onConfigChange} role={role} />;
  }

  if (activeModule === "reports") {
    return (
      <div className="focused-layout report-layout">
        <AnalyticsPanel tickets={allTickets} expanded config={config} selectedPersona={selectedPersona} />
        <SlaBoard tickets={allTickets} />
      </div>
    );
  }

  if (activeModule === "sla") {
    return <SlaRulesManager config={config} onConfigChange={onConfigChange} />;
  }

  return <SlaBoard tickets={allTickets} expanded />;
}

function WorkspaceEmptyPanel() {
  return (
    <section className="panel workspace-empty-panel">
      <PanelHeader
        title="No tickets yet"
        description="The workspace is clean. Create a ticket to start governed workflow, Jira sync, and escalation tracking."
        iconName="folder"
      />
      <EmptyState
        title="No predefined work"
        body="Demo tickets, seeded notifications, escalations, Jira drafts, comments, attachments, and audit entries are not loaded."
      />
    </section>
  );
}

function ClarificationsEmptyPanel() {
  return (
    <section className="panel workspace-empty-panel">
      <PanelHeader
        title="No clarification requests"
        description="There are no open clarification requests for this role."
        iconName="message"
      />
      <EmptyState
        title="Clarifications are clear"
        body="When a ticket needs clarification from this role, it will appear here."
      />
    </section>
  );
}

function AccessRestrictedPanel({
  activeModule,
  role
}: {
  activeModule: ModuleKey;
  role: RoleKey;
}) {
  const moduleLabel = navItems.find((item) => item.key === activeModule)?.label ?? activeModule;

  return (
    <section className="panel access-restricted-panel">
      <PanelHeader
        title="Role visibility"
        description={`${moduleLabel} is not visible for ${getAdminRoleLabel(role)}.`}
        iconName="privacy"
      />
      <p>Switch to a role with access or use the visible modules in the sidebar.</p>
    </section>
  );
}

function ApprovalCenter({
  tickets,
  role,
  selectedPersona,
  config,
  onApprovalDecision,
  onOpenTicket
}: {
  tickets: Ticket[];
  role: RoleKey;
  selectedPersona: RolePersonaOption;
  config: AdminConfig;
  onApprovalDecision: (
    ticketKey: string,
    stepId: string,
    action: ApprovalDecisionAction,
    note: ApprovalDecisionPayload
  ) => void;
  onOpenTicket: (ticketKey: string) => void;
}) {
  const approvalItems = useMemo(
    () => getApprovalQueueItems(tickets, config, selectedPersona),
    [config, selectedPersona, tickets]
  );
  const pendingApprovals = approvalItems.filter((item) => item.actionable && item.step.status !== "blocked");
  const blockedApprovals = approvalItems.filter((item) => item.actionable && item.step.status === "blocked");
  const waitingApprovals = approvalItems.filter((item) => !item.actionable);
  const personaLabel =
    selectedPersona.assignment === "fallback" ? selectedPersona.roleLabel : formatPersonaOptionLabel(selectedPersona);
  const [clarificationComposerItemId, setClarificationComposerItemId] = useState<string | null>(null);
  const [clarificationDrafts, setClarificationDrafts] = useState<Record<string, ApprovalClarificationDraft>>({});
  const [clarificationErrorItemId, setClarificationErrorItemId] = useState<string | null>(null);

  function submitDecision(item: ApprovalQueueItem, action: ApprovalDecisionAction) {
    if (!item.actionable || item.step.status === "blocked") {
      return;
    }

    onApprovalDecision(item.ticket.key, item.step.id, action, "");
  }

  function openClarificationComposer(item: ApprovalQueueItem) {
    setClarificationComposerItemId(item.id);
    setClarificationErrorItemId(null);
    setClarificationDrafts((current) => {
      const currentDraft = current[item.id];
      const defaultDraft = createDefaultApprovalClarificationDraft(config, item);

      return {
        ...current,
        [item.id]: currentDraft
          ? {
              ...currentDraft,
              question: stripGeneratedApprovalClarificationContext(currentDraft.question)
            }
          : defaultDraft
      };
    });
  }

  function closeClarificationComposer() {
    setClarificationComposerItemId(null);
    setClarificationErrorItemId(null);
  }

  function submitClarificationQuestion(item: ApprovalQueueItem) {
    const draft = clarificationDrafts[item.id] ?? createDefaultApprovalClarificationDraft(config, item);
    const hasTarget = draft.workflowTargetRoles.length > 0 || draft.includePullIn;

    if (!htmlToPlainTextFallback(draft.question).trim() || !hasTarget) {
      setClarificationErrorItemId(item.id);
      return;
    }

    const question = stripGeneratedApprovalClarificationContext(draft.question).trim();

    if (!htmlToPlainTextFallback(question).trim()) {
      setClarificationErrorItemId(item.id);
      return;
    }

    onApprovalDecision(item.ticket.key, item.step.id, "clarification", {
      question,
      workflowTargetRoles: draft.workflowTargetRoles,
      pullInTargetRole: draft.includePullIn ? draft.pullInTargetRole : undefined,
      pullInActionType: draft.includePullIn ? draft.pullInActionType : undefined,
      temporary: draft.temporary
    });
    setClarificationComposerItemId(null);
    setClarificationErrorItemId(null);
    setClarificationDrafts((current) => ({
      ...current,
      [item.id]: createDefaultApprovalClarificationDraft(config, item)
    }));
  }

  return (
    <section className="approval-workbench approval-workbench-table">
      <div className="approval-table-card" aria-labelledby="pending-approvals-title">
        <header className="approval-table-header">
          <div>
            <h2 id="pending-approvals-title">Pending approvals</h2>
            <p>
              {role === "admin" ? "All approval roles" : personaLabel} ·{" "}
              {formatCount(pendingApprovals.length)} approval{pendingApprovals.length === 1 ? "" : "s"} ready for decision
            </p>
          </div>
        </header>
        <div className="approval-table-scroll">
          <table className="approval-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Product / PRU / Module</th>
                <th>Submitted by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingApprovals.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="No pending approvals"
                      body="There are no active workflow gates waiting for this responsibility right now."
                    />
                  </td>
                </tr>
              ) : null}
              {pendingApprovals.map((item) => {
                const isClarificationComposerOpen = clarificationComposerItemId === item.id;
                const clarificationDraft =
                  clarificationDrafts[item.id] ?? createDefaultApprovalClarificationDraft(config, item);
                const workflowTargetOptions = getApprovalClarificationTargetOptions(config, item);
                const workflowTargetRoleKeys = new Set(workflowTargetOptions.map((option) => option.key));
                const configuredPullInRoleOptions = getPullInRoleOptions(config, clarificationDraft.pullInActionType);
                const pullInRoleOptions =
                  configuredPullInRoleOptions.filter(
                    (option) => !workflowTargetRoleKeys.has(option.key) || option.key === clarificationDraft.pullInTargetRole
                  ) || configuredPullInRoleOptions;
                const availablePullInRoleOptions = pullInRoleOptions.length > 0 ? pullInRoleOptions : configuredPullInRoleOptions;

                return (
                  <Fragment key={item.id}>
                    <tr>
                      <td>
                        <button
                          className="approval-ticket-link"
                          type="button"
                          title="Open ticket details"
                          onClick={() => onOpenTicket(item.ticket.key)}
                        >
                          <strong>{item.ticket.key}</strong>
                          <span>{item.ticket.title}</span>
                        </button>
                      </td>
                      <td>
                        <span className="approval-status-chip">{getTicketListStatusLabel(item.ticket)}</span>
                      </td>
                      <td>
                        <span className={`priority priority-${getPriorityToneClassName(item.ticket.priority)}`}>
                          {item.ticket.priority}
                        </span>
                      </td>
                      <td>
                        <span className="approval-product-cell">
                          <strong>{item.ticket.product || "No product"}</strong>
                          <small>
                            {[item.ticket.pru, item.ticket.module].filter(Boolean).join(" - ") || "No PRU / module"}
                          </small>
                        </span>
                      </td>
                      <td>{getTicketSubmitter(item.ticket)}</td>
                      <td>
                        <div className="approval-row-actions">
                          <button className="primary-button" type="button" onClick={() => submitDecision(item, "approve")}>
                            Approve
                          </button>
                          <button
                            className="secondary-button danger-button hard-delete-button"
                            type="button"
                            onClick={() => submitDecision(item, "reject")}
                          >
                            Reject
                          </button>
                          <button
                            className="secondary-button"
                            title="Ask for clarification"
                            type="button"
                            onClick={() => openClarificationComposer(item)}
                          >
                            More info
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isClarificationComposerOpen ? (
                      <tr className="approval-clarification-row">
                        <td colSpan={6}>
                          <div className="approval-clarification-card">
                            <div className="approval-clarification-target-grid">
                              <label className="form-field">
                                <span>Ask workflow role</span>
                                <select
                                  multiple
                                  value={clarificationDraft.workflowTargetRoles}
                                  onChange={(event) => {
                                    const workflowTargetRoles = Array.from(
                                      event.currentTarget.selectedOptions,
                                      (option) => option.value as RoleKey
                                    );

                                    setClarificationDrafts((current) => ({
                                      ...current,
                                      [item.id]: {
                                        ...clarificationDraft,
                                        workflowTargetRoles
                                      }
                                    }));
                                    setClarificationErrorItemId(null);
                                  }}
                                >
                                  {workflowTargetOptions.map((option) => (
                                    <option key={option.key} value={option.key}>
                                      {option.label} - {option.detail}
                                    </option>
                                  ))}
                                </select>
                                <small>Select one or more roles already involved in this ticket.</small>
                              </label>
                              <div className="approval-pull-in-box">
                                <label className="approval-inline-checkbox">
                                  <input
                                    checked={clarificationDraft.includePullIn}
                                    type="checkbox"
                                    onChange={(event) => {
                                      const includePullIn = event.currentTarget.checked;

                                      setClarificationDrafts((current) => ({
                                        ...current,
                                        [item.id]: {
                                          ...clarificationDraft,
                                          includePullIn
                                        }
                                      }));
                                    }}
                                  />
                                  Pull in another role
                                </label>
                                {clarificationDraft.includePullIn ? (
                                  <div className="approval-pull-in-grid">
                                    <label className="form-field">
                                      <span>Action type</span>
                                      <select
                                        value={clarificationDraft.pullInActionType}
                                        onChange={(event) => {
                                          const pullInActionType = event.currentTarget.value as PullInActionType;
                                          const nextRoleOptions = getPullInRoleOptions(config, pullInActionType).filter(
                                            (option) =>
                                              !workflowTargetRoleKeys.has(option.key) ||
                                              option.key === clarificationDraft.pullInTargetRole
                                          );
                                          const availableNextRoleOptions =
                                            nextRoleOptions.length > 0 ? nextRoleOptions : getPullInRoleOptions(config, pullInActionType);
                                          const pullInTargetRole = availableNextRoleOptions.some(
                                            (option) => option.key === clarificationDraft.pullInTargetRole
                                          )
                                            ? clarificationDraft.pullInTargetRole
                                            : availableNextRoleOptions[0]?.key ?? clarificationDraft.pullInTargetRole;

                                          setClarificationDrafts((current) => ({
                                            ...current,
                                            [item.id]: {
                                              ...clarificationDraft,
                                              pullInActionType,
                                              pullInTargetRole
                                            }
                                          }));
                                        }}
                                      >
                                        {pullInActionOptions.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="form-field">
                                      <span>Role to pull in</span>
                                      <select
                                        value={clarificationDraft.pullInTargetRole}
                                        onChange={(event) => {
                                          const pullInTargetRole = event.currentTarget.value as RoleKey;

                                          setClarificationDrafts((current) => ({
                                            ...current,
                                            [item.id]: {
                                              ...clarificationDraft,
                                              pullInTargetRole
                                            }
                                          }));
                                        }}
                                      >
                                        {availablePullInRoleOptions.map((roleOption) => (
                                          <option key={roleOption.key} value={roleOption.key}>
                                            {roleOption.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <RichTextEditor
                              label="Question / approval context"
                              value={clarificationDraft.question}
                              onChange={(value) => {
                                setClarificationDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...clarificationDraft,
                                    question: value
                                  }
                                }));
                                setClarificationErrorItemId(null);
                              }}
                              placeholder="Describe what is missing and what you need before approving."
                              rows={3}
                            />
                            {clarificationErrorItemId === item.id ? (
                              <p className="approval-clarification-error">
                                Select at least one target and write the question or request before sending.
                              </p>
                            ) : null}
                            <div className="approval-clarification-actions">
                              <button className="secondary-button" type="button" onClick={closeClarificationComposer}>
                                Cancel
                              </button>
                              <button className="primary-button" type="button" onClick={() => submitClarificationQuestion(item)}>
                                <TegelIcon name="send" size="16px" />
                                Send more info request
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {blockedApprovals.length > 0 ? (
          <div className="approval-waiting-panel">
            <h3>Blocked approvals</h3>
            <p>
              {formatCount(blockedApprovals.length)} approval gate{blockedApprovals.length === 1 ? "" : "s"} assigned to{" "}
              {role === "admin" ? "approval roles" : personaLabel}, waiting for requested information.
            </p>
            <div className="approval-waiting-list" role="list">
              {blockedApprovals.map((item) => (
                <div className="approval-waiting-row" key={item.id} role="listitem">
                  <div>
                    <button
                      className="approval-ticket-link"
                      type="button"
                      title="Open ticket details"
                      onClick={() => onOpenTicket(item.ticket.key)}
                    >
                      <strong>{item.ticket.key}</strong>
                      <span>{item.ticket.title}</span>
                    </button>
                    <small>
                      {item.step.label} · Owner {item.step.ownerName} · {item.ticket.product} / {item.ticket.pru} /{" "}
                      {item.ticket.module}
                    </small>
                  </div>
                  <div className="approval-waiting-status">
                    <span className={`step-state step-state-${item.step.status}`}>
                      {nextActionLabel(item.step.status)}
                    </span>
                    <p>{getApprovalQueueWaitReason(item)}</p>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => onOpenTicket(item.ticket.key)}>
                    Open workflow
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {waitingApprovals.length > 0 ? (
          <div className="approval-waiting-panel">
            <h3>Waiting approvals</h3>
            <p>
              {formatCount(waitingApprovals.length)} approval gate{waitingApprovals.length === 1 ? "" : "s"} assigned to{" "}
              {role === "admin" ? "approval roles" : personaLabel}, but not ready for decision yet.
            </p>
            <div className="approval-waiting-list" role="list">
              {waitingApprovals.map((item) => (
                <div className="approval-waiting-row" key={item.id} role="listitem">
                  <div>
                    <button
                      className="approval-ticket-link"
                      type="button"
                      title="Open ticket details"
                      onClick={() => onOpenTicket(item.ticket.key)}
                    >
                      <strong>{item.ticket.key}</strong>
                      <span>{item.ticket.title}</span>
                    </button>
                    <small>
                      {item.step.label} · Owner {item.step.ownerName} · {item.ticket.product} / {item.ticket.pru} /{" "}
                      {item.ticket.module}
                    </small>
                  </div>
                  <div className="approval-waiting-status">
                    <span className={`step-state step-state-${item.step.status}`}>
                      {nextActionLabel(item.step.status)}
                    </span>
                    <p>{getApprovalQueueWaitReason(item)}</p>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => onOpenTicket(item.ticket.key)}>
                    Open workflow
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getDashboardProcessSteps(ticket: Ticket) {
  return getTicketLifecycleSteps(ticket).map((step) => ({
    label: step.label,
    detail: step.detail,
    status: step.status,
    state: step.state
  }));
}

function getDashboardCurrentProcessStep(steps: ReturnType<typeof getDashboardProcessSteps>) {
  return (
    steps.find((step) => step.state === "active" || step.state === "blocked" || step.state === "rejected") ??
    steps.find((step) => step.state === "waiting") ??
    steps[steps.length - 1]
  );
}

function getDashboardNextProcessStep(
  steps: ReturnType<typeof getDashboardProcessSteps>,
  currentStep?: ReturnType<typeof getDashboardProcessSteps>[number]
) {
  if (!currentStep) {
    return undefined;
  }

  const currentIndex = steps.findIndex((step) => step.label === currentStep.label);

  return currentIndex >= 0 ? steps.slice(currentIndex + 1).find((step) => step.state === "waiting") : undefined;
}

function getDashboardPercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function countDashboardTicketsBySlaState(tickets: Ticket[]): Record<SlaState, number> {
  return tickets.reduce(
    (counts, ticket) => {
      counts[ticket.slaState] += 1;
      return counts;
    },
    { healthy: 0, watch: 0, breach: 0, paused: 0 } as Record<SlaState, number>
  );
}

function getDashboardTopProductRows(tickets: Ticket[]): Array<{ label: string; count: number; blocked: number }> {
  const rowsByProduct = new Map<string, { label: string; count: number; blocked: number }>();

  for (const ticket of tickets) {
    const label = ticket.product || "Unknown product";
    const current = rowsByProduct.get(label) ?? { label, count: 0, blocked: 0 };
    current.count += 1;
    current.blocked += getTicketQueueBucket(ticket) === "blocked" ? 1 : 0;
    rowsByProduct.set(label, current);
  }

  return Array.from(rowsByProduct.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5);
}

function getEmptyReleasePlanJiraMetadata(): ReleasePlanJiraMetadata {
  return {
    versionDateLookup: new Map(),
    boards: [],
    sprints: []
  };
}

function useReleasePlanJiraMetadata(config: AdminConfig, tickets: Ticket[]): ReleasePlanJiraMetadata {
  const [jiraMetadata, setJiraMetadata] = useState<ReleasePlanJiraMetadata>(() => getEmptyReleasePlanJiraMetadata());
  const projectKeys = useMemo(
    () =>
      Array.from(
        new Set(
          tickets
            .map((ticket) =>
              getValidJiraProjectKey(ticket.jiraDraft.project) ||
              getValidJiraProjectKey(config.integrations.jira.defaultProjectKey)
            )
            .filter((projectKey): projectKey is string => Boolean(projectKey))
        )
      ).sort(),
    [config.integrations.jira.defaultProjectKey, tickets]
  );

  useEffect(() => {
    const integration = config.integrations.jira;

    if (!integration.enabled || projectKeys.length === 0) {
      setJiraMetadata(getEmptyReleasePlanJiraMetadata());
      return;
    }

    const localToken = readLocalIntegrationSecrets().jiraToken?.trim() ?? "";

    if (!localToken) {
      setJiraMetadata(getEmptyReleasePlanJiraMetadata());
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadVersionDates() {
      const nextLookup: ReleasePlanVersionDateLookup = new Map();
      const nextBoards = new Map<string, JiraBoardMetadataOption>();
      const nextSprints = new Map<string, ReleasePlanSprintMetadata>();

      await Promise.all(
        projectKeys.map(async (projectKey) => {
          const response = await fetch("/api/integrations/jira/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              config: {
                enabled: integration.enabled,
                apiBaseUrl: integration.apiBaseUrl,
                apiVersion: integration.apiVersion,
                authMode: integration.authMode,
                username: integration.username,
                token: localToken,
                defaultProjectKey: projectKey,
                defaultIssueType: integration.defaultIssueType
              }
            }),
            signal: controller.signal
          });
          const payload = (await response.json().catch(() => null)) as JiraSyncMetadataPayload | null;

          if (!response.ok) {
            return;
          }

          for (const board of payload?.data?.boards ?? []) {
            const boardId = board.id?.trim() ?? "";
            const boardName = board.name?.trim() ?? "";

            if (!boardId || !boardName) {
              continue;
            }

            nextBoards.set(boardId, {
              id: boardId,
              name: boardName,
              type: board.type?.trim() || "board"
            });
          }

          for (const sprint of payload?.data?.sprints ?? []) {
            const sprintId = sprint.id?.trim() ?? "";
            const sprintName = sprint.name?.trim() ?? "";
            const boardId = sprint.boardId?.trim() ?? "";
            const boardName = sprint.boardName?.trim() ?? "";

            if (!sprintId || !sprintName) {
              continue;
            }

            nextSprints.set(`${boardId || "unknown"}::${sprintId}`, {
              id: sprintId,
              name: sprintName,
              state: sprint.state?.trim() || "future",
              boardId,
              boardName,
              startDate: sprint.startDate?.trim() ?? "",
              endDate: sprint.endDate?.trim() ?? ""
            });
          }

          for (const version of payload?.data?.versions ?? []) {
            const versionName = version.name?.trim() ?? "";
            const startDate = formatReleaseDate(version.startDate || version.userStartDate);
            const releaseDate = formatReleaseDate(version.releaseDate || version.userReleaseDate);

            if (!versionName) {
              continue;
            }

            const dateValue = { name: versionName, startDate, releaseDate };
            nextLookup.set(getReleasePlanVersionDateLookupKey(projectKey, versionName), dateValue);

            if (!nextLookup.has(getReleasePlanVersionDateLookupKey("*", versionName))) {
              nextLookup.set(getReleasePlanVersionDateLookupKey("*", versionName), dateValue);
            }
          }
        })
      );

      if (!cancelled) {
        setJiraMetadata({
          versionDateLookup: nextLookup,
          boards: Array.from(nextBoards.values()).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true })),
          sprints: Array.from(nextSprints.values()).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
        });
      }
    }

    loadVersionDates().catch((error) => {
      if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
        console.warn("[release-plan] Jira version dates could not be loaded.", {
          error: getErrorMessage(error)
        });
        setJiraMetadata(getEmptyReleasePlanJiraMetadata());
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    config.integrations.jira.apiBaseUrl,
    config.integrations.jira.apiVersion,
    config.integrations.jira.authMode,
    config.integrations.jira.defaultIssueType,
    config.integrations.jira.enabled,
    config.integrations.jira,
    config.integrations.jira.username,
    projectKeys
  ]);

  return jiraMetadata;
}

function useReleasePlanVersionDateLookup(config: AdminConfig, tickets: Ticket[]): ReleasePlanVersionDateLookup {
  return useReleasePlanJiraMetadata(config, tickets).versionDateLookup;
}

function DashboardOverview({
  config,
  notifications,
  role,
  selectedPersona,
  tickets,
  onOpenNotification,
  onOpenTicketModule
}: {
  config: AdminConfig;
  notifications: NotificationItem[];
  role: RoleKey;
  selectedPersona: RolePersonaOption;
  tickets: Ticket[];
  onOpenNotification: (notification: NotificationItem) => void;
  onOpenTicketModule: (ticketKey: string, module: ModuleKey, tab?: DetailTab) => void;
}) {
  const totalTickets = tickets.length;
  const openTickets = tickets.filter((ticket) => getTicketQueueBucket(ticket) !== "done").length;
  const doneTickets = tickets.filter((ticket) => getTicketQueueBucket(ticket) === "done").length;
  const blockedTickets = tickets.filter((ticket) => getTicketQueueBucket(ticket) === "blocked").length;
  const slaCounts = countDashboardTicketsBySlaState(tickets);
  const approvalItems = getApprovalQueueItems(tickets, config, selectedPersona).filter(
    (item) => item.actionable && item.step.status !== "blocked"
  );
  const clarificationItems = tickets.flatMap((ticket) =>
    buildClarificationThreadGroups(ticket).flatMap((group) =>
      group.threads
        .filter((thread) => clarificationNeedsRoleAttention(thread, role))
        .map((thread) => ({ ticket, thread }))
    )
  );
  const unreadNotifications = notifications.filter((notification) => notification.unread);
  const jiraAttentionTickets = tickets.filter((ticket) => Boolean(getJiraAttentionId(ticket)));
  const productRows = getDashboardTopProductRows(tickets);
  const versionDateLookup = useReleasePlanVersionDateLookup(config, tickets);
  const releaseRows = tickets
    .map((ticket) => getReleasePlanTicket(ticket, versionDateLookup, config))
    .reduce((rows, item) => {
      const current = rows.get(item.releaseVersion) ?? {
        releaseVersion: item.releaseVersion,
        tickets: 0,
        preprodDate: item.preprodDate,
        prodDate: item.prodDate,
        sortDate: getReleasePlanSortDate(item.prodDate || item.preprodDate)
      };

      current.tickets += 1;
      current.preprodDate = selectEarliestReleasePlanDate([current.preprodDate, item.preprodDate]);
      current.prodDate = selectEarliestReleasePlanDate([current.prodDate, item.prodDate]);
      current.sortDate = Math.min(current.sortDate, getReleasePlanSortDate(item.prodDate || item.preprodDate));
      rows.set(item.releaseVersion, current);

      return rows;
    }, new Map<string, { releaseVersion: string; tickets: number; preprodDate: string; prodDate: string; sortDate: number }>());
  const releaseTimeline = Array.from(releaseRows.values())
    .sort((left, right) => left.sortDate - right.sortDate || left.releaseVersion.localeCompare(right.releaseVersion))
    .slice(0, 4);
  const attentionRows: Array<{
    id: string;
    tone: "critical" | "warning" | "info";
    title: string;
    detail: string;
    meta: string;
    ticketKey: string;
    module: ModuleKey;
    tab?: DetailTab;
  }> = [
    ...tickets
      .filter((ticket) => ticket.slaState === "breach")
      .map((ticket) => ({
        id: `sla-${ticket.key}`,
        tone: "critical" as const,
        title: "SLA breach",
        detail: `${ticket.key} - ${ticket.title}`,
        meta: ticket.slaLabel,
        ticketKey: ticket.key,
        module: "tickets" as ModuleKey,
        tab: "Overview" as DetailTab
      })),
    ...clarificationItems.map(({ ticket, thread }) => ({
      id: `clarification-${ticket.key}-${thread.id}`,
      tone: "warning" as const,
      title: "Clarification needed",
      detail: `${ticket.key} - ${thread.question}`,
      meta: thread.assignedTo,
      ticketKey: ticket.key,
      module: "clarifications" as ModuleKey
    })),
    ...approvalItems.map((item) => ({
      id: `approval-${item.ticket.key}-${item.step.id}`,
      tone: "info" as const,
      title: "Approval action",
      detail: `${item.ticket.key} - ${item.step.label}`,
      meta: item.step.ownerName,
      ticketKey: item.ticket.key,
      module: "approvals" as ModuleKey
    })),
    ...jiraAttentionTickets.map((ticket) => ({
      id: `jira-${ticket.key}`,
      tone: "info" as const,
      title: "Jira follow-up",
      detail: `${ticket.key} - ${ticket.title}`,
      meta: getJiraFollowUpStatusLabel(getTicketJiraFollowUpStatus(ticket)),
      ticketKey: ticket.key,
      module: "jira" as ModuleKey
    }))
  ].slice(0, 8);
  const overviewMetrics = [
    {
      label: role === "requester" ? "My tickets" : "Visible tickets",
      value: formatCount(totalTickets),
      detail: `${formatCount(openTickets)} open · ${formatCount(doneTickets)} done`,
      state: "healthy" as SlaState,
      iconName: "folder" as TegelIconName
    },
    {
      label: "SLA health",
      value: formatCount(slaCounts.breach),
      detail: slaCounts.breach > 0 ? "Breaches need action" : `${formatCount(slaCounts.watch)} watched · no breach`,
      state: slaCounts.breach > 0 ? ("breach" as SlaState) : slaCounts.watch > 0 ? ("watch" as SlaState) : ("healthy" as SlaState),
      iconName: "warning" as TegelIconName
    },
    {
      label: "Clarifications",
      value: formatCount(clarificationItems.length),
      detail: "Waiting for role answer",
      state: clarificationItems.length > 0 ? ("watch" as SlaState) : ("healthy" as SlaState),
      iconName: "message" as TegelIconName
    },
    {
      label: "Notifications",
      value: formatCount(unreadNotifications.length),
      detail: "Unread role-visible updates",
      state: unreadNotifications.length > 0 ? ("watch" as SlaState) : ("healthy" as SlaState),
      iconName: "notification" as TegelIconName
    },
    {
      label: "Approvals",
      value: formatCount(approvalItems.length),
      detail: "Actionable gates",
      state: approvalItems.length > 0 ? ("watch" as SlaState) : ("healthy" as SlaState),
      iconName: "document_check" as TegelIconName
    },
    {
      label: "Blocked work",
      value: formatCount(blockedTickets),
      detail: `${getDashboardPercent(blockedTickets, totalTickets)}% of visible work`,
      state: blockedTickets > 0 ? ("breach" as SlaState) : ("healthy" as SlaState),
      iconName: "route" as TegelIconName
    }
  ];

  return (
    <div className="dashboard-overview-layout">
      <section className="dashboard-command-panel">
        <div>
          <span>Operational overview</span>
          <h2>{role === "requester" ? "Your support portfolio at a glance" : "Role workload at a glance"}</h2>
          <p>
            SLA, clarifications, approvals, notifications, releases, and blocked work summarized for quick review.
          </p>
        </div>
        <div className="dashboard-command-actions">
          <button
            className="secondary-button"
            disabled={!unreadNotifications[0]}
            type="button"
            onClick={() => unreadNotifications[0] && onOpenNotification(unreadNotifications[0])}
          >
            <TegelIcon name="notification" size="16px" />
            Open latest notice
          </button>
          <button
            className="primary-button"
            disabled={!attentionRows[0]}
            type="button"
            onClick={() => attentionRows[0] && onOpenTicketModule(attentionRows[0].ticketKey, attentionRows[0].module, attentionRows[0].tab)}
          >
            <TegelIcon name="route" size="16px" />
            Open top action
          </button>
        </div>
      </section>

      <section className="dashboard-overview-metrics" aria-label="Dashboard overview metrics">
        {overviewMetrics.map((item) => (
          <article className={`dashboard-overview-metric state-${item.state}`} key={item.label}>
            <div>
              <span>{item.label}</span>
              <TegelIcon name={item.iconName} size="18px" />
            </div>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <div className="dashboard-overview-grid">
        <section className="panel dashboard-health-panel">
          <PanelHeader title="Health overview" description="SLA and workflow distribution across visible work." iconName="dashboard" />
          <div className="dashboard-health-split">
            <div className="dashboard-ring-card">
              <div
                className="dashboard-ring"
                style={{
                  "--done": `${getDashboardPercent(doneTickets, totalTickets) * 3.6}deg`,
                  "--blocked": `${getDashboardPercent(blockedTickets, totalTickets) * 3.6}deg`
                } as CSSProperties}
                aria-label={`${getDashboardPercent(doneTickets, totalTickets)} percent done`}
              >
                <strong>{getDashboardPercent(doneTickets, totalTickets)}%</strong>
                <span>done</span>
              </div>
              <p>{formatCount(openTickets)} open items remain in scope.</p>
            </div>
            <div className="dashboard-distribution-list">
              {(["healthy", "watch", "breach", "paused"] as SlaState[]).map((state) => (
                <div className={`dashboard-distribution-row state-${state}`} key={state}>
                  <div>
                    <span>{state === "healthy" ? "Healthy" : state === "watch" ? "Watch" : state === "breach" ? "Breach" : "Paused"}</span>
                    <strong>{formatCount(slaCounts[state])}</strong>
                  </div>
                  <div className="dashboard-distribution-track">
                    <span style={{ width: `${getDashboardPercent(slaCounts[state], totalTickets)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel dashboard-attention-panel">
          <PanelHeader title="Needs attention" description="The highest-priority items to inspect first." iconName="warning" />
          {attentionRows.length === 0 ? (
            <EmptyState title="No urgent actions" body="SLA, clarifications, approvals, and Jira follow-up are currently clear." />
          ) : (
            <div className="dashboard-attention-list" role="list">
              {attentionRows.map((item) => (
                <button
                  className={`dashboard-attention-row tone-${item.tone}`}
                  key={item.id}
                  onClick={() => onOpenTicketModule(item.ticketKey, "tickets", "Overview")}
                  type="button"
                >
                  <span>{item.title}</span>
                  <strong>{item.detail}</strong>
                  <small>{item.meta}</small>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel dashboard-portfolio-panel">
          <PanelHeader title="Portfolio mix" description="Where visible work is concentrated." iconName="folder" />
          <div className="dashboard-product-list">
            {productRows.length === 0 ? (
              <EmptyState title="No portfolio data" body="Create or import tickets to populate product distribution." />
            ) : (
              productRows.map((row) => (
                <div className="dashboard-product-row" key={row.label}>
                  <div>
                    <strong>{row.label}</strong>
                    <span>{formatCount(row.count)} tickets · {formatCount(row.blocked)} blocked</span>
                  </div>
                  <div className="dashboard-product-track">
                    <span style={{ width: `${getDashboardPercent(row.count, totalTickets)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel dashboard-release-panel">
          <PanelHeader title="Release snapshot" description="Upcoming release dates from planned tickets." iconName="calendar" />
          {releaseTimeline.length === 0 ? (
            <EmptyState title="No release data" body="Tickets with fix versions will appear in this release summary." />
          ) : (
            <div className="dashboard-release-list">
              {releaseTimeline.map((release) => (
                <div className="dashboard-release-row" key={release.releaseVersion}>
                  <div>
                    <strong>{release.releaseVersion}</strong>
                    <span>{formatCount(release.tickets)} ticket{release.tickets === 1 ? "" : "s"}</span>
                  </div>
                  <div>
                    <span>Pre-prod {formatReleasePlanDate(release.preprodDate)}</span>
                    <span>Prod {formatReleasePlanDate(release.prodDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel dashboard-notification-panel">
          <PanelHeader title="Latest notifications" description="Recent unread and role-visible activity." iconName="notification" />
          {notifications.length === 0 ? (
            <EmptyState title="No notifications" body="Role-visible updates will appear here when workflow activity occurs." />
          ) : (
            <div className="dashboard-notification-list">
              {notifications.slice(0, 5).map((notification) => (
                <button
                  className={notification.unread ? "is-unread" : ""}
                  key={notification.id}
                  onClick={() => onOpenNotification(notification)}
                  type="button"
                >
                  <span>{notification.title}</span>
                  <strong>{notification.ticketKey}</strong>
                  <small>{notification.body}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DashboardFocusPanel({
  config,
  role,
  selectedPersona,
  ticket,
  onOpenTicketModule
}: {
  config: AdminConfig;
  role: RoleKey;
  selectedPersona: RolePersonaOption;
  ticket: Ticket;
  onOpenTicketModule: (ticketKey: string, module: ModuleKey, tab?: DetailTab) => void;
}) {
  const actionSummary = getWorkflowActionSummary(ticket);
  const workflowHealth = summarizeWorkflowHealth(ticket);
  const processSteps = getDashboardProcessSteps(ticket);
  const completedProcessSteps = processSteps.filter((step) => step.state === "complete").length;
  const totalProcessSteps = processSteps.length || 1;
  const currentProcessStep = getDashboardCurrentProcessStep(processSteps);
  const nextProcessStep = getDashboardNextProcessStep(processSteps, currentProcessStep);
  const processProgressPercent = Math.round((completedProcessSteps / totalProcessSteps) * 100);
  const openClarifications = ticket.clarifications.filter((thread) => thread.status !== "answered").length;
  const openEscalations = ticket.escalations.filter((escalation) => escalation.status !== "resolved").length;
  const activeSteps = ticket.workflow.filter((step) => step.status === "active" || step.status === "delegated" || step.status === "blocked");
  const stepsToShow = activeSteps.length ? activeSteps : ticket.workflow.filter((step) => step.status === "waiting").slice(0, 2);
  const currentStatusLabel = getTicketCurrentStatusLabel(ticket);
  const canReviewApproval = ticket.workflow.some(
    (step) => isActionableWorkflowStep(step) && isApprovalVisibleForPersona(config, selectedPersona, ticket, step)
  );
  const quickActions: Array<{
    label: string;
    iconName: TegelIconName;
    module: ModuleKey;
    tab?: DetailTab;
    visible: boolean;
  }> = [
    {
      label: "Open details",
      iconName: "folder" as TegelIconName,
      module: "tickets" as ModuleKey,
      tab: "Overview" as DetailTab,
      visible: true
    },
    {
      label: "Review workflow",
      iconName: "route" as TegelIconName,
      module: "tickets" as ModuleKey,
      tab: "Workflow" as DetailTab,
      visible: true
    },
    {
      label: "Approval queue",
      iconName: "document_check" as TegelIconName,
      module: "approvals" as ModuleKey,
      visible: canReviewApproval && canAccessModule(role, "approvals")
    },
    {
      label: "Clarifications",
      iconName: "message" as TegelIconName,
      module: "clarifications" as ModuleKey,
      visible: openClarifications > 0 && canAccessModule(role, "clarifications")
    },
    {
      label: "Jira handoff",
      iconName: "route" as TegelIconName,
      module: "jira" as ModuleKey,
      visible: (ticket.state === "jira_draft" || Boolean(ticket.relatedJiraKey)) && canAccessModule(role, "jira")
    },
    {
      label: "Escalations",
      iconName: "warning" as TegelIconName,
      module: "escalations" as ModuleKey,
      visible: openEscalations > 0 && canAccessModule(role, "escalations")
    }
  ].filter((action) => action.visible);

  return (
    <section className="panel dashboard-focus-panel">
      <PanelHeader
        title={role === "requester" ? "Selected ticket" : "Selected work"}
        description="Current status, next step, and useful places to continue."
        iconName="route"
      />
      <div className="dashboard-focus-hero">
        <div>
          <span className="ticket-key">{ticket.key}</span>
          <h2>{ticket.title}</h2>
          <p>
            {[getTicketTypeLabel(ticket.typeId), ticket.product, ticket.site].filter(Boolean).join(" - ")}
          </p>
        </div>
        <div className="ticket-badges" aria-label="Selected ticket status">
          <span className={`ticket-status-chip tag-variant-${getStatusColorVariant(config, currentStatusLabel)}`}>
            {currentStatusLabel}
          </span>
          <span className={`priority priority-${getPriorityToneClassName(ticket.priority)}`}>{ticket.priority}</span>
          <span className={`sla-chip state-${ticket.slaState}`}>{ticket.slaLabel}</span>
          {ticket.relatedJiraKey ? (
            <JiraIssueLink config={config} jiraKey={ticket.relatedJiraKey} className="jira-issue-link ticket-jira-link" />
          ) : null}
        </div>
      </div>
      <div className="dashboard-status-board" aria-label="Selected ticket position">
        <article className={`dashboard-status-card dashboard-status-current step-${currentProcessStep?.state ?? "waiting"}`}>
          <span>Current position</span>
          <strong>{currentProcessStep?.label ?? currentStatusLabel}</strong>
          <small>{currentProcessStep?.detail ?? actionSummary.detail}</small>
        </article>
        <article className="dashboard-status-card">
          <span>Done already</span>
          <strong>
            {completedProcessSteps}/{totalProcessSteps} stages done
          </strong>
          <small>
            {workflowHealth.completed}/{workflowHealth.total} review gates complete
          </small>
        </article>
        <article className="dashboard-status-card dashboard-status-next">
          <span>Next action</span>
          <strong>{actionSummary.label}</strong>
          <small>{actionSummary.detail}</small>
        </article>
      </div>
      <div className="dashboard-progress-meter" aria-label={`Ticket lifecycle progress ${processProgressPercent}%`}>
        <div>
          <span>Lifecycle progress</span>
          <strong>{processProgressPercent}%</strong>
        </div>
        <div className="dashboard-progress-track" aria-hidden="true">
          <span style={{ width: `${processProgressPercent}%` }} />
        </div>
      </div>
      <ol className="dashboard-process" aria-label="Ticket process">
        {processSteps.map((step, index) => (
          <li
            className={`dashboard-process-step step-${step.state} ${step.label === currentProcessStep?.label ? "is-current" : ""}`}
            key={step.label}
          >
            <div className="dashboard-process-step-top">
              <span className="dashboard-process-index">{index + 1}</span>
              <span className={`dashboard-process-state step-${step.state}`}>{step.status}</span>
            </div>
            <strong>{step.label}</strong>
            <span>{step.detail}</span>
            {nextProcessStep?.label === step.label ? <small className="dashboard-process-next-label">Next stage</small> : null}
          </li>
        ))}
      </ol>
      <div className="dashboard-focus-grid">
        <div>
          <h3>Active gates</h3>
          {stepsToShow.length > 0 ? (
            <div className="dashboard-gate-list">
              {stepsToShow.map((step) => (
                <div className={`dashboard-gate-row step-${step.status}`} key={step.id}>
                  <span className={`step-state step-state-${step.status}`}>{nextActionLabel(step.status)}</span>
                  <strong>{step.label}</strong>
                  <small>{step.ownerName} - {getConfigRoleLabel(config, step.ownerRole)}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No active gates" body="Workflow approvals are complete or no gate is currently assigned." />
          )}
        </div>
        <div>
          <h3>Continue in</h3>
          <div className="dashboard-action-list">
            {quickActions.map((action) => (
              <button
                className="secondary-button"
                key={action.label}
                type="button"
                onClick={() => onOpenTicketModule(ticket.key, action.module, action.tab)}
              >
                <TegelIcon name={action.iconName} size="16px" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function KpiStrip({
  tickets,
  role,
  config,
  selectedPersona
}: {
  tickets: Ticket[];
  role: RoleKey;
  config: AdminConfig;
  selectedPersona: RolePersonaOption;
}) {
  const openTickets = tickets.filter((ticket) => ticket.state !== "closed").length;
  const breachedTickets = tickets.filter((ticket) => ticket.slaState === "breach").length;
  const approvalCount = getApprovalQueueItems(tickets, config, selectedPersona).filter(
    (item) => item.actionable && item.step.status !== "blocked"
  ).length;
  const openClarifications = getClarificationAttentionCount(tickets, role);

  const items = [
    {
      label: role === "requester" ? "My open tickets" : "Open governed work",
      value: formatCount(openTickets),
      detail: role === "requester"
        ? "Submitted by you"
        : role === "admin"
          ? "Across configured PRUs and sites"
          : "Visible to current role",
      state: "healthy" as SlaState
    },
    {
      label: "Approval actions",
      value: formatCount(approvalCount),
      detail: role === "admin" ? "Active approval gates" : "Gates owned by this role",
      state: "watch" as SlaState
    },
    {
      label: "Clarifications",
      value: formatCount(openClarifications),
      detail: "Need role action",
      state: "healthy" as SlaState
    },
    {
      label: "SLA breaches",
      value: formatCount(breachedTickets),
      detail: "Escalation required",
      state: breachedTickets > 0 ? ("breach" as SlaState) : ("healthy" as SlaState)
    }
  ];

  return (
    <section className="kpi-strip" aria-label="Operational KPIs">
      {items.map((item) => (
        <div className={`metric-card state-${item.state}`} key={item.label}>
          <div className="metric-topline">
            <span>{item.label}</span>
            <AppIcon status={item.state} />
          </div>
          <strong>{item.value}</strong>
          <p>{item.detail}</p>
        </div>
      ))}
    </section>
  );
}

function IntegrationAdminWorkspace({
  config,
  onConfigChange,
  role
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
  role: RoleKey;
}) {
  return (
    <div className="focused-layout integration-admin-workspace">
      <IntegrationHealthPanel config={config} role={role} />
      <IntegrationConfigurationPanel config={config} onConfigChange={onConfigChange} />
    </div>
  );
}

function ReleasePlanBoard({
  config,
  jiraBulkSyncError,
  jiraBulkSyncMessage,
  jiraBulkSyncState,
  tickets,
  onOpenTicket,
  onSyncLinkedJiraTickets
}: {
  config: AdminConfig;
  jiraBulkSyncError: string;
  jiraBulkSyncMessage: string;
  jiraBulkSyncState: "idle" | "syncing";
  tickets: Ticket[];
  onOpenTicket: (ticketKey: string) => void;
  onSyncLinkedJiraTickets: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<ReleasePlanTab>("releases");
  const [releaseFilter, setReleaseFilter] = useState(REPORT_ALL_VALUE);
  const [sprintFilter, setSprintFilter] = useState(REPORT_ALL_VALUE);
  const [boardFilter, setBoardFilter] = useState(REPORT_ALL_VALUE);
  const jiraMetadata = useReleasePlanJiraMetadata(config, tickets);
  const versionDateLookup = jiraMetadata.versionDateLookup;
  const releaseTickets = useMemo(
    () => tickets.map((ticket) => getReleasePlanTicket(ticket, versionDateLookup, config)),
    [config, tickets, versionDateLookup]
  );
  const boardOptions = useMemo(
    () => [
      { value: REPORT_ALL_VALUE, label: "All product boards" },
      ...uniqueSortedReportValues(
        [
          ...tickets.map((ticket) => ticket.jiraDraft.board?.trim() || "No product board"),
          ...jiraMetadata.boards.map((board) => board.name)
        ]
      ).map((board) => ({
        value: board,
        label: board
      }))
    ],
    [jiraMetadata.boards, tickets]
  );
  const releaseOptions = useMemo(
    () => [
      { value: REPORT_ALL_VALUE, label: "All releases" },
      ...uniqueSortedReportValues([
        ...releaseTickets.map((item) => item.releaseVersion),
        ...Array.from(versionDateLookup.values()).map((versionDate) => versionDate.name)
      ]).map((releaseVersion) => ({
        value: releaseVersion,
        label: releaseVersion
      }))
    ],
    [releaseTickets, versionDateLookup]
  );
  const sprintOptions = useMemo(
    () => [
      { value: REPORT_ALL_VALUE, label: "All sprints" },
      ...uniqueSortedReportValues([
        ...releaseTickets
          .filter((item) => {
            const board = item.ticket.jiraDraft.board?.trim() || "No product board";
            return boardFilter === REPORT_ALL_VALUE || board === boardFilter;
          })
          .filter((item) => item.sprint !== "No sprint")
          .map((item) => item.sprint),
        ...jiraMetadata.sprints
          .filter((sprint) => boardFilter === REPORT_ALL_VALUE || sprint.boardName === boardFilter)
          .map((sprint) => sprint.name)
      ]).map((sprint) => ({
        value: sprint,
        label: sprint
      }))
    ],
    [boardFilter, jiraMetadata.sprints, releaseTickets]
  );
  useEffect(() => {
    if (sprintFilter !== REPORT_ALL_VALUE && !sprintOptions.some((option) => option.value === sprintFilter)) {
      setSprintFilter(REPORT_ALL_VALUE);
    }
  }, [sprintFilter, sprintOptions]);
  const filteredTickets = useMemo(
    () =>
      tickets.filter((ticket) => {
        const board = ticket.jiraDraft.board?.trim() || "No product board";

        if (boardFilter !== REPORT_ALL_VALUE && board !== boardFilter) {
          return false;
        }

        if (activeTab === "releases" && releaseFilter !== REPORT_ALL_VALUE && getReleasePlanVersion(ticket) !== releaseFilter) {
          return false;
        }

        if (activeTab === "sprintPlanning") {
          const sprint = ticket.jiraDraft.sprint?.trim() || "No sprint";

          if (sprint === "No sprint") {
            return false;
          }

          if (sprintFilter !== REPORT_ALL_VALUE && sprint !== sprintFilter) {
            return false;
          }
        }

        return true;
      }),
    [activeTab, boardFilter, releaseFilter, sprintFilter, tickets]
  );
  const releaseFilteredTickets = useMemo(
    () =>
      tickets.filter((ticket) => {
        const board = ticket.jiraDraft.board?.trim() || "No product board";

        if (boardFilter !== REPORT_ALL_VALUE && board !== boardFilter) {
          return false;
        }

        if (releaseFilter !== REPORT_ALL_VALUE && getReleasePlanVersion(ticket) !== releaseFilter) {
          return false;
        }

        return true;
      }),
    [boardFilter, releaseFilter, tickets]
  );
  const sprintFilteredTickets = useMemo(
    () =>
      tickets.filter((ticket) => {
        const board = ticket.jiraDraft.board?.trim() || "No product board";
        const sprint = ticket.jiraDraft.sprint?.trim() || "No sprint";

        if (boardFilter !== REPORT_ALL_VALUE && board !== boardFilter) {
          return false;
        }

        if (sprint === "No sprint") {
          return false;
        }

        if (sprintFilter === REPORT_ALL_VALUE) {
          return true;
        }

        return sprint === sprintFilter;
      }),
    [boardFilter, sprintFilter, tickets]
  );
  const filteredMetadataSprints = useMemo(
    () =>
      jiraMetadata.sprints.filter((sprint) => {
        if (boardFilter !== REPORT_ALL_VALUE && sprint.boardName !== boardFilter) {
          return false;
        }

        if (sprintFilter !== REPORT_ALL_VALUE && sprint.name !== sprintFilter) {
          return false;
        }

        return true;
      }),
    [boardFilter, jiraMetadata.sprints, sprintFilter]
  );
  const releaseGroups = useMemo(
    () => buildReleasePlanGroups(releaseFilteredTickets, versionDateLookup, config),
    [config, releaseFilteredTickets, versionDateLookup]
  );
  const sprintGroups = useMemo(
    () => buildSprintPlanGroups(sprintFilteredTickets, versionDateLookup, config, filteredMetadataSprints),
    [config, filteredMetadataSprints, sprintFilteredTickets, versionDateLookup]
  );
  const filteredReleaseTickets = useMemo(
    () => filteredTickets.map((ticket) => getReleasePlanTicket(ticket, versionDateLookup, config)),
    [config, filteredTickets, versionDateLookup]
  );
  const plannedReleaseTickets = filteredReleaseTickets.filter((item) => item.releaseVersion !== releasePlanUnplannedLabel).length;
  const activeSprintCount = new Set(
    filteredReleaseTickets.filter((item) => item.sprint !== "No sprint").map((item) => item.sprint)
  ).size;
  const activeBoardCount = new Set(
    filteredTickets.map((ticket) => ticket.jiraDraft.board?.trim() || "No product board")
  ).size;
  const prodDateCount = filteredReleaseTickets.filter((item) => !isMissingReleasePlanValue(item.prodDate)).length;
  const totalEstimateHours = filteredTickets.reduce((sum, ticket) => sum + getTicketEstimateHours(ticket), 0);
  const remainingHours = filteredTickets.reduce((sum, ticket) => sum + getTicketRemainingHours(ticket), 0);

  return (
    <section className="panel release-plan-board">
      <PanelHeader
        title="Release plan"
        description="End-user release view grouped by Jira fix version, sprint, pre-prod date, and production date."
        iconName="calendar"
      />
      <div className="release-plan-tabs" role="tablist" aria-label="Release planning views">
        <button
          aria-selected={activeTab === "releases"}
          className={activeTab === "releases" ? "is-active" : ""}
          role="tab"
          type="button"
          onClick={() => setActiveTab("releases")}
        >
          Releases
        </button>
        <button
          aria-selected={activeTab === "sprintPlanning"}
          className={activeTab === "sprintPlanning" ? "is-active" : ""}
          role="tab"
          type="button"
          onClick={() => setActiveTab("sprintPlanning")}
        >
          Sprint planning
        </button>
      </div>
      <div className="release-plan-controls">
        {activeTab === "releases" ? (
          <label className="release-plan-filter">
            <span>Release</span>
            <select value={releaseFilter} onChange={(event) => setReleaseFilter(event.target.value)}>
              {releaseOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="release-plan-filter">
            <span>Sprint</span>
            <select value={sprintFilter} onChange={(event) => setSprintFilter(event.target.value)}>
              {sprintOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="release-plan-filter">
          <span>Product board</span>
          <select value={boardFilter} onChange={(event) => setBoardFilter(event.target.value)}>
            {boardOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            if (activeTab === "releases") {
              setReleaseFilter(REPORT_ALL_VALUE);
            } else {
              setSprintFilter(REPORT_ALL_VALUE);
            }
            setBoardFilter(REPORT_ALL_VALUE);
          }}
        >
          Reset filters
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={jiraBulkSyncState === "syncing"}
          onClick={() => void onSyncLinkedJiraTickets()}
        >
          {jiraBulkSyncState === "syncing" ? "Syncing Jira..." : "Sync Jira data"}
        </button>
      </div>
      {jiraBulkSyncError || jiraBulkSyncMessage ? (
        <p className={jiraBulkSyncError ? "admin-form-error" : "admin-form-success"} role="status">
          {jiraBulkSyncError || jiraBulkSyncMessage}
        </p>
      ) : null}
      <div className="release-plan-summary-grid">
        <ReleasePlanMetric label="Visible tickets" value={filteredTickets.length} />
        <ReleasePlanMetric label="Releases" value={releaseGroups.length} />
        <ReleasePlanMetric label="Planned tickets" value={plannedReleaseTickets} />
        <ReleasePlanMetric label="Sprints" value={activeSprintCount} />
        <ReleasePlanMetric label="Product boards" value={activeBoardCount} />
        <ReleasePlanMetric label="Prod dates" value={prodDateCount} />
      </div>
      {activeTab === "releases" ? (
        <div className="release-plan-list">
          {releaseGroups.length === 0 ? (
            <EmptyState title="No release plan items" body="No visible tickets match the selected release filters." />
          ) : null}
          {releaseGroups.map((group) => (
            <ReleasePlanGroupCard
              config={config}
              group={group}
              key={`${group.id}-${group.releaseVersion}`}
              onOpenTicket={onOpenTicket}
            />
          ))}
        </div>
      ) : (
        <SprintPlanningBoard
          config={config}
          groups={sprintGroups}
          remainingHours={remainingHours}
          taskCount={filteredTickets.length}
          totalEstimateHours={totalEstimateHours}
          onOpenTicket={onOpenTicket}
        />
      )}
    </section>
  );
}

function ReleasePlanMetric({ label, value }: { label: string; value: number }) {
  return (
    <article className="release-plan-metric">
      <span>{label}</span>
      <strong>{formatCount(value)}</strong>
    </article>
  );
}

function SprintPlanningBoard({
  config,
  groups,
  totalEstimateHours,
  remainingHours,
  taskCount,
  onOpenTicket
}: {
  config: AdminConfig;
  groups: SprintPlanGroup[];
  totalEstimateHours: number;
  remainingHours: number;
  taskCount: number;
  onOpenTicket: (ticketKey: string) => void;
}) {
  const resourceCount = new Set(groups.flatMap((group) => group.resources)).size;

  return (
    <div className="sprint-planning-board">
      <div className="sprint-planning-summary">
        <ReleasePlanMetric label="Task number" value={taskCount} />
        <ReleasePlanMetric label="Estimate hours" value={totalEstimateHours} />
        <ReleasePlanMetric label="Remain hours" value={remainingHours} />
        <ReleasePlanMetric label="Resources" value={resourceCount} />
      </div>
      <div className="sprint-plan-list">
        {groups.length === 0 ? (
          <EmptyState title="No sprint plan items" body="No visible tickets match the selected sprint filters." />
        ) : null}
        {groups.map((group) => (
          <SprintPlanGroupCard config={config} group={group} key={`${group.id}-${group.sprint}`} onOpenTicket={onOpenTicket} />
        ))}
      </div>
    </div>
  );
}

function SprintPlanGroupCard({
  config,
  group,
  onOpenTicket
}: {
  config: AdminConfig;
  group: SprintPlanGroup;
  onOpenTicket: (ticketKey: string) => void;
}) {
  return (
    <article className="sprint-plan-group">
      <header className="sprint-plan-header">
        <div>
          <span>Sprint</span>
          <h3>{group.sprint}</h3>
          <small>{group.releaseVersions.join(", ") || "No linked release"}</small>
        </div>
        <div className="sprint-plan-header-metrics">
          <span>{formatCount(group.taskCount)} tasks</span>
          <span>{formatCount(group.totalEstimateHours)}h estimate</span>
          <span>{formatCount(group.remainingHours)}h remain</span>
        </div>
      </header>
      <div className="sprint-plan-meta-grid">
        <div>
          <span>Product board</span>
          <strong>{group.boardNames.join(", ") || "No product board"}</strong>
        </div>
        <div>
          <span>Sprint state</span>
          <strong>{group.state || "Not synced"}</strong>
        </div>
        <div>
          <span>Start</span>
          <strong>{group.startDate || "Not planned"}</strong>
        </div>
        <div>
          <span>End</span>
          <strong>{group.endDate || "Not planned"}</strong>
        </div>
      </div>
      <div className="sprint-plan-resource-row">
        <span>Resources</span>
        <strong>{group.resources.join(", ") || "Unassigned"}</strong>
      </div>
      <SprintTaskDetailTable config={config} group={group} onOpenTicket={onOpenTicket} />
    </article>
  );
}

function SprintTaskDetailTable({
  config,
  group,
  onOpenTicket
}: {
  config: AdminConfig;
  group: SprintPlanGroup;
  onOpenTicket: (ticketKey: string) => void;
}) {
  const tasks = group.lanes.flatMap((lane) => lane.tickets);

  return (
    <div className="sprint-task-details">
      <header>
        <div>
          <span>Task details</span>
          <strong>{formatCount(tasks.length)} tasks in this sprint</strong>
        </div>
      </header>
      {tasks.length === 0 ? (
        <p>No portal tasks are linked to this sprint yet.</p>
      ) : (
        <div className="sprint-task-table" aria-label={`${group.sprint} task details`}>
          <div className="sprint-task-table-header">
            <span>Ticket</span>
            <span>Jira ID</span>
            <span>Product / PRU</span>
            <span>Status</span>
            <span>Resource</span>
            <span>Estimate</span>
            <span>Remain</span>
            <span>Release</span>
          </div>
          {tasks.map((item) => (
            <button
              className="sprint-task-table-row"
              key={`${group.id}-${item.ticket.key}`}
              type="button"
              onClick={() => onOpenTicket(item.ticket.key)}
            >
              <span>
                <strong>{item.ticket.key}</strong>
                <small>{item.ticket.title}</small>
              </span>
              <span>
                {item.ticket.relatedJiraKey ? (
                  <JiraIssueLink config={config} jiraKey={item.ticket.relatedJiraKey} />
                ) : (
                  <strong>No Jira ID</strong>
                )}
              </span>
              <span>
                <strong>{item.ticket.product || "No product"}</strong>
                <small>{item.ticket.pru || item.ticket.module || "No PRU"}</small>
              </span>
              <span>
                <span className={`jira-follow-up-badge tone-${item.sprintStatusTone}`}>{item.sprintStatusLabel}</span>
              </span>
              <span>{getTicketResourceName(item.ticket)}</span>
              <span>{formatCount(getTicketEstimateHours(item.ticket))}h</span>
              <span>{formatCount(getTicketRemainingHours(item.ticket))}h</span>
              <span>
                <strong>{item.releaseVersion}</strong>
                <small>{formatReleasePlanDate(item.prodDate)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReleasePlanGroupCard({
  config,
  group,
  onOpenTicket
}: {
  config: AdminConfig;
  group: ReleasePlanGroup;
  onOpenTicket: (ticketKey: string) => void;
}) {
  return (
    <article className="release-plan-group">
      <header className="release-plan-group-header">
        <div>
          <span>Release</span>
          <h3>{group.releaseVersion}</h3>
        </div>
        <strong>{formatCount(group.tickets.length)} tickets</strong>
      </header>
      <div className="release-plan-date-grid">
        <ReleasePlanDateBlock label="Pre-prod release" value={group.preprodDate} />
        <ReleasePlanDateBlock label="Production release" value={group.prodDate} />
        <div className="release-plan-sprints">
          <span>Sprints</span>
          <strong>{group.sprintNames.join(", ")}</strong>
        </div>
      </div>
      <div className="release-plan-status-row" aria-label="Sprint status summary">
        {group.statusCounts.map((item) => (
          <span className={`jira-follow-up-badge tone-${item.tone}`} key={`${group.id}-${item.label}`}>
            {item.label}: {formatCount(item.value)}
          </span>
        ))}
      </div>
      <div className="release-plan-ticket-table" role="table" aria-label={`${group.releaseVersion} tickets`}>
        <div className="release-plan-ticket-header" role="row">
          <span>Ticket</span>
          <span>Jira ID</span>
          <span>Product / PRU</span>
          <span>Product board</span>
          <span>Sprint</span>
          <span>Status</span>
          <span>Pre-prod</span>
          <span>Prod</span>
        </div>
        {group.tickets.map((item) => (
          <button
            className="release-plan-ticket-row"
            key={`${group.id}-${item.ticket.key}`}
            type="button"
            role="row"
            onClick={() => onOpenTicket(item.ticket.key)}
          >
            <span className="release-plan-ticket-main">
              <strong>{item.ticket.key}</strong>
              <small>{item.ticket.title}</small>
            </span>
            <span>
              {item.ticket.relatedJiraKey ? (
                <JiraIssueLink config={config} jiraKey={item.ticket.relatedJiraKey} />
              ) : (
                <strong>No Jira ID</strong>
              )}
            </span>
            <span>
              <strong>{item.ticket.product || "No product"}</strong>
              <small>{item.ticket.pru || "No PRU"}</small>
            </span>
            <span>{item.ticket.jiraDraft.board?.trim() || "No product board"}</span>
            <span>{item.sprint}</span>
            <span>
              <span className={`jira-follow-up-badge tone-${item.sprintStatusTone}`}>{item.sprintStatusLabel}</span>
            </span>
            <span>{formatReleasePlanDate(item.preprodDate)}</span>
            <span>{formatReleasePlanDate(item.prodDate)}</span>
          </button>
        ))}
      </div>
    </article>
  );
}

function ReleasePlanDateBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="release-plan-date-block">
      <span>{label}</span>
      <strong>{formatReleasePlanDate(value)}</strong>
    </div>
  );
}

function IntegrationHealthPanel({
  config,
  role,
  onOpenIntegrations
}: {
  config: AdminConfig;
  role: RoleKey;
  onOpenIntegrations?: () => void;
}) {
  const jira = config.integrations.jira;
  const smtp = config.integrations.smtp;
  const jiraBaseUrl = getJiraApiBaseUrl(jira);
  const canConfigure = role === "admin";

  return (
    <section className="panel integration-health-panel">
      <PanelHeader
        title="Integration health"
        description="Jira API sync and SMTP notification delivery configuration."
        iconName="link"
      />
      <div className="integration-health-list">
        <article className="integration-health-card">
          <div className="integration-health-topline">
            <strong>Jira integration</strong>
            <span className={`integration-health-state ${jira.enabled ? "is-active" : "is-inactive"}`}>
              {jira.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <dl>
            <div>
              <dt>API endpoint</dt>
              <dd>{jiraBaseUrl ? getJiraApiEndpoint(jira) : "Not configured"}</dd>
            </div>
            <div>
              <dt>Auth</dt>
              <dd>{getJiraAuthModeLabel(jira.authMode ?? "personalAccessToken")}</dd>
            </div>
            <div>
              <dt>Token</dt>
              <dd>{getJiraTokenStatus(jira)}</dd>
            </div>
          </dl>
        </article>
        <article className="integration-health-card">
          <div className="integration-health-topline">
            <strong>SMTP email</strong>
            <span className={`integration-health-state ${smtp.enabled ? "is-active" : "is-inactive"}`}>
              {smtp.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <dl>
            <div>
              <dt>Host</dt>
              <dd>{smtp.host || "Not configured"}</dd>
            </div>
            <div>
              <dt>Security</dt>
              <dd>{getSmtpSecurityLabel(smtp.security)}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{getNotificationDeliveryModeLabel(smtp.deliveryMode)}</dd>
            </div>
          </dl>
        </article>
      </div>
      <div className="integration-health-actions">
        {canConfigure && onOpenIntegrations ? (
          <button className="secondary-button" type="button" onClick={onOpenIntegrations}>
            <TegelIcon name="configurator" size="16px" />
            Open integration settings
          </button>
        ) : canConfigure ? (
          <span>Managed in this admin workspace.</span>
        ) : (
          <span>Configuration changes require the Admin role.</span>
        )}
      </div>
    </section>
  );
}

function TicketListWorkspace({
  tickets,
  selectedTicket,
  selectedTicketKey,
  isDetailOpen,
  activeTab,
  visibleAudit,
  visibleComments,
  role,
  selectedPersona,
  config,
  onOpenTicket,
  onDetailOpenChange,
  onAddClarificationReply,
  onAddAttachments,
  onReplaceAttachmentContent,
  onAddComment,
  onCreateClarification,
  onCreateEscalation,
  onPostJiraComment,
  onReopenTicket,
  onUpdateTicket,
  onUpdateWorkflowStatus,
  onUpdateEscalationStatus,
  onSyncJiraActivity,
  onTabChange
}: {
  tickets: Ticket[];
  selectedTicket?: Ticket;
  selectedTicketKey: string;
  isDetailOpen: boolean;
  activeTab: DetailTab;
  visibleAudit: Ticket["audit"];
  visibleComments: Ticket["comments"];
  role: RoleKey;
  selectedPersona: RolePersonaOption;
  config: AdminConfig;
  onOpenTicket: (ticketKey: string) => void;
  onDetailOpenChange: (isOpen: boolean) => void;
  onAddClarificationReply: (ticketKey: string, threadId: string, body: string) => void;
  onAddAttachments: (ticketKey: string, attachments: NewTicketAttachmentInput[]) => void;
  onReplaceAttachmentContent: (ticketKey: string, attachmentId: string, attachment: NewTicketAttachmentInput) => void;
  onAddComment: (ticketKey: string, body: string, visibility: VisibilityLevel) => void;
  onCreateClarification: (ticketKey: string, input: NewClarificationThreadInput) => void;
  onCreateEscalation: (ticketKey: string, input: NewEscalationInput) => void;
  onPostJiraComment?: PostJiraCommentHandler;
  onReopenTicket: (ticketKey: string) => void;
  onUpdateTicket: UpdateTicketHandler;
  onUpdateWorkflowStatus: UpdateWorkflowStatusHandler;
  onUpdateEscalationStatus: (
    ticketKey: string,
    escalationId: string,
    status: EscalationStatus,
    decisionNote: string,
    details?: EscalationStatusUpdateDetails
  ) => void;
  onSyncJiraActivity: SyncJiraActivityHandler;
  onTabChange: (tab: DetailTab) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [submitterFilter, setSubmitterFilter] = useState("all");
  const [sortBy, setSortBy] = useState<TicketListSortKey>("updatedAt");
  const [mineOnly, setMineOnly] = useState(false);

  const rows = useMemo<TicketListRow[]>(
    () =>
      tickets.map((ticket) => ({
        ticket,
        statusLabel: getTicketListStatusLabel(ticket),
        statusBucket: getTicketQueueBucket(ticket),
        submitter: getTicketSubmitter(ticket),
        typeLabel: getConfigTicketTypeLabel(config, ticket.typeId)
      })),
    [config, tickets]
  );

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...Array.from(new Set(rows.map((row) => row.statusLabel)))
        .sort((left, right) => left.localeCompare(right))
        .map((status) => ({ value: status, label: status }))
    ],
    [rows]
  );

  const typeOptions = useMemo(() => {
    const configuredTypes = config.requestTypes
      .filter((type) => type.active)
      .map((type) => ({ value: getConfigTicketTypeLabel(config, type.id), label: type.label }));
    const configuredLabels = new Set(configuredTypes.map((type) => type.value));
    const ticketTypesInUse = Array.from(new Set(rows.map((row) => row.typeLabel)))
      .filter((typeLabel) => !configuredLabels.has(typeLabel))
      .sort((left, right) => left.localeCompare(right))
      .map((typeLabel) => ({ value: typeLabel, label: typeLabel }));

    return [{ value: "all", label: "All types" }, ...configuredTypes, ...ticketTypesInUse];
  }, [config, rows]);

  const priorityOptions = useMemo(
    () => [
      { value: "all", label: "All priorities" },
      ...config.priorities
        .filter((priority) => priority.active)
        .map((priority) => ({ value: priority.label, label: priority.label }))
    ],
    [config.priorities]
  );

  const productOptions = useMemo(() => {
    const products = Array.from(
      new Set([
        ...config.products.filter((product) => product.active).map((product) => product.productName),
        ...rows.map((row) => row.ticket.product)
      ])
    )
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));

    return [{ value: "all", label: "All products" }, ...products.map((product) => ({ value: product, label: product }))];
  }, [config.products, rows]);

  const submitterOptions = useMemo(() => {
    const submitters = Array.from(new Set(rows.map((row) => row.submitter)))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));

    return [
      { value: "all", label: "All submitters" },
      ...submitters.map((submitter) => ({ value: submitter, label: submitter }))
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch = (row: TicketListRow) =>
      [
        row.ticket.key,
        row.ticket.title,
        row.ticket.product,
        row.ticket.pru,
        row.ticket.module,
        row.typeLabel,
        row.statusLabel,
        row.submitter
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);

    return rows.filter((row) => {
      if (normalizedSearch && !matchesSearch(row)) {
        return false;
      }

      if (statusFilter !== "all" && row.statusLabel !== statusFilter) {
        return false;
      }

      if (typeFilter !== "all" && row.typeLabel !== typeFilter) {
        return false;
      }

      if (priorityFilter !== "all" && row.ticket.priority !== priorityFilter) {
        return false;
      }

      if (productFilter !== "all" && row.ticket.product !== productFilter) {
        return false;
      }

      if (submitterFilter !== "all" && row.submitter !== submitterFilter) {
        return false;
      }

      if (mineOnly && !ticketWasSubmittedByPersona(row.ticket, selectedPersona)) {
        return false;
      }

      return true;
    });
  }, [
    mineOnly,
    priorityFilter,
    productFilter,
    rows,
    search,
    selectedPersona,
    statusFilter,
    submitterFilter,
    typeFilter
  ]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((left, right) => {
      if (sortBy === "ticketKey") {
        return right.ticket.key.localeCompare(left.ticket.key, undefined, { numeric: true });
      }

      if (sortBy === "priority") {
        return getPriorityWeight(right.ticket.priority) - getPriorityWeight(left.ticket.priority);
      }

      if (sortBy === "status") {
        return left.statusLabel.localeCompare(right.statusLabel);
      }

      return parseTicketTimestamp(right.ticket.updatedAt) - parseTicketTimestamp(left.ticket.updatedAt);
    });
  }, [filteredRows, sortBy]);

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setPriorityFilter("all");
    setProductFilter("all");
    setSubmitterFilter("all");
    setSortBy("updatedAt");
    setMineOnly(false);
  }

  if (selectedTicket && isDetailOpen) {
    return (
      <div className="ticket-list-workspace ticket-list-detail-mode">
        <div className="ticket-detail-toolbar">
          <button className="secondary-button" type="button" onClick={() => onDetailOpenChange(false)}>
            <TegelIcon name="arrow_left" size="16px" />
            Back to ticket list
          </button>
          <span>
            {selectedTicket.key} · {selectedTicket.title}
          </span>
        </div>
        <TicketDetail
          activeTab={activeTab}
          config={config}
          selectedPersona={selectedPersona}
          onAddClarificationReply={onAddClarificationReply}
          onAddAttachments={onAddAttachments}
          onReplaceAttachmentContent={onReplaceAttachmentContent}
          onAddComment={onAddComment}
          onCreateClarification={onCreateClarification}
          onCreateEscalation={onCreateEscalation}
          onPostJiraComment={onPostJiraComment}
          onReopenTicket={onReopenTicket}
          onTabChange={onTabChange}
          onUpdateTicket={onUpdateTicket}
          onUpdateWorkflowStatus={onUpdateWorkflowStatus}
          onUpdateEscalationStatus={onUpdateEscalationStatus}
          onSyncJiraActivity={onSyncJiraActivity}
          role={role}
          ticket={selectedTicket}
          visibleAudit={visibleAudit}
          visibleComments={visibleComments}
        />
      </div>
    );
  }

  return (
    <div className="ticket-list-workspace">
      <section className="ticket-list-filter-card" aria-labelledby="ticket-list-filters-title">
        <div className="ticket-list-filter-heading">
          <h2 id="ticket-list-filters-title">Find tickets</h2>
          <p>
            {role === "requester"
              ? "Dashboard shows your submitted tickets. This list lets you search across all support tickets."
              : "Use filters to narrow the tickets visible to your current role."}
          </p>
        </div>
        <div className="ticket-list-filters-grid">
          <label className="ticket-list-field">
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ticket number, title, product, submitter"
            />
          </label>
          <label className="ticket-list-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ticket-list-field">
            <span>Type</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ticket-list-field">
            <span>Priority</span>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ticket-list-field">
            <span>Product</span>
            <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
              {productOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ticket-list-field">
            <span>Submitted by</span>
            <select value={submitterFilter} onChange={(event) => setSubmitterFilter(event.target.value)}>
              {submitterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ticket-list-field ticket-list-sort-field">
            <span>Sort by</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as TicketListSortKey)}>
              <option value="updatedAt">Updated date</option>
              <option value="ticketKey">Ticket number</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>
        <div className="ticket-list-filter-actions">
          <button
            aria-pressed={mineOnly}
            className={`secondary-button ${mineOnly ? "is-active" : ""}`}
            type="button"
            onClick={() => setMineOnly((isActive) => !isActive)}
          >
            {role === "requester" ? "Only my tickets" : "My raised tickets"}
          </button>
          <button className="secondary-button" type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      </section>

      <section className="ticket-list-table-card" aria-labelledby="ticket-list-table-title">
        <header>
          <h2 id="ticket-list-table-title">Tickets</h2>
          <span>
            {formatCount(sortedRows.length)} of {formatCount(tickets.length)}
          </span>
        </header>
        <div className="ticket-list-table-scroll">
          <table className="ticket-list-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Status</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Product / PRU / Module</th>
                <th>Jira</th>
                <th>Submitted by</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      title="No tickets found"
                      body="No support tickets match the current filters."
                    />
                  </td>
                </tr>
              ) : null}
              {sortedRows.map((row) => (
                <tr
                  className={selectedTicketKey === row.ticket.key ? "is-selected" : ""}
                  key={row.ticket.key}
                >
                  <td>
                    <button
                      className="ticket-list-link"
                      type="button"
                      onClick={() => {
                        onOpenTicket(row.ticket.key);
                        onDetailOpenChange(true);
                      }}
                    >
                      <strong>{row.ticket.key}</strong>
                      <span>{row.ticket.title}</span>
                    </button>
                  </td>
                  <td>
                    <span className={`ticket-list-status status-${row.statusBucket} tag-variant-${getStatusColorVariant(config, row.statusLabel)}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                  <td>
                    <span className={`ticket-list-type ticket-list-type-${toClassName(row.typeLabel)}`}>
                      {row.typeLabel}
                    </span>
                  </td>
                  <td>
                    <span className={`priority priority-${getPriorityToneClassName(row.ticket.priority)}`}>
                      {row.ticket.priority}
                    </span>
                  </td>
                  <td>
                    <span className="ticket-list-product">
                      <strong>{row.ticket.product || "No product"}</strong>
                      <small>
                        {[row.ticket.pru, row.ticket.module].filter(Boolean).join(" - ") || "No PRU / module"}
                      </small>
                    </span>
                  </td>
                  <td>
                    {row.ticket.relatedJiraKey ? (
                      <JiraIssueLink config={config} jiraKey={row.ticket.relatedJiraKey} />
                    ) : (
                      <span className="jira-issue-empty">Not linked</span>
                    )}
                  </td>
                  <td>{row.submitter}</td>
                  <td>{formatTicketListDate(row.ticket.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GovernanceQueue({
  tickets: queueTickets,
  role,
  selectedTicketKey,
  onSelectTicket
}: {
  tickets: Ticket[];
  role: RoleKey;
  selectedTicketKey: string;
  onSelectTicket: (ticketKey: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<QueueStatusFilter>("all");
  const filteredQueueTickets = useMemo(
    () => queueTickets.filter((ticket) => ticketMatchesQueueFilter(ticket, activeFilter)),
    [activeFilter, queueTickets]
  );
  const queueFilterCounts = useMemo(
    () =>
      queueStatusFilters.reduce((counts, filter) => {
        counts[filter.key] = queueTickets.filter((ticket) =>
          ticketMatchesQueueFilter(ticket, filter.key)
        ).length;

        return counts;
      }, {} as Record<QueueStatusFilter, number>),
    [queueTickets]
  );

  useEffect(() => {
    if (
      filteredQueueTickets.length > 0 &&
      !filteredQueueTickets.some((ticket) => ticket.key === selectedTicketKey)
    ) {
      onSelectTicket(filteredQueueTickets[0].key);
    }
  }, [filteredQueueTickets, onSelectTicket, selectedTicketKey]);

  return (
    <section className="panel queue-panel">
      <PanelHeader
        title={role === "requester" ? "My submitted tickets" : "Governance queue"}
        description={
          role === "requester"
            ? "Tickets you created, grouped by current status."
            : "Role-visible tickets grouped by current status."
        }
        iconName="folder"
      />
      <div className="queue-filter-bar" aria-label="Queue status filters">
        {queueStatusFilters.map((filter) => (
          <button
            aria-pressed={activeFilter === filter.key}
            className={activeFilter === filter.key ? "is-active" : ""}
            key={filter.key}
            onClick={() => setActiveFilter(filter.key)}
            type="button"
          >
            <span>{filter.label}</span>
            <strong>{formatCount(queueFilterCounts[filter.key])}</strong>
          </button>
        ))}
      </div>
      <div className="queue-list" role="list">
        {filteredQueueTickets.length === 0 ? (
          <EmptyState
            title="No tickets in this bucket"
            body={
              role === "requester"
                ? "No submitted tickets match this status and search scope."
                : "No governed work matches the current queue status and search scope."
            }
          />
        ) : null}
        {filteredQueueTickets.map((ticket) => {
          const health = summarizeWorkflowHealth(ticket);
          const bucket = getTicketQueueBucket(ticket);

          return (
            <button
              className={`queue-row ${selectedTicketKey === ticket.key ? "is-selected" : ""}`}
              key={ticket.key}
              onClick={() => onSelectTicket(ticket.key)}
              type="button"
            >
              <span className={`status-rail state-${ticket.slaState}`} aria-hidden="true" />
              <span className="queue-main">
                <span className="queue-title">
                  <strong>{ticket.key}</strong>
                  <span>{ticket.title}</span>
                </span>
                <span className="queue-meta">
                  {getTicketTypeLabel(ticket.typeId)} · {ticket.product} · {ticket.site}
                </span>
                <span className="queue-progress">
                  <span style={{ width: `${Math.round((health.completed / health.total) * 100)}%` }} />
                </span>
              </span>
              <span className="queue-state">
                <span className={`queue-status queue-status-${bucket}`}>
                  {getQueueBucketLabel(bucket)}
                </span>
                <span className={`priority priority-${getPriorityToneClassName(ticket.priority)}`}>
                  {ticket.priority}
                </span>
                <small>{ticket.slaLabel}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function getTicketTabDescription(tab: DetailTab): string {
  switch (tab) {
    case "Workflow":
      return "Approval and review steps, showing what is done, current, waiting, or blocked.";
    case "Clarifications":
      return "Questions and answers needed before the ticket can move forward.";
    case "Comments":
      return "Public, internal, architecture, Jira, and system comments visible to this role.";
    case "Jira":
      return "Read-only Jira handoff, current Jira status, and Jira comments.";
    case "Escalations":
      return "Raised risks or decisions that need extra attention.";
    case "Audit":
      return "System history for status changes, approvals, Jira sync, and configuration actions.";
    case "Attachments":
      return "Files connected to this support ticket.";
    case "Overview":
    default:
      return "Ticket summary, request details, and key fields.";
  }
}

function TicketDetail({
  ticket,
  activeTab,
  config,
  visibleAudit,
  visibleComments,
  role,
  selectedPersona,
  onAddClarificationReply,
  onAddAttachments,
  onReplaceAttachmentContent,
  onAddComment,
  onCreateClarification,
  onCreateEscalation,
  onPostJiraComment,
  onReopenTicket,
  onUpdateTicket,
  onUpdateWorkflowStatus,
  onUpdateEscalationStatus,
  onSyncJiraActivity,
  onTabChange
}: {
  ticket: Ticket;
  activeTab: DetailTab;
  config: AdminConfig;
  visibleAudit: Ticket["audit"];
  visibleComments: Ticket["comments"];
  role: RoleKey;
  selectedPersona: RolePersonaOption;
  onAddClarificationReply: (ticketKey: string, threadId: string, body: string) => void;
  onAddAttachments: (ticketKey: string, attachments: NewTicketAttachmentInput[]) => void;
  onReplaceAttachmentContent: (ticketKey: string, attachmentId: string, attachment: NewTicketAttachmentInput) => void;
  onAddComment: (ticketKey: string, body: string, visibility: VisibilityLevel) => void;
  onCreateClarification: (ticketKey: string, input: NewClarificationThreadInput) => void;
  onCreateEscalation: (ticketKey: string, input: NewEscalationInput) => void;
  onPostJiraComment?: PostJiraCommentHandler;
  onReopenTicket: (ticketKey: string) => void;
  onUpdateTicket: UpdateTicketHandler;
  onUpdateWorkflowStatus: UpdateWorkflowStatusHandler;
  onUpdateEscalationStatus: (
    ticketKey: string,
    escalationId: string,
    status: EscalationStatus,
    decisionNote: string,
    details?: EscalationStatusUpdateDetails
  ) => void;
  onSyncJiraActivity: SyncJiraActivityHandler;
  onTabChange: (tab: DetailTab) => void;
}) {
  const canReopenTicket = canReopenTicketForRole(ticket, role);
  const currentStatusLabel = getTicketCurrentStatusLabel(ticket);

  return (
    <section className="panel ticket-detail">
      <div className="ticket-hero">
        <div>
          <span className="ticket-key">{ticket.key}</span>
          <h2>{ticket.title}</h2>
          <RichTextContent value={ticket.description} fallback="No description provided." compact />
        </div>
        <div className="ticket-hero-actions">
          <div className="ticket-badges" aria-label="Ticket status">
            <span className={`ticket-status-chip tag-variant-${getStatusColorVariant(config, currentStatusLabel)}`}>
              {currentStatusLabel}
            </span>
            <span className={`priority priority-${getPriorityToneClassName(ticket.priority)}`}>
              {ticket.priority}
            </span>
            <span className={`risk risk-${toClassName(ticket.risk)}`}>{ticket.risk} risk</span>
            <span className={`sla-chip state-${ticket.slaState}`}>{ticket.slaLabel}</span>
            {ticket.relatedJiraKey ? (
              <JiraIssueLink config={config} jiraKey={ticket.relatedJiraKey} className="jira-issue-link ticket-jira-link" />
            ) : null}
          </div>
          {canReopenTicket ? (
            <button className="secondary-button ticket-reopen-button" type="button" onClick={() => onReopenTicket(ticket.key)}>
              <TegelIcon name="history" size="16px" />
              Reopen ticket
            </button>
          ) : null}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Ticket detail sections">
        {tabItems.map((tab) => (
          <button
            className={activeTab === tab ? "is-active" : ""}
            key={tab}
            onClick={() => onTabChange(tab)}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tab}
          </button>
        ))}
      </div>
      <p className="tab-helper">{getTicketTabDescription(activeTab)}</p>
      <div className="tab-content">
        {activeTab === "Overview" ? (
          <OverviewPanel
            ticket={ticket}
            config={config}
            onUpdateTicket={onUpdateTicket}
            selectedPersona={selectedPersona}
          />
        ) : null}
        {activeTab === "Workflow" ? (
          <WorkflowPanel
            ticket={ticket}
            config={config}
            embedded
            expanded
            role={role}
            onOpenClarifications={() => onTabChange("Clarifications")}
            onUpdateWorkflowStatus={onUpdateWorkflowStatus}
          />
        ) : null}
        {activeTab === "Clarifications" ? (
          <ClarificationPanel
            ticket={ticket}
            config={config}
            embedded
            expanded
            onCreateClarification={onCreateClarification}
            onReply={onAddClarificationReply}
            role={role}
          />
        ) : null}
        {activeTab === "Comments" ? (
          <CommentPanel ticket={ticket} comments={visibleComments} embedded onAddComment={onAddComment} role={role} />
        ) : null}
        {activeTab === "Jira" ? (
          <JiraSyncPanel
            ticket={ticket}
            config={config}
            canManageJiraActions={false}
            embedded
            expanded
            onPostJiraComment={onPostJiraComment}
            onSyncJiraActivity={onSyncJiraActivity}
            role={role}
            surface="ticket"
          />
        ) : null}
        {activeTab === "Escalations" ? (
          <EscalationPanel
            ticket={ticket}
            embedded
            expanded
            onCreateEscalation={onCreateEscalation}
            onUpdateEscalationStatus={onUpdateEscalationStatus}
            role={role}
          />
        ) : null}
        {activeTab === "Audit" ? <AuditTimeline entries={visibleAudit} embedded expanded /> : null}
        {activeTab === "Attachments" ? (
          <AttachmentPanel
            ticket={ticket}
            embedded
            expanded
            onAddAttachments={onAddAttachments}
            onReplaceAttachmentContent={onReplaceAttachmentContent}
          />
        ) : null}
      </div>
    </section>
  );
}

function TicketUpdatePanel({
  ticket,
  config,
  selectedPersona,
  onUpdateTicket
}: {
  ticket: Ticket;
  config: AdminConfig;
  selectedPersona: RolePersonaOption;
  onUpdateTicket: UpdateTicketHandler;
}) {
  const [form, setForm] = useState<TicketUpdateInput>(() => buildTicketUpdateForm(ticket));
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const canEdit = canEditTicketForPersona(config, selectedPersona, ticket);
  const priorityOptions = useMemo(
    () => getTicketUpdateOptionLabels(config.priorities, ticket.priority),
    [config.priorities, ticket.priority]
  );
  const riskOptions = useMemo(
    () => getTicketUpdateOptionLabels(config.riskOptions, ticket.risk),
    [config.riskOptions, ticket.risk]
  );

  useEffect(() => {
    setForm(buildTicketUpdateForm(ticket));
    setFormError("");
  }, [ticket]);

  useEffect(() => {
    setSuccessMessage("");
  }, [ticket.key]);

  if (!canEdit) {
    return null;
  }

  function formHasChanges(input: TicketUpdateInput): boolean {
    const title = input.title.trim() || ticket.title;
    const description = normalizeRichTextForStorage(input.description);
    const businessImpact = normalizeRichTextForStorage(input.businessImpact);
    const currentDescription = normalizeRichTextForStorage(ticket.description);
    const currentBusinessImpact = normalizeRichTextForStorage(getEditableTicketBusinessImpact(ticket));

    return (
      title !== ticket.title ||
      input.state !== ticket.state ||
      input.priority !== ticket.priority ||
      input.risk !== ticket.risk ||
      description !== currentDescription ||
      businessImpact !== currentBusinessImpact
    );
  }

  function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");

    if (!form.title.trim()) {
      setFormError("Title is required.");
      return;
    }

    if (!formHasChanges(form) && isRichTextBlank(form.requesterNote)) {
      setFormError("Change at least one field or add a requester note.");
      return;
    }

    onUpdateTicket(ticket.key, form);
    setForm((currentForm) => ({ ...currentForm, requesterNote: "" }));
    setSuccessMessage("Ticket update saved and copied to requester comments.");
  }

  return (
    <section className="ticket-update-panel embedded-section" aria-labelledby={`ticket-update-${ticket.key}`}>
      <PanelHeader
        title="Ticket correction"
        description={`${selectedPersona.roleLabel} update with requester copy and audit trail.`}
        iconName="edit"
      />
      <form className="ticket-update-form admin-form" onSubmit={submitUpdate}>
        <div className="ticket-update-grid">
          <label className="form-field">
            <span>Lifecycle status</span>
            <select
              value={form.state}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  state: event.target.value as TicketState
                }))
              }
            >
              {ticketStateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Priority</span>
            <select
              value={form.priority}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  priority: event.target.value
                }))
              }
            >
              {priorityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Risk</span>
            <select
              value={form.risk}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  risk: event.target.value
                }))
              }
            >
              {riskOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-field">
          <span>Title</span>
          <input
            value={form.title}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                title: event.target.value
              }))
            }
          />
        </label>
        <RichTextEditor
          label="Request description"
          value={form.description}
          onChange={(value) =>
            setForm((currentForm) => ({
              ...currentForm,
              description: value
            }))
          }
          placeholder="Update the request summary."
          rows={4}
        />
        <RichTextEditor
          label="Business impact / added info"
          value={form.businessImpact}
          onChange={(value) =>
            setForm((currentForm) => ({
              ...currentForm,
              businessImpact: value
            }))
          }
          placeholder="Add or correct impact, urgency, or missing information."
          rows={4}
        />
        <RichTextEditor
          label="Requester copy / change note"
          value={form.requesterNote}
          onChange={(value) =>
            setForm((currentForm) => ({
              ...currentForm,
              requesterNote: value
            }))
          }
          placeholder="Explain what changed for the requester."
          rows={3}
        />
        {formError ? (
          <p className="admin-form-error" role="alert">
            {formError}
          </p>
        ) : null}
        {successMessage ? (
          <p className="admin-form-success" role="status">
            {successMessage}
          </p>
        ) : null}
        <div className="composer-actions">
          <button className="primary-button" type="submit">
            <TegelIcon name="save" size="16px" />
            Save ticket update
          </button>
        </div>
      </form>
    </section>
  );
}

function OverviewPanel({
  ticket,
  config,
  selectedPersona,
  onUpdateTicket
}: {
  ticket: Ticket;
  config: AdminConfig;
  selectedPersona: RolePersonaOption;
  onUpdateTicket: UpdateTicketHandler;
}) {
  const dynamicFieldEntries = Object.entries(ticket.dynamicFields).filter(
    ([label]) => !hiddenTicketDynamicFieldLabels.has(label)
  );

  return (
    <div className="overview-grid">
      <div className="field-list">
        {[
          ["Type", getTicketTypeLabel(ticket.typeId)],
          ["PRU", ticket.pru],
          ["Site", ticket.site],
          ["Product", ticket.product],
          ["Module", ticket.module],
          ["Current status", getTicketCurrentStatusLabel(ticket)],
          ["Lifecycle state", ticket.state.replace("_", " ")]
        ].map(([label, value]) => (
          <div className="field-row" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
        <div className="field-row">
          <span>Jira issue</span>
          <strong>
            <JiraIssueLink config={config} jiraKey={ticket.relatedJiraKey} />
          </strong>
        </div>
      </div>
      <div className="dynamic-fields">
        <h3>Dynamic fields</h3>
        {dynamicFieldEntries.map(([label, value]) => (
          <div className="dynamic-field" key={label}>
            <span>{label}</span>
            <RichTextContent value={value} />
          </div>
        ))}
      </div>
      <TicketUpdatePanel
        ticket={ticket}
        config={config}
        selectedPersona={selectedPersona}
        onUpdateTicket={onUpdateTicket}
      />
    </div>
  );
}

function TicketLifecycleStrip({ ticket, config }: { ticket: Ticket; config: AdminConfig }) {
  const steps = getTicketLifecycleSteps(ticket);

  return (
    <div className="ticket-lifecycle-strip" aria-label="Ticket lifecycle progress">
      {steps.map((step, index) => (
        <div className={`ticket-lifecycle-step lifecycle-${step.state}`} key={step.label}>
          <span className="ticket-lifecycle-index">{index + 1}</span>
          <div className="ticket-lifecycle-copy">
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </div>
          <span className={`admin-pill tag-variant-${getStatusColorVariant(config, step.status)} lifecycle-pill lifecycle-pill-${step.state}`}>
            {step.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function WorkflowPanel({
  ticket,
  config = adminConfig,
  expanded = false,
  embedded = false,
  role,
  onApprovalDecision,
  onOpenClarifications,
  onUpdateWorkflowStatus
}: {
  ticket: Ticket;
  config?: AdminConfig;
  expanded?: boolean;
  embedded?: boolean;
  role?: RoleKey;
  onApprovalDecision?: (
    ticketKey: string,
    stepId: string,
    action: ApprovalDecisionAction,
    note: ApprovalDecisionPayload
  ) => void;
  onOpenClarifications?: () => void;
  onUpdateWorkflowStatus?: UpdateWorkflowStatusHandler;
}) {
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [manualStepId, setManualStepId] = useState(() => getDefaultWorkflowOverrideStepId(ticket.workflow));
  const [manualStatus, setManualStatus] = useState<WorkflowStepStatus>("blocked");
  const [manualReason, setManualReason] = useState("");
  const [manualStatusError, setManualStatusError] = useState("");
  const configuredWorkflow = getConfiguredWorkflowSteps(config, ticket.workflow);
  const configuredTicket = { ...ticket, workflow: configuredWorkflow };
  const health = summarizeWorkflowHealth(configuredTicket);
  const workflowName = getTicketWorkflowTemplateName(ticket);
  const actionSummary = getWorkflowActionSummary(configuredTicket);
  const currentPositionSummary = getWorkflowCurrentPositionSummary(ticket, configuredTicket);
  const parallelGroups = Array.from(
    new Set(configuredWorkflow.map((step) => step.parallelGroup).filter(Boolean))
  );
  const roleClarificationAction = role
    ? [...ticket.clarifications]
        .filter((thread) => clarificationNeedsRoleAttention(thread, role))
        .sort((left, right) => getClarificationThreadUpdatedAt(right) - getClarificationThreadUpdatedAt(left))[0]
    : undefined;
  const blockedWorkflowStep = configuredWorkflow.find((step) => step.status === "blocked");
  const clarificationCallout = roleClarificationAction
    ? {
        title: "Clarification answer needed",
        body: `${getClarificationRequesterRole(roleClarificationAction)} is waiting for your answer. Reply to move the ticket forward.`,
        actionLabel: "Answer clarification"
      }
    : blockedWorkflowStep
      ? {
          title: "Workflow is blocked by clarification",
          body: `${blockedWorkflowStep.label} is paused until the open clarification is answered.`,
          actionLabel: "Open clarifications"
        }
      : undefined;
  const canManageWorkflowStatus = Boolean(
    onUpdateWorkflowStatus &&
      role &&
      (role === "admin" || role === "release_manager") &&
      configuredWorkflow.length > 0
  );

  useEffect(() => {
    if (!configuredWorkflow.some((step) => step.id === manualStepId)) {
      setManualStepId(getDefaultWorkflowOverrideStepId(configuredWorkflow));
    }
  }, [configuredWorkflow, manualStepId]);

  function submitStepDecision(stepId: string, action: ApprovalDecisionAction) {
    if (!onApprovalDecision) {
      return;
    }

    onApprovalDecision(ticket.key, stepId, action, decisionNotes[stepId] ?? "");
    setDecisionNotes((current) => ({ ...current, [stepId]: "" }));
  }

  function submitManualWorkflowStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onUpdateWorkflowStatus || !manualStepId) {
      return;
    }

    if (!manualReason.trim()) {
      setManualStatusError("Enter a reason before changing the workflow status.");
      return;
    }

    onUpdateWorkflowStatus(ticket.key, {
      stepId: manualStepId,
      status: manualStatus,
      reason: manualReason
    });
    setManualReason("");
    setManualStatusError("");
  }

  return (
    <section className={embedded ? "embedded-section" : "panel workflow-panel"}>
      <PanelHeader
        title="Workflow gates"
        description={`${workflowName} for ${ticket.key} · ${health.completed}/${health.total} complete · ${health.active} active`}
        iconName="route"
      />
      <TicketLifecycleStrip ticket={ticket} config={config} />
      <div className="workflow-command-strip">
        <div className={`workflow-command-action action-tone-${currentPositionSummary.tone}`}>
          <span>Current position</span>
          <strong>{currentPositionSummary.label}</strong>
          <small>{currentPositionSummary.detail}</small>
        </div>
        <div className={`workflow-command-action action-tone-${actionSummary.tone}`}>
          <span>Next action</span>
          <strong>{actionSummary.label}</strong>
          <small>{actionSummary.detail}</small>
        </div>
        <div>
          <span>Path</span>
          <strong>{parallelGroups.length > 0 ? "Parallel review" : "Sequential review"}</strong>
          <small>{parallelGroups.length > 0 ? parallelGroups.join(", ") : "No parallel gates"}</small>
        </div>
      </div>
      {canManageWorkflowStatus ? (
        <form className="workflow-status-override" onSubmit={submitManualWorkflowStatus}>
          <label className="form-field">
            <span>Workflow gate</span>
            <select value={manualStepId} onChange={(event) => setManualStepId(event.target.value)}>
              {configuredWorkflow.map((step) => (
                <option key={step.id} value={step.id}>
                  {step.label} - {nextActionLabel(step.status)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Set status</span>
            <select
              value={manualStatus}
              onChange={(event) => setManualStatus(event.target.value as WorkflowStepStatus)}
            >
              {workflowStatusOverrideOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field form-field-wide">
            <span>Reason</span>
            <textarea
              value={manualReason}
              onChange={(event) => {
                setManualReason(event.target.value);
                setManualStatusError("");
              }}
              placeholder="Explain why this gate is blocked, not needed, restarted, or completed manually."
              rows={3}
            />
          </label>
          <div className="workflow-status-override-actions">
            {manualStatusError ? (
              <p className="admin-form-error" role="alert">
                {manualStatusError}
              </p>
            ) : null}
            <button className="primary-button" type="submit">
              <TegelIcon name="save" size="16px" />
              Apply workflow status
            </button>
          </div>
        </form>
      ) : null}
      {clarificationCallout ? (
        <div className="workflow-blocked-callout">
          <div>
            <strong>{clarificationCallout.title}</strong>
            <p>{clarificationCallout.body}</p>
          </div>
          {onOpenClarifications ? (
            <button className="secondary-button" type="button" onClick={onOpenClarifications}>
              <TegelIcon name="message" size="16px" />
              {clarificationCallout.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={`workflow-timeline ${expanded ? "is-expanded" : ""}`}>
        {configuredWorkflow.length === 0 ? (
          <EmptyState title="No configured workflow roles" body="Workflow roles assigned to this ticket are no longer configured." />
        ) : null}
        {configuredWorkflow.map((step, index) => {
          const waitReason = getWorkflowStepWaitReason(configuredTicket, step);

          return (
            <div className={`workflow-step step-${step.status}`} key={step.id}>
              <div className="step-marker">
                <AppIcon status={step.status} />
                {index < configuredWorkflow.length - 1 ? <span aria-hidden="true" /> : null}
              </div>
              <div className="step-body">
                <div className="step-title">
                  <strong>{step.label}</strong>
                  <span className={`step-state step-state-${step.status}`}>
                    {getWorkflowStepProgressLabel(step.status)}
                  </span>
                </div>
                <div className="step-meta">
                  <span>
                    <b>Owner</b> {step.ownerName}
                  </span>
                  <span>
                    <b>Role</b> {getConfigRoleLabel(config, step.ownerRole)}
                  </span>
                  <span className={`sla-dot state-${step.slaState}`}>
                    <b>SLA</b> {getSlaLabel(step.slaState)}
                  </span>
                </div>
                <div className="step-footer">
                  <span>
                    <TegelIcon name="clock" size="14px" />
                    <b>Due</b> {formatDateTimeDisplay(step.dueAt)}
                  </span>
                  {step.parallelGroup ? (
                    <span>
                      <TegelIcon name="route" size="14px" />
                      <b>Lane</b> {step.parallelGroup}
                    </span>
                  ) : null}
                </div>
                {waitReason ? <p className="workflow-step-wait-reason">{waitReason}</p> : null}
                {step.statusReason ? (
                  <div className="workflow-step-status-reason">
                    <span>Reason</span>
                    <RichTextContent value={step.statusReason} fallback="" compact />
                  </div>
                ) : null}
                {onApprovalDecision && role && isActionableWorkflowStep(step) ? (
                  isApprovalVisibleForRole(role, step) ? (
                    <div className="workflow-step-actions">
                      <RichTextEditor
                        label="Decision note / clarification question"
                        value={decisionNotes[step.id] ?? ""}
                        onChange={(value) =>
                          setDecisionNotes((current) => ({
                            ...current,
                            [step.id]: value
                          }))
                        }
                        placeholder="Add approval reason, rejection reason, or question."
                        rows={3}
                      />
                      <div className="workflow-step-action-row">
                        <button className="primary-button" type="button" onClick={() => submitStepDecision(step.id, "approve")}>
                          <TegelIcon name="tick" size="16px" />
                          Approve
                        </button>
                        <button className="secondary-button" type="button" onClick={() => submitStepDecision(step.id, "clarification")}>
                          <TegelIcon name="message" size="16px" />
                          Need clarification
                        </button>
                        <button className="secondary-button danger-button" type="button" onClick={() => submitStepDecision(step.id, "reject")}>
                          <TegelIcon name="cross" size="16px" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="workflow-step-role-hint">
                      This gate belongs to {getConfigRoleLabel(config, step.ownerRole)}. Switch role or assign acting responsibility to decide it.
                    </p>
                  )
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ClarificationPanel({
  ticket,
  config = adminConfig,
  expanded = false,
  embedded = false,
  role,
  onCreateClarification,
  onReply
}: {
  ticket: Ticket;
  config?: AdminConfig;
  expanded?: boolean;
  embedded?: boolean;
  role?: RoleKey;
  onCreateClarification?: (ticketKey: string, input: NewClarificationThreadInput) => void;
  onReply?: (ticketKey: string, threadId: string, body: string) => void;
}) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyTargetByGroup, setReplyTargetByGroup] = useState<Record<string, string>>({});
  const [requestDraft, setRequestDraft] = useState<NewClarificationThreadInput>(() =>
    createDefaultPullInRequest(config, role)
  );
  const clarifications = ticket.clarifications;
  const clarificationGroups = useMemo(() => buildClarificationThreadGroups(ticket), [ticket]);
  const pullInRoleOptions = useMemo(
    () => getPullInRoleOptions(config, requestDraft.actionType),
    [config, requestDraft.actionType]
  );
  const canWrite = Boolean(role && (onReply || onCreateClarification));
  const selectedPullInAction = getPullInActionOption(requestDraft.actionType);
  const pullInSubmitLabel =
    requestDraft.actionType === "clarification"
      ? "Create clarification"
      : requestDraft.actionType === "inform"
        ? "Send information"
        : `Request ${selectedPullInAction.label.toLowerCase()}`;

  useEffect(() => {
    if (!pullInRoleOptions.some((option) => option.key === requestDraft.targetRole)) {
      const nextTargetRole = getDefaultPullInRole(config, role, requestDraft.actionType);

      setRequestDraft((current) => ({
        ...current,
        targetRole: nextTargetRole,
        assignedTo: getConfigRoleLabel(config, nextTargetRole)
      }));
    }
  }, [config, pullInRoleOptions, requestDraft.actionType, requestDraft.targetRole, role]);

  return (
    <section className={embedded ? "embedded-section" : "panel clarification-panel"}>
      <PanelHeader
        title="Clarification threads"
        description={`${clarificationGroups.length} section${clarificationGroups.length === 1 ? "" : "s"} · ${clarifications.length} request${clarifications.length === 1 ? "" : "s"}`}
        iconName="message"
      />
      <div className={`thread-list ${expanded ? "is-expanded" : ""}`}>
        {clarificationGroups.length === 0 ? (
          <EmptyState
            title="No active clarifications"
            body="Approvers can request structured questions without losing approval context."
          />
        ) : (
          clarificationGroups.map((group) => {
            const replyTargetThreads = [...group.threads].sort((left, right) => {
              const leftNeedsAttention = role ? clarificationNeedsRoleAttention(left, role) : left.status !== "answered";
              const rightNeedsAttention = role ? clarificationNeedsRoleAttention(right, role) : right.status !== "answered";

              if (leftNeedsAttention !== rightNeedsAttention) {
                return leftNeedsAttention ? -1 : 1;
              }

              return getClarificationThreadUpdatedAt(right) - getClarificationThreadUpdatedAt(left);
            });
            const selectedThread =
              replyTargetThreads.find((thread) => thread.id === replyTargetByGroup[group.id]) ?? replyTargetThreads[0];
            const requesterRoles = Array.from(new Set(group.threads.map((thread) => getClarificationRequesterRole(thread))));
            const selectedThreadRequesterRole = selectedThread ? getClarificationRequesterRole(selectedThread) : "";
            const selectedThreadLatestMessage = selectedThread ? getLastClarificationMessage(selectedThread) : undefined;
            const selectedThreadRoleToneClass = selectedThreadRequesterRole ? getRoleToneClass(selectedThreadRequesterRole) : "";
            const displayedThread = selectedThread ?? group.threads[0];
            const displayedQuestion = displayedThread
              ? getClarificationDisplayBody(displayedThread, displayedThread.question)
              : "";
            const visibleTimelineEntries = group.timeline.filter(
              (entry) => !isDuplicateInitialClarificationMessage(entry.thread, entry.message)
            );

            return (
              <article className="thread-row" key={group.id}>
                <div className="thread-topline">
                  <span>{group.level}</span>
                  <span className={`thread-state thread-${group.status}`}>{group.status}</span>
                </div>
                <div className="thread-question">
                  <RichTextContent
                    value={displayedQuestion}
                    fallback="Clarification question not provided."
                    compact
                  />
                </div>
                <p>
                  {group.threads.length} request{group.threads.length === 1 ? "" : "s"} · due {formatDateTimeDisplay(group.dueAt)}
                </p>
                {requesterRoles.length > 0 ? (
                  <div className="thread-role-list" aria-label="Clarification requester roles">
                    {requesterRoles.map((requesterRole) => {
                      const roleToneClass = getRoleToneClass(requesterRole);

                      return (
                        <span className={`role-color-chip ${roleToneClass}`} key={requesterRole}>
                          Asked by {requesterRole}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {expanded && visibleTimelineEntries.length > 0 ? (
                  <div className="clarification-timeline" role="list">
                    {visibleTimelineEntries.map((entry) => {
                      const roleToneClass = getRoleToneClass(entry.message.role);
                      const actionLabel = getClarificationMessageActionLabel(entry.thread, entry.message);
                      const isRequestMessage = actionLabel === "Asked by";

                      return (
                        <div
                          className={`message-row clarification-timeline-item ${
                            isRequestMessage ? "message-row-request" : "message-row-answer"
                          } ${roleToneClass}`}
                          key={`${entry.thread.id}-${entry.message.id}`}
                          role="listitem"
                        >
                          <div className="message-row-header">
                            <div className="message-author-stack">
                              <strong>{entry.message.author}</strong>
                              <span className={`role-color-chip ${roleToneClass}`}>
                                {actionLabel} {entry.message.role}
                              </span>
                            </div>
                            <span className="message-time">{formatClarificationTimestamp(entry.message.createdAt)}</span>
                          </div>
                          <RichTextContent
                            value={getClarificationDisplayBody(entry.thread, entry.message.body)}
                            fallback="No message body."
                            compact
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {expanded && onReply && selectedThread ? (
                  <form
                    className="thread-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onReply(ticket.key, selectedThread.id, replyDrafts[group.id] ?? "");
                      setReplyDrafts((currentDrafts) => ({ ...currentDrafts, [group.id]: "" }));
                    }}
                  >
                    {replyTargetThreads.length > 1 ? (
                      <div className="thread-reply-target-block">
                        <label className="form-field thread-reply-target">
                          <span>Reply target</span>
                          <select
                            value={selectedThread.id}
                            onChange={(event) =>
                              setReplyTargetByGroup((currentTargets) => ({
                                ...currentTargets,
                                [group.id]: event.target.value
                              }))
                            }
                          >
                            {replyTargetThreads.map((thread, index) => (
                              <option key={thread.id} value={thread.id}>
                                {getClarificationReplyTargetLabel(thread, index)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className={`reply-target-summary ${selectedThreadRoleToneClass}`} aria-live="polite">
                          <span className={`role-color-chip ${selectedThreadRoleToneClass}`}>
                            Asked by {selectedThreadRequesterRole}
                          </span>
                          <strong>{selectedThread.status}</strong>
                          <span>
                            Latest {selectedThreadLatestMessage?.role ?? selectedThreadRequesterRole} ·{" "}
                            {selectedThreadLatestMessage
                              ? formatClarificationTimestamp(selectedThreadLatestMessage.createdAt)
                              : selectedThread.dueAt}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <RichTextEditor
                      label="Reply to clarification"
                      value={replyDrafts[group.id] ?? ""}
                      onChange={(value) =>
                        setReplyDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [group.id]: value
                        }))
                      }
                      placeholder="Write your answer or add the missing information."
                      rows={3}
                    />
                    <div className="composer-actions">
                      <button className="primary-button" type="submit">
                        <TegelIcon name="send" size="16px" />
                        Send reply
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })
        )}
      </div>
      {canWrite && onCreateClarification ? (
        <form
          className="clarification-create-form admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateClarification(ticket.key, requestDraft);
            setRequestDraft(createDefaultPullInRequest(config, role, requestDraft.actionType));
          }}
        >
          <h3>Pull in role</h3>
          <div className="clarification-create-grid">
            <label className="form-field">
              <span>Action type</span>
              <select
                value={requestDraft.actionType}
                onChange={(event) => {
                  const actionType = event.target.value as PullInActionType;
                  const actionOption = getPullInActionOption(actionType);
                  const targetRole = getDefaultPullInRole(config, role, actionType);

                  setRequestDraft({
                    ...requestDraft,
                    actionType,
                    level: actionOption.level,
                    targetRole,
                    assignedTo: getConfigRoleLabel(config, targetRole)
                  });
                }}
              >
                {pullInActionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Role to pull in</span>
              <select
                value={requestDraft.targetRole}
                onChange={(event) => {
                  const targetRole = event.target.value as RoleKey;

                  setRequestDraft({
                    ...requestDraft,
                    targetRole,
                    assignedTo: getConfigRoleLabel(config, targetRole)
                  });
                }}
              >
                {pullInRoleOptions.map((roleOption) => (
                  <option key={roleOption.key} value={roleOption.key}>
                    {roleOption.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Request label</span>
              <input
                value={requestDraft.level}
                onChange={(event) => setRequestDraft({ ...requestDraft, level: event.target.value })}
                placeholder={selectedPullInAction.level}
              />
            </label>
            <AdminCheckbox
              checked={requestDraft.temporary}
              label="Temporary for this ticket"
              onChange={(temporary) => setRequestDraft({ ...requestDraft, temporary })}
            />
            <RichTextEditor
              label={requestDraft.actionType === "inform" ? "Message" : "Question / request"}
              value={requestDraft.question}
              onChange={(value) => setRequestDraft({ ...requestDraft, question: value })}
              placeholder="Describe why this role is needed and what action is expected."
              rows={3}
            />
          </div>
          <div className="composer-actions">
            <button className="primary-button" type="submit">
              <TegelIcon name="message" size="16px" />
              {pullInSubmitLabel}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function JiraWorkspace({
  config,
  tickets,
  selectedTicket,
  selectedTicketKey,
  role,
  selectedPersona,
  onCreateJira,
  onPostJiraComment,
  onReopenTicket,
  onSelectTicket,
  onUpdateJiraDraft,
  onUpdateJiraIssue,
  onUpdateJiraLink,
  onUpdateJiraStatus,
  onSyncJiraActivity
}: {
  config: AdminConfig;
  tickets: Ticket[];
  selectedTicket?: Ticket;
  selectedTicketKey: string;
  role: RoleKey;
  selectedPersona: RolePersonaOption;
  onCreateJira: CreateJiraHandler;
  onPostJiraComment: PostJiraCommentHandler;
  onReopenTicket: (ticketKey: string) => void;
  onSelectTicket: (ticketKey: string) => void;
  onUpdateJiraDraft: (ticketKey: string, draftUpdate: JiraDraftUpdateInput) => void;
  onUpdateJiraIssue: UpdateJiraIssueHandler;
  onUpdateJiraLink: UpdateJiraLinkHandler;
  onUpdateJiraStatus: UpdateJiraStatusHandler;
  onSyncJiraActivity: SyncJiraActivityHandler;
}) {
  const readyTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => canCreateJiraForTicket(ticket))
        .sort((left, right) => parseTicketTimestamp(right.updatedAt) - parseTicketTimestamp(left.updatedAt)),
    [tickets]
  );
  const followUpTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.relatedJiraKey)
        .sort((left, right) => parseTicketTimestamp(right.updatedAt) - parseTicketTimestamp(left.updatedAt)),
    [tickets]
  );
  const queueTicketKeys = useMemo(
    () => new Set([...readyTickets, ...followUpTickets].map((ticket) => ticket.key)),
    [followUpTickets, readyTickets]
  );
  const activeTicket =
    selectedTicket && queueTicketKeys.has(selectedTicket.key)
      ? selectedTicket
      : readyTickets[0] ?? followUpTickets[0];

  useEffect(() => {
    if (activeTicket && selectedTicketKey !== activeTicket.key) {
      onSelectTicket(activeTicket.key);
    }
  }, [activeTicket, onSelectTicket, selectedTicketKey]);

  function renderQueueRow(ticket: Ticket, label: string) {
    const isSelected = activeTicket?.key === ticket.key;

    return (
      <button
        className={`jira-queue-row ${isSelected ? "is-selected" : ""}`}
        key={ticket.key}
        type="button"
        onClick={() => onSelectTicket(ticket.key)}
      >
        <span className="jira-queue-main">
          <strong>{ticket.key}</strong>
          <span>{ticket.title}</span>
          <small>{[ticket.product, ticket.pru, ticket.module].filter(Boolean).join(" - ")}</small>
        </span>
        <span className="jira-queue-state">
          <span>{label}</span>
          <small>{ticket.jiraDraft.project || "No project"}</small>
        </span>
      </button>
    );
  }

  return (
    <div className="jira-workspace">
      <section className="panel jira-handoff-queue">
        <PanelHeader
          title="Ready for Jira creation"
          description="Approved portal tickets waiting for Jira issue creation."
          iconName="route"
        />
        <div className="jira-queue-list" role="list">
          {readyTickets.length === 0 ? (
            <EmptyState
              title="No tickets ready"
              body="Tickets appear here after all required workflow gates are completed."
            />
          ) : null}
          {readyTickets.map((ticket) => renderQueueRow(ticket, "Ready to create"))}
        </div>
        {followUpTickets.length > 0 ? (
          <>
            <h3 className="jira-queue-subtitle">Jira follow-up</h3>
            <div className="jira-queue-list" role="list">
              {followUpTickets.map((ticket) =>
                renderQueueRow(ticket, getJiraFollowUpStatusLabel(getTicketJiraFollowUpStatus(ticket)))
              )}
            </div>
          </>
        ) : null}
      </section>
      {activeTicket ? (
        <div className="jira-workspace-detail">
          <JiraSyncPanel
            ticket={activeTicket}
            config={config}
            canManageJiraActions={canManageJiraForTicket(config, selectedPersona, activeTicket)}
            expanded
            onCreateJira={onCreateJira}
            onPostJiraComment={onPostJiraComment}
            onReopenTicket={onReopenTicket}
            onUpdateJiraDraft={onUpdateJiraDraft}
            onUpdateJiraIssue={onUpdateJiraIssue}
            onUpdateJiraLink={onUpdateJiraLink}
            onUpdateJiraStatus={onUpdateJiraStatus}
            onSyncJiraActivity={onSyncJiraActivity}
            role={role}
            surface="sync"
          />
          <WorkflowPanel ticket={activeTicket} config={config} />
        </div>
      ) : (
        <WorkspaceEmptyPanel />
      )}
    </div>
  );
}

type JiraSyncPanelSurface = "ticket" | "sync";

function JiraSyncPanel({
  ticket,
  config,
  canManageJiraActions = false,
  expanded = false,
  embedded = false,
  role,
  surface = "sync",
  onCreateJira,
  onPostJiraComment,
  onReopenTicket,
  onUpdateJiraDraft,
  onUpdateJiraIssue,
  onUpdateJiraLink,
  onUpdateJiraStatus,
  onSyncJiraActivity
}: {
  ticket: Ticket;
  config: AdminConfig;
  canManageJiraActions?: boolean;
  expanded?: boolean;
  embedded?: boolean;
  role?: RoleKey;
  surface?: JiraSyncPanelSurface;
  onCreateJira?: CreateJiraHandler;
  onPostJiraComment?: PostJiraCommentHandler;
  onReopenTicket?: (ticketKey: string) => void;
  onUpdateJiraDraft?: (ticketKey: string, draftUpdate: JiraDraftUpdateInput) => void;
  onUpdateJiraIssue?: UpdateJiraIssueHandler;
  onUpdateJiraLink?: UpdateJiraLinkHandler;
  onUpdateJiraStatus?: UpdateJiraStatusHandler;
  onSyncJiraActivity?: SyncJiraActivityHandler;
}) {
  const draft = ticket.jiraDraft;
  const followUpStatus = getTicketJiraFollowUpStatus(ticket);
  const [statusDraft, setStatusDraft] = useState<SelectableJiraFollowUpStatus>(
    getSelectableJiraFollowUpStatus(followUpStatus)
  );
  const [followUpNote, setFollowUpNote] = useState("");
  const [draftForm, setDraftForm] = useState<JiraDraftFormState>(() => getJiraDraftFormState(ticket));
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saved">("idle");
  const [jiraCreateState, setJiraCreateState] = useState<"idle" | "creating">("idle");
  const [jiraCreateError, setJiraCreateError] = useState("");
  const [jiraUpdateState, setJiraUpdateState] = useState<"idle" | "updating">("idle");
  const [jiraUpdateError, setJiraUpdateError] = useState("");
  const [jiraUpdateSuccess, setJiraUpdateSuccess] = useState("");
  const [jiraStatusSyncState, setJiraStatusSyncState] = useState<"idle" | "syncing">("idle");
  const [jiraStatusSyncError, setJiraStatusSyncError] = useState("");
  const [jiraStatusSyncSuccess, setJiraStatusSyncSuccess] = useState("");
  const [jiraCommentDraft, setJiraCommentDraft] = useState("");
  const [jiraCommentState, setJiraCommentState] = useState<"idle" | "posting">("idle");
  const [jiraCommentError, setJiraCommentError] = useState("");
  const [jiraCommentSuccess, setJiraCommentSuccess] = useState("");
  const [isJiraLinkStale, setIsJiraLinkStale] = useState(false);
  const [jiraLinkDraft, setJiraLinkDraft] = useState(ticket.relatedJiraKey ?? "");
  const [jiraLinkState, setJiraLinkState] = useState<"idle" | "saving">("idle");
  const [jiraLinkError, setJiraLinkError] = useState("");
  const [jiraLinkSuccess, setJiraLinkSuccess] = useState("");
  const [isJiraLinkCorrectionOpen, setIsJiraLinkCorrectionOpen] = useState(false);
  const [jiraFieldMetadata, setJiraFieldMetadata] = useState<JiraFieldMetadata>(emptyJiraFieldMetadata);
  const isJiraSyncSurface = surface === "sync";
  const canCreateJira = canCreateJiraForTicket(ticket);
  const canReplaceJira = canReplaceJiraForTicket(ticket);
  const canManageJira = Boolean(
    isJiraSyncSurface &&
      canManageJiraActions &&
      canOperateJira(role) &&
      (
        onCreateJira ||
        onUpdateJiraIssue ||
        onUpdateJiraStatus ||
        onUpdateJiraDraft ||
        onUpdateJiraLink
      )
  );
  const canEditJiraDraft = Boolean(canManageJira && onUpdateJiraDraft);
  const canPostJiraComment = Boolean(ticket.relatedJiraKey && onPostJiraComment);
  const shouldLoadJiraMetadata = isJiraSyncSurface && (canEditJiraDraft || canReplaceJira || Boolean(ticket.relatedJiraKey));
  const canReopenTicket = Boolean(role && onReopenTicket && canReopenTicketForRole(ticket, role));
  const productProjectKey = getConfigProduct(config, ticket.product)?.jiraProjectKey;
  const metadataProjectKey =
    getValidJiraProjectKey(draftForm.project) ||
    getValidJiraProjectKey(draft.project) ||
    getValidJiraProjectKey(productProjectKey) ||
    getValidJiraProjectKey(config.integrations.jira.defaultProjectKey);
  const generatedJiraDescription = useMemo(() => getGeneratedTicketJiraDescription(ticket), [ticket]);
  const jiraSummaryPreview = canEditJiraDraft
    ? draftForm.summary.trim() || getTicketJiraSummary(ticket)
    : getTicketJiraSummary(ticket);
  const jiraDescriptionPreview = canEditJiraDraft
    ? composeJiraDescription(draftForm.description.trim() || generatedJiraDescription, draftForm.releaseNote)
    : getTicketJiraDescription(ticket);
  const selectedComponents = parseCommaSeparatedValues(draftForm.components);
  const shouldValidateComponents = jiraFieldMetadata.status === "ready";
  const componentMetadataOptions = shouldValidateComponents ? jiraFieldMetadata.components : undefined;
  const priorityMetadataOptions = jiraFieldMetadata.status === "ready" ? jiraFieldMetadata.priorities : undefined;
  const selectedValidComponents = componentMetadataOptions
    ? getValidJiraMetadataSelections(selectedComponents, componentMetadataOptions)
    : selectedComponents;
  const selectedInvalidComponents = componentMetadataOptions
    ? getInvalidJiraMetadataSelections(selectedComponents, componentMetadataOptions)
    : [];
  const selectedComponent = selectedValidComponents[0] ?? "";
  const configuredModule = getConfigModuleForTicket(config, ticket.product, ticket.pru, ticket.module);
  const configuredJiraComponent = configuredModule?.jiraComponent?.trim();
  const configuredModuleLabels =
    getConfigProduct(config, ticket.product)
      ?.prus.find((pru) => pru.active && pru.name.trim().toLowerCase() === ticket.pru.trim().toLowerCase())
      ?.modules.filter((module) => module.active)
      .map((module) => toJiraLabelValue(module.name))
      .filter(Boolean) ?? [];
  const selectedLabels = parseCommaSeparatedValues(draftForm.labels);
  const ticketModuleLabel = toJiraLabelValue(ticket.module);
  const selectedLabel = selectedLabels[0] || ticketModuleLabel;
  const selectedBoard = jiraFieldMetadata.boards.find(
    (board) => board.name.toLowerCase() === draftForm.board.trim().toLowerCase()
  );
  const availableSprints = selectedBoard
    ? jiraFieldMetadata.sprints.filter((sprint) => sprint.boardId === selectedBoard.id)
    : jiraFieldMetadata.sprints;
  const projectOptions = getUniqueOptionValues([
    getValidJiraProjectKey(draftForm.project),
    getValidJiraProjectKey(draft.project),
    jiraFieldMetadata.project?.key,
    productProjectKey,
    config.integrations.jira.defaultProjectKey
  ]);
  const boardOptions = getUniqueOptionValues([
    draftForm.board,
    ...jiraFieldMetadata.boards.map((board) => board.name)
  ]);
  const backlogOptions = getJiraBacklogOptions(draftForm.board, draftForm.backlog);
  const sprintOptions = getUniqueOptionValues([
    draftForm.sprint,
    ...availableSprints.map((sprint) => sprint.name)
  ]);
  const fixVersionOptions = getUniqueOptionValues([
    draftForm.fixVersion,
    ...getJiraMetadataNames(jiraFieldMetadata.versions)
  ]);
  const selectedFixVersionMetadata = getJiraVersionMetadataByName(jiraFieldMetadata.versions, draftForm.fixVersion);
  const selectedFixVersionStartDate = formatReleaseDate(
    draftForm.fixVersionStartDate || selectedFixVersionMetadata?.startDate || selectedFixVersionMetadata?.userStartDate
  );
  const selectedFixVersionReleaseDate = formatReleaseDate(
    draftForm.fixVersionReleaseDate || selectedFixVersionMetadata?.releaseDate || selectedFixVersionMetadata?.userReleaseDate
  );
  const selectedFixVersionStartDateDisplay = formatReleaseDateDisplay(selectedFixVersionStartDate);
  const selectedFixVersionReleaseDateDisplay = formatReleaseDateDisplay(selectedFixVersionReleaseDate);
  const selectedPriority = getJiraPriorityName(draftForm.priority || ticket.priority, priorityMetadataOptions);
  const priorityOptions = priorityMetadataOptions?.length
    ? getJiraMetadataNames(priorityMetadataOptions)
    : getUniqueOptionValues([
        selectedPriority,
        draftForm.priority,
        ticket.priority,
        ...config.priorities.filter((priority) => priority.active).map((priority) => priority.label)
      ]);
  const assigneeOptions = getUniqueOptionValues([
    draftForm.assignee,
    ...jiraFieldMetadata.assignableUsers.filter((user) => user.active).map((user) => user.name)
  ]);
  const componentOptions = getUniqueOptionValues([
    selectedComponent,
    ...(componentMetadataOptions ? [] : selectedComponents),
    configuredJiraComponent,
    ...getJiraMetadataNames(jiraFieldMetadata.components)
  ]);
  const labelOptions = getUniqueOptionValues([
    selectedLabel,
    ticketModuleLabel,
    ...configuredModuleLabels
  ]);
  const fields = [
    ["Project", draft.project],
    ["Board", draft.board],
    ["Backlog", draft.backlog],
    ["Sprint", draft.sprint ?? "Not selected"],
    ["Fix Version", draft.fixVersion ?? "Not selected"],
    ["Start date", formatReleaseDateDisplay(draft.fixVersionStartDate) || "Not selected"],
    ["Release date", formatReleaseDateDisplay(draft.fixVersionReleaseDate) || "Not selected"],
    ["Priority", draft.priority],
    ["Estimate", draft.estimateHours ? `${draft.estimateHours}h` : "Pending"],
    ["Story Points", draft.storyPoints ? String(draft.storyPoints) : "Pending"],
    ["Assignee", draft.assignee ?? "Unassigned"]
  ];
  const currentJiraStatusName = getJiraStatusDisplayName(ticket, followUpStatus);
  const jiraStatusTimelineSteps = getJiraStatusTimelineSteps(
    jiraFieldMetadata.statuses,
    currentJiraStatusName,
    followUpStatus
  );
  const importedJiraComments = ticket.comments
    .filter((comment) => comment.source === "jira" && comment.id.includes("-jira-import-"))
    .sort((left, right) => parseTicketTimestamp(right.createdAt) - parseTicketTimestamp(left.createdAt));

  useEffect(() => {
    setStatusDraft(getSelectableJiraFollowUpStatus(followUpStatus));
    setFollowUpNote("");
    setDraftForm(getJiraDraftFormState(ticket));
    setJiraCreateState("idle");
    setJiraCreateError("");
    setJiraUpdateState("idle");
    setJiraUpdateError("");
    setJiraUpdateSuccess("");
    setJiraStatusSyncState("idle");
    setJiraStatusSyncError("");
    setJiraStatusSyncSuccess("");
    setJiraCommentState("idle");
    setIsJiraLinkStale(false);
    setJiraLinkDraft(ticket.relatedJiraKey ?? "");
    setJiraLinkState("idle");
    setJiraLinkError("");
    setJiraLinkSuccess("");
    setIsJiraLinkCorrectionOpen(false);
  }, [followUpStatus, ticket]);

  useEffect(() => {
    setDraftSaveState("idle");
    setJiraCommentDraft("");
    setJiraCommentState("idle");
    setJiraCommentError("");
    setJiraCommentSuccess("");
  }, [ticket.key]);

  useEffect(() => {
    const integration = config.integrations.jira;

    if (!shouldLoadJiraMetadata) {
      setJiraFieldMetadata(emptyJiraFieldMetadata);
      return;
    }

    if (!integration.enabled) {
      setJiraFieldMetadata({
        ...emptyJiraFieldMetadata,
        status: "unavailable",
        message: "Jira integration is disabled."
      });
      return;
    }

    if (!metadataProjectKey) {
      setJiraFieldMetadata({
        ...emptyJiraFieldMetadata,
        status: "unavailable",
        message: "Select a valid Jira project key before syncing dropdown values."
      });
      return;
    }

    const localToken = readLocalIntegrationSecrets().jiraToken?.trim() ?? "";

    if (!localToken) {
      setJiraFieldMetadata({
        ...emptyJiraFieldMetadata,
        status: "unavailable",
        message: integration.tokenConfigured
          ? "Jira metadata needs the token available in this browser. Open Admin > Integrations and paste the token to refresh dropdowns."
          : "Configure a Jira token in Admin > Integrations to load live dropdown values."
      });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setJiraFieldMetadata({
      ...emptyJiraFieldMetadata,
      status: "loading",
      message: `Loading Jira dropdown values for ${metadataProjectKey}...`
    });

    async function loadJiraFieldMetadata() {
      try {
        const response = await fetch("/api/integrations/jira/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            config: {
              enabled: integration.enabled,
              apiBaseUrl: integration.apiBaseUrl,
              apiVersion: integration.apiVersion,
              authMode: integration.authMode,
              username: integration.username,
              token: localToken,
              defaultProjectKey: metadataProjectKey,
              defaultIssueType: integration.defaultIssueType
            }
          }),
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => null)) as
          | IntegrationApiErrorPayload
          | JiraSyncMetadataPayload
          | null;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setJiraFieldMetadata({
            ...emptyJiraFieldMetadata,
            status: "error",
            message: formatIntegrationApiError(payload as IntegrationApiErrorPayload | null, "Could not load Jira dropdown values.")
          });
          return;
        }

        const data = (payload as JiraSyncMetadataPayload | null)?.data;

        setJiraFieldMetadata({
          status: "ready",
          message: `Loaded Jira dropdown values for ${data?.project?.key ?? metadataProjectKey}.`,
          warnings: data?.warnings ?? [],
          project: data?.project,
          components: data?.components ?? [],
          versions: data?.versions ?? [],
          priorities: data?.priorities ?? [],
          statuses: data?.statuses ?? [],
          boards: data?.boards ?? [],
          sprints: data?.sprints ?? [],
          assignableUsers: data?.assignableUsers ?? []
        });
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        setJiraFieldMetadata({
          ...emptyJiraFieldMetadata,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown Jira metadata load failure."
        });
      }
    }

    void loadJiraFieldMetadata();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    config.integrations.jira,
    config.integrations.jira.apiBaseUrl,
    config.integrations.jira.apiVersion,
    config.integrations.jira.authMode,
    config.integrations.jira.defaultIssueType,
    config.integrations.jira.enabled,
    config.integrations.jira.tokenConfigured,
    config.integrations.jira.username,
    metadataProjectKey,
    shouldLoadJiraMetadata
  ]);

  useEffect(() => {
    if (jiraFieldMetadata.status !== "ready") {
      return;
    }

    setDraftForm((currentForm) => {
      if (
        !currentForm.fixVersion.trim() ||
        (currentForm.fixVersionStartDate.trim() && currentForm.fixVersionReleaseDate.trim())
      ) {
        return currentForm;
      }

      const versionMetadata = getJiraVersionMetadataByName(jiraFieldMetadata.versions, currentForm.fixVersion);
      const nextStartDate = currentForm.fixVersionStartDate.trim()
        ? currentForm.fixVersionStartDate
        : versionMetadata?.startDate || versionMetadata?.userStartDate || "";
      const nextReleaseDate = currentForm.fixVersionReleaseDate.trim()
        ? currentForm.fixVersionReleaseDate
        : versionMetadata?.releaseDate || versionMetadata?.userReleaseDate || "";

      return nextStartDate || nextReleaseDate
        ? {
            ...currentForm,
            fixVersionStartDate: nextStartDate,
            fixVersionReleaseDate: nextReleaseDate
          }
        : currentForm;
    });
  }, [jiraFieldMetadata.status, jiraFieldMetadata.versions]);

  function updateDraftForm(field: keyof JiraDraftFormState, value: string) {
    setDraftForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
    setDraftSaveState("idle");
    setJiraUpdateError("");
    setJiraUpdateSuccess("");
    setJiraStatusSyncError("");
    setJiraStatusSyncSuccess("");
    setJiraCommentError("");
    setJiraCommentSuccess("");
  }

  function updateFixVersion(value: string) {
    const versionMetadata = getJiraVersionMetadataByName(jiraFieldMetadata.versions, value);

    setDraftForm((currentForm) => ({
      ...currentForm,
      fixVersion: value,
      fixVersionStartDate: versionMetadata?.startDate ?? versionMetadata?.userStartDate ?? "",
      fixVersionReleaseDate: versionMetadata?.releaseDate ?? versionMetadata?.userReleaseDate ?? ""
    }));
    setDraftSaveState("idle");
    setJiraUpdateError("");
    setJiraUpdateSuccess("");
    setJiraStatusSyncError("");
    setJiraStatusSyncSuccess("");
    setJiraCommentError("");
    setJiraCommentSuccess("");
  }

  function saveJiraDraft() {
    if (!onUpdateJiraDraft) {
      return;
    }

    onUpdateJiraDraft(ticket.key, getJiraDraftUpdateInput(draftForm, componentMetadataOptions, priorityMetadataOptions));
    setDraftSaveState("saved");
  }

  async function createJiraFromDraft(replaceExisting = false) {
    if (!onCreateJira) {
      return;
    }

    setJiraCreateState("creating");
    setJiraCreateError("");
    setJiraStatusSyncError("");
    setJiraStatusSyncSuccess("");
    setJiraUpdateError("");
    setJiraUpdateSuccess("");
    setJiraCommentError("");
    setJiraCommentSuccess("");

    try {
      await onCreateJira(
        ticket.key,
        getJiraDraftUpdateInput(draftForm, componentMetadataOptions, priorityMetadataOptions),
        { replaceExisting }
      );
      setIsJiraLinkStale(false);
    } catch (error) {
      setJiraCreateError(getErrorMessage(error));
    } finally {
      setJiraCreateState("idle");
    }
  }

  async function updateJiraIssueFromDraft() {
    if (!onUpdateJiraIssue || !ticket.relatedJiraKey) {
      return;
    }

    setJiraUpdateState("updating");
    setJiraUpdateError("");
    setJiraUpdateSuccess("");
    setJiraStatusSyncError("");
    setJiraStatusSyncSuccess("");

    try {
      await onUpdateJiraIssue(
        ticket.key,
        getJiraDraftUpdateInput(draftForm, componentMetadataOptions, priorityMetadataOptions)
      );
      setDraftSaveState("saved");
      setIsJiraLinkStale(false);
      setJiraUpdateSuccess(`Jira issue ${getValidJiraIssueKey(ticket.relatedJiraKey) || ticket.relatedJiraKey} updated.`);
    } catch (error) {
      if (getIntegrationActionErrorCode(error) === "jira_issue_not_found") {
        const staleJiraKey = getValidJiraIssueKey(ticket.relatedJiraKey) || ticket.relatedJiraKey;
        setIsJiraLinkStale(true);
        setJiraUpdateError(
          `Jira issue ${staleJiraKey} was not found in Jira. Create a new Jira issue to replace this invalid link.`
        );
      } else {
        setJiraUpdateError(getErrorMessage(error));
      }
    } finally {
      setJiraUpdateState("idle");
    }
  }

  async function syncJiraStatusFromRemote() {
    if (!onSyncJiraActivity || !ticket.relatedJiraKey) {
      return;
    }

    const jiraIssueKey = getValidJiraIssueKey(ticket.relatedJiraKey);

    if (!jiraIssueKey) {
      setJiraStatusSyncError("Link the portal ticket to a valid Jira issue before syncing Jira status.");
      return;
    }

    const localJiraToken = readLocalIntegrationSecrets().jiraToken?.trim() ?? "";

    if (!localJiraToken) {
      setJiraStatusSyncError(
        config.integrations.jira.tokenConfigured
          ? "Jira token is not available in this browser. Open Admin > Integrations and paste the token before syncing Jira status."
          : "Configure a Jira token in Admin > Integrations before syncing Jira status."
      );
      return;
    }

    setJiraStatusSyncState("syncing");
    setJiraStatusSyncError("");
    setJiraStatusSyncSuccess("");
    setJiraUpdateError("");
    setJiraUpdateSuccess("");

    try {
      const response = await fetch("/api/integrations/jira/issue-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: buildTicketJiraActionConfig(ticket, draft, config, localJiraToken),
          issueKey: jiraIssueKey
        })
      });
      const payload = (await response.json().catch(() => null)) as JiraCreateTaskPayload | null;

      if (!response.ok) {
        throw createIntegrationActionError(
          payload as IntegrationApiErrorPayload | null,
          "Jira status sync failed."
        );
      }

      const jiraIssueStatus = (payload as { data?: { jiraStatus?: JiraIssueStatusDetails } } | null)?.data?.jiraStatus;
      const jiraComments = (payload as { data?: { comments?: JiraSyncedCommentInput[] } } | null)?.data?.comments ?? [];
      const jiraIssueFields = (payload as { data?: { issueFields?: JiraSyncedIssueFieldsInput } } | null)?.data?.issueFields;
      const warnings = (payload as { data?: { warnings?: string[] } } | null)?.data?.warnings ?? [];
      const nextFollowUpStatus = getJiraFollowUpStatusFromIssueStatus(jiraIssueStatus, followUpStatus);
      const jiraStatusSummary = getJiraIssueStatusSummary(jiraIssueStatus);
      const syncedJiraFieldSummary = formatSyncedJiraFieldSummary(getSyncedJiraDraftFieldUpdate(jiraIssueFields));
      const nextFollowUpLabel = getJiraFollowUpStatusLabel(nextFollowUpStatus);
      const syncResult = onSyncJiraActivity(
        ticket.key,
        nextFollowUpStatus,
        [`Synced from Jira. Jira status: ${jiraStatusSummary}.`, syncedJiraFieldSummary].filter(Boolean).join(" "),
        jiraComments,
        jiraIssueStatus?.name,
        jiraIssueFields
      );

      const commentSummary = [
        syncResult.importedComments
          ? `${syncResult.importedComments} Jira comment${syncResult.importedComments === 1 ? "" : "s"} imported`
          : "",
        syncResult.updatedComments
          ? `${syncResult.updatedComments} Jira comment${syncResult.updatedComments === 1 ? "" : "s"} updated`
          : ""
      ].filter(Boolean).join("; ");
      const warningSummary = warnings.length > 0 ? ` ${warnings.join(" ")}` : "";

      setJiraStatusSyncSuccess(
        [
          syncResult.statusChanged
            ? `Synced Jira status ${jiraStatusSummary} to portal status ${nextFollowUpLabel}.`
            : syncResult.jiraStatusChanged
              ? `Synced Jira status ${jiraStatusSummary}.`
              : syncResult.jiraFieldsChanged
                ? "Synced Jira fields."
                : `Jira status already matches portal: ${nextFollowUpLabel}.`,
          syncResult.jiraFieldsChanged ? syncedJiraFieldSummary : "",
          commentSummary || "No new Jira comments.",
          warningSummary
        ].filter(Boolean).join(" ")
      );
      setIsJiraLinkStale(false);
    } catch (error) {
      if (getIntegrationActionErrorCode(error) === "jira_issue_not_found") {
        setIsJiraLinkStale(true);
      }

      setJiraStatusSyncError(getErrorMessage(error));
    } finally {
      setJiraStatusSyncState("idle");
    }
  }

  async function submitJiraComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onPostJiraComment || !ticket.relatedJiraKey) {
      return;
    }

    const trimmedComment = jiraCommentDraft.trim();

    if (!trimmedComment) {
      setJiraCommentError("Write a Jira comment before sending.");
      return;
    }

    setJiraCommentState("posting");
    setJiraCommentError("");
    setJiraCommentSuccess("");
    setJiraStatusSyncError("");
    setJiraStatusSyncSuccess("");

    try {
      await onPostJiraComment(ticket.key, trimmedComment);
      setJiraCommentDraft("");
      setJiraCommentSuccess("Jira comment added.");
      setIsJiraLinkStale(false);
    } catch (error) {
      if (getIntegrationActionErrorCode(error) === "jira_issue_not_found") {
        setIsJiraLinkStale(true);
      }

      setJiraCommentError(getErrorMessage(error));
    } finally {
      setJiraCommentState("idle");
    }
  }

  async function saveJiraIssueLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onUpdateJiraLink) {
      return;
    }

    setJiraLinkState("saving");
    setJiraLinkError("");
    setJiraLinkSuccess("");

    try {
      await onUpdateJiraLink(ticket.key, jiraLinkDraft);
      setJiraLinkSuccess("Jira link updated.");
      setIsJiraLinkStale(false);
      setIsJiraLinkCorrectionOpen(false);
    } catch (error) {
      setJiraLinkError(getErrorMessage(error));
    } finally {
      setJiraLinkState("idle");
    }
  }

  async function clearJiraIssueLink() {
    if (!onUpdateJiraLink) {
      return;
    }

    setJiraLinkState("saving");
    setJiraLinkError("");
    setJiraLinkSuccess("");

    try {
      await onUpdateJiraLink(ticket.key, "");
      setJiraLinkDraft("");
      setJiraLinkSuccess("Jira link cleared.");
      setIsJiraLinkStale(false);
      setIsJiraLinkCorrectionOpen(false);
    } catch (error) {
      setJiraLinkError(getErrorMessage(error));
    } finally {
      setJiraLinkState("idle");
    }
  }

  function submitFollowUpStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onUpdateJiraStatus || !ticket.relatedJiraKey) {
      return;
    }

    onUpdateJiraStatus(ticket.key, statusDraft, followUpNote);
    setFollowUpNote("");
  }

  return (
    <section className={embedded ? "embedded-section jira-panel" : "panel jira-panel"}>
      <PanelHeader
        title={isJiraSyncSurface ? "Jira preparation" : "Jira activity"}
        description={
          isJiraSyncSurface
            ? "Portal governance gates execution-layer Jira creation and synchronization."
            : "Read-only Jira issue details and comments for this ticket."
        }
        iconName="link"
      />
      <div className="jira-status-line">
        {jiraDraftStageOptions.map(
          (state) => (
            <span
              className={draft.status === state.value ? "is-current" : ""}
              key={state.value}
            >
              {state.label}
            </span>
          )
        )}
      </div>
      <div className="jira-follow-up-strip" aria-label="Jira status timeline">
        {jiraStatusTimelineSteps.map((option) => (
          <span
            className={`jira-follow-up-step tone-${option.tone} ${option.isCurrent ? "is-current" : ""}`}
            key={option.key}
            title={option.title || undefined}
          >
            {option.label}
          </span>
        ))}
      </div>
      <div className="jira-description-preview">
        <div>
          <span>Jira title / description preview</span>
          <strong>{jiraSummaryPreview}</strong>
        </div>
        <pre>{jiraDescriptionPreview}</pre>
      </div>
      {!canManageJira && ticket.relatedJiraKey && onSyncJiraActivity ? (
        <div className="jira-refresh-panel">
          <div>
            <span>Jira activity</span>
            <strong>
              <JiraIssueLink config={config} jiraKey={ticket.relatedJiraKey} />
            </strong>
            <small>Refresh status and import Jira comments into the support ticket.</small>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={jiraStatusSyncState === "syncing"}
            onClick={() => void syncJiraStatusFromRemote()}
          >
            <TegelIcon name="route" size="16px" />
            {jiraStatusSyncState === "syncing" ? "Syncing..." : "Refresh from Jira"}
          </button>
          {jiraStatusSyncError ? <p className="admin-form-error">{jiraStatusSyncError}</p> : null}
          {isJiraLinkStale ? (
            <p className="admin-hint">
              This linked Jira issue no longer exists. A Jira owner or admin can recreate the Jira issue from this
              ticket.
            </p>
          ) : null}
          {jiraStatusSyncSuccess ? <p className="admin-form-success">{jiraStatusSyncSuccess}</p> : null}
        </div>
      ) : null}
      {!canEditJiraDraft ? (
        <>
          <div className={`jira-fields jira-fields-compact ${expanded ? "is-expanded" : ""}`}>
            {fields.map(([label, value]) => (
              <div className="jira-field" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {expanded ? (
            <div className="jira-meta jira-meta-compact">
              <span>Components: {draft.components.join(", ") || "None"}</span>
              <span>Labels: {draft.labels.join(", ") || "None"}</span>
              {ticket.relatedJiraKey ? (
                <span>
                  Synced: <JiraIssueLink config={config} jiraKey={ticket.relatedJiraKey} />
                </span>
              ) : null}
              <span>Status: {getJiraFollowUpStatusLabel(followUpStatus)}</span>
            </div>
          ) : null}
        </>
      ) : null}
      {canPostJiraComment ? (
        <form className="jira-comment-form" onSubmit={submitJiraComment}>
          <label className="form-field form-field-wide">
            <span>Jira comment</span>
            <textarea
              rows={4}
              value={jiraCommentDraft}
              onChange={(event) => {
                setJiraCommentDraft(event.target.value);
                setJiraCommentError("");
                setJiraCommentSuccess("");
              }}
              placeholder="Write a comment to add directly to the linked Jira issue."
            />
            <small>Posted to Jira and shown in the imported Jira comments for this ticket.</small>
          </label>
          <div className="composer-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={jiraCommentState === "posting" || !jiraCommentDraft.trim()}
            >
              <TegelIcon name="send" size="16px" />
              {jiraCommentState === "posting" ? "Sending..." : "Add Jira comment"}
            </button>
          </div>
          {jiraCommentError ? <p className="admin-form-error">{jiraCommentError}</p> : null}
          {jiraCommentSuccess ? <p className="admin-form-success">{jiraCommentSuccess}</p> : null}
        </form>
      ) : null}
      <div className="jira-imported-comments">
        <div className="jira-imported-comments-header">
          <div>
            <span>Jira comments</span>
            <strong>
              {importedJiraComments.length === 0
                ? "No Jira comments imported yet"
                : `${importedJiraComments.length} imported`}
            </strong>
          </div>
          {ticket.relatedJiraKey ? (
            <JiraIssueLink config={config} jiraKey={ticket.relatedJiraKey} />
          ) : null}
        </div>
        {importedJiraComments.length === 0 ? (
          <p>
            {isJiraSyncSurface
              ? "Refresh from Jira to load comments from the linked Jira issue."
              : "No Jira comments have been imported for this linked issue yet."}
          </p>
        ) : (
          <div className="jira-imported-comments-list">
            {importedJiraComments.map((comment) => (
              <article className="jira-imported-comment" key={comment.id}>
                <div>
                  <strong>{comment.author}</strong>
                  <span>{formatTicketCommentTimestamp(comment.createdAt)}</span>
                </div>
                <JiraCommentContent value={comment.body} />
              </article>
            ))}
          </div>
        )}
      </div>
      {canEditJiraDraft ? (
        <>
          <div className={`jira-metadata-status status-${jiraFieldMetadata.status}`}>
            <span>{jiraFieldMetadata.message || "Dropdown values use the current ticket data until Jira metadata is loaded."}</span>
            {jiraFieldMetadata.warnings.length > 0 ? (
              <small>{jiraFieldMetadata.warnings.join(" ")}</small>
            ) : null}
          </div>
          <div className={`jira-draft-form ${expanded ? "is-expanded" : ""}`}>
          <label className="form-field form-field-wide">
            <span>Jira title</span>
            <input
              type="text"
              value={draftForm.summary}
              onChange={(event) => updateDraftForm("summary", event.target.value)}
              placeholder={ticket.title}
            />
            <small>Used as the Jira summary and release handoff title.</small>
          </label>
          <label className="form-field form-field-wide">
            <span>Jira description</span>
            <textarea
              rows={9}
              value={draftForm.description}
              onChange={(event) => updateDraftForm("description", event.target.value)}
              placeholder={generatedJiraDescription}
            />
            <small>Sent to the Jira description field. Defaults to the generated portal request summary.</small>
          </label>
          <label className="form-field form-field-wide">
            <span>Release note</span>
            <textarea
              rows={4}
              value={draftForm.releaseNote}
              onChange={(event) => updateDraftForm("releaseNote", event.target.value)}
              placeholder="Add the short release note or deployment summary."
            />
            <small>Appended to the Jira description under a Release note section.</small>
          </label>
          <label className="form-field">
            <span>Project</span>
            <select value={draftForm.project} onChange={(event) => updateDraftForm("project", event.target.value)}>
              <option value="">No project selected</option>
              {projectOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Board</span>
            <select value={draftForm.board} onChange={(event) => updateDraftForm("board", event.target.value)}>
              <option value="">No board selected</option>
              {boardOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Backlog</span>
            <select value={draftForm.backlog} onChange={(event) => updateDraftForm("backlog", event.target.value)}>
              <option value="">No backlog selected</option>
              {backlogOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Sprint</span>
            <select value={draftForm.sprint} onChange={(event) => updateDraftForm("sprint", event.target.value)}>
              <option value="">No sprint selected</option>
              {sprintOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Fix version</span>
            <select value={draftForm.fixVersion} onChange={(event) => updateFixVersion(event.target.value)}>
              <option value="">No fix version selected</option>
              {fixVersionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {selectedFixVersionMetadata ? (
              <small>
                {selectedFixVersionMetadata.released ? "Released" : "Unreleased"}
                {selectedFixVersionStartDateDisplay ? ` · starts ${selectedFixVersionStartDateDisplay}` : ""}
                {selectedFixVersionReleaseDateDisplay ? ` · ${selectedFixVersionReleaseDateDisplay}` : ""}
                {selectedFixVersionMetadata.archived ? " · Archived" : ""}
              </small>
            ) : (
              <small>Loaded versions come from Jira metadata.</small>
            )}
          </label>
          <label className="form-field">
            <span>Release start date</span>
            <input
              type="date"
              value={draftForm.fixVersionStartDate}
              onChange={(event) => updateDraftForm("fixVersionStartDate", event.target.value)}
            />
            <small>Used as the pre-prod date in Release Plan.</small>
          </label>
          <label className="form-field">
            <span>Release date</span>
            <input
              type="date"
              value={draftForm.fixVersionReleaseDate}
              onChange={(event) => updateDraftForm("fixVersionReleaseDate", event.target.value)}
            />
            <small>Used in the portal planned release step.</small>
          </label>
          <label className="form-field">
            <span>Priority</span>
            <select value={selectedPriority} onChange={(event) => updateDraftForm("priority", event.target.value)}>
              {priorityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Estimate hours</span>
            <input
              min="0"
              step="0.5"
              type="number"
              value={draftForm.estimateHours}
              onChange={(event) => updateDraftForm("estimateHours", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Story points</span>
            <input
              min="0"
              step="1"
              type="number"
              value={draftForm.storyPoints}
              onChange={(event) => updateDraftForm("storyPoints", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Assignee</span>
            <select value={draftForm.assignee} onChange={(event) => updateDraftForm("assignee", event.target.value)}>
              <option value="">Unassigned</option>
              {assigneeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Components</span>
            <select
              value={selectedComponent}
              onChange={(event) => updateDraftForm("components", event.target.value)}
            >
              <option value="">No component selected</option>
              {componentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {selectedInvalidComponents.length > 0 ? (
              <small className="form-warning">
                Not valid in Jira and will not be sent: {selectedInvalidComponents.join(", ")}.
              </small>
            ) : (
              <small>Values come from Jira metadata and the module&apos;s configured Jira component.</small>
            )}
          </label>
          <label className="form-field">
            <span>Label / module</span>
            <select value={selectedLabel} onChange={(event) => updateDraftForm("labels", event.target.value)}>
              {labelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          </div>
        </>
      ) : null}
      {canManageJira ? (
        <div className="jira-action-panel">
          <div className="jira-action-summary">
            <div>
              <span>Jira issue</span>
              <strong>
                <JiraIssueLink config={config} jiraKey={ticket.relatedJiraKey} />
              </strong>
            </div>
            <span className={`jira-follow-up-badge tone-${getJiraFollowUpStatusTone(followUpStatus)}`}>
              {getJiraFollowUpStatusLabel(followUpStatus)}
            </span>
          </div>
          {!ticket.relatedJiraKey ? (
            <>
              <div className="jira-draft-actions">
                {canEditJiraDraft ? (
                  <button className="secondary-button" type="button" onClick={saveJiraDraft}>
                    <TegelIcon name="save" size="16px" />
                    Save Jira fields
                  </button>
                ) : null}
                <button
                  className="primary-button"
                  type="button"
                  disabled={!canCreateJira || !onCreateJira || jiraCreateState === "creating"}
                  onClick={() => void createJiraFromDraft()}
                >
                  <TegelIcon name="link" size="16px" />
                  {jiraCreateState === "creating" ? "Creating..." : "Create Jira ticket"}
                </button>
              </div>
              {jiraCreateError ? <p className="admin-form-error">{jiraCreateError}</p> : null}
              {draftSaveState === "saved" ? (
                <p className="admin-hint">Jira fields saved for this portal ticket.</p>
              ) : null}
              {!canCreateJira ? (
                <p className="admin-hint">
                  Complete required workflow gates before creating the Jira issue.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="jira-draft-actions">
                {canEditJiraDraft ? (
                  <button className="secondary-button" type="button" onClick={saveJiraDraft}>
                    <TegelIcon name="save" size="16px" />
                    Save Jira fields
                  </button>
                ) : null}
                <button
                  className="primary-button"
                  type="button"
                  disabled={!onUpdateJiraIssue || jiraUpdateState === "updating"}
                  onClick={() => void updateJiraIssueFromDraft()}
                >
                  <TegelIcon name="save" size="16px" />
                  {jiraUpdateState === "updating" ? "Updating..." : "Update Jira issue"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!onSyncJiraActivity || jiraStatusSyncState === "syncing"}
                  onClick={() => void syncJiraStatusFromRemote()}
                >
                  <TegelIcon name="route" size="16px" />
                  {jiraStatusSyncState === "syncing" ? "Syncing..." : "Sync Jira status & comments"}
                </button>
              </div>
              {jiraUpdateError ? <p className="admin-form-error">{jiraUpdateError}</p> : null}
              {jiraStatusSyncError ? <p className="admin-form-error">{jiraStatusSyncError}</p> : null}
              {isJiraLinkStale ? (
                <div className="jira-stale-action">
                  <p className="admin-hint">
                    The linked Jira issue was not found. Recreate it to replace the invalid Jira link with a new issue.
                  </p>
                  <div className="jira-draft-actions">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!canReplaceJira || !onCreateJira || jiraCreateState === "creating"}
                      onClick={() => void createJiraFromDraft(true)}
                    >
                      <TegelIcon name="link" size="16px" />
                      {jiraCreateState === "creating" ? "Creating..." : "Recreate Jira issue"}
                    </button>
                  </div>
                  {!canReplaceJira ? (
                    <p className="admin-hint">
                      Complete required workflow gates before recreating the Jira issue.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {jiraCreateError ? <p className="admin-form-error">{jiraCreateError}</p> : null}
              {jiraUpdateSuccess ? <p className="admin-form-success">{jiraUpdateSuccess}</p> : null}
              {jiraStatusSyncSuccess ? <p className="admin-form-success">{jiraStatusSyncSuccess}</p> : null}
              {draftSaveState === "saved" ? (
                <p className="admin-hint">Jira fields saved for this portal ticket.</p>
              ) : null}
              <form className="jira-follow-up-form" onSubmit={submitFollowUpStatus}>
                <label className="form-field">
                  <span>Jira follow-up status</span>
                  <select
                    value={statusDraft}
                    onChange={(event) =>
                      setStatusDraft(event.target.value as SelectableJiraFollowUpStatus)
                    }
                  >
                    {jiraFollowUpStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <RichTextEditor
                  label="Follow-up note"
                  value={followUpNote}
                  onChange={setFollowUpNote}
                  placeholder="Capture Jira progress, blocker, test result, done note, or rejection reason."
                  rows={3}
                />
                <div className="composer-actions">
                  <button className="primary-button" type="submit" disabled={!onUpdateJiraStatus}>
                    <TegelIcon name="save" size="16px" />
                    Save Jira follow-up
                  </button>
                </div>
              </form>
              <div className="jira-link-correction">
                <div className="jira-draft-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!onUpdateJiraLink || jiraLinkState === "saving"}
                    onClick={() => {
                      setJiraLinkDraft(ticket.relatedJiraKey ?? "");
                      setJiraLinkError("");
                      setJiraLinkSuccess("");
                      setIsJiraLinkCorrectionOpen((isOpen) => !isOpen);
                    }}
                  >
                    <TegelIcon name="edit" size="16px" />
                      Edit Jira link
                    </button>
                </div>
                {isJiraLinkCorrectionOpen ? (
                  <form className="jira-link-correction-form" onSubmit={saveJiraIssueLink}>
                    <label className="form-field">
                      <span>Jira issue key or URL</span>
                      <input
                        value={jiraLinkDraft}
                        onChange={(event) => {
                          setJiraLinkDraft(event.target.value);
                          setJiraLinkError("");
                          setJiraLinkSuccess("");
                        }}
                        placeholder="NEXUS-1234 or Jira browse URL"
                      />
                    </label>
                    <div className="jira-draft-actions">
                      <button className="secondary-button" type="button" disabled={jiraLinkState === "saving"} onClick={() => void clearJiraIssueLink()}>
                        Clear link
                      </button>
                      <button className="primary-button" type="submit" disabled={!onUpdateJiraLink || jiraLinkState === "saving"}>
                        <TegelIcon name="save" size="16px" />
                        {jiraLinkState === "saving" ? "Saving..." : "Save Jira link"}
                      </button>
                    </div>
                  </form>
                ) : null}
                {jiraLinkError ? <p className="admin-form-error">{jiraLinkError}</p> : null}
                {jiraLinkSuccess ? <p className="admin-form-success">{jiraLinkSuccess}</p> : null}
              </div>
            </>
          )}
          {canReopenTicket ? (
            <div className="jira-reopen-action">
              <button className="secondary-button ticket-reopen-button" type="button" onClick={() => onReopenTicket?.(ticket.key)}>
                <TegelIcon name="history" size="16px" />
                Reopen ticket
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EscalationActionChecklist({
  items,
  emptyLabel = "No action items"
}: {
  items: EscalationActionItem[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="escalation-checklist-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="escalation-checklist" aria-label="Escalation action checklist">
      {items.map((item) => (
        <li className={item.done ? "is-done" : ""} key={item.id}>
          <input checked={item.done} readOnly type="checkbox" aria-label={item.label} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function EscalationActionChecklistEditor({
  items,
  onChange
}: {
  items: EscalationActionItemInput[];
  onChange: (items: EscalationActionItemInput[]) => void;
}) {
  const editableItems = items.length > 0 ? items : [createEmptyEscalationActionItemInput()];

  function updateItem(itemId: string, patch: Partial<EscalationActionItemInput>) {
    onChange(
      editableItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...patch
            }
          : item
      )
    );
  }

  function removeItem(itemId: string) {
    const nextItems = editableItems.filter((item) => item.id !== itemId);

    onChange(nextItems.length > 0 ? nextItems : [createEmptyEscalationActionItemInput()]);
  }

  return (
    <div className="escalation-checklist-editor form-field-wide">
      <div className="escalation-editor-heading">
        <span>Action checklist</span>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onChange([...editableItems, createEmptyEscalationActionItemInput()])}
        >
          <TegelIcon name="plus" size="16px" />
          Add action
        </button>
      </div>
      <div className="escalation-checklist-editor-list">
        {editableItems.map((item) => (
          <div className="escalation-checklist-editor-row" key={item.id}>
            <input
              checked={item.done}
              type="checkbox"
              aria-label={`Mark ${item.label || "action item"} done`}
              onChange={(event) => updateItem(item.id, { done: event.currentTarget.checked })}
            />
            <input
              value={item.label}
              onChange={(event) => updateItem(item.id, { label: event.currentTarget.value })}
              placeholder="Action item, owner, or follow-up"
            />
            <button
              className="icon-button quiet danger-button"
              type="button"
              aria-label="Remove action item"
              onClick={() => removeItem(item.id)}
            >
              <TegelIcon name="trash" size="16px" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EscalationPeopleEditor({
  people,
  onChange
}: {
  people: EscalationPersonInput[];
  onChange: (people: EscalationPersonInput[]) => void;
}) {
  const editablePeople = people.length > 0 ? people : [createEmptyEscalationPersonInput()];

  function updatePerson(personId: string, patch: Partial<EscalationPersonInput>) {
    onChange(
      editablePeople.map((person) =>
        person.id === personId
          ? {
              ...person,
              ...patch
            }
          : person
      )
    );
  }

  function removePerson(personId: string) {
    const nextPeople = editablePeople.filter((person) => person.id !== personId);

    onChange(nextPeople.length > 0 ? nextPeople : [createEmptyEscalationPersonInput()]);
  }

  return (
    <div className="escalation-people-editor form-field-wide">
      <div className="escalation-editor-heading">
        <span>People involved</span>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onChange([...editablePeople, createEmptyEscalationPersonInput()])}
        >
          <TegelIcon name="plus" size="16px" />
          Add person
        </button>
      </div>
      <div className="escalation-people-editor-list">
        {editablePeople.map((person) => (
          <div className="escalation-people-editor-row" key={person.id}>
            <label className="form-field">
              <span>Name</span>
              <input
                value={person.name}
                onChange={(event) => updatePerson(person.id, { name: event.currentTarget.value })}
                placeholder="Name"
              />
            </label>
            <label className="form-field">
              <span>Email</span>
              <input
                type="email"
                value={person.email}
                onChange={(event) => updatePerson(person.id, { email: event.currentTarget.value })}
                placeholder="name@example.com"
              />
            </label>
            <label className="form-field">
              <span>Role</span>
              <input
                value={person.role}
                onChange={(event) => updatePerson(person.id, { role: event.currentTarget.value })}
                placeholder="Manager, owner, architect"
              />
            </label>
            <button
              className="icon-button quiet danger-button"
              type="button"
              aria-label="Remove person"
              onClick={() => removePerson(person.id)}
            >
              <TegelIcon name="trash" size="16px" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EscalationPeopleList({ people }: { people: EscalationPerson[] }) {
  if (people.length === 0) {
    return <p className="escalation-people-empty">No people added.</p>;
  }

  return (
    <div className="escalation-people-list" aria-label="People involved">
      {people.map((person) => (
        <span className="escalation-person-chip" key={person.id}>
          <strong>{person.name || person.email}</strong>
          {person.role ? <small>{person.role}</small> : null}
          {person.email ? <small>{person.email}</small> : null}
        </span>
      ))}
    </div>
  );
}

function EscalationPanel({
  ticket,
  expanded = false,
  embedded = false,
  role,
  onCreateEscalation,
  onUpdateEscalationStatus
}: {
  ticket: Ticket;
  expanded?: boolean;
  embedded?: boolean;
  role?: RoleKey;
  onCreateEscalation?: (ticketKey: string, input: NewEscalationInput) => void;
  onUpdateEscalationStatus?: (
    ticketKey: string,
    escalationId: string,
    status: EscalationStatus,
    decisionNote: string,
    details?: EscalationStatusUpdateDetails
  ) => void;
}) {
  const [newEscalation, setNewEscalation] = useState<NewEscalationInput>(() =>
    createDefaultEscalationInput()
  );
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [activeDecisionFormId, setActiveDecisionFormId] = useState<string | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, EscalationStatus>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [actionPlanDrafts, setActionPlanDrafts] = useState<Record<string, string>>({});
  const [actionItemDrafts, setActionItemDrafts] = useState<Record<string, EscalationActionItemInput[]>>({});
  const [meetingSeriesDrafts, setMeetingSeriesDrafts] = useState<Record<string, string>>({});
  const [managerNameDrafts, setManagerNameDrafts] = useState<Record<string, string>>({});
  const [managerEmailDrafts, setManagerEmailDrafts] = useState<Record<string, string>>({});
  const [peopleDrafts, setPeopleDrafts] = useState<Record<string, EscalationPersonInput[]>>({});
  const [managerInviteDrafts, setManagerInviteDrafts] = useState<Record<string, boolean>>({});
  const [escalationStatusFilter, setEscalationStatusFilter] =
    useState<(typeof escalationBoardColumns)[number]["id"]>("new");
  const [escalationSearch, setEscalationSearch] = useState("");
  const canWrite = Boolean(role && (onCreateEscalation || onUpdateEscalationStatus));
  const escalationColumns = escalationBoardColumns.map((column) => ({
    ...column,
    escalations: ticket.escalations.filter((escalation) => getEscalationStatusLane(escalation.status) === column.id)
  }));
  const selectedEscalationColumn =
    escalationColumns.find((column) => column.id === escalationStatusFilter) ?? escalationColumns[0];
  const selectedEscalationTotal = selectedEscalationColumn?.escalations.length ?? 0;
  const activeEscalationCount = ticket.escalations.filter((escalation) => escalation.status !== "resolved").length;
  const getManagerInviteStatusLabel = (status?: EscalationManagerInviteStatus) =>
    status === "sent"
      ? "Invite sent"
      : status === "failed"
        ? "Invite failed"
        : status === "pending"
        ? "Invite pending"
        : "Not invited";
  const normalizedEscalationSearch = escalationSearch.trim().toLowerCase();
  const escalationRows = ticket.escalations
    .filter((escalation) => getEscalationStatusLane(escalation.status) === escalationStatusFilter)
    .filter((escalation) => {
      if (!normalizedEscalationSearch) {
        return true;
      }

      const searchableText = [
        escalation.reason,
        escalation.type,
        escalation.severity,
        getEscalationStatusLabel(escalation.status),
        escalation.decisionMaker,
        escalation.dueAt,
        escalation.requestedAction,
        escalation.impact,
        escalation.actionPlan,
        escalation.mitigationPlan,
        escalation.meetingSeries,
        escalation.managerName,
        escalation.managerEmail,
        ...(escalation.people ?? []).flatMap((person) => [person.name, person.email, person.role]),
        ...(escalation.actionItems ?? []).map((item) => item.label),
        escalation.statusNote
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedEscalationSearch);
    })
    .sort((left, right) => {
      const leftTimestamp = parseTicketTimestamp(left.statusUpdatedAt ?? left.dueAt);
      const rightTimestamp = parseTicketTimestamp(right.statusUpdatedAt ?? right.dueAt);

      return rightTimestamp - leftTimestamp;
    });

  function openEscalationStatusForm(escalation: Ticket["escalations"][number]) {
    if (activeDecisionFormId === escalation.id) {
      setActiveDecisionFormId(null);
      return;
    }

    setStatusDrafts((currentDrafts) => ({
      ...currentDrafts,
      [escalation.id]: escalation.status
    }));
    setActionPlanDrafts((currentDrafts) => ({
      ...currentDrafts,
      [escalation.id]: escalation.actionPlan || escalation.mitigationPlan || ""
    }));
    setActionItemDrafts((currentDrafts) => ({
      ...currentDrafts,
      [escalation.id]: getEscalationActionItems(escalation)
    }));
    setMeetingSeriesDrafts((currentDrafts) => ({
      ...currentDrafts,
      [escalation.id]: escalation.meetingSeries ?? ""
    }));
    setManagerNameDrafts((currentDrafts) => ({
      ...currentDrafts,
      [escalation.id]: escalation.managerName ?? ""
    }));
    setManagerEmailDrafts((currentDrafts) => ({
      ...currentDrafts,
      [escalation.id]: escalation.managerEmail ?? ""
    }));
    setPeopleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [escalation.id]: getEscalationPeople(escalation).map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email ?? "",
        role: person.role ?? ""
      }))
    }));
    setManagerInviteDrafts((currentDrafts) => ({
      ...currentDrafts,
      [escalation.id]: false
    }));
    setActiveDecisionFormId(escalation.id);
  }

  function renderEscalationStatusForm(escalation: Ticket["escalations"][number]) {
    if (!expanded || !onUpdateEscalationStatus || activeDecisionFormId !== escalation.id) {
      return null;
    }

    return (
      <form
        className="escalation-action-form admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          const nextActionItems = actionItemDrafts[escalation.id] ?? getEscalationActionItems(escalation);
          const nextPeople =
            peopleDrafts[escalation.id] ??
            getEscalationPeople(escalation).map((person) => ({
              id: person.id,
              name: person.name,
              email: person.email ?? "",
              role: person.role ?? ""
            }));
          const primaryPerson = getPrimaryEscalationPerson(normalizeEscalationPeople(nextPeople));
          onUpdateEscalationStatus(
            ticket.key,
            escalation.id,
            statusDrafts[escalation.id] ?? escalation.status,
            decisionNotes[escalation.id] ?? "",
            {
              actionPlan:
                formatEscalationActionItemsForStorage(normalizeEscalationActionItems(nextActionItems)) ||
                actionPlanDrafts[escalation.id] ||
                escalation.actionPlan ||
                escalation.mitigationPlan,
              actionItems: nextActionItems,
              meetingSeries: meetingSeriesDrafts[escalation.id] ?? escalation.meetingSeries ?? "",
              managerName: primaryPerson?.name ?? managerNameDrafts[escalation.id] ?? escalation.managerName ?? "",
              managerEmail: primaryPerson?.email ?? managerEmailDrafts[escalation.id] ?? escalation.managerEmail ?? "",
              people: nextPeople,
              sendManagerInvite: managerInviteDrafts[escalation.id] ?? false
            }
          );
          setDecisionNotes((currentNotes) => ({ ...currentNotes, [escalation.id]: "" }));
          setManagerInviteDrafts((currentDrafts) => ({ ...currentDrafts, [escalation.id]: false }));
          setActiveDecisionFormId(null);
        }}
      >
        <div className="escalation-action-grid">
          <label className="form-field">
            <span>Status</span>
            <select
              value={statusDrafts[escalation.id] ?? escalation.status}
              onChange={(event) =>
                setStatusDrafts((currentDrafts) => ({
                  ...currentDrafts,
                  [escalation.id]: event.target.value as EscalationStatus
                }))
              }
            >
              {escalationStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <RichTextEditor
            label="Status update"
            value={decisionNotes[escalation.id] ?? ""}
            onChange={(value) =>
              setDecisionNotes((currentNotes) => ({
                ...currentNotes,
                [escalation.id]: value
              }))
            }
            placeholder="Capture decision, owner response, progress, blocker, or why it is done."
            rows={3}
          />
          <EscalationActionChecklistEditor
            items={actionItemDrafts[escalation.id] ?? getEscalationActionItems(escalation)}
            onChange={(items) => {
              setActionItemDrafts((currentDrafts) => ({
                ...currentDrafts,
                [escalation.id]: items
              }));
              setActionPlanDrafts((currentDrafts) => ({
                ...currentDrafts,
                [escalation.id]: formatEscalationActionItemsForStorage(normalizeEscalationActionItems(items))
              }));
            }}
          />
          <label className="form-field form-field-wide">
            <span>Meeting series</span>
            <textarea
              value={meetingSeriesDrafts[escalation.id] ?? escalation.meetingSeries ?? ""}
              onChange={(event) =>
                setMeetingSeriesDrafts((currentDrafts) => ({
                  ...currentDrafts,
                  [escalation.id]: event.target.value
                }))
              }
              placeholder="Cadence, invite text, meeting link, or recurring follow-up notes."
              rows={3}
            />
          </label>
          <EscalationPeopleEditor
            people={
              peopleDrafts[escalation.id] ??
              getEscalationPeople(escalation).map((person) => ({
                id: person.id,
                name: person.name,
                email: person.email ?? "",
                role: person.role ?? ""
              }))
            }
            onChange={(people) => {
              const primaryPerson = getPrimaryEscalationPerson(normalizeEscalationPeople(people));
              setPeopleDrafts((currentDrafts) => ({
                ...currentDrafts,
                [escalation.id]: people
              }));
              setManagerNameDrafts((currentDrafts) => ({
                ...currentDrafts,
                [escalation.id]: primaryPerson?.name ?? ""
              }));
              setManagerEmailDrafts((currentDrafts) => ({
                ...currentDrafts,
                [escalation.id]: primaryPerson?.email ?? ""
              }));
            }}
          />
          <div className="form-field form-field-wide">
            <AdminCheckbox
              checked={managerInviteDrafts[escalation.id] ?? false}
              label="Invite primary person by email"
              onChange={(checked) =>
                setManagerInviteDrafts((currentDrafts) => ({
                  ...currentDrafts,
                  [escalation.id]: checked
                }))
              }
            />
          </div>
        </div>
        <div className="composer-actions">
          <button className="secondary-button" type="button" onClick={() => setActiveDecisionFormId(null)}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            <TegelIcon name="save" size="16px" />
            Save status
          </button>
        </div>
      </form>
    );
  }

  return (
    <section className={embedded ? "embedded-section" : "panel escalation-panel"}>
      <PanelHeader
        title="Escalation management"
        description={`${activeEscalationCount} active · ${ticket.escalations.length} total escalation${ticket.escalations.length === 1 ? "" : "s"}.`}
        iconName="warning"
      />
      <div className="escalation-summary-strip" aria-label="Escalation status summary">
        {escalationColumns.map((column) => (
          <button
            aria-label={`Show ${column.title.toLowerCase()} escalations, ${column.escalations.length} item${
              column.escalations.length === 1 ? "" : "s"
            }`}
            aria-pressed={escalationStatusFilter === column.id}
            className={`escalation-summary-item lane-${column.id} ${
              escalationStatusFilter === column.id ? "is-active" : ""
            }`}
            key={column.id}
            onClick={() => {
              setEscalationStatusFilter(column.id);
              setActiveDecisionFormId(null);
            }}
            type="button"
          >
            <b>{column.escalations.length}</b>
            {column.title}
          </button>
        ))}
      </div>
      {canWrite ? (
        <div className="escalation-toolbar">
          {onCreateEscalation ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => setIsCreateFormOpen((isOpen) => !isOpen)}
            >
              <TegelIcon name="warning" size="16px" />
              {isCreateFormOpen ? "Close escalation form" : "Create escalation"}
            </button>
          ) : null}
        </div>
      ) : null}
      {canWrite && onCreateEscalation && isCreateFormOpen ? (
        <form
          className="escalation-create-form admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateEscalation(ticket.key, newEscalation);
            setNewEscalation(createDefaultEscalationInput());
            setIsCreateFormOpen(false);
          }}
        >
          <h3>Create escalation</h3>
          <div className="escalation-create-grid">
            <label className="form-field">
              <span>Type</span>
              <select
                value={newEscalation.type}
                onChange={(event) =>
                  setNewEscalation({ ...newEscalation, type: event.target.value as EscalationType })
                }
              >
                {escalationTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Severity</span>
              <select
                value={newEscalation.severity}
                onChange={(event) =>
                  setNewEscalation({ ...newEscalation, severity: event.target.value as EscalationSeverity })
                }
              >
                {escalationSeverityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Escalation point</span>
              <input
                value={newEscalation.decisionMaker}
                onChange={(event) =>
                  setNewEscalation({ ...newEscalation, decisionMaker: event.target.value })
                }
                placeholder="Planner, owner, or release manager"
              />
            </label>
            <label className="form-field">
              <span>Due date</span>
              <input
                type="datetime-local"
                value={newEscalation.dueAt}
                onChange={(event) => setNewEscalation({ ...newEscalation, dueAt: event.target.value })}
              />
            </label>
            <label className="form-field form-field-wide">
              <span>Reason</span>
              <input
                value={newEscalation.reason}
                onChange={(event) => setNewEscalation({ ...newEscalation, reason: event.target.value })}
                placeholder="Why this needs escalation"
              />
            </label>
            <RichTextEditor
              label="Impact"
              value={newEscalation.impact}
              onChange={(value) => setNewEscalation({ ...newEscalation, impact: value })}
              placeholder="Describe business, release, SLA, or technical impact."
              rows={3}
            />
            <label className="form-field form-field-wide">
              <span>Urgency</span>
              <input
                value={newEscalation.urgency}
                onChange={(event) => setNewEscalation({ ...newEscalation, urgency: event.target.value })}
                placeholder="Why a decision is needed now"
              />
            </label>
            <RichTextEditor
              label="Requested action"
              value={newEscalation.requestedAction}
              onChange={(value) => setNewEscalation({ ...newEscalation, requestedAction: value })}
              placeholder="What decision or action is requested"
              rows={3}
            />
            <EscalationActionChecklistEditor
              items={newEscalation.actionItems}
              onChange={(items) => {
                const actionPlan = formatEscalationActionItemsForStorage(normalizeEscalationActionItems(items));

                setNewEscalation({
                  ...newEscalation,
                  actionItems: items,
                  actionPlan,
                  mitigationPlan: actionPlan
                });
              }}
            />
            <label className="form-field form-field-wide">
              <span>Meeting series</span>
              <textarea
                value={newEscalation.meetingSeries}
                onChange={(event) => setNewEscalation({ ...newEscalation, meetingSeries: event.target.value })}
                placeholder="Cadence, invite text, meeting link, or recurring follow-up notes."
                rows={3}
              />
            </label>
            <EscalationPeopleEditor
              people={newEscalation.people}
              onChange={(people) => {
                const primaryPerson = getPrimaryEscalationPerson(normalizeEscalationPeople(people));

                setNewEscalation({
                  ...newEscalation,
                  people,
                  managerName: primaryPerson?.name ?? "",
                  managerEmail: primaryPerson?.email ?? ""
                });
              }}
            />
            <div className="form-field form-field-wide">
              <AdminCheckbox
                checked={newEscalation.sendManagerInvite}
                label="Invite primary person by email"
                onChange={(checked) => setNewEscalation({ ...newEscalation, sendManagerInvite: checked })}
              />
            </div>
          </div>
          <div className="composer-actions">
            <button className="secondary-button" type="button" onClick={() => setIsCreateFormOpen(false)}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              <TegelIcon name="warning" size="16px" />
              Submit escalation
            </button>
          </div>
        </form>
      ) : null}
      <div className="escalation-table-card">
        <header>
          <div>
            <h3>{selectedEscalationColumn.title} escalations</h3>
            <span>
              {escalationRows.length} of {selectedEscalationTotal} shown
            </span>
          </div>
          <label className="escalation-table-search">
            <TegelIcon name="search" size="16px" />
            <input
              value={escalationSearch}
              onChange={(event) => setEscalationSearch(event.target.value)}
              placeholder={`Search ${selectedEscalationColumn.title.toLowerCase()} escalations, manager, plan`}
            />
          </label>
        </header>
        <div className="escalation-responsive-list" role="list" aria-label="Escalation cards">
          {escalationRows.length === 0 ? (
            <div className="escalation-table-empty" role="listitem">
              {ticket.escalations.length === 0
                ? "No escalations have been opened for this ticket."
                : selectedEscalationTotal === 0
                  ? selectedEscalationColumn.empty
                  : "No escalations match the current search."}
            </div>
          ) : (
            escalationRows.map((escalation) => {
              const lane = getEscalationStatusLane(escalation.status);
              const statusUpdatedAt = getEscalationStatusTimestampLabel(escalation.statusUpdatedAt);
              const actionItems = getEscalationActionItems(escalation);
              const people = getEscalationPeople(escalation);
              const statusUpdates = [...(escalation.statusUpdates ?? [])].sort(
                (left, right) => parseTicketTimestamp(right.createdAt) - parseTicketTimestamp(left.createdAt)
              );
              const latestUpdate = escalation.statusNote?.trim() || statusUpdates[0]?.note || "";

              return (
                <article
                  className={`escalation-work-card severity-${escalation.severity} ${
                    activeDecisionFormId === escalation.id ? "is-editing" : ""
                  }`}
                  key={escalation.id}
                  role="listitem"
                >
                  <div className="escalation-work-card-header">
                    <div>
                      <span>{escalation.type} escalation</span>
                      <h3>{escalation.reason}</h3>
                    </div>
                    <div className="escalation-work-card-badges">
                      <strong className={`escalation-status-pill lane-${lane}`}>
                        {getEscalationStatusLabel(escalation.status)}
                      </strong>
                      <span className={`escalation-severity-pill severity-${escalation.severity}`}>
                        {escalation.severity}
                      </span>
                    </div>
                  </div>
                  <div className="escalation-work-meta">
                    <div>
                      <span>Point / due</span>
                      <strong>{escalation.decisionMaker || "Unassigned"}</strong>
                      <small>{formatDateTimeDisplay(escalation.dueAt)}</small>
                    </div>
                    <div>
                      <span>Updated</span>
                      <strong>{statusUpdatedAt || "Not updated"}</strong>
                      <small>{statusUpdates.length} update{statusUpdates.length === 1 ? "" : "s"}</small>
                    </div>
                  </div>
                  <div className="escalation-work-section">
                    <h4>Requested action</h4>
                    <RichTextContent value={escalation.requestedAction} fallback="No target outcome provided." compact />
                  </div>
                  <div className="escalation-work-section">
                    <h4>Action checklist</h4>
                    <EscalationActionChecklist items={actionItems} />
                  </div>
                  <div className="escalation-work-section">
                    <h4>People involved</h4>
                    <EscalationPeopleList people={people} />
                    {escalation.managerInviteStatus ? (
                      <b className={`escalation-invite-status status-${escalation.managerInviteStatus}`}>
                        {getManagerInviteStatusLabel(escalation.managerInviteStatus)}
                      </b>
                    ) : null}
                  </div>
                  {latestUpdate ? (
                    <div className="escalation-work-section">
                      <h4>Latest update</h4>
                      <RichTextContent value={latestUpdate} fallback="" compact />
                    </div>
                  ) : null}
                  <div className="escalation-card-actions">
                    {expanded && onUpdateEscalationStatus ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => openEscalationStatusForm(escalation)}
                      >
                        <TegelIcon name="edit" size="16px" />
                        {activeDecisionFormId === escalation.id ? "Close update" : "Update"}
                      </button>
                    ) : null}
                  </div>
                  {expanded && onUpdateEscalationStatus && activeDecisionFormId === escalation.id
                    ? renderEscalationStatusForm(escalation)
                    : null}
                </article>
              );
            })
          )}
        </div>
        <div className="escalation-table-scroll" role="region" aria-label="Escalations">
          <table className="escalation-table">
            <thead>
              <tr>
                <th scope="col">Escalation</th>
                <th scope="col">Status</th>
                <th scope="col">Severity</th>
                <th scope="col">Point / due</th>
                <th scope="col">Action plan</th>
                <th scope="col">Meeting / manager</th>
                <th scope="col">Updated</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {escalationRows.length === 0 ? (
                <tr>
                  <td className="escalation-table-empty" colSpan={8}>
                    {ticket.escalations.length === 0
                      ? "No escalations have been opened for this ticket."
                      : selectedEscalationTotal === 0
                        ? selectedEscalationColumn.empty
                        : "No escalations match the current search."}
                  </td>
                </tr>
              ) : (
                escalationRows.flatMap((escalation) => {
                  const lane = getEscalationStatusLane(escalation.status);
                  const statusUpdatedAt = getEscalationStatusTimestampLabel(escalation.statusUpdatedAt);
                  const actionPlan = escalation.actionPlan || escalation.mitigationPlan;
                  const statusUpdates = [...(escalation.statusUpdates ?? [])].sort(
                    (left, right) => parseTicketTimestamp(right.createdAt) - parseTicketTimestamp(left.createdAt)
                  );
                  const latestUpdate = escalation.statusNote?.trim() || statusUpdates[0]?.note || "";
                  const managerContact = [escalation.managerName, escalation.managerEmail]
                    .map((value) => value?.trim() ?? "")
                    .filter(Boolean)
                    .join(" · ");
                  const row = (
                    <tr className={activeDecisionFormId === escalation.id ? "is-editing" : ""} key={escalation.id}>
                      <td className="escalation-table-primary">
                        <strong>{escalation.reason}</strong>
                        <span>{escalation.type} escalation</span>
                        <RichTextContent value={escalation.requestedAction} fallback="No target outcome provided." compact />
                      </td>
                      <td>
                        <strong className={`escalation-status-pill lane-${lane}`}>
                          {getEscalationStatusLabel(escalation.status)}
                        </strong>
                      </td>
                      <td>
                        <span className={`escalation-severity-pill severity-${escalation.severity}`}>
                          {escalation.severity}
                        </span>
                      </td>
                      <td className="escalation-table-stack">
                        <strong>{escalation.decisionMaker || "Unassigned"}</strong>
                        <span>{formatDateTimeDisplay(escalation.dueAt)}</span>
                      </td>
                      <td>
                        <RichTextContent value={actionPlan} fallback="No action plan." compact />
                      </td>
                      <td className="escalation-table-stack">
                        <span>{escalation.meetingSeries || "No meeting series"}</span>
                        <small>{managerContact || "No manager invited"}</small>
                        {escalation.managerInviteStatus ? (
                          <b className={`escalation-invite-status status-${escalation.managerInviteStatus}`}>
                            {getManagerInviteStatusLabel(escalation.managerInviteStatus)}
                          </b>
                        ) : null}
                      </td>
                      <td className="escalation-table-stack">
                        <strong>{statusUpdatedAt || "Not updated"}</strong>
                        <span>{statusUpdates.length} update{statusUpdates.length === 1 ? "" : "s"}</span>
                        {latestUpdate ? <RichTextContent value={latestUpdate} fallback="" compact /> : null}
                      </td>
                      <td className="escalation-table-actions">
                        {expanded && onUpdateEscalationStatus ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => openEscalationStatusForm(escalation)}
                          >
                            <TegelIcon name="edit" size="16px" />
                            {activeDecisionFormId === escalation.id ? "Close" : "Update"}
                          </button>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                    </tr>
                  );
                  const formRow =
                    expanded && onUpdateEscalationStatus && activeDecisionFormId === escalation.id ? (
                      <tr className="escalation-table-form-row" key={`${escalation.id}-form`}>
                        <td colSpan={8}>{renderEscalationStatusForm(escalation)}</td>
                      </tr>
                    ) : null;

                  return formRow ? [row, formRow] : [row];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className={`escalation-list escalation-board ${expanded ? "is-expanded" : ""}`} hidden>
        {ticket.escalations.length === 0 ? (
          <EmptyState
            title="No escalation active"
            body="Escalation matrices remain ready for SLA, technical, business, or management triggers."
          />
        ) : (
          escalationColumns.map((column) => (
            <section className={`escalation-column lane-${column.id}`} key={column.id}>
              <div className="escalation-column-header">
                <div>
                  <strong>{column.title}</strong>
                  <span>{column.statuses.map((status) => getEscalationStatusLabel(status)).join(" / ")}</span>
                </div>
                <b>{column.escalations.length}</b>
              </div>
              <div className="escalation-column-list">
                {column.escalations.length === 0 ? (
                  <div className="escalation-empty-lane">{column.empty}</div>
                ) : (
                  column.escalations.map((escalation) => {
                    const lane = getEscalationStatusLane(escalation.status);
                    const isClosed = escalation.status === "resolved";
                    const statusUpdatedAt = getEscalationStatusTimestampLabel(escalation.statusUpdatedAt);
                    const statusNote = escalation.statusNote?.trim() ?? "";
                    const actionPlan = escalation.actionPlan || escalation.mitigationPlan;
                    const planOrOutcome = isClosed ? statusNote || actionPlan : actionPlan;
                    const statusUpdates = [...(escalation.statusUpdates ?? [])].sort(
                      (left, right) => parseTicketTimestamp(right.createdAt) - parseTicketTimestamp(left.createdAt)
                    );
                    const managerContact = [escalation.managerName, escalation.managerEmail]
                      .map((value) => value?.trim() ?? "")
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <article className={`escalation-card severity-${escalation.severity}`} key={escalation.id}>
                        <div className="escalation-topline">
                          <span>{escalation.type} escalation</span>
                          <strong className={`escalation-status-pill lane-${lane}`}>
                            {getEscalationStatusLabel(escalation.status)}
                          </strong>
                        </div>
                        <h3>{escalation.reason}</h3>
                        <div className="escalation-card-grid">
                          <div className="escalation-field">
                            <span>Escalation point</span>
                            <strong>{escalation.decisionMaker || "Unassigned"}</strong>
                          </div>
                          <div className="escalation-field">
                            <span>Due target</span>
                            <strong>{formatDateTimeDisplay(escalation.dueAt)}</strong>
                          </div>
                          <div className="escalation-field">
                            <span>Severity</span>
                            <strong>{escalation.severity}</strong>
                          </div>
                        </div>
                        <div className="escalation-field is-wide">
                          <span>Target outcome</span>
                          <RichTextContent value={escalation.requestedAction} fallback="No target outcome provided." compact />
                        </div>
                        {expanded ? (
                          <div className="escalation-detail-stack">
                            <div className="escalation-field is-wide">
                              <span>Impact</span>
                              <RichTextContent value={escalation.impact} fallback="No impact provided." compact />
                            </div>
                            <div className="escalation-field is-wide">
                              <span>{isClosed ? "Fix / done" : "Action plan"}</span>
                              <RichTextContent value={planOrOutcome} fallback="No plan provided." compact />
                            </div>
                            {escalation.meetingSeries ? (
                              <div className="escalation-field is-wide">
                                <span>Meeting series</span>
                                <p>{escalation.meetingSeries}</p>
                              </div>
                            ) : null}
                            {managerContact || escalation.managerInviteStatus ? (
                              <div className="escalation-manager-strip">
                                <div>
                                  <span>Manager</span>
                                  <strong>{managerContact || "No manager assigned"}</strong>
                                  {escalation.managerInviteError ? <small>{escalation.managerInviteError}</small> : null}
                                </div>
                                <b className={`escalation-invite-status status-${escalation.managerInviteStatus ?? "not_sent"}`}>
                                  {getManagerInviteStatusLabel(escalation.managerInviteStatus)}
                                </b>
                              </div>
                            ) : null}
                            {!isClosed && statusNote ? (
                              <div className="escalation-field is-wide">
                                <span>Latest update</span>
                                <RichTextContent value={statusNote} fallback="No update provided." compact />
                                {statusUpdatedAt ? <small>Updated {statusUpdatedAt}</small> : null}
                              </div>
                            ) : null}
                            {statusUpdates.length > 0 ? (
                              <div className="escalation-update-archive">
                                <div className="escalation-update-archive-header">
                                  <span>Status update archive</span>
                                  <b>{statusUpdates.length}</b>
                                </div>
                                <div className="escalation-update-table-wrap" role="region" aria-label="Status update archive">
                                  <table className="escalation-update-table">
                                    <thead>
                                      <tr>
                                        <th scope="col">Time</th>
                                        <th scope="col">Archive</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {statusUpdates.map((statusUpdate) => (
                                        <tr key={statusUpdate.id}>
                                          <td className="escalation-update-time-cell">
                                            <strong>{formatClarificationTimestamp(statusUpdate.createdAt)}</strong>
                                            <small>{getEscalationStatusLabel(statusUpdate.status)}</small>
                                            <small>{statusUpdate.author}</small>
                                          </td>
                                          <td className="escalation-update-details-cell">
                                            <div className="escalation-update-cell-block">
                                              <b>Update</b>
                                              <RichTextContent value={statusUpdate.note} fallback="-" compact />
                                            </div>
                                            {statusUpdate.actionPlan ? (
                                              <div className="escalation-update-cell-block">
                                                <b>Action plan</b>
                                                <RichTextContent value={statusUpdate.actionPlan} fallback="-" compact />
                                              </div>
                                            ) : null}
                                            {statusUpdate.meetingSeries ? (
                                              <div className="escalation-update-cell-block">
                                                <b>Meeting</b>
                                                <p>{statusUpdate.meetingSeries}</p>
                                              </div>
                                            ) : null}
                                            {statusUpdate.managerInvite ? (
                                              <small>
                                                {getManagerInviteStatusLabel(statusUpdate.managerInvite.status)} ·{" "}
                                                {statusUpdate.managerInvite.email}
                                              </small>
                                            ) : null}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : null}
                            <div className="escalation-field is-wide">
                              <span>Urgency</span>
                              <p>{escalation.urgency || "No urgency provided."}</p>
                            </div>
                          </div>
                        ) : null}
                        {expanded && onUpdateEscalationStatus ? (
                          <div className="escalation-card-actions">
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => {
                                if (activeDecisionFormId === escalation.id) {
                                  setActiveDecisionFormId(null);
                                  return;
                                }

                                setStatusDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [escalation.id]: escalation.status
                                }));
                                setActionPlanDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [escalation.id]: escalation.actionPlan || escalation.mitigationPlan || ""
                                }));
                                setMeetingSeriesDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [escalation.id]: escalation.meetingSeries ?? ""
                                }));
                                setManagerNameDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [escalation.id]: escalation.managerName ?? ""
                                }));
                                setManagerEmailDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [escalation.id]: escalation.managerEmail ?? ""
                                }));
                                setManagerInviteDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [escalation.id]: false
                                }));
                                setActiveDecisionFormId(escalation.id);
                              }}
                            >
                              <TegelIcon name="edit" size="16px" />
                              {activeDecisionFormId === escalation.id ? "Close status update" : "Update status"}
                            </button>
                          </div>
                        ) : null}
                        {expanded && onUpdateEscalationStatus && activeDecisionFormId === escalation.id ? (
                          <form
                            className="escalation-action-form admin-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              onUpdateEscalationStatus(
                                ticket.key,
                                escalation.id,
                                statusDrafts[escalation.id] ?? escalation.status,
                                decisionNotes[escalation.id] ?? "",
                                {
                                  actionPlan: actionPlanDrafts[escalation.id] ?? escalation.actionPlan ?? escalation.mitigationPlan,
                                  meetingSeries: meetingSeriesDrafts[escalation.id] ?? escalation.meetingSeries ?? "",
                                  managerName: managerNameDrafts[escalation.id] ?? escalation.managerName ?? "",
                                  managerEmail: managerEmailDrafts[escalation.id] ?? escalation.managerEmail ?? "",
                                  sendManagerInvite: managerInviteDrafts[escalation.id] ?? false
                                }
                              );
                              setDecisionNotes((currentNotes) => ({ ...currentNotes, [escalation.id]: "" }));
                              setManagerInviteDrafts((currentDrafts) => ({ ...currentDrafts, [escalation.id]: false }));
                              setActiveDecisionFormId(null);
                            }}
                          >
                            <div className="escalation-action-grid">
                              <label className="form-field">
                                <span>Status</span>
                                <select
                                  value={statusDrafts[escalation.id] ?? escalation.status}
                                  onChange={(event) =>
                                    setStatusDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [escalation.id]: event.target.value as EscalationStatus
                                    }))
                                  }
                                >
                                  {escalationStatusOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <RichTextEditor
                                label="Status update"
                                value={decisionNotes[escalation.id] ?? ""}
                                onChange={(value) =>
                                  setDecisionNotes((currentNotes) => ({
                                    ...currentNotes,
                                    [escalation.id]: value
                                  }))
                                }
                                placeholder="Capture decision, owner response, progress, blocker, or why it is done."
                                rows={3}
                              />
                              <RichTextEditor
                                label="Action plan"
                                value={actionPlanDrafts[escalation.id] ?? escalation.actionPlan ?? escalation.mitigationPlan}
                                onChange={(value) =>
                                  setActionPlanDrafts((currentDrafts) => ({
                                    ...currentDrafts,
                                    [escalation.id]: value
                                  }))
                                }
                                placeholder="Update next actions, owners, mitigation, or fallback plan."
                                rows={3}
                              />
                              <label className="form-field form-field-wide">
                                <span>Meeting series</span>
                                <textarea
                                  value={meetingSeriesDrafts[escalation.id] ?? escalation.meetingSeries ?? ""}
                                  onChange={(event) =>
                                    setMeetingSeriesDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [escalation.id]: event.target.value
                                    }))
                                  }
                                  placeholder="Cadence, invite text, meeting link, or recurring follow-up notes."
                                  rows={3}
                                />
                              </label>
                              <label className="form-field">
                                <span>Manager name</span>
                                <input
                                  value={managerNameDrafts[escalation.id] ?? escalation.managerName ?? ""}
                                  onChange={(event) =>
                                    setManagerNameDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [escalation.id]: event.target.value
                                    }))
                                  }
                                  placeholder="Manager or decision owner"
                                />
                              </label>
                              <label className="form-field">
                                <span>Manager email</span>
                                <input
                                  type="email"
                                  required={managerInviteDrafts[escalation.id] ?? false}
                                  value={managerEmailDrafts[escalation.id] ?? escalation.managerEmail ?? ""}
                                  onChange={(event) =>
                                    setManagerEmailDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [escalation.id]: event.target.value
                                    }))
                                  }
                                  placeholder="manager@example.com"
                                />
                              </label>
                              <div className="form-field form-field-wide">
                                <AdminCheckbox
                                  checked={managerInviteDrafts[escalation.id] ?? false}
                                  label="Invite manager by email"
                                  onChange={(checked) =>
                                    setManagerInviteDrafts((currentDrafts) => ({
                                      ...currentDrafts,
                                      [escalation.id]: checked
                                    }))
                                  }
                                />
                              </div>
                            </div>
                            <div className="composer-actions">
                              <button className="secondary-button" type="button" onClick={() => setActiveDecisionFormId(null)}>
                                Cancel
                              </button>
                              <button className="primary-button" type="submit">
                                <TegelIcon name="save" size="16px" />
                                Save status
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

function NotificationCenter({
  items,
  onOpenNotification
}: {
  items: NotificationItem[];
  onOpenNotification: (notification: NotificationItem) => void;
}) {
  return (
    <section className="panel notification-center">
      <PanelHeader
        title="Notification center"
        description="Actionable in-app notifications with direct ticket routing and visibility filtering."
        iconName="notification"
      />
      <div className="notification-list">
        {items.length === 0 ? (
          <EmptyState title="No notifications" body="New answers, approvals, and workflow follow-ups will appear here." />
        ) : null}
        {items.map((item) => (
          <article className={`notification-row ${item.unread ? "is-unread" : ""}`} key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <span>
                {item.ticketKey} · {formatDateTimeDisplay(item.createdAt)}
              </span>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onOpenNotification(item)}
            >
              {item.actionLabel}
              <TegelIcon name="chevron_right" size="17px" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function AuditTimeline({
  entries,
  expanded = false,
  embedded = false
}: {
  entries: Ticket["audit"];
  expanded?: boolean;
  embedded?: boolean;
}) {
  return (
    <section className={embedded ? "embedded-section" : "panel audit-panel"}>
      <PanelHeader
        title="Audit and history"
        description="Immutable timeline showing old value, new value, actor, reason, and timestamp."
        iconName="history"
      />
      <div className={`audit-list ${expanded ? "is-expanded" : ""}`}>
        {entries.length === 0 ? (
          <EmptyState title="No visible audit entries" body="Your current role has no matching audit visibility." />
        ) : (
          entries.map((entry) => (
            <article className="audit-row" key={entry.id}>
              <div className="audit-marker" aria-hidden="true" />
              <div>
                <div className="audit-topline">
                  <strong>{entry.eventType}</strong>
                  <span>{formatDateTimeDisplay(entry.createdAt)}</span>
                </div>
                <div className="audit-reason">
                  <strong>{entry.actor}</strong>
                  {entry.reason ? <RichTextContent value={entry.reason} fallback="" compact /> : null}
                </div>
                {entry.oldValue || entry.newValue ? (
                  <div className="audit-values">
                    {entry.oldValue ? <span>Old: {entry.oldValue}</span> : null}
                    {entry.newValue ? <span>New: {entry.newValue}</span> : null}
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function decodeTextAttachmentContent(contentDataUrl: string): string | null {
  const match = /^data:([^,]*),([\s\S]*)$/.exec(contentDataUrl);

  if (!match) {
    return null;
  }

  const metadata = match[1] ?? "";
  const encodedPayload = match[2] ?? "";

  try {
    if (metadata.toLowerCase().includes(";base64")) {
      const binary = window.atob(encodedPayload);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }

    return decodeURIComponent(encodedPayload.replace(/\+/g, "%20"));
  } catch (error) {
    console.error("Failed to decode text attachment preview.", {
      error: getErrorMessage(error)
    });
    return null;
  }
}

function dataUrlToBlob(contentDataUrl: string): Blob {
  const match = /^data:([^,]*),([\s\S]*)$/.exec(contentDataUrl);

  if (!match) {
    throw new Error("Attachment content is not a valid data URL.");
  }

  const metadata = match[1] ?? "";
  const encodedPayload = match[2] ?? "";
  const mimeType = metadata.split(";")[0] || "application/octet-stream";
  const binaryPayload = metadata.toLowerCase().includes(";base64")
    ? window.atob(encodedPayload)
    : decodeURIComponent(encodedPayload.replace(/\+/g, "%20"));
  const bytes = Uint8Array.from(binaryPayload, (character) => character.charCodeAt(0));

  return new Blob([bytes], { type: mimeType });
}

function triggerAttachmentDownload(attachment: Ticket["attachments"][number]): void {
  if (!attachment.contentDataUrl) {
    throw new Error("Attachment content is not stored.");
  }

  const blob = dataUrlToBlob(attachment.contentDataUrl);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = attachment.fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function sortAttachmentLabels(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

function countTicketAttachments(tickets: AttachmentLibraryTicketNode[]): number {
  return tickets.reduce((count, ticketNode) => count + ticketNode.attachments.length, 0);
}

function buildAttachmentLibrary(tickets: Ticket[]): AttachmentLibrarySiteNode[] {
  const siteMap = new Map<string, Map<string, Map<string, AttachmentLibraryTicketNode[]>>>();

  for (const ticket of tickets) {
    if (!ticket.attachments.length) {
      continue;
    }

    const siteLabel = ticket.site || "No site";
    const pruLabel = ticket.pru || "No PRU";
    const productLabel = ticket.product || "No product";
    const siteNode = siteMap.get(siteLabel) ?? new Map<string, Map<string, AttachmentLibraryTicketNode[]>>();
    const pruNode = siteNode.get(pruLabel) ?? new Map<string, AttachmentLibraryTicketNode[]>();
    const productNode = pruNode.get(productLabel) ?? [];

    productNode.push({
      ticket,
      attachments: [...ticket.attachments].sort((left, right) => sortAttachmentLabels(left.fileName, right.fileName))
    });
    pruNode.set(productLabel, productNode);
    siteNode.set(pruLabel, pruNode);
    siteMap.set(siteLabel, siteNode);
  }

  return Array.from(siteMap.entries())
    .sort(([left], [right]) => sortAttachmentLabels(left, right))
    .map(([siteLabel, pruMap]) => {
      const prus = Array.from(pruMap.entries())
        .sort(([left], [right]) => sortAttachmentLabels(left, right))
        .map(([pruLabel, productMap]) => {
          const products = Array.from(productMap.entries())
            .sort(([left], [right]) => sortAttachmentLabels(left, right))
            .map(([productLabel, ticketNodes]) => {
              const sortedTickets = [...ticketNodes].sort((left, right) =>
                sortAttachmentLabels(`${left.ticket.key} ${left.ticket.title}`, `${right.ticket.key} ${right.ticket.title}`)
              );

              return {
                label: productLabel,
                attachmentCount: countTicketAttachments(sortedTickets),
                tickets: sortedTickets
              };
            });

          return {
            label: pruLabel,
            attachmentCount: products.reduce((count, product) => count + product.attachmentCount, 0),
            products
          };
        });

      return {
        label: siteLabel,
        attachmentCount: prus.reduce((count, pru) => count + pru.attachmentCount, 0),
        prus
      };
    });
}

function AttachmentTextPreview({ attachment }: { attachment: Ticket["attachments"][number] }) {
  const textContent = useMemo(
    () => (attachment.contentDataUrl ? decodeTextAttachmentContent(attachment.contentDataUrl) : null),
    [attachment.contentDataUrl]
  );

  if (!textContent) {
    return (
      <div className="attachment-preview-empty">
        Text preview is not available for this file.
      </div>
    );
  }

  return <pre className="attachment-text-preview">{textContent}</pre>;
}

function AttachmentPreview({
  attachment,
  downloadError,
  isReplacing,
  onClose,
  onDownload,
  onReplaceContent
}: {
  attachment: Ticket["attachments"][number];
  downloadError: string;
  isReplacing: boolean;
  onClose: () => void;
  onDownload: (attachment: Ticket["attachments"][number]) => void;
  onReplaceContent?: (attachmentId: string, files: FileList | null) => void;
}) {
  const titleId = useId();
  const [isMounted, setIsMounted] = useState(false);
  const previewKind = getAttachmentPreviewKind(attachment);
  const canDownload = Boolean(attachment.contentDataUrl);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function renderPreviewBody() {
    if (!attachment.contentDataUrl) {
      return (
        <div className="attachment-preview-empty">
          <strong>File content is not stored yet.</strong>
          <span>
            This attachment was saved as metadata only. Attach the original file content here to enable preview and download.
          </span>
          {onReplaceContent ? (
            <label className={`secondary-button attachment-upload-control ${isReplacing ? "is-disabled" : ""}`}>
              <TegelIcon name="plus" size="16px" />
              <span>{isReplacing ? "Reading file..." : "Attach file content"}</span>
              <input
                disabled={isReplacing}
                type="file"
                onChange={(event) => {
                  onReplaceContent(attachment.id, event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
      );
    }

    if (previewKind === "image") {
      // eslint-disable-next-line @next/next/no-img-element
      return <img alt={attachment.fileName} src={attachment.contentDataUrl} />;
    }

    if (previewKind === "pdf") {
      return <iframe src={attachment.contentDataUrl} title={`Preview ${attachment.fileName}`} />;
    }

    if (previewKind === "video") {
      return <video controls src={attachment.contentDataUrl} />;
    }

    if (previewKind === "audio") {
      return <audio controls src={attachment.contentDataUrl} />;
    }

    if (previewKind === "text") {
      return <AttachmentTextPreview attachment={attachment} />;
    }

    if (previewKind === "office") {
      return (
        <div className="attachment-preview-empty">
          Office files are stored for download. Inline Office preview requires a document conversion service or Office viewer integration.
        </div>
      );
    }

    return (
      <div className="attachment-preview-empty">
        This file type can be stored and downloaded, but it does not have an inline browser preview.
      </div>
    );
  }

  const modal = (
    <div className="modal-backdrop attachment-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="attachment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="attachment-preview-header">
          <div>
            <strong id={titleId}>{attachment.fileName}</strong>
            <span>
              {getAttachmentKindLabel(attachment)} · {attachment.sizeLabel} · uploaded by {attachment.uploadedBy}
            </span>
          </div>
          <div className="attachment-preview-actions">
            <button
              className="secondary-button attachment-action-button"
              type="button"
              disabled={!canDownload}
              onClick={() => onDownload(attachment)}
            >
              <TegelIcon name="document" size="16px" />
              Download
            </button>
            <button className="icon-button quiet" type="button" aria-label="Close attachment preview" onClick={onClose}>
              <TegelIcon name="cross" />
            </button>
          </div>
        </div>
        {downloadError ? (
          <p className="form-error attachment-upload-error" role="alert">
            {downloadError}
          </p>
        ) : null}
        <div className={`attachment-preview-body attachment-preview-${previewKind}`}>
          {renderPreviewBody()}
        </div>
      </section>
    </div>
  );

  return isMounted ? createPortal(modal, document.body) : null;
}

function AttachmentPanel({
  ticket,
  expanded = false,
  embedded = false,
  onAddAttachments,
  onReplaceAttachmentContent
}: {
  ticket: Ticket;
  expanded?: boolean;
  embedded?: boolean;
  onAddAttachments?: (ticketKey: string, attachments: NewTicketAttachmentInput[]) => void;
  onReplaceAttachmentContent?: (ticketKey: string, attachmentId: string, attachment: NewTicketAttachmentInput) => void;
}) {
  const [selectedAttachmentId, setSelectedAttachmentId] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [isReadingAttachments, setIsReadingAttachments] = useState(false);
  const [replacingAttachmentId, setReplacingAttachmentId] = useState("");
  const selectedAttachment = ticket.attachments.find((attachment) => attachment.id === selectedAttachmentId);

  useEffect(() => {
    setSelectedAttachmentId("");
    setUploadError("");
    setDownloadError("");
    setReplacingAttachmentId("");
  }, [ticket.key]);

  async function addAttachmentFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);

    if (!selectedFiles.length || !onAddAttachments) {
      return;
    }

    setIsReadingAttachments(true);
    setUploadError("");

    try {
      const { attachments, rejectedFileNames } = await buildAttachmentInputsFromFiles(selectedFiles);

      if (attachments.length > 0) {
        onAddAttachments(ticket.key, attachments);
      }

      setUploadError(getAttachmentLimitError(rejectedFileNames));
    } catch (error) {
      console.error("Failed to add attachment files.", {
        error: getErrorMessage(error)
      });
      setUploadError("Could not read the selected attachment files.");
    } finally {
      setIsReadingAttachments(false);
    }
  }

  async function replaceAttachmentContent(attachmentId: string, files: FileList | null) {
    const selectedFile = files?.[0];

    if (!selectedFile || !onReplaceAttachmentContent) {
      return;
    }

    setReplacingAttachmentId(attachmentId);
    setUploadError("");
    setDownloadError("");

    try {
      const { attachments, rejectedFileNames } = await buildAttachmentInputsFromFiles([selectedFile]);

      if (attachments[0]) {
        onReplaceAttachmentContent(ticket.key, attachmentId, attachments[0]);
      }

      setUploadError(getAttachmentLimitError(rejectedFileNames));
    } catch (error) {
      console.error("Failed to replace attachment content.", {
        error: getErrorMessage(error)
      });
      setUploadError("Could not read the selected attachment file.");
    } finally {
      setReplacingAttachmentId("");
    }
  }

  async function downloadAttachment(attachment: Ticket["attachments"][number]) {
    setDownloadError("");

    try {
      await triggerAttachmentDownload(attachment);
    } catch (error) {
      console.error("Failed to download attachment.", {
        attachmentId: attachment.id,
        error: getErrorMessage(error)
      });
      setDownloadError("File content is not stored for this attachment yet. Attach the original file content first.");
    }
  }

  return (
    <section className={embedded ? "embedded-section" : "panel attachment-panel"}>
      <PanelHeader
        title="Attachment management"
        description="View browser-safe previews, download stored files, and keep object-storage-ready metadata."
        iconName="paperclip"
      />
      {onAddAttachments ? (
        <div className="attachment-toolbar">
          <label className={`secondary-button attachment-upload-control ${isReadingAttachments ? "is-disabled" : ""}`}>
            <TegelIcon name="plus" size="16px" />
            <span>{isReadingAttachments ? "Reading files..." : "Add files"}</span>
            <input
              disabled={isReadingAttachments}
              multiple
              type="file"
              onChange={(event) => {
                void addAttachmentFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <span>PDF, Office, images, video, YAML, Markdown, and text files are accepted.</span>
        </div>
      ) : null}
      {uploadError ? (
        <p className="form-error attachment-upload-error" role="alert">
          {uploadError}
        </p>
      ) : null}
      <div className={`attachment-list ${expanded ? "is-expanded" : ""}`}>
        {ticket.attachments.length === 0 ? (
          <EmptyState title="No attachments" body="Files can be related to ticket data, clarifications, approvals, escalations, or Jira sync." />
        ) : (
          ticket.attachments.map((attachment) => (
            <div className="attachment-item" key={attachment.id}>
              <article className="attachment-row">
                <TegelIcon name="document" size="20px" />
                <div>
                  <strong>{attachment.fileName}</strong>
                  <span>
                    {attachment.sizeLabel} · {getAttachmentKindLabel(attachment)} ·{" "}
                    {attachment.relation.replace("_", " ")} · {attachment.storageProvider}
                  </span>
                </div>
                <div className="attachment-row-actions">
                  <button
                    className="secondary-button attachment-action-button"
                    type="button"
                    onClick={() => setSelectedAttachmentId(attachment.id)}
                  >
                    <TegelIcon name="chevron_right" size="16px" />
                    View
                  </button>
                  <button
                    className="secondary-button attachment-action-button"
                    type="button"
                    disabled={!attachment.contentDataUrl}
                    onClick={() => void downloadAttachment(attachment)}
                  >
                    <TegelIcon name="document" size="16px" />
                    Download
                  </button>
                </div>
              </article>
            </div>
          ))
        )}
      </div>
      {selectedAttachment ? (
        <AttachmentPreview
          attachment={selectedAttachment}
          downloadError={downloadError}
          isReplacing={replacingAttachmentId === selectedAttachment.id}
          onClose={() => {
            setSelectedAttachmentId("");
            setDownloadError("");
          }}
          onDownload={(attachment) => void downloadAttachment(attachment)}
          onReplaceContent={onReplaceAttachmentContent ? (attachmentId, files) => void replaceAttachmentContent(attachmentId, files) : undefined}
        />
      ) : null}
    </section>
  );
}

function AttachmentLibraryPanel({
  tickets,
  expanded = false,
  onOpenTicket,
  onReplaceAttachmentContent
}: {
  tickets: Ticket[];
  expanded?: boolean;
  onOpenTicket: (ticketKey: string) => void;
  onReplaceAttachmentContent?: (ticketKey: string, attachmentId: string, attachment: NewTicketAttachmentInput) => void;
}) {
  const [selectedAttachmentContext, setSelectedAttachmentContext] = useState<{
    ticketKey: string;
    attachmentId: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [replacingAttachmentId, setReplacingAttachmentId] = useState("");
  const library = useMemo(() => buildAttachmentLibrary(tickets), [tickets]);
  const selectedTicket = selectedAttachmentContext
    ? tickets.find((ticket) => ticket.key === selectedAttachmentContext.ticketKey)
    : undefined;
  const selectedAttachment = selectedTicket?.attachments.find(
    (attachment) => attachment.id === selectedAttachmentContext?.attachmentId
  );
  const attachmentCount = library.reduce((count, site) => count + site.attachmentCount, 0);

  async function replaceAttachmentContent(ticketKey: string, attachmentId: string, files: FileList | null) {
    const selectedFile = files?.[0];

    if (!selectedFile || !onReplaceAttachmentContent) {
      return;
    }

    setReplacingAttachmentId(attachmentId);
    setUploadError("");
    setDownloadError("");

    try {
      const { attachments, rejectedFileNames } = await buildAttachmentInputsFromFiles([selectedFile]);

      if (attachments[0]) {
        onReplaceAttachmentContent(ticketKey, attachmentId, attachments[0]);
      }

      setUploadError(getAttachmentLimitError(rejectedFileNames));
    } catch (error) {
      console.error("Failed to replace attachment content.", {
        error: getErrorMessage(error)
      });
      setUploadError("Could not read the selected attachment file.");
    } finally {
      setReplacingAttachmentId("");
    }
  }

  async function downloadAttachment(attachment: Ticket["attachments"][number]) {
    setDownloadError("");

    try {
      await triggerAttachmentDownload(attachment);
    } catch (error) {
      console.error("Failed to download attachment.", {
        attachmentId: attachment.id,
        error: getErrorMessage(error)
      });
      setDownloadError("File content is not stored for this attachment yet. Attach the original file content first.");
    }
  }

  return (
    <section className="panel attachment-panel attachment-library-panel">
      <PanelHeader
        title="Attachment library"
        description="Structured by site, PRU, product, ticket, and file."
        iconName="paperclip"
      />
      <div className="attachment-library-summary">
        <span>{formatCount(attachmentCount)} stored attachment{attachmentCount === 1 ? "" : "s"}</span>
        <span>{formatCount(library.length)} site folder{library.length === 1 ? "" : "s"}</span>
      </div>
      {uploadError ? (
        <p className="form-error attachment-upload-error" role="alert">
          {uploadError}
        </p>
      ) : null}
      <div className={`attachment-folder-tree ${expanded ? "is-expanded" : ""}`}>
        {library.length === 0 ? (
          <EmptyState
            title="No attachments"
            body="Files appear here after tickets in your scope receive attachments."
          />
        ) : null}
        {library.map((site) => (
          <details className="attachment-folder attachment-site-folder" key={site.label} open>
            <summary>
              <TegelIcon name="folder" size="18px" />
              <span>
                <strong>{site.label}</strong>
                <small>{formatCount(site.attachmentCount)} attachments</small>
              </span>
            </summary>
            <div className="attachment-folder-children">
              {site.prus.map((pru) => (
                <details className="attachment-folder attachment-pru-folder" key={`${site.label}-${pru.label}`} open>
                  <summary>
                    <TegelIcon name="folder" size="18px" />
                    <span>
                      <strong>{pru.label}</strong>
                      <small>{formatCount(pru.attachmentCount)} attachments</small>
                    </span>
                  </summary>
                  <div className="attachment-folder-children">
                    {pru.products.map((product) => (
                      <details
                        className="attachment-folder attachment-product-folder"
                        key={`${site.label}-${pru.label}-${product.label}`}
                        open
                      >
                        <summary>
                          <TegelIcon name="department" size="18px" />
                          <span>
                            <strong>{product.label}</strong>
                            <small>{formatCount(product.attachmentCount)} attachments</small>
                          </span>
                        </summary>
                        <div className="attachment-folder-children">
                          {product.tickets.map((ticketNode) => (
                            <details
                              className="attachment-folder attachment-ticket-folder"
                              key={ticketNode.ticket.key}
                              open
                            >
                              <summary>
                                <TegelIcon name="document" size="18px" />
                                <span>
                                  <strong>{ticketNode.ticket.key} - {ticketNode.ticket.title}</strong>
                                  <small>{formatCount(ticketNode.attachments.length)} attachments</small>
                                </span>
                                <button
                                  className="secondary-button attachment-action-button"
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    onOpenTicket(ticketNode.ticket.key);
                                  }}
                                >
                                  Open ticket
                                </button>
                              </summary>
                              <div className="attachment-ticket-files">
                                {ticketNode.attachments.map((attachment) => (
                                  <article className="attachment-row" key={attachment.id}>
                                    <TegelIcon name="document" size="20px" />
                                    <div>
                                      <strong>{attachment.fileName}</strong>
                                      <span>
                                        {attachment.sizeLabel} · {getAttachmentKindLabel(attachment)} · uploaded by{" "}
                                        {attachment.uploadedBy}
                                      </span>
                                    </div>
                                    <div className="attachment-row-actions">
                                      <button
                                        className="secondary-button attachment-action-button"
                                        type="button"
                                        onClick={() =>
                                          setSelectedAttachmentContext({
                                            ticketKey: ticketNode.ticket.key,
                                            attachmentId: attachment.id
                                          })
                                        }
                                      >
                                        <TegelIcon name="chevron_right" size="16px" />
                                        View
                                      </button>
                                      <button
                                        className="secondary-button attachment-action-button"
                                        type="button"
                                        disabled={!attachment.contentDataUrl}
                                        onClick={() => void downloadAttachment(attachment)}
                                      >
                                        <TegelIcon name="document" size="16px" />
                                        Download
                                      </button>
                                    </div>
                                  </article>
                                ))}
                              </div>
                            </details>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
      {selectedTicket && selectedAttachment ? (
        <AttachmentPreview
          attachment={selectedAttachment}
          downloadError={downloadError}
          isReplacing={replacingAttachmentId === selectedAttachment.id}
          onClose={() => {
            setSelectedAttachmentContext(null);
            setDownloadError("");
          }}
          onDownload={(attachment) => void downloadAttachment(attachment)}
          onReplaceContent={
            onReplaceAttachmentContent
              ? (attachmentId, files) => void replaceAttachmentContent(selectedTicket.key, attachmentId, files)
              : undefined
          }
        />
      ) : null}
    </section>
  );
}

const adminSections = [
  {
    id: "configuration",
    label: "Configuration",
    summary: "Master data",
    description: "Users, roles, regions, sites, products, PRUs, and modules.",
    iconName: "configurator"
  },
  {
    id: "responsibility",
    label: "Responsibility mapping",
    summary: "Owners by product",
    description: "Primary and acting role ownership by product, PRU, and site scope.",
    iconName: "profile"
  },
  {
    id: "forms",
    label: "Form templates",
    summary: "Dynamic intake",
    description: "Product and request-type specific form questions.",
    iconName: "document"
  },
  {
    id: "workflows",
    label: "Ticket workflows",
    summary: "Approval routing",
    description: "Request-type routing into governed workflow templates.",
    iconName: "route"
  },
  {
    id: "options",
    label: "Request options",
    summary: "Types and colors",
    description: "Ticket types, priorities, categories, and status colors.",
    iconName: "filters"
  },
  {
    id: "sla",
    label: "SLA rules",
    summary: "Targets",
    description: "Priority targets, warning windows, and escalation matrices.",
    iconName: "timer"
  },
  {
    id: "notifications",
    label: "Notifications",
    summary: "Templates",
    description: "In-app and email template routing by event and role.",
    iconName: "notification"
  },
  {
    id: "database",
    label: "Database",
    summary: "Tables and SQL",
    description: "Inspect local SQLite tables and run read-only SQL queries.",
    iconName: "report"
  }
] as const satisfies readonly {
  id: string;
  label: string;
  summary: string;
  description: string;
  iconName: TegelIconName;
}[];

type AdminSectionId = (typeof adminSections)[number]["id"];

function AdminConfigPanel({
  config,
  onConfigChange,
  role
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
  role: RoleKey;
}) {
  const [activeSectionId, setActiveSectionId] = useState<AdminSectionId>("configuration");
  const activeSection =
    adminSections.find((section) => section.id === activeSectionId) ?? adminSections[0];
  const currentRoleLabel = getAdminRoleLabel(role);

  return (
    <section className="admin-workspace">
      <aside className="panel admin-section-nav" aria-label="Admin configuration sections">
        <PanelHeader
          title="Admin configuration"
          description={`Current role: ${currentRoleLabel}. Configuration is modeled as editable backend data.`}
          iconName="configurator"
        />
        <div className="admin-section-list">
          {adminSections.map((section) => (
            <button
              className={`admin-section-button ${activeSectionId === section.id ? "is-active" : ""}`}
              key={section.id}
              onClick={() => setActiveSectionId(section.id)}
              type="button"
            >
              <TegelIcon name={section.iconName} />
              <span>
                <strong>{section.label}</strong>
                <small>{section.summary}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <div className="panel admin-section-panel">
        <PanelHeader
          title={activeSection.label}
          description={activeSection.description}
          iconName={activeSection.iconName}
        />
        {renderAdminSection(activeSectionId, config, onConfigChange, role)}
      </div>
    </section>
  );
}

function renderAdminSection(
  sectionId: AdminSectionId,
  config: AdminConfig,
  onConfigChange: AdminConfigUpdater,
  role: RoleKey
) {
  if (sectionId === "configuration") {
    return <AdminMasterDataManager config={config} onConfigChange={onConfigChange} />;
  }

  if (sectionId === "responsibility") {
    return <ResponsibilityMappingManager config={config} onConfigChange={onConfigChange} />;
  }

  if (sectionId === "forms") {
    return <FormTemplateManager config={config} onConfigChange={onConfigChange} />;
  }

  if (sectionId === "workflows") {
    return <TicketWorkflowManager config={config} onConfigChange={onConfigChange} />;
  }

  if (sectionId === "options") {
    return <RequestOptionsManager config={config} onConfigChange={onConfigChange} />;
  }

  if (sectionId === "sla") {
    return <SlaRulesManager config={config} onConfigChange={onConfigChange} />;
  }

  if (sectionId === "notifications") {
    return <NotificationTemplateManager config={config} onConfigChange={onConfigChange} />;
  }

  if (sectionId === "database") {
    return <DatabaseAdminPanel role={role} />;
  }

  return <AdminMasterDataManager config={config} onConfigChange={onConfigChange} />;
}

function RequestOptionsManager({
  config,
  onConfigChange
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
}) {
  function saveRequestType(editingOptionId: string | null, option: ConfigOption) {
    const defaultWorkflow = workflowTemplates.find((workflow) => workflow.id === "standard-governance") ?? workflowTemplates[0];

    onConfigChange((current) => ({
      ...current,
      requestTypes: editingOptionId
        ? current.requestTypes.map((type) => (type.id === editingOptionId ? option : type))
        : [...current.requestTypes, option],
      ticketTypeWorkflows: current.ticketTypeWorkflows.some((workflow) => workflow.ticketTypeId === option.id)
        ? current.ticketTypeWorkflows.map((workflow) =>
            workflow.ticketTypeId === option.id
              ? { ...workflow, active: option.active, updatedAt: new Date().toISOString() }
              : workflow
          )
        : [
            ...current.ticketTypeWorkflows,
            {
              id: `workflow-${option.id}`,
              ticketTypeId: option.id,
              workflowTemplateId: defaultWorkflow?.id ?? "standard-governance",
              escalationPolicyId: defaultWorkflow?.escalationPolicyId,
              stepIds: defaultWorkflow?.steps.map((step) => step.id) ?? [],
              jiraCreatorStepId: "release-gate",
              jiraCreatorStepIds: ["release-gate"],
              stepOverrides: {},
              active: option.active,
              updatedAt: new Date().toISOString()
            }
          ]
    }));
  }

  function setRequestTypeActive(optionId: string, active: boolean) {
    onConfigChange((current) => ({
      ...current,
      requestTypes: current.requestTypes.map((type) => (type.id === optionId ? { ...type, active } : type)),
      ticketTypeWorkflows: current.ticketTypeWorkflows.map((workflow) =>
        workflow.ticketTypeId === optionId ? { ...workflow, active, updatedAt: new Date().toISOString() } : workflow
      )
    }));
  }

  function savePriority(editingOptionId: string | null, option: ConfigOption) {
    onConfigChange((current) => {
      const previousOption = editingOptionId
        ? current.priorities.find((priority) => priority.id === editingOptionId)
        : undefined;
      const previousLabel = previousOption?.label;
      const priorityWasRenamed = Boolean(previousLabel && previousLabel !== option.label);

      return {
        ...current,
        priorities: editingOptionId
          ? current.priorities.map((priority) => (priority.id === editingOptionId ? option : priority))
          : [...current.priorities, option],
        slaRules: priorityWasRenamed
          ? current.slaRules.map((rule) =>
              rule.priority === previousLabel ? { ...rule, priority: option.label } : rule
            )
          : current.slaRules,
        escalationPolicies: priorityWasRenamed
          ? current.escalationPolicies.map((policy) =>
              policy.priority === previousLabel ? { ...policy, priority: option.label } : policy
            )
          : current.escalationPolicies
      };
    });
  }

  function saveRisk(editingOptionId: string | null, option: ConfigOption) {
    onConfigChange((current) => ({
      ...current,
      riskOptions: editingOptionId
        ? current.riskOptions.map((risk) => (risk.id === editingOptionId ? option : risk))
        : [...current.riskOptions, option]
    }));
  }

  return (
    <div className="request-options-manager">
      <div className="admin-summary-grid">
        <AdminSummaryCard label="Request types" value={config.requestTypes.length} />
        <AdminSummaryCard label="Priorities" value={config.priorities.length} />
        <AdminSummaryCard label="Risk levels" value={config.riskOptions.length} />
        <AdminSummaryCard label="Categories" value={config.requestCategories.length} />
      </div>
      <div className="request-options-grid">
        <RequestConfigOptionEditor
          title="Request types"
          description="Controls ticket type choices and default workflow routing."
          idPrefix="ticket-type"
          options={config.requestTypes}
          onSave={saveRequestType}
          onToggleActive={setRequestTypeActive}
          onRemove={(optionId) => onConfigChange((current) => removeTicketTypeFromConfig(current, optionId))}
        />
        <RequestConfigOptionEditor
          title="Priorities"
          description="Controls intake priority choices and SLA priority labels."
          idPrefix="priority"
          options={config.priorities}
          onSave={savePriority}
          onToggleActive={(optionId, active) =>
            onConfigChange((current) => ({
              ...current,
              priorities: current.priorities.map((priority) =>
                priority.id === optionId ? { ...priority, active } : priority
              )
            }))
          }
          onRemove={(optionId) =>
            onConfigChange((current) => {
              const removedPriority = current.priorities.find((priority) => priority.id === optionId);
              const remainingPriorities = current.priorities.filter((priority) => priority.id !== optionId);
              const fallbackPriority = remainingPriorities.find((priority) => priority.active)?.label ?? remainingPriorities[0]?.label ?? "2 - Medium";

              return {
                ...current,
                priorities: remainingPriorities,
                slaRules: removedPriority
                  ? current.slaRules.filter((rule) => rule.priority !== removedPriority.label)
                  : current.slaRules,
                escalationPolicies: removedPriority
                  ? current.escalationPolicies.map((policy) =>
                      policy.priority === removedPriority.label ? { ...policy, priority: fallbackPriority } : policy
                    )
                  : current.escalationPolicies
              };
            })
          }
        />
        <RequestConfigOptionEditor
          title="Risk levels"
          description="Controls selectable risk labels used during intake."
          idPrefix="risk"
          options={config.riskOptions}
          onSave={saveRisk}
          onToggleActive={(optionId, active) =>
            onConfigChange((current) => ({
              ...current,
              riskOptions: current.riskOptions.map((risk) => (risk.id === optionId ? { ...risk, active } : risk))
            }))
          }
          onRemove={(optionId) =>
            onConfigChange((current) => ({
              ...current,
              riskOptions: current.riskOptions.filter((risk) => risk.id !== optionId)
            }))
          }
        />
        <StatusColorEditor
          statuses={config.statusColors}
          onSave={(editingStatus, statusColor) =>
            onConfigChange((current) => ({
              ...current,
              statusColors: editingStatus
                ? current.statusColors.map((status) => (status.status === editingStatus ? statusColor : status))
                : [...current.statusColors, statusColor]
            }))
          }
          onRemove={(statusLabel) =>
            onConfigChange((current) => ({
              ...current,
              statusColors: current.statusColors.filter((status) => status.status !== statusLabel)
            }))
          }
        />
        <RequestCategoryEditor
          categories={config.requestCategories}
          onSave={(editingCategory, category) =>
            onConfigChange((current) => ({
              ...current,
              requestCategories: editingCategory
                ? current.requestCategories.map((item) => (item === editingCategory ? category : item))
                : [...current.requestCategories, category]
            }))
          }
          onRemove={(category) =>
            onConfigChange((current) => ({
              ...current,
              requestCategories: current.requestCategories.filter((item) => item !== category)
            }))
          }
        />
      </div>
    </div>
  );
}

function RequestConfigOptionEditor({
  title,
  description,
  idPrefix,
  options,
  onSave,
  onToggleActive,
  onRemove
}: {
  title: string;
  description: string;
  idPrefix: string;
  options: ConfigOption[];
  onSave: (editingOptionId: string | null, option: ConfigOption) => void;
  onToggleActive: (optionId: string, active: boolean) => void;
  onRemove: (optionId: string) => void;
}) {
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [optionForm, setOptionForm] = useState<RequestOptionFormState>(() =>
    buildRequestOptionForm(undefined, options.length + 1)
  );
  const [error, setError] = useState("");
  const sortedOptions = sortConfigOptions(options);

  function resetForm() {
    setEditingOptionId(null);
    setOptionForm(buildRequestOptionForm(undefined, options.length + 1));
    setError("");
  }

  function startEdit(option: ConfigOption) {
    setEditingOptionId(option.id);
    setOptionForm(buildRequestOptionForm(option, options.length + 1));
    setError("");
  }

  function saveOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const label = optionForm.label.trim();

    if (!label) {
      setError("Label is required.");
      return;
    }

    const hasDuplicateLabel = options.some(
      (option) => option.id !== editingOptionId && normalizeRoleText(option.label) === normalizeRoleText(label)
    );

    if (hasDuplicateLabel) {
      setError("A record with this label already exists.");
      return;
    }

    const id =
      editingOptionId ??
      getUniqueConfigId(
        options.map((option) => option.id),
        normalizeId(label, idPrefix)
      );
    const sortOrder = Number.parseInt(optionForm.sortOrder, 10);

    onSave(editingOptionId, {
      id,
      label,
      color: optionForm.color,
      active: optionForm.active,
      sortOrder: Number.isFinite(sortOrder) && sortOrder > 0 ? sortOrder : options.length + 1
    });
    setEditingOptionId(id);
    setOptionForm((current) => ({ ...current, label }));
    setError("");
  }

  return (
    <section className="request-options-editor">
      <form className="admin-editor-form admin-form request-option-form" onSubmit={saveOption}>
        <div className="admin-form-heading">
          <h3>{editingOptionId ? `Edit ${title.toLowerCase()}` : `Create ${title.toLowerCase()}`}</h3>
          {editingOptionId ? (
            <button className="secondary-button" type="button" onClick={resetForm}>
              New
            </button>
          ) : null}
        </div>
        <p className="admin-hint">{description}</p>
        {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
        <label className="form-field">
          <span>Label</span>
          <input
            value={optionForm.label}
            onChange={(event) => setOptionForm({ ...optionForm, label: event.target.value })}
            placeholder={title === "Request types" ? "Change Request" : title === "Priorities" ? "2 - Medium" : "Medium"}
          />
        </label>
        <div className="admin-form-grid two-columns">
          <label className="form-field">
            <span>Color</span>
            <select
              value={optionForm.color}
              onChange={(event) => setOptionForm({ ...optionForm, color: event.target.value as TegelTagVariant })}
            >
              {tagVariantOptions.map((variant) => (
                <option key={variant} value={variant}>
                  {variant}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Sort order</span>
            <input
              min="1"
              type="number"
              value={optionForm.sortOrder}
              onChange={(event) => setOptionForm({ ...optionForm, sortOrder: event.target.value })}
            />
          </label>
        </div>
        <AdminCheckbox
          checked={optionForm.active}
          label="Active"
          onChange={(active) => setOptionForm({ ...optionForm, active })}
        />
        <div className="request-option-preview">
          <span className={`admin-pill tag-variant-${optionForm.color}`}>{optionForm.label || "Preview"}</span>
        </div>
        <AdminFormActions editing={Boolean(editingOptionId)} onCancel={resetForm} />
      </form>
      <div className="request-option-record-list">
        {sortedOptions.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()}`} body="Create the first option to make it available in ticket intake." />
        ) : null}
        {sortedOptions.map((option) => (
          <article className="admin-editable-record request-option-record" key={option.id}>
            <div className="admin-record-main">
              <div className="admin-record-header">
                <div>
                  <strong>{option.label}</strong>
                  <span>{option.id} · sort {option.sortOrder}</span>
                </div>
                <AdminStatusPill active={option.active} />
              </div>
              <div className="admin-pill-list">
                <span className={`admin-pill tag-variant-${option.color}`}>{option.color}</span>
              </div>
            </div>
            <div className="admin-record-actions">
              <button className="secondary-button" type="button" onClick={() => startEdit(option)}>
                <TegelIcon name="edit" size="16px" />
                Edit
              </button>
              <button className="secondary-button" type="button" onClick={() => onToggleActive(option.id, !option.active)}>
                {option.active ? "Deactivate" : "Activate"}
              </button>
              <button className="secondary-button danger-button hard-delete-button" type="button" onClick={() => onRemove(option.id)}>
                <TegelIcon name="trash" size="16px" />
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatusColorEditor({
  statuses,
  onSave,
  onRemove
}: {
  statuses: StatusColorConfig[];
  onSave: (editingStatus: string | null, statusColor: StatusColorConfig) => void;
  onRemove: (statusLabel: string) => void;
}) {
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [statusForm, setStatusForm] = useState<StatusColorFormState>(() => buildStatusColorForm());
  const [error, setError] = useState("");

  function resetForm() {
    setEditingStatus(null);
    setStatusForm(buildStatusColorForm());
    setError("");
  }

  function startEdit(statusColor: StatusColorConfig) {
    setEditingStatus(statusColor.status);
    setStatusForm(buildStatusColorForm(statusColor));
    setError("");
  }

  function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const editingStandardStatus = editingStatus ? isDefaultStatusColor(editingStatus) : false;
    const status = editingStandardStatus ? editingStatus : statusForm.status.trim();

    if (!status) {
      setError("Status label is required.");
      return;
    }

    const hasDuplicateStatus = statuses.some(
      (item) => item.status !== editingStatus && normalizeRoleText(item.status) === normalizeRoleText(status)
    );

    if (hasDuplicateStatus) {
      setError("A status color with this label already exists.");
      return;
    }

    onSave(editingStatus, { status, color: statusForm.color });
    setEditingStatus(status);
    setStatusForm({ status, color: statusForm.color });
    setError("");
  }

  return (
    <section className="request-options-editor">
      <form className="admin-editor-form admin-form request-option-form" onSubmit={saveStatus}>
        <div className="admin-form-heading">
          <h3>{editingStatus ? "Edit status color" : "Create status color"}</h3>
          {editingStatus ? (
            <button className="secondary-button" type="button" onClick={resetForm}>
              New
            </button>
          ) : null}
        </div>
        <p className="admin-hint">Controls the color tag used when this status appears in admin surfaces.</p>
        {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
        <label className="form-field">
          <span>Status label</span>
          <input
            readOnly={Boolean(editingStatus && isDefaultStatusColor(editingStatus))}
            value={statusForm.status}
            onChange={(event) => setStatusForm({ ...statusForm, status: event.target.value })}
            placeholder="Approval"
          />
        </label>
        <label className="form-field">
          <span>Color</span>
          <select
            value={statusForm.color}
            onChange={(event) => setStatusForm({ ...statusForm, color: event.target.value as TegelTagVariant })}
          >
            {tagVariantOptions.map((variant) => (
              <option key={variant} value={variant}>
                {variant}
              </option>
            ))}
          </select>
        </label>
        <div className="request-option-preview">
          <span className={`admin-pill tag-variant-${statusForm.color}`}>{statusForm.status || "Preview"}</span>
        </div>
        <AdminFormActions editing={Boolean(editingStatus)} onCancel={resetForm} />
      </form>
      <div className="request-option-record-list">
        {statuses.map((statusColor) => {
          const isStandardStatus = isDefaultStatusColor(statusColor.status);

          return (
            <article className="admin-editable-record request-option-record" key={statusColor.status}>
              <div className="admin-record-main">
                <div className="admin-record-header">
                  <div>
                    <strong>{statusColor.status}</strong>
                    <span>Workflow status color</span>
                  </div>
                </div>
                <div className="admin-pill-list">
                  <span className={`admin-pill tag-variant-${statusColor.color}`}>{statusColor.color}</span>
                  <span className="admin-pill tag-variant-neutral">{isStandardStatus ? "Standard" : "Custom"}</span>
                </div>
              </div>
              <div className="admin-record-actions">
                <button className="secondary-button" type="button" onClick={() => startEdit(statusColor)}>
                  <TegelIcon name="edit" size="16px" />
                  Edit
                </button>
                {!isStandardStatus ? (
                  <button className="secondary-button danger-button hard-delete-button" type="button" onClick={() => onRemove(statusColor.status)}>
                    <TegelIcon name="trash" size="16px" />
                    Delete
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RequestCategoryEditor({
  categories,
  onSave,
  onRemove
}: {
  categories: string[];
  onSave: (editingCategory: string | null, category: string) => void;
  onRemove: (category: string) => void;
}) {
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<RequestCategoryFormState>(() => buildRequestCategoryForm());
  const [error, setError] = useState("");

  function resetForm() {
    setEditingCategory(null);
    setCategoryForm(buildRequestCategoryForm());
    setError("");
  }

  function startEdit(category: string) {
    setEditingCategory(category);
    setCategoryForm(buildRequestCategoryForm(category));
    setError("");
  }

  function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const category = categoryForm.category.trim();

    if (!category) {
      setError("Category is required.");
      return;
    }

    const hasDuplicateCategory = categories.some(
      (item) => item !== editingCategory && normalizeRoleText(item) === normalizeRoleText(category)
    );

    if (hasDuplicateCategory) {
      setError("A category with this label already exists.");
      return;
    }

    onSave(editingCategory, category);
    setEditingCategory(category);
    setCategoryForm(buildRequestCategoryForm(category));
    setError("");
  }

  return (
    <section className="request-options-editor request-category-editor">
      <form className="admin-editor-form admin-form request-option-form" onSubmit={saveCategory}>
        <div className="admin-form-heading">
          <h3>{editingCategory ? "Edit category" : "Create category"}</h3>
          {editingCategory ? (
            <button className="secondary-button" type="button" onClick={resetForm}>
              New
            </button>
          ) : null}
        </div>
        <p className="admin-hint">Controls classification values available to ticket intake and reporting.</p>
        {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
        <label className="form-field">
          <span>Category</span>
          <input
            value={categoryForm.category}
            onChange={(event) => setCategoryForm({ category: event.target.value })}
            placeholder="Data quality"
          />
        </label>
        <AdminFormActions editing={Boolean(editingCategory)} onCancel={resetForm} />
      </form>
      <div className="request-option-record-list">
        {categories.map((category) => (
          <article className="admin-editable-record request-option-record" key={category}>
            <div className="admin-record-main">
              <div className="admin-record-header">
                <div>
                  <strong>{category}</strong>
                  <span>Selectable classification</span>
                </div>
              </div>
              <div className="admin-pill-list">
                <span className="admin-pill">active</span>
              </div>
            </div>
            <div className="admin-record-actions">
              <button className="secondary-button" type="button" onClick={() => startEdit(category)}>
                <TegelIcon name="edit" size="16px" />
                Edit
              </button>
              <button className="secondary-button danger-button hard-delete-button" type="button" onClick={() => onRemove(category)}>
                <TegelIcon name="trash" size="16px" />
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function formatDatabaseCell(value: unknown): string {
  if (value === null || typeof value === "undefined") {
    return "NULL";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

const defaultDatabaseConfigSql = "SELECT key, updated_at FROM app_config";

function isLocalTestingHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function isLocalTicketCleanupVisible(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_NEXUS_ENABLE_LOCAL_TEST_TOOLS === "true" ||
    (typeof window !== "undefined" && isLocalTestingHostname(window.location.hostname))
  );
}

function DatabaseAdminPanel({ role }: { role: RoleKey }) {
  const [tables, setTables] = useState<DatabaseTableSummary[]>([]);
  const [databasePath, setDatabasePath] = useState("");
  const [selectedTableName, setSelectedTableName] = useState("");
  const [sql, setSql] = useState(defaultDatabaseConfigSql);
  const [queryResult, setQueryResult] = useState<DatabaseQueryResult | null>(null);
  const [error, setError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isRunningQuery, setIsRunningQuery] = useState(false);
  const [isResettingDatabase, setIsResettingDatabase] = useState(false);
  const isDevelopmentDatabaseToolsEnabled = isLocalTicketCleanupVisible();
  const selectedTable = tables.find((table) => table.name === selectedTableName) ?? tables[0];
  const totalRows = tables.reduce((count, table) => count + table.rowCount, 0);

  useEffect(() => {
    if (role !== "admin") {
      return;
    }

    let isCancelled = false;

    async function loadTables() {
      setIsLoadingTables(true);
      setError("");

      try {
        const response = await fetch("/api/database?role=admin", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | {
              data?: { tables?: DatabaseTableSummary[] };
              meta?: { databasePath?: string };
              error?: { message?: string };
            }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Failed to load local database metadata.");
        }

        if (!isCancelled) {
          const nextTables = payload?.data?.tables ?? [];
          setTables(nextTables);
          setSelectedTableName((currentName) =>
            nextTables.some((table) => table.name === currentName) ? currentName : nextTables[0]?.name ?? ""
          );
          setDatabasePath(payload?.meta?.databasePath ?? "");
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTables(false);
        }
      }
    }

    void loadTables();

    return () => {
      isCancelled = true;
    };
  }, [role]);

  async function runQuery(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!sql.trim()) {
      setError("SQL query is required.");
      return;
    }

    setIsRunningQuery(true);
    setError("");

    try {
      const response = await fetch("/api/database", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          role,
          sql
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            data?: DatabaseQueryResult;
            error?: { message?: string };
          }
        | null;

      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? "Database query failed.");
      }

      setQueryResult(payload.data);
    } catch (queryError) {
      setQueryResult(null);
      setError(getErrorMessage(queryError));
    } finally {
      setIsRunningQuery(false);
    }
  }

  function inspectTable(tableName: string) {
    setSelectedTableName(tableName);
    setSql(`SELECT * FROM ${quoteSqlIdentifier(tableName)} LIMIT 20`);
    setQueryResult(null);
    setError("");
    setResetNotice("");
  }

  async function cleanDevelopmentTickets() {
    if (!isDevelopmentDatabaseToolsEnabled) {
      setError("Local ticket cleaning is available only in development mode.");
      return;
    }

    const confirmed = window.confirm(
      "Clean local testing tickets? This deletes only tickets from the local database. Admin configuration and integration settings are kept."
    );

    if (!confirmed) {
      return;
    }

    setIsResettingDatabase(true);
    setError("");
    setResetNotice("");

    try {
      const response = await fetch("/api/database", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          role,
          confirmation: "clean-local-tickets"
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            data?: { tables?: DatabaseTableSummary[] };
            meta?: { databasePath?: string };
            error?: { message?: string };
          }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Local ticket cleanup failed.");
      }

      const nextTables = payload?.data?.tables ?? [];

      setTables(nextTables);
      setSelectedTableName(nextTables[0]?.name ?? "");
      setDatabasePath(payload?.meta?.databasePath ?? databasePath);
      setSql(defaultDatabaseConfigSql);
      setQueryResult(null);
      setResetNotice("Local tickets cleaned. Reloading ticket state...");

      try {
        window.localStorage.removeItem(notificationReadStorageKey);
        window.localStorage.removeItem(jiraCheckedStorageKey);
        window.localStorage.removeItem(sentEmailNotificationStorageKey);
      } catch (storageError) {
        console.error("Failed to clean browser test state after database reset.", {
          error: getErrorMessage(storageError)
        });
      }

      window.location.reload();
    } catch (resetError) {
      setError(getErrorMessage(resetError));
    } finally {
      setIsResettingDatabase(false);
    }
  }

  if (role !== "admin") {
    return <AccessRestrictedPanel activeModule="admin" role={role} />;
  }

  return (
    <div className="database-admin-panel">
      <div className="admin-metric-grid">
        <AdminSummaryCard label="Tables" value={tables.length} />
        <AdminSummaryCard label="Rows" value={totalRows} />
        <AdminSummaryCard
          label="Columns"
          value={tables.reduce((count, table) => count + table.columns.length, 0)}
        />
      </div>
      <section className="database-path-card">
        <strong>Local database</strong>
        <span>{databasePath || "Loading database path..."}</span>
      </section>
      {isDevelopmentDatabaseToolsEnabled ? (
        <section className="database-reset-card">
          <div>
            <strong>Development testing</strong>
            <span>Delete local testing tickets only. Admin configuration stays unchanged.</span>
          </div>
          <button
            className="secondary-button danger-button"
            disabled={isResettingDatabase}
            onClick={cleanDevelopmentTickets}
            type="button"
          >
            <TegelIcon name="trash" size="16px" />
            {isResettingDatabase ? "Cleaning..." : "Clean tickets"}
          </button>
        </section>
      ) : null}
      {error ? <p className="admin-form-error">{error}</p> : null}
      {resetNotice ? <p className="admin-form-success">{resetNotice}</p> : null}
      <section className="database-query-panel panel">
        <PanelHeader
          title="SQL query"
          description="Read-only SQL console for local troubleshooting."
          iconName="filters"
        />
        <form className="database-query-form" onSubmit={runQuery}>
          <label className="form-field">
            <span>SQL</span>
            <textarea
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              rows={5}
              spellCheck={false}
            />
          </label>
          <div className="database-query-actions">
            <button className="secondary-button" type="button" onClick={() => setSql(defaultDatabaseConfigSql)}>
              Config rows
            </button>
            <button className="secondary-button" type="button" onClick={() => setSql("SELECT key, title, state, updated_at FROM tickets ORDER BY updated_at DESC LIMIT 50")}>
              Ticket rows
            </button>
            <button className="primary-button" disabled={isRunningQuery} type="submit">
              <TegelIcon name="search" size="16px" />
              {isRunningQuery ? "Running..." : "Run query"}
            </button>
          </div>
          <p className="admin-hint">
            Allowed statements: SELECT, WITH, and safe PRAGMA reads. Write and schema-changing statements are blocked.
          </p>
        </form>
        {queryResult ? (
          <div className="database-query-result">
            <div className="database-query-meta">
              <strong>{queryResult.statementType}</strong>
              <span>
                {formatCount(queryResult.rowCount)} row{queryResult.rowCount === 1 ? "" : "s"} in {queryResult.elapsedMs}ms
              </span>
            </div>
            <DatabaseResultTable columns={queryResult.columns} rows={queryResult.rows} />
          </div>
        ) : null}
      </section>
      <div className="database-grid">
        <section className="database-table-browser panel">
          <PanelHeader
            title="Tables"
            description="Local SQLite tables, columns, and row counts."
            iconName="report"
          />
          {isLoadingTables ? <p className="admin-hint">Loading database tables...</p> : null}
          <div className="database-table-list">
            {tables.map((table) => (
              <button
                className={`database-table-button ${selectedTable?.name === table.name ? "is-selected" : ""}`}
                key={table.name}
                onClick={() => inspectTable(table.name)}
                type="button"
              >
                <strong>{table.name}</strong>
                <span>
                  {formatCount(table.rowCount)} row{table.rowCount === 1 ? "" : "s"} - {formatCount(table.columns.length)} column{table.columns.length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
          {tables.length === 0 && !isLoadingTables ? (
            <EmptyState title="No database tables" body="Local SQLite tables will appear after the database initializes." />
          ) : null}
        </section>

        <section className="database-detail-panel panel">
          <PanelHeader
            title={selectedTable?.name ?? "Table detail"}
            description="Column metadata for the selected local table."
            iconName="document"
          />
          {selectedTable ? (
            <>
              <div className="database-column-list">
                {selectedTable.columns.map((column) => (
                  <div className="database-column-row" key={`${selectedTable.name}-${column.name}`}>
                    <strong>{column.name}</strong>
                    <span>
                      {column.type || "ANY"}{column.primaryKey ? " - primary key" : ""}{column.nullable ? "" : " - required"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="No table selected" body="Select a local database table to inspect its columns." />
          )}
        </section>
      </div>
    </div>
  );
}

function DatabaseResultTable({
  columns,
  rows
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  if (columns.length === 0) {
    return <EmptyState title="No rows" body="The selected table or query returned no rows." />;
  }

  return (
    <div className="database-result-scroll">
      <table className="database-result-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>No rows returned.</td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={`database-row-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={`${rowIndex}-${column}`}>{formatDatabaseCell(row[column])}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

type AdminMasterTab = "users" | "roles" | "regions" | "products" | "prus" | "modules" | "ticketTypes";

type UserFormState = {
  displayName: string;
  email: string;
  primaryRole: RoleKey;
  actionRoles: RoleKey[];
  region: string;
  site: string;
  productIds: string[];
  pruNames: string[];
  active: boolean;
};

type RoleFormState = {
  role: RoleKey;
  customKey: string;
  label: string;
  description: string;
  domain: RoleDomain;
  workflowType: WorkflowRoleType;
};

type RegionSiteFormState = {
  region: string;
  site: string;
  localProductOwnerId: string;
  active: boolean;
};

type ProductFormState = {
  productName: string;
  productOwnerName: string;
  jiraProjectKey: string;
  active: boolean;
};

type PruFormState = {
  productIds: string[];
  name: string;
  site: string;
  localProductOwnerId: string;
  active: boolean;
};

type ModuleFormState = {
  productId: string;
  pruIds: string[];
  name: string;
  jiraComponent: string;
  active: boolean;
};

type TicketTypeFormState = {
  label: string;
  color: TegelTagVariant;
  active: boolean;
  sortOrder: string;
};

type SlaRuleFormState = {
  priority: Ticket["priority"];
  targetHours: string;
  warningHours: string;
};

type RequestOptionFormState = {
  label: string;
  color: TegelTagVariant;
  active: boolean;
  sortOrder: string;
};

type StatusColorFormState = {
  status: string;
  color: TegelTagVariant;
};

type RequestCategoryFormState = {
  category: string;
};

type EscalationPolicyFormState = {
  id: string;
  name: string;
  priority: string;
  responseHours: string;
  resolutionHours: string;
  escalationMatrixId: string;
};

type WorkflowStepFormState = {
  label: string;
  ownerRole: RoleKey;
  workflowType: WorkflowRoleType;
  required: boolean;
  parallelGroup: string;
  slaHours: string;
  allowDelegation: boolean;
  allowClarification: boolean;
};

type WorkflowRouteFormState = {
  ticketTypeId: string;
  workflowTemplateId: string;
  escalationPolicyId: string;
  stepIds: string[];
  jiraCreatorStepIds: string[];
  stepOverrides: Record<string, WorkflowStepFormState>;
  active: boolean;
};

type FormTemplateFormState = {
  productName: string;
  requestTypeId: string;
  title: string;
  description: string;
  fields: FormTemplateField[];
  active: boolean;
};

type TemplateFieldFormState = {
  id: string;
  label: string;
  type: FormFieldType;
  component: FormComponentType;
  required: boolean;
  helperText: string;
  optionsText: string;
  optionSource: FormTemplateOptionSource;
  sortOrder: string;
};

type ResponsibilityMappingFormState = {
  roleIds: RoleKey[];
  productIds: string[];
  regionSiteIds: string[];
  pruNames: string[];
  userIds: string[];
  actingRole: boolean;
  active: boolean;
};

type NotificationTemplateFormState = {
  eventType: NotificationEventType;
  subject: string;
  body: string;
  deliveryMode: NotificationDeliveryMode;
  severity: NotificationSeverity;
  enabledRoles: RoleKey[];
  active: boolean;
};

type JiraConfigFormState = {
  enabled: boolean;
  apiBaseUrl: string;
  apiVersion: JiraApiVersion;
  projectUrl: string;
  defaultProjectKey: string;
  defaultIssueType: string;
  authMode: JiraAuthMode;
  username: string;
  token: string;
  testIssueSummary: string;
};

type SmtpConfigFormState = {
  enabled: boolean;
  deliveryMode: NotificationDeliveryMode;
  host: string;
  port: string;
  security: SmtpConfig["security"];
  fromName: string;
  fromEmail: string;
  username: string;
  password: string;
  testRecipient: string;
  testSubject: string;
  testBody: string;
};

type IntegrationProviderKey = "jira" | "smtp";

type IntegrationTestResult = {
  tone: "success" | "warning" | "danger";
  title: string;
  detail: string;
  checkedAt: string;
};

type IntegrationApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: string[];
  };
};

type JiraIssueStatusDetails = {
  name?: string;
  categoryKey?: string;
  categoryName?: string;
  resolutionName?: string | null;
};

type JiraAttachmentActionPayload = {
  uploaded?: string[];
  skipped?: string[];
};

type JiraCreateTaskPayload = IntegrationApiErrorPayload | {
  data?: {
    status?: string;
    jiraKey?: string;
    jiraId?: string | null;
    jiraUrl?: string | null;
    self?: string | null;
    jiraStatus?: JiraIssueStatusDetails;
    issueFields?: JiraSyncedIssueFieldsInput;
    comment?: JiraSyncedCommentInput;
    comments?: JiraSyncedCommentInput[];
    attachments?: JiraAttachmentActionPayload;
    warnings?: string[];
  };
};

interface DatabaseColumnSummary {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: unknown;
}

interface DatabaseTableSummary {
  name: string;
  rowCount: number;
  columns: DatabaseColumnSummary[];
  previewRows: Record<string, unknown>[];
}

interface DatabaseQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  elapsedMs: number;
  statementType: string;
}

type LocalIntegrationSecrets = {
  jiraToken?: string;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpTestRecipient?: string;
  smtpTestSubject?: string;
  smtpTestBody?: string;
  updatedAt?: string;
};

type PruEditRef = {
  productId: string;
  pruId: string;
};

type ModuleEditRef = PruEditRef & {
  moduleId: string;
};

const roleDomainOptions: RoleDomain[] = ["Business", "IT", "Admin"];
const workflowRoleTypeOptions = [
  { value: "approval", label: "Approval level" },
  { value: "review", label: "Review level" },
  { value: "inform", label: "Inform only" }
] as const satisfies readonly { value: WorkflowRoleType; label: string }[];
const workflowRoleTypeCompatibility: Partial<Record<RoleKey, readonly WorkflowRoleType[]>> = {
  software_architect: ["approval", "review"]
};
const tagVariantOptions: TegelTagVariant[] = [
  "neutral",
  "information",
  "success",
  "warning",
  "new",
  "error"
];

const formFieldTypes = [
  { value: "shortText", label: "Short text" },
  { value: "longText", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "singleSelect", label: "Single select" },
  { value: "multiSelect", label: "Multi select" },
  { value: "yesNo", label: "Yes / No" }
] as const satisfies readonly { value: FormFieldType; label: string }[];

const formComponentTypes = [
  { value: "textField", label: "Text field" },
  { value: "textArea", label: "Text area" },
  { value: "numberField", label: "Number field" },
  { value: "datePicker", label: "Date picker" },
  { value: "dropdown", label: "Dropdown" },
  { value: "radioGroup", label: "Radio group" },
  { value: "checkbox", label: "Checkbox" },
  { value: "checkboxGroup", label: "Checkbox group" }
] as const satisfies readonly { value: FormComponentType; label: string }[];

const defaultOptionsByFieldType: Partial<Record<FormFieldType, string[]>> = {
  singleSelect: ["Option A", "Option B"],
  multiSelect: ["Option A", "Option B"],
  yesNo: ["Yes", "No"]
};

const templateFieldOptionSourceOptions = [
  { value: "manual", label: "Manual options" },
  { value: "portalProducts", label: "Portal products" },
  { value: "portalPrus", label: "Portal PRUs" },
  { value: "portalModules", label: "Portal modules" },
  { value: "jiraUnreleasedVersions", label: "Jira available versions" },
  { value: "jiraVersions", label: "Jira all versions" },
  { value: "jiraSprints", label: "Jira sprints" },
  { value: "jiraComponents", label: "Jira components" },
  { value: "jiraBoards", label: "Jira boards" },
  { value: "jiraPriorities", label: "Jira priorities" }
] as const satisfies readonly { value: FormTemplateOptionSource; label: string }[];

const jiraTemplateOptionSources = new Set<FormTemplateOptionSource>([
  "jiraUnreleasedVersions",
  "jiraVersions",
  "jiraSprints",
  "jiraComponents",
  "jiraBoards",
  "jiraPriorities"
]);

const workflowStatusOverrideOptions = [
  { value: "active", label: "Start again / reopen" },
  { value: "blocked", label: "Blocked" },
  { value: "optional", label: "Not needed" },
  { value: "waiting", label: "Waiting" },
  { value: "complete", label: "Completed" }
] as const satisfies readonly { value: WorkflowStepStatus; label: string }[];

const adminMasterTabs = [
  { id: "users", label: "Users", iconName: "profile" },
  { id: "roles", label: "Roles", iconName: "privacy" },
  { id: "regions", label: "Regions/sites", iconName: "global" },
  { id: "products", label: "Products", iconName: "department" },
  { id: "prus", label: "PRUs", iconName: "factory" },
  { id: "modules", label: "Modules", iconName: "folder" },
  { id: "ticketTypes", label: "Ticket types", iconName: "document" }
] as const satisfies readonly {
  id: AdminMasterTab;
  label: string;
  iconName: TegelIconName;
}[];

function getUniqueConfigId(existingIds: string[], preferredId: string): string {
  return existingIds.includes(preferredId) ? `${preferredId}-${Date.now()}` : preferredId;
}

function getConfigSiteByName(config: AdminConfig, siteName: string): RegionSiteConfig | undefined {
  return config.regionSites.find((site) => site.site === siteName);
}

function getWorkflowRoleTypeLabel(type: WorkflowRoleType): string {
  return workflowRoleTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function getRoleWorkflowType(config: AdminConfig, role: RoleKey): WorkflowRoleType {
  return (
    config.roleDomains.find((roleDomain) => roleDomain.role === role)?.workflowType ??
    getDefaultWorkflowRoleType(role)
  );
}

function roleCanOwnWorkflowType(config: AdminConfig, role: RoleKey, workflowType?: WorkflowRoleType): boolean {
  if (!workflowType) {
    return true;
  }

  if (workflowRoleTypeCompatibility[role]?.includes(workflowType)) {
    return true;
  }

  return getRoleWorkflowType(config, role) === workflowType;
}

function getWorkflowRoleOptions(config: AdminConfig, workflowType?: WorkflowRoleType) {
  return getRoleOptions(config).filter((role) => roleCanOwnWorkflowType(config, role.key, workflowType));
}

function getWorkflowRoleOptionsForStep(
  config: AdminConfig,
  workflowType: WorkflowRoleType,
  ownerRole: RoleKey
) {
  const matchingRoles = getWorkflowRoleOptions(config, workflowType);

  if (matchingRoles.some((role) => role.key === ownerRole)) {
    return matchingRoles;
  }

  const selectedRole = getRoleOptions(config).find((role) => role.key === ownerRole);

  return selectedRole ? [selectedRole, ...matchingRoles] : matchingRoles;
}

function workflowStepCanCreateJira(config: AdminConfig, stepForm: WorkflowStepFormState): boolean {
  return stepForm.workflowType !== "inform" && roleCanCreateJira(config, stepForm.ownerRole);
}

function getAllConfigPrus(config: AdminConfig): Array<ProductPruConfig & { productId: string; productName: string }> {
  return config.products.flatMap((product) =>
    (product.prus ?? []).map((pru) => ({
      ...pru,
      productId: product.id,
      productName: product.productName
    }))
  );
}

function getAllConfigModules(
  config: AdminConfig
): Array<ProductModuleConfig & { productId: string; productName: string; pruId: string; pruName: string }> {
  return config.products.flatMap((product) =>
    (product.prus ?? []).flatMap((pru) =>
      (pru.modules ?? []).map((module) => ({
        ...module,
        productId: product.id,
        productName: product.productName,
        pruId: pru.id,
        pruName: pru.name
      }))
    )
  );
}

function getUniquePruNames(config: AdminConfig): string[] {
  return Array.from(new Set(getAllConfigPrus(config).map((pru) => pru.name))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function getSelectedValues(event: React.ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
}

function uniqueSortedValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normalizeAllSelection(values: string[]): string[] {
  return values.includes(ALL_SCOPE_VALUE) ? [ALL_SCOPE_VALUE] : uniqueSortedValues(values);
}

function expandAllSelection(values: string[], allValues: string[]): string[] {
  return values.includes(ALL_SCOPE_VALUE) ? allValues : values;
}

function formatScopedCount(values: string[], singular: string, plural: string): string {
  if (values.includes(ALL_SCOPE_VALUE)) {
    return `All ${plural}`;
  }

  return `${values.length} ${values.length === 1 ? singular : plural}`;
}

function getResponsibilityMappingRoles(mapping: ResponsibilityMappingConfig): RoleKey[] {
  const rolesForMapping = mapping.roles?.length ? mapping.roles : [mapping.role];

  return Array.from(new Set(rolesForMapping.filter(Boolean)));
}

function getResponsibilityMappingFingerprint(mapping: ResponsibilityMappingConfig): string {
  return JSON.stringify({
    roles: uniqueSortedValues(getResponsibilityMappingRoles(mapping)),
    products: uniqueSortedValues(mapping.productIds),
    sites: uniqueSortedValues(mapping.regionSiteIds),
    prus: uniqueSortedValues(mapping.pruNames),
    users: uniqueSortedValues(mapping.userIds),
    actingRole: Boolean(mapping.actingRole)
  });
}

function normalizeResponsibilityMapping(mapping: ResponsibilityMappingConfig): ResponsibilityMappingConfig {
  const rolesForMapping = getResponsibilityMappingRoles(mapping);

  return {
    ...mapping,
    role: rolesForMapping[0] ?? "requester",
    roles: rolesForMapping,
    actingRole: Boolean(mapping.actingRole)
  };
}

function dedupeResponsibilityMappings(
  mappings: ResponsibilityMappingConfig[]
): ResponsibilityMappingConfig[] {
  const seen = new Set<string>();
  const dedupedMappings: ResponsibilityMappingConfig[] = [];

  mappings.forEach((mapping) => {
    const normalizedMapping = normalizeResponsibilityMapping(mapping);
    const fingerprint = getResponsibilityMappingFingerprint(normalizedMapping);

    if (seen.has(fingerprint)) {
      return;
    }

    seen.add(fingerprint);
    dedupedMappings.push(normalizedMapping);
  });

  return dedupedMappings;
}

function getNotificationEventLabel(eventType: NotificationEventType): string {
  return notificationEventOptions.find((option) => option.value === eventType)?.label ?? eventType;
}

function getNotificationDeliveryModeLabel(deliveryMode: NotificationDeliveryMode): string {
  return notificationDeliveryModeOptions.find((option) => option.value === deliveryMode)?.label ?? deliveryMode;
}

function getNotificationSeverityLabel(severity: NotificationSeverity): string {
  return notificationSeverityOptions.find((option) => option.value === severity)?.label ?? severity.toUpperCase();
}

function renderNotificationTemplate(value: string): string {
  return notificationTokenList.reduce(
    (renderedValue, token) =>
      renderedValue.replaceAll(`{{${token}}}`, notificationTokenSamples[token as keyof typeof notificationTokenSamples]),
    value
  );
}

function getSmtpSecurityLabel(security: SmtpConfig["security"]): string {
  return smtpSecurityOptions.find((option) => option.value === security)?.label ?? security;
}

function getJiraApiVersionLabel(apiVersion: JiraApiVersion): string {
  return jiraApiVersionOptions.find((option) => option.value === apiVersion)?.label ?? apiVersion;
}

function getJiraAuthModeLabel(authMode: JiraAuthMode): string {
  return jiraAuthModeOptions.find((option) => option.value === authMode)?.label ?? authMode;
}

function getJiraApiBaseUrl(config: JiraIntegrationConfig): string {
  if (config.apiBaseUrl) {
    return normalizeJiraBaseUrl(config.apiBaseUrl);
  }

  try {
    const projectUrl = new URL(config.projectUrl);

    return normalizeJiraBaseUrl(projectUrl.toString());
  } catch {
    return "";
  }
}

function getJiraApiEndpoint(config: JiraIntegrationConfig): string {
  const apiBaseUrl = getJiraApiBaseUrl(config);
  const apiVersion = config.apiVersion ?? "rest/api/2";

  return apiBaseUrl ? `${apiBaseUrl}/${apiVersion}` : "Not configured";
}

function getJiraProjectUrl(apiBaseUrl: string, projectKey: string): string {
  const normalizedBaseUrl = normalizeJiraBaseUrl(apiBaseUrl);
  const normalizedProjectKey = getValidJiraProjectKey(projectKey);

  return normalizedBaseUrl && normalizedProjectKey ? `${normalizedBaseUrl}/projects/${normalizedProjectKey}` : "";
}

function getJiraTokenStatus(config: JiraIntegrationConfig): string {
  if (!config.tokenConfigured) {
    return "Not configured";
  }

  return config.tokenLastFour ? `Configured - ending ${config.tokenLastFour}` : "Configured";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);

    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatIntegrationApiError(payload: IntegrationApiErrorPayload | null, fallback: string): string {
  if (!payload?.error) {
    return fallback;
  }

  const details = payload.error.details?.filter(Boolean).join(" ");
  return details ? `${payload.error.message ?? fallback} ${details}` : payload.error.message ?? fallback;
}

function createIntegrationActionError(
  payload: IntegrationApiErrorPayload | null,
  fallback: string
): Error & { code?: string } {
  const error = new Error(formatIntegrationApiError(payload, fallback)) as Error & { code?: string };
  error.code = payload?.error?.code;

  return error;
}

function formatJiraAttachmentActionComment(attachments?: JiraAttachmentActionPayload): string {
  const uploadedCount = attachments?.uploaded?.length ?? 0;
  const skippedCount = attachments?.skipped?.length ?? 0;
  const parts = [
    uploadedCount > 0
      ? `${uploadedCount} ticket attachment${uploadedCount === 1 ? "" : "s"} uploaded to Jira.`
      : "",
    skippedCount > 0
      ? `${skippedCount} ticket attachment${skippedCount === 1 ? "" : "s"} skipped because Jira already had it or content was unavailable.`
      : ""
  ].filter(Boolean);

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function formatJiraActionWarningComment(warnings: string[]): string {
  return warnings.length > 0 ? ` Jira warning: ${warnings.join(" ")}` : "";
}

function getIntegrationActionErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "";
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === "string" ? code : "";
}

function readLocalIntegrationSecrets(): LocalIntegrationSecrets {
  try {
    const savedSecrets = window.localStorage.getItem(localIntegrationSecretsStorageKey);

    return savedSecrets ? (JSON.parse(savedSecrets) as LocalIntegrationSecrets) : {};
  } catch {
    return {};
  }
}

function writeLocalIntegrationSecrets(secrets: LocalIntegrationSecrets): void {
  window.localStorage.setItem(
    localIntegrationSecretsStorageKey,
    JSON.stringify({
      ...secrets,
      updatedAt: new Date().toISOString()
    })
  );
}

function buildUserForm(config: AdminConfig, user?: AdminUser): UserFormState {
  const firstSite = config.regionSites.find((site) => site.active) ?? config.regionSites[0];

  return {
    displayName: user?.displayName ?? "",
    email: user?.email ?? "",
    primaryRole: user?.primaryRole ?? "requester",
    actionRoles: user?.actionRoles ?? [],
    region: user?.region ?? firstSite?.region ?? "Global",
    site: user?.site ?? firstSite?.site ?? "Global",
    productIds: user?.productIds ?? [],
    pruNames: user?.pruNames ?? [],
    active: user?.active ?? true
  };
}

function buildRoleForm(config: AdminConfig, roleConfig?: RoleDomainConfig): RoleFormState {
  const role = roleConfig?.role ?? getRoleOptions(config)[0]?.key ?? "requester";
  const customRole = config.customRoles?.find((item) => item.key === role);

  return {
    role,
    customKey: customRole?.key ?? "",
    label: customRole?.label ?? "",
    description: customRole?.description ?? "",
    domain: roleConfig?.domain ?? "Business",
    workflowType: roleConfig?.workflowType ?? getDefaultWorkflowRoleType(role)
  };
}

function buildRegionSiteForm(config: AdminConfig, site?: RegionSiteConfig): RegionSiteFormState {
  return {
    region: site?.region ?? "Europe",
    site: site?.site ?? "",
    localProductOwnerId: site?.localProductOwnerId ?? config.users[0]?.id ?? "",
    active: site?.active ?? true
  };
}

function buildProductForm(product?: ProductConfig): ProductFormState {
  return {
    productName: product?.productName ?? "",
    productOwnerName: product?.productOwnerName ?? "",
    jiraProjectKey: product?.jiraProjectKey ?? "",
    active: product?.active ?? true
  };
}

function buildPruForm(config: AdminConfig, product?: ProductConfig, pru?: ProductPruConfig): PruFormState {
  const firstProduct = product ?? config.products[0];

  return {
    productIds: firstProduct?.id ? [firstProduct.id] : [],
    name: pru?.name ?? "",
    site: normalizePruSite(config.regionSites, pru?.site),
    localProductOwnerId: pru?.localProductOwnerId ?? config.users[0]?.id ?? "",
    active: pru?.active ?? true
  };
}

function buildModuleForm(config: AdminConfig, product?: ProductConfig, pru?: ProductPruConfig, module?: ProductModuleConfig): ModuleFormState {
  const firstProduct = product ?? config.products[0];
  const firstPru = pru ?? firstProduct?.prus?.[0];

  return {
    productId: firstProduct?.id ?? "",
    pruIds: firstPru?.id ? [firstPru.id] : [],
    name: module?.name ?? "",
    jiraComponent: module?.jiraComponent ?? "",
    active: module?.active ?? true
  };
}

function buildTicketTypeForm(option?: ConfigOption): TicketTypeFormState {
  return {
    label: option?.label ?? "",
    color: option?.color ?? "neutral",
    active: option?.active ?? true,
    sortOrder: String(option?.sortOrder ?? 1)
  };
}

function buildRequestOptionForm(option?: ConfigOption, nextSortOrder = 1): RequestOptionFormState {
  return {
    label: option?.label ?? "",
    color: option?.color ?? "neutral",
    active: option?.active ?? true,
    sortOrder: String(option?.sortOrder ?? nextSortOrder)
  };
}

function buildStatusColorForm(status?: StatusColorConfig): StatusColorFormState {
  return {
    status: status?.status ?? "",
    color: status?.color ?? "neutral"
  };
}

function buildRequestCategoryForm(category = ""): RequestCategoryFormState {
  return {
    category
  };
}

function sortConfigOptions<TOption extends ConfigOption>(options: TOption[]): TOption[] {
  return [...options].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.label.localeCompare(right.label);
  });
}

function buildSlaRuleForm(config: AdminConfig, rule?: SlaRule): SlaRuleFormState {
  const defaultPriority = (config.priorities.find((priority) => priority.active)?.label ?? "2 - Medium") as Ticket["priority"];

  return {
    priority: rule?.priority ?? defaultPriority,
    targetHours: String(rule?.targetHours ?? 240),
    warningHours: String(rule?.warningHours ?? 168)
  };
}

function buildEscalationPolicyForm(config: AdminConfig, policy?: SlaPolicy): EscalationPolicyFormState {
  const defaultPolicy = policy ?? config.escalationPolicies[0];
  const defaultPriority = config.priorities.find((priority) => priority.active)?.label ?? "2 - Medium";

  return {
    id: defaultPolicy?.id ?? "",
    name: defaultPolicy?.name ?? "",
    priority: defaultPolicy?.priority ?? defaultPriority,
    responseHours: String(defaultPolicy?.responseHours ?? 24),
    resolutionHours: String(defaultPolicy?.resolutionHours ?? 120),
    escalationMatrixId: defaultPolicy?.escalationMatrixId ?? "standard"
  };
}

function buildWorkflowStepForm(
  step: WorkflowTemplateStep,
  override: Partial<WorkflowTemplateStep> = {}
): WorkflowStepFormState {
  return {
    label: override.label ?? step.label,
    ownerRole: override.ownerRole ?? step.ownerRole,
    workflowType: override.workflowType ?? step.workflowType ?? getDefaultWorkflowRoleType(override.ownerRole ?? step.ownerRole),
    required: override.required ?? step.required,
    parallelGroup: override.parallelGroup ?? step.parallelGroup ?? "",
    slaHours: String(override.slaHours ?? step.slaHours),
    allowDelegation: override.allowDelegation ?? step.allowDelegation,
    allowClarification: override.allowClarification ?? step.allowClarification
  };
}

function getWorkflowTemplateStepsByRouteOrder(
  template: (typeof workflowTemplates)[number],
  stepIds: string[],
  stepOverrides: Record<string, WorkflowStepFormState> = {}
): WorkflowTemplateStep[] {
  return stepIds
    .map((stepId) => {
      const templateStep = template.steps.find((step) => step.id === stepId);

      if (templateStep) {
        return templateStep;
      }

      const override = stepOverrides[stepId];

      return buildDynamicWorkflowStepConfig(stepId, {
        label: override?.label,
        ownerRole: override?.ownerRole,
        workflowType: override?.workflowType,
        required: override?.required,
        parallelGroup: override?.parallelGroup,
        slaHours: Number.parseInt(override?.slaHours ?? "", 10),
        allowDelegation: override?.allowDelegation,
        allowClarification: override?.allowClarification
      });
    })
    .filter((step): step is WorkflowTemplateStep => Boolean(step));
}

function buildWorkflowRouteForm(
  config: AdminConfig,
  workflow?: TicketTypeWorkflowConfig
): WorkflowRouteFormState {
  const firstRequestType = config.requestTypes.find((type) => type.active) ?? config.requestTypes[0];
  const firstTemplate = workflowTemplates[0];
  const template = getWorkflowTemplateById(workflow?.workflowTemplateId ?? "") ?? firstTemplate;
  const stepIds = workflow?.stepIds?.length ? workflow.stepIds : template.steps.map((step) => step.id);
  const stepOverrides = Object.fromEntries(
    stepIds.flatMap((stepId) => {
      const templateStep = template.steps.find((step) => step.id === stepId);
      const override = workflow?.stepOverrides?.[stepId];
      const step = templateStep ?? buildDynamicWorkflowStepConfig(stepId, override);

      return step ? ([[stepId, buildWorkflowStepForm(step, override)] as const]) : [];
    })
  );
  const jiraCreatorStepIds = getJiraCreatorStepIds({
    stepIds,
    jiraCreatorStepId: workflow?.jiraCreatorStepId ?? "",
    jiraCreatorStepIds: workflow?.jiraCreatorStepIds
  }).filter((stepId) => {
    const stepForm = stepOverrides[stepId];

    return stepForm ? workflowStepCanCreateJira(config, stepForm) : false;
  });

  return {
    ticketTypeId: workflow?.ticketTypeId ?? firstRequestType?.id ?? "",
    workflowTemplateId: template.id,
    escalationPolicyId: workflow?.escalationPolicyId ?? template.escalationPolicyId ?? config.escalationPolicies[0]?.id ?? "",
    stepIds,
    jiraCreatorStepIds,
    stepOverrides,
    active: workflow?.active ?? true
  };
}

function buildWorkflowStepOverridesFromForm(
  form: WorkflowRouteFormState,
  template: (typeof workflowTemplates)[number]
): TicketTypeWorkflowConfig["stepOverrides"] {
  return Object.fromEntries(
    form.stepIds.flatMap((stepId) => {
      const templateStep = template.steps.find((step) => step.id === stepId);
      const formStep = form.stepOverrides[stepId];

      if (!formStep && !templateStep) {
        return [];
      }

      const step = templateStep ?? buildDynamicWorkflowStepConfig(stepId, {
        label: formStep?.label,
        ownerRole: formStep?.ownerRole,
        workflowType: formStep?.workflowType,
        required: formStep?.required,
        parallelGroup: formStep?.parallelGroup,
        slaHours: Number.parseInt(formStep?.slaHours ?? "", 10),
        allowDelegation: formStep?.allowDelegation,
        allowClarification: formStep?.allowClarification
      });

      if (!step) {
        return [];
      }

      const resolvedFormStep = form.stepOverrides[step.id] ?? buildWorkflowStepForm(step);

      return [[
        step.id,
        {
          label: resolvedFormStep.label.trim() || step.label,
          ownerRole: resolvedFormStep.ownerRole,
          workflowType: resolvedFormStep.workflowType,
          required: resolvedFormStep.required,
          parallelGroup: resolvedFormStep.parallelGroup.trim() || undefined,
          slaHours: Number.parseInt(resolvedFormStep.slaHours, 10) || step.slaHours,
          allowDelegation: resolvedFormStep.allowDelegation,
          allowClarification: resolvedFormStep.allowClarification
        }
      ] as const];
    })
  );
}

function getDefaultComponentForFieldType(type: FormFieldType): FormComponentType {
  if (type === "longText") {
    return "textArea";
  }

  if (type === "number") {
    return "numberField";
  }

  if (type === "date") {
    return "datePicker";
  }

  if (type === "singleSelect" || type === "yesNo") {
    return "dropdown";
  }

  if (type === "multiSelect") {
    return "checkboxGroup";
  }

  return "textField";
}

function buildFormTemplateForm(config: AdminConfig, template?: ProductFormTemplate): FormTemplateFormState {
  const firstProduct = config.products.find((product) => product.active) ?? config.products[0];
  const firstRequestType = config.requestTypes.find((type) => type.active) ?? config.requestTypes[0];

  return {
    productName: template?.productName ?? firstProduct?.productName ?? "",
    requestTypeId: template?.requestTypeId ?? firstRequestType?.id ?? "",
    title: template?.title ?? "",
    description: template?.description ?? "",
    fields: template ? [...template.fields].sort((a, b) => a.sortOrder - b.sortOrder) : [],
    active: template?.active ?? true
  };
}

function buildTemplateFieldForm(field?: FormTemplateField, nextSortOrder = 1): TemplateFieldFormState {
  const type = field?.type ?? "shortText";

  return {
    id: field?.id ?? "",
    label: field?.label ?? "",
    type,
    component: field?.component ?? getDefaultComponentForFieldType(type),
    required: field?.required ?? true,
    helperText: field?.helperText ?? "",
    optionsText: (field?.options ?? defaultOptionsByFieldType[type] ?? []).join(", "),
    optionSource: field?.optionSource ?? "manual",
    sortOrder: String(field?.sortOrder ?? nextSortOrder)
  };
}

function buildTemplateFieldFromForm(form: TemplateFieldFormState, existingFieldIds: string[]): FormTemplateField {
  const id = form.id || getUniqueConfigId(existingFieldIds, normalizeId(form.label, "field"));
  const fieldShape = { type: form.type, component: form.component };
  const optionSource = isChoiceTemplateField(fieldShape) && form.optionSource !== "manual"
    ? form.optionSource
    : undefined;

  return {
    id,
    label: form.label.trim(),
    type: form.type,
    component: form.component,
    required: form.required,
    helperText: form.helperText.trim() || undefined,
    options: form.optionsText
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean),
    optionSource,
    sortOrder: Number.parseInt(form.sortOrder, 10) || 1
  };
}

function buildTemplateFromForm(
  form: FormTemplateFormState,
  templateId: string,
  updatedAt: string
): ProductFormTemplate {
  return {
    id: templateId,
    productName: form.productName,
    requestTypeId: form.requestTypeId,
    title: form.title.trim(),
    description: form.description.trim(),
    active: form.active,
    updatedAt,
    fields: [...form.fields].sort((a, b) => a.sortOrder - b.sortOrder)
  };
}

function buildMappingForm(
  config: AdminConfig,
  mapping?: ResponsibilityMappingConfig
): ResponsibilityMappingFormState {
  return {
    roleIds: mapping ? getResponsibilityMappingRoles(mapping) : ["local_product_owner"],
    productIds: mapping?.productIds ?? config.products.slice(0, 1).map((product) => product.id),
    regionSiteIds: mapping?.regionSiteIds ?? config.regionSites.slice(0, 1).map((site) => site.id),
    pruNames: mapping?.pruNames ?? getUniquePruNames(config).slice(0, 1),
    userIds: mapping?.userIds ?? config.users.slice(0, 1).map((user) => user.id),
    actingRole: mapping?.actingRole ?? false,
    active: mapping?.active ?? true
  };
}

function buildNotificationTemplateForm(template?: NotificationTemplate): NotificationTemplateFormState {
  return {
    eventType: template?.eventType ?? "approvalRequested",
    subject: template?.subject ?? "",
    body: template?.body ?? "",
    deliveryMode: template?.deliveryMode ?? "inAppAndEmail",
    severity: template?.severity ?? getDefaultNotificationSeverity(template?.eventType ?? "approvalRequested"),
    enabledRoles: template?.enabledRoles ?? ["admin"],
    active: template?.active ?? true
  };
}

function buildNotificationTemplateFromForm(
  form: NotificationTemplateFormState,
  templateId: string
): NotificationTemplate {
  return {
    id: templateId,
    eventType: form.eventType,
    subject: form.subject.trim(),
    body: form.body.trim(),
    deliveryMode: form.deliveryMode,
    severity: form.severity,
    active: form.active,
    enabledRoles: form.enabledRoles
  };
}

function buildJiraConfigForm(config: JiraIntegrationConfig): JiraConfigFormState {
  const apiBaseUrl = getJiraApiBaseUrl(config);
  const defaultProjectKey = getValidJiraProjectKey(config.defaultProjectKey) || "NEXUS";

  return {
    enabled: config.enabled,
    apiBaseUrl,
    apiVersion: config.apiVersion ?? "rest/api/2",
    projectUrl: getJiraProjectUrl(apiBaseUrl, defaultProjectKey) || config.projectUrl,
    defaultProjectKey,
    defaultIssueType: config.defaultIssueType,
    authMode: config.authMode ?? "personalAccessToken",
    username: config.username ?? "",
    token: "",
    testIssueSummary: `NEXUS integration test - ${defaultProjectKey || "Jira"}`
  };
}

function buildSmtpConfigForm(config: SmtpConfig): SmtpConfigFormState {
  return {
    enabled: config.enabled,
    deliveryMode: config.deliveryMode,
    host: config.host,
    port: String(config.port),
    security: config.security,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    username: "",
    password: "",
    testRecipient: "",
    testSubject: "NEXUS Portal SMTP test",
    testBody: "This is a test email from the NEXUS Portal SMTP integration settings."
  };
}

function deactivateUserInConfig(config: AdminConfig, userId: string): AdminConfig {
  return {
    ...config,
    users: config.users.map((user) => (user.id === userId ? { ...user, active: false } : user))
  };
}

function removeUserFromConfig(config: AdminConfig, userId: string): AdminConfig {
  return {
    ...config,
    users: config.users.filter((user) => user.id !== userId),
    regionSites: config.regionSites.map((site) =>
      site.localProductOwnerId === userId ? { ...site, localProductOwnerId: "" } : site
    ),
    products: config.products.map((product) => ({
      ...product,
      roleAssignments: product.roleAssignments.map((assignment) => ({
        ...assignment,
        userIds: assignment.userIds.filter((id) => id !== userId)
      })),
      prus: product.prus.map((pru) =>
        pru.localProductOwnerId === userId ? { ...pru, localProductOwnerId: "" } : pru
      )
    })),
    responsibilityMappings: config.responsibilityMappings
      .map((mapping) => ({
        ...mapping,
        userIds: mapping.userIds.filter((id) => id !== userId)
      }))
      .filter((mapping) => mapping.userIds.length > 0)
  };
}

function deactivateRoleInConfig(config: AdminConfig, role: RoleKey): AdminConfig {
  return removeRoleFromConfig(config, role);
}

function removeRoleFromConfig(config: AdminConfig, role: RoleKey): AdminConfig {
  const deletedRoleKeys = new Set(config.deletedRoleKeys ?? []);

  if (isBuiltInRole(role)) {
    deletedRoleKeys.add(role);
  }

  return {
    ...config,
    deletedRoleKeys: Array.from(deletedRoleKeys),
    customRoles: (config.customRoles ?? []).filter((customRole) => customRole.key !== role),
    roleDomains: config.roleDomains.filter((roleDomain) => roleDomain.role !== role),
    users: config.users.map((user) => ({
      ...user,
      primaryRole: user.primaryRole === role ? "requester" : user.primaryRole,
      actionRoles: user.actionRoles.filter((roleKey) => roleKey !== role)
    })),
    products: config.products.map((product) => ({
      ...product,
      roleAssignments: product.roleAssignments.filter((assignment) => assignment.role !== role)
    })),
    notificationTemplates: config.notificationTemplates.map((template) => ({
      ...template,
      enabledRoles: template.enabledRoles.filter((roleKey) => roleKey !== role)
    })),
    ticketTypeWorkflows: config.ticketTypeWorkflows.map((workflow) => ({
      ...workflow,
      stepOverrides: Object.fromEntries(
        Object.entries(workflow.stepOverrides ?? {}).map(([stepId, override]) => [
          stepId,
          {
            ...override,
            ownerRole: override.ownerRole === role ? "requester" : override.ownerRole
          }
        ])
      )
    })),
    responsibilityMappings: config.responsibilityMappings
      .map((mapping) => {
        const remainingRoles = getResponsibilityMappingRoles(mapping).filter((roleKey) => roleKey !== role);

        return {
          ...mapping,
          role: remainingRoles[0] ?? mapping.role,
          roles: remainingRoles
        };
      })
      .filter((mapping) => mapping.roles && mapping.roles.length > 0)
  };
}

function reactivateRoleInConfig(config: AdminConfig, role: RoleKey): AdminConfig {
  return {
    ...config,
    deletedRoleKeys: (config.deletedRoleKeys ?? []).filter((roleKey) => roleKey !== role)
  };
}

function deactivateRegionSiteInConfig(config: AdminConfig, siteId: string): AdminConfig {
  return {
    ...config,
    regionSites: config.regionSites.map((site) => (site.id === siteId ? { ...site, active: false } : site))
  };
}

function removeRegionSiteFromConfig(config: AdminConfig, siteId: string): AdminConfig {
  const removedSite = config.regionSites.find((site) => site.id === siteId);

  return {
    ...config,
    regionSites: config.regionSites.filter((site) => site.id !== siteId),
    users: config.users.map((user) =>
      removedSite && user.site === removedSite.site ? { ...user, region: "", site: "" } : user
    ),
    products: config.products.map((product) => ({
      ...product,
      prus: product.prus.map((pru) =>
        removedSite && pru.site === removedSite.site ? { ...pru, site: "" } : pru
      )
    })),
    responsibilityMappings: config.responsibilityMappings
      .map((mapping) => ({
        ...mapping,
        regionSiteIds: mapping.regionSiteIds.filter((id) => id !== siteId)
      }))
      .filter((mapping) => mapping.regionSiteIds.length > 0)
  };
}

function deactivateProductInConfig(config: AdminConfig, productId: string): AdminConfig {
  return {
    ...config,
    products: config.products.map((product) =>
      product.id === productId ? { ...product, active: false } : product
    )
  };
}

function removeProductFromConfig(config: AdminConfig, productId: string): AdminConfig {
  return {
    ...config,
    products: config.products.filter((product) => product.id !== productId),
    users: config.users.map((user) => ({
      ...user,
      productIds: user.productIds.filter((id) => id !== productId)
    })),
    responsibilityMappings: config.responsibilityMappings
      .map((mapping) => ({
        ...mapping,
        productIds: mapping.productIds.filter((id) => id !== productId)
      }))
      .filter((mapping) => mapping.productIds.length > 0)
  };
}

function deactivatePruInConfig(config: AdminConfig, productId: string, pruId: string): AdminConfig {
  return {
    ...config,
    products: config.products.map((product) =>
      product.id === productId
        ? {
            ...product,
            prus: product.prus.map((pru) => (pru.id === pruId ? { ...pru, active: false } : pru))
          }
        : product
    )
  };
}

function removePruFromConfig(config: AdminConfig, productId: string, pruId: string): AdminConfig {
  const removedPru = getConfigProductById(config, productId)?.prus.find((pru) => pru.id === pruId);

  return {
    ...config,
    products: config.products.map((product) =>
      product.id === productId
        ? { ...product, prus: product.prus.filter((pru) => pru.id !== pruId) }
        : product
    ),
    users: config.users.map((user) => ({
      ...user,
      pruNames: removedPru ? user.pruNames.filter((name) => name !== removedPru.name) : user.pruNames
    })),
    responsibilityMappings: config.responsibilityMappings
      .map((mapping) => ({
        ...mapping,
        pruNames: removedPru ? mapping.pruNames.filter((name) => name !== removedPru.name) : mapping.pruNames
      }))
      .filter((mapping) => mapping.pruNames.length > 0)
  };
}

function deactivateModuleInConfig(
  config: AdminConfig,
  productId: string,
  pruId: string,
  moduleId: string
): AdminConfig {
  return {
    ...config,
    products: config.products.map((product) =>
      product.id === productId
        ? {
            ...product,
            prus: product.prus.map((pru) =>
              pru.id === pruId
                ? {
                    ...pru,
                    modules: pru.modules.map((module) =>
                      module.id === moduleId ? { ...module, active: false } : module
                    )
                  }
                : pru
            )
          }
        : product
    )
  };
}

function removeModuleFromConfig(config: AdminConfig, productId: string, pruId: string, moduleId: string): AdminConfig {
  return {
    ...config,
    products: config.products.map((product) =>
      product.id === productId
        ? {
            ...product,
            prus: product.prus.map((pru) =>
              pru.id === pruId
                ? { ...pru, modules: pru.modules.filter((module) => module.id !== moduleId) }
                : pru
            )
          }
        : product
    )
  };
}

function deactivateTicketTypeInConfig(config: AdminConfig, ticketTypeId: string): AdminConfig {
  return {
    ...config,
    requestTypes: config.requestTypes.map((type) =>
      type.id === ticketTypeId ? { ...type, active: false } : type
    ),
    ticketTypeWorkflows: config.ticketTypeWorkflows.map((workflow) =>
      workflow.ticketTypeId === ticketTypeId ? { ...workflow, active: false } : workflow
    )
  };
}

function removeTicketTypeFromConfig(config: AdminConfig, ticketTypeId: string): AdminConfig {
  return {
    ...config,
    requestTypes: config.requestTypes.filter((type) => type.id !== ticketTypeId),
    formTemplates: config.formTemplates.filter((template) => template.requestTypeId !== ticketTypeId),
    ticketTypeWorkflows: config.ticketTypeWorkflows.filter((workflow) => workflow.ticketTypeId !== ticketTypeId)
  };
}

function deactivateResponsibilityMappingInConfig(config: AdminConfig, mappingId: string): AdminConfig {
  return {
    ...config,
    responsibilityMappings: config.responsibilityMappings.map((mapping) =>
      mapping.id === mappingId ? { ...mapping, active: false } : mapping
    )
  };
}

function FormTemplateManager({
  config,
  onConfigChange
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
}) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(config.formTemplates[0]?.id ?? "");
  const [templateForm, setTemplateForm] = useState<FormTemplateFormState>(() => buildFormTemplateForm(config));
  const [fieldForm, setFieldForm] = useState<TemplateFieldFormState>(() => buildTemplateFieldForm(undefined, 1));
  const [error, setError] = useState("");
  const previewTemplate = buildTemplateFromForm(
    templateForm,
    editingTemplateId ?? "draft-template-preview",
    new Date().toISOString()
  );
  const selectedTemplateProduct = getConfigProduct(config, templateForm.productName);
  const jiraTemplateMetadata = useJiraTemplateFieldMetadata(
    config,
    templateHasJiraOptionSource(templateForm.fields) || isJiraTemplateOptionSource(fieldForm.optionSource),
    selectedTemplateProduct?.jiraProjectKey ?? config.integrations.jira.defaultProjectKey
  );

  function resetTemplateForm() {
    setEditingTemplateId(null);
    setEditingFieldId(null);
    setError("");
    setTemplateForm(buildFormTemplateForm(config));
    setFieldForm(buildTemplateFieldForm(undefined, 1));
  }

  function startEditTemplate(template: ProductFormTemplate) {
    setEditingTemplateId(template.id);
    setSelectedTemplateId(template.id);
    setError("");
    setTemplateForm(buildFormTemplateForm(config, template));
    setEditingFieldId(null);
    setFieldForm(buildTemplateFieldForm(undefined, template.fields.length + 1));
  }

  function addOrUpdateField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fieldForm.label.trim()) {
      setError("Field label is required.");
      return;
    }

    const existingFieldIds = templateForm.fields.map((field) => field.id);
    const field = buildTemplateFieldFromForm(fieldForm, existingFieldIds);

    setTemplateForm((current) => ({
      ...current,
      fields: editingFieldId
        ? current.fields
            .map((item) => (item.id === editingFieldId ? field : item))
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [...current.fields, field].sort((a, b) => a.sortOrder - b.sortOrder)
    }));
    setEditingFieldId(null);
    setFieldForm(buildTemplateFieldForm(undefined, templateForm.fields.length + 2));
    setError("");
  }

  function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!templateForm.title.trim()) {
      setError("Template title is required.");
      return;
    }

    if (!templateForm.productName) {
      setError("Product is required.");
      return;
    }

    if (!templateForm.requestTypeId) {
      setError("Ticket type is required.");
      return;
    }

    if (templateForm.fields.length === 0) {
      setError("Add at least one template field before saving.");
      return;
    }

    const id =
      editingTemplateId ??
      getUniqueConfigId(
        config.formTemplates.map((template) => template.id),
        normalizeId(`${templateForm.productName}-${templateForm.requestTypeId}-${templateForm.title}`, "form")
      );
    const template = buildTemplateFromForm(templateForm, id, new Date().toISOString());

    onConfigChange((current) => ({
      ...current,
      formTemplates: editingTemplateId
        ? current.formTemplates.map((item) => (item.id === editingTemplateId ? template : item))
        : [...current.formTemplates, template]
    }));
    setSelectedTemplateId(id);
    setEditingTemplateId(id);
    setEditingFieldId(null);
    setTemplateForm(buildFormTemplateForm(config, template));
    setFieldForm(buildTemplateFieldForm(undefined, template.fields.length + 1));
    setError("");
  }

  return (
    <div className="form-template-manager">
      <div className="admin-editor-layout form-template-layout">
        <form className="admin-editor-form admin-form" onSubmit={saveTemplate}>
          <div className="admin-form-heading">
            <h3>{editingTemplateId ? "Edit form template" : "Create form template"}</h3>
            <button className="secondary-button" type="button" onClick={resetTemplateForm}>
              New template
            </button>
          </div>
          {error ? <p className="admin-form-error">{error}</p> : null}
          <label className="form-field">
            <span>Template title</span>
            <input
              value={templateForm.title}
              onChange={(event) => setTemplateForm({ ...templateForm, title: event.target.value })}
              placeholder="Example: Release readiness intake"
            />
          </label>
          <label className="form-field">
            <span>Product</span>
            <select
              value={templateForm.productName}
              onChange={(event) => setTemplateForm({ ...templateForm, productName: event.target.value })}
            >
              {config.products.map((product) => (
                <option key={product.id} value={product.productName}>
                  {product.productName}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Ticket type</span>
            <select
              value={templateForm.requestTypeId}
              onChange={(event) => setTemplateForm({ ...templateForm, requestTypeId: event.target.value })}
            >
              {config.requestTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Description</span>
            <textarea
              value={templateForm.description}
              onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })}
              placeholder="Explain when this template is used."
            />
          </label>
          <AdminCheckbox
            checked={templateForm.active}
            label="Active template"
            onChange={(active) => setTemplateForm({ ...templateForm, active })}
          />
          <div className="template-field-list" aria-label="Fields in current template">
            <strong>Fields</strong>
            {templateForm.fields.length === 0 ? (
              <span>No fields added yet.</span>
            ) : (
              templateForm.fields.map((field) => (
                <div className="template-field-pill" key={field.id}>
                  <span>
                    {field.label}
                    <small>
                      {field.component} / {field.required ? "required" : "optional"} /{" "}
                      {getTemplateOptionSourceLabel(field.optionSource)}
                    </small>
                  </span>
                  <button
                    className="icon-button quiet"
                    type="button"
                    aria-label={`Edit ${field.label}`}
                    onClick={() => {
                      setEditingFieldId(field.id);
                      setFieldForm(buildTemplateFieldForm(field));
                    }}
                  >
                    <TegelIcon name="edit" />
                  </button>
                  <button
                    className="icon-button quiet danger-button"
                    type="button"
                    aria-label={`Delete ${field.label}`}
                    onClick={() => {
                      setTemplateForm((current) => ({
                        ...current,
                        fields: current.fields.filter((item) => item.id !== field.id)
                      }));
                      if (editingFieldId === field.id) {
                        setEditingFieldId(null);
                        setFieldForm(buildTemplateFieldForm(undefined, templateForm.fields.length));
                      }
                    }}
                  >
                    <TegelIcon name="trash" />
                  </button>
                </div>
              ))
            )}
          </div>
          <AdminFormActions editing={Boolean(editingTemplateId)} onCancel={resetTemplateForm} />
        </form>

        <div className="form-template-main">
          <form className="template-field-builder admin-form" onSubmit={addOrUpdateField}>
            <div className="admin-form-heading">
              <h3>{editingFieldId ? "Edit field" : "Add field"}</h3>
              {editingFieldId ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditingFieldId(null);
                    setFieldForm(buildTemplateFieldForm(undefined, templateForm.fields.length + 1));
                  }}
                >
                  Cancel field edit
                </button>
              ) : null}
            </div>
            <div className="template-field-grid">
              <label className="form-field">
                <span>Field label</span>
                <input
                  value={fieldForm.label}
                  onChange={(event) => setFieldForm({ ...fieldForm, label: event.target.value })}
                  placeholder="Example: Release evidence link"
                />
              </label>
              <label className="form-field">
                <span>Field type</span>
                <select
                  value={fieldForm.type}
                  onChange={(event) => {
                    const type = event.target.value as FormFieldType;
                    const nextComponent = getDefaultComponentForFieldType(type);
                    setFieldForm({
                      ...fieldForm,
                      type,
                      component: nextComponent,
                      optionSource: isChoiceTemplateField({ type, component: nextComponent }) ? fieldForm.optionSource : "manual",
                      optionsText: (defaultOptionsByFieldType[type] ?? []).join(", ")
                    });
                  }}
                >
                  {formFieldTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Component</span>
                <select
                  value={fieldForm.component}
                  onChange={(event) => {
                    const component = event.target.value as FormComponentType;

                    setFieldForm({
                      ...fieldForm,
                      component,
                      optionSource: isChoiceTemplateField({ type: fieldForm.type, component })
                        ? fieldForm.optionSource
                        : "manual"
                    });
                  }}
                >
                  {formComponentTypes.map((component) => (
                    <option key={component.value} value={component.value}>
                      {component.label}
                    </option>
                  ))}
                </select>
              </label>
              {isChoiceTemplateField(fieldForm) ? (
                <label className="form-field">
                  <span>Option source</span>
                  <select
                    value={fieldForm.optionSource}
                    onChange={(event) =>
                      setFieldForm({
                        ...fieldForm,
                        optionSource: event.target.value as FormTemplateOptionSource
                      })
                    }
                  >
                    {templateFieldOptionSourceOptions.map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="form-field">
                <span>Sort order</span>
                <input
                  type="number"
                  min="1"
                  value={fieldForm.sortOrder}
                  onChange={(event) => setFieldForm({ ...fieldForm, sortOrder: event.target.value })}
                />
              </label>
              <label className="form-field form-field-wide">
                <span>Helper text</span>
                <input
                  value={fieldForm.helperText}
                  onChange={(event) => setFieldForm({ ...fieldForm, helperText: event.target.value })}
                  placeholder="Short guidance below the field"
                />
              </label>
              <label className="form-field form-field-wide">
                <span>{fieldForm.optionSource === "manual" ? "Options" : "Fallback options"}</span>
                <input
                  value={fieldForm.optionsText}
                  onChange={(event) => setFieldForm({ ...fieldForm, optionsText: event.target.value })}
                  disabled={!isChoiceTemplateField(fieldForm)}
                  placeholder={
                    fieldForm.optionSource === "manual"
                      ? "Comma separated values for dropdowns, radios, and checkbox groups"
                      : "Optional fallback if the dynamic source has no values"
                  }
                />
                {fieldForm.optionSource !== "manual" ? (
                  <small>
                    Uses {getTemplateOptionSourceLabel(fieldForm.optionSource)}
                    {isJiraTemplateOptionSource(fieldForm.optionSource) && jiraTemplateMetadata.message
                      ? ` - ${jiraTemplateMetadata.message}`
                      : "."}
                  </small>
                ) : null}
              </label>
            </div>
            <AdminCheckbox
              checked={fieldForm.required}
              label="Required field"
              onChange={(required) => setFieldForm({ ...fieldForm, required })}
            />
            <div className="admin-form-actions">
              <button className="primary-button" type="submit">
                <TegelIcon name={editingFieldId ? "save" : "plus"} size="16px" />
                {editingFieldId ? "Save field" : "Add field"}
              </button>
            </div>
          </form>

          <FormTemplatePreview template={previewTemplate} config={config} jiraFieldMetadata={jiraTemplateMetadata} />

          <div className="admin-editable-list">
            {config.formTemplates.map((template) => (
              <AdminEditableRecord
                active={template.active}
                key={template.id}
                title={template.title}
                meta={`${template.productName} - ${getConfigTicketTypeLabel(config, template.requestTypeId)} - ${template.fields.length} fields`}
                tags={template.fields.map((field) => field.label)}
                onEdit={() => startEditTemplate(template)}
                onDelete={
                  template.active
                    ? () => {
                        onConfigChange((current) => ({
                          ...current,
                          formTemplates: current.formTemplates.map((item) =>
                            item.id === template.id ? { ...item, active: false } : item
                          )
                        }));
                        if (editingTemplateId === template.id) {
                          resetTemplateForm();
                        }
                      }
                    : undefined
                }
                onHardDelete={
                  !template.active
                    ? () => {
                        onConfigChange((current) => ({
                          ...current,
                          formTemplates: current.formTemplates.filter((item) => item.id !== template.id)
                        }));
                        if (selectedTemplateId === template.id) {
                          setSelectedTemplateId(config.formTemplates.find((item) => item.id !== template.id)?.id ?? "");
                        }
                        if (editingTemplateId === template.id) {
                          resetTemplateForm();
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FormTemplatePreview({
  template,
  config,
  jiraFieldMetadata
}: {
  template: ProductFormTemplate;
  config: AdminConfig;
  jiraFieldMetadata?: JiraFieldMetadata;
}) {
  return (
    <section className="form-template-preview" aria-label="Form template preview">
      <div className="preview-topline">
        <span>Live preview</span>
        <AdminStatusPill active={template.active} />
      </div>
      <header>
        <strong>{template.title || "Untitled form template"}</strong>
        <span>{template.productName || "No product"} - {getConfigTicketTypeLabel(config, template.requestTypeId)}</span>
        <p>{template.description || "No description has been added yet."}</p>
      </header>
      <div className="preview-form-grid">
        {template.fields.length === 0 ? (
          <EmptyState title="Preview is empty" body="Add fields to see how this intake template will render." />
        ) : (
          template.fields.map((field) => (
            <PreviewField config={config} field={field} jiraFieldMetadata={jiraFieldMetadata} key={field.id} />
          ))
        )}
      </div>
    </section>
  );
}

function PreviewField({
  config,
  field,
  jiraFieldMetadata
}: {
  config: AdminConfig;
  field: FormTemplateField;
  jiraFieldMetadata?: JiraFieldMetadata;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  const options = getTemplateFieldOptions(field, config, { jiraFieldMetadata });
  const optionSourceLabel = field.optionSource && field.optionSource !== "manual"
    ? getTemplateOptionSourceLabel(field.optionSource)
    : "";

  if (field.component === "textArea") {
    return (
      <label className="form-field form-field-wide preview-field">
        <span>{label}</span>
        <textarea placeholder="Long answer" readOnly />
        {field.helperText ? <small>{field.helperText}</small> : null}
      </label>
    );
  }

  if (field.component === "dropdown") {
    return (
      <label className="form-field preview-field">
        <span>{label}</span>
        <select defaultValue="">
          <option value="" disabled>
            {options.length ? "Select option" : "No options available"}
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {field.helperText || optionSourceLabel ? (
          <small>{[field.helperText, optionSourceLabel].filter(Boolean).join(" · ")}</small>
        ) : null}
      </label>
    );
  }

  if (field.component === "radioGroup" || field.component === "checkboxGroup") {
    return (
      <fieldset className="preview-choice-group">
        <legend>{label}</legend>
        {options.map((option) => (
          <label key={option}>
            <input type={field.component === "radioGroup" ? "radio" : "checkbox"} name={field.id} readOnly />
            <span>{option}</span>
          </label>
        ))}
        {!options.length ? <p>No options available.</p> : null}
        {field.helperText || optionSourceLabel ? (
          <small>{[field.helperText, optionSourceLabel].filter(Boolean).join(" · ")}</small>
        ) : null}
      </fieldset>
    );
  }

  if (field.component === "checkbox") {
    return (
      <label className="preview-single-checkbox">
        <input type="checkbox" readOnly />
        <span>{label}</span>
        {field.helperText ? <small>{field.helperText}</small> : null}
      </label>
    );
  }

  return (
    <label className="form-field preview-field">
      <span>{label}</span>
      <input
        type={field.component === "numberField" ? "number" : field.component === "datePicker" ? "date" : "text"}
        placeholder={field.component === "numberField" ? "0" : field.component === "datePicker" ? "" : "Short answer"}
        readOnly
      />
      {field.helperText ? <small>{field.helperText}</small> : null}
    </label>
  );
}

function AdminMasterDataManager({
  config,
  onConfigChange
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
}) {
  const [activeTab, setActiveTab] = useState<AdminMasterTab>("users");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<RoleKey | null>(null);
  const [editingRegionSiteId, setEditingRegionSiteId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingPruRef, setEditingPruRef] = useState<PruEditRef | null>(null);
  const [editingModuleRef, setEditingModuleRef] = useState<ModuleEditRef | null>(null);
  const [editingTicketTypeId, setEditingTicketTypeId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(() => buildUserForm(config));
  const [roleForm, setRoleForm] = useState<RoleFormState>(() => buildRoleForm(config));
  const [regionSiteForm, setRegionSiteForm] = useState<RegionSiteFormState>(() => buildRegionSiteForm(config));
  const [productForm, setProductForm] = useState<ProductFormState>(() => buildProductForm());
  const [pruForm, setPruForm] = useState<PruFormState>(() => buildPruForm(config));
  const [pruFormError, setPruFormError] = useState("");
  const [pruFormNotice, setPruFormNotice] = useState("");
  const [moduleForm, setModuleForm] = useState<ModuleFormState>(() => buildModuleForm(config));
  const [moduleFormError, setModuleFormError] = useState("");
  const [moduleFormNotice, setModuleFormNotice] = useState("");
  const [ticketTypeForm, setTicketTypeForm] = useState<TicketTypeFormState>(() => buildTicketTypeForm());
  const allPrus = getAllConfigPrus(config);
  const allModules = getAllConfigModules(config);
  const roleOptions = getRoleOptions(config);
  const regionOptions = uniqueSortedValues(
    [
      ...config.regionSites.map((site) => site.region),
      ...config.users.map((user) => user.region)
    ]
      .filter((region) => Boolean(region) && region !== ALL_SCOPE_LABEL)
  );
  const userSiteOptions = uniqueSortedValues(
    [
      ...config.regionSites.map((site) => site.site),
      ...config.users.map((user) => user.site)
    ]
      .filter((site) => Boolean(site) && site !== ALL_SCOPE_LABEL)
  );
  const selectedModuleProduct = getConfigProductById(config, moduleForm.productId) ?? config.products[0];
  const modulePruOptions = selectedModuleProduct?.prus ?? [];

  useEffect(() => {
    if (editingPruRef) {
      return;
    }

    setPruForm((current) => {
      const productIds = current.productIds.length
        ? current.productIds
        : config.products[0]?.id
          ? [config.products[0].id]
          : [];
      const site = current.site ? normalizePruSite(config.regionSites, current.site) : normalizePruSite(config.regionSites);

      if (productIds === current.productIds && site === current.site) {
        return current;
      }

      return {
        ...current,
        productIds,
        site
      };
    });
  }, [config.products, config.regionSites, editingPruRef]);

  function switchTab(tab: AdminMasterTab) {
    setActiveTab(tab);
  }

  function updatePruForm(nextForm: PruFormState) {
    setPruForm(nextForm);
    setPruFormError("");
    setPruFormNotice("");
  }

  function resetUserForm() {
    setEditingUserId(null);
    setUserForm(buildUserForm(config));
  }

  function resetRoleForm() {
    setEditingRole(null);
    setRoleForm(buildRoleForm(config));
  }

  function resetRegionSiteForm() {
    setEditingRegionSiteId(null);
    setRegionSiteForm(buildRegionSiteForm(config));
  }

  function resetProductForm() {
    setEditingProductId(null);
    setProductForm(buildProductForm());
  }

  function resetPruForm() {
    setEditingPruRef(null);
    setPruForm(buildPruForm(config));
    setPruFormError("");
    setPruFormNotice("");
  }

  function resetModuleForm() {
    setEditingModuleRef(null);
    setModuleForm(buildModuleForm(config));
    setModuleFormError("");
    setModuleFormNotice("");
  }

  function resetTicketTypeForm() {
    setEditingTicketTypeId(null);
    setTicketTypeForm(buildTicketTypeForm());
  }

  function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const displayName = userForm.displayName.trim();
    const email = userForm.email.trim();

    if (!displayName || !email) {
      return;
    }

    const id =
      editingUserId ??
      getUniqueConfigId(
        config.users.map((user) => user.id),
        normalizeId(displayName, "user")
      );
    const user: AdminUser = {
      id,
      displayName,
      email,
      primaryRole: userForm.primaryRole,
      actionRoles: userForm.actionRoles,
      region: userForm.region.trim(),
      site: userForm.site.trim(),
      productIds: userForm.productIds,
      pruNames: userForm.pruNames,
      active: userForm.active
    };

    onConfigChange((current) => ({
      ...current,
      users: editingUserId
        ? current.users.map((item) => (item.id === editingUserId ? user : item))
        : [...current.users, user]
    }));
    resetUserForm();
  }

  function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const customLabel = roleForm.label.trim();
    const isEditingBuiltInRole = Boolean(editingRole && isBuiltInRole(editingRole));
    const isEditingCustomRole = Boolean(editingRole && !isBuiltInRole(editingRole));
    const isCustomRole = Boolean(customLabel || roleForm.customKey.trim() || isEditingCustomRole);
    const roleKey = isCustomRole
      ? editingRole ?? normalizeRoleKey(roleForm.customKey.trim() || customLabel)
      : roleForm.role;

    if (!isEditingBuiltInRole && isCustomRole && !customLabel) {
      return;
    }

    if (!isEditingBuiltInRole && isCustomRole && isBuiltInRole(roleKey) && roleKey !== editingRole) {
      return;
    }

    const roleDomain: RoleDomainConfig = {
      role: roleKey,
      domain: roleForm.domain,
      workflowType: roleForm.workflowType
    };

    onConfigChange((current) => {
      const reactivatedConfig = reactivateRoleInConfig(current, roleKey);
      const customRole = !isEditingBuiltInRole && isCustomRole
        ? {
            key: roleKey,
            label: customLabel,
            description: roleForm.description.trim() || "Custom responsibility role."
          }
        : null;

      return {
        ...reactivatedConfig,
        customRoles: customRole
          ? reactivatedConfig.customRoles?.some((role) => role.key === roleKey)
            ? reactivatedConfig.customRoles.map((role) => (role.key === roleKey ? customRole : role))
            : [...(reactivatedConfig.customRoles ?? []), customRole]
          : reactivatedConfig.customRoles ?? [],
        roleDomains: reactivatedConfig.roleDomains.some((item) => item.role === roleKey)
          ? reactivatedConfig.roleDomains.map((item) => (item.role === roleKey ? roleDomain : item))
          : [...reactivatedConfig.roleDomains, roleDomain]
      };
    });
    resetRoleForm();
  }

  function saveRegionSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const region = regionSiteForm.region.trim();
    const site = regionSiteForm.site.trim();

    if (!region || !site) {
      return;
    }

    const id =
      editingRegionSiteId ??
      getUniqueConfigId(
        config.regionSites.map((item) => item.id),
        normalizeId(site, "site")
      );
    const siteConfig: RegionSiteConfig = {
      id,
      label: `${region} - ${site}`,
      region,
      site,
      localProductOwnerId: regionSiteForm.localProductOwnerId,
      active: regionSiteForm.active
    };
    const previousSite = editingRegionSiteId
      ? config.regionSites.find((item) => item.id === editingRegionSiteId)
      : undefined;

    onConfigChange((current) => ({
      ...current,
      regionSites: editingRegionSiteId
        ? current.regionSites.map((item) => (item.id === editingRegionSiteId ? siteConfig : item))
        : [...current.regionSites, siteConfig],
      users: current.users.map((user) =>
        previousSite && user.site === previousSite.site
          ? { ...user, region: siteConfig.region, site: siteConfig.site }
          : user
      ),
      products: current.products.map((product) => ({
        ...product,
        prus: product.prus.map((pru) =>
          previousSite && pru.site === previousSite.site ? { ...pru, site: siteConfig.site } : pru
        )
      }))
    }));
    resetRegionSiteForm();
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const productName = productForm.productName.trim();
    const jiraProjectKey = productForm.jiraProjectKey.trim().toUpperCase();

    if (!productName || !jiraProjectKey) {
      return;
    }

    const previousProduct = editingProductId
      ? getConfigProductById(config, editingProductId)
      : undefined;
    const id =
      editingProductId ??
      getUniqueConfigId(
        config.products.map((product) => product.id),
        normalizeId(productName, "product")
      );
    const product: ProductConfig = {
      id,
      productName,
      productOwnerName: productForm.productOwnerName.trim(),
      jiraProjectKey,
      roleAssignments: previousProduct?.roleAssignments ?? [],
      prus: previousProduct?.prus ?? [],
      active: productForm.active
    };

    onConfigChange((current) => ({
      ...current,
      products: editingProductId
        ? current.products.map((item) => (item.id === editingProductId ? product : item))
        : [...current.products, product],
      formTemplates: previousProduct
        ? current.formTemplates.map((template) =>
            template.productName === previousProduct.productName
              ? { ...template, productName: product.productName }
              : template
          )
        : current.formTemplates
    }));
    resetProductForm();
  }

  function savePru(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = pruForm.name.trim();
    const site = pruForm.site.trim();
    const selectedProductIds = expandAllSelection(
      pruForm.productIds,
      config.products.map((product) => product.id)
    );
    const targetProducts = selectedProductIds
      .map((productId) => getConfigProductById(config, productId))
      .filter((product): product is ProductConfig => Boolean(product));

    setPruFormError("");
    setPruFormNotice("");

    if (config.products.length === 0) {
      setPruFormError("Create a product before adding a PRU.");
      return;
    }

    if (selectedProductIds.length === 0) {
      setPruFormError("Select at least one product before creating a PRU.");
      return;
    }

    if (targetProducts.length !== selectedProductIds.length) {
      setPruFormError("One or more selected products no longer exist. Refresh the page and try again.");
      return;
    }

    if (!name) {
      setPruFormError("Enter a PRU name before creating it.");
      return;
    }

    if (!site || site === ALL_SCOPE_LABEL || site === ALL_SCOPE_VALUE) {
      setPruFormError("Select exactly one site before creating a PRU.");
      return;
    }

    if (!getConfigSiteByName(config, site)) {
      setPruFormError("The selected site no longer exists. Refresh the page and try again.");
      return;
    }

    const previousProduct = editingPruRef ? getConfigProductById(config, editingPruRef.productId) : undefined;
    const previousPru = previousProduct?.prus?.find((pru) => pru.id === editingPruRef?.pruId);

    onConfigChange((current) => {
      const selectedIds = expandAllSelection(
        pruForm.productIds,
        current.products.map((product) => product.id)
      );
      const products = current.products.map((product) => {
        const productPrus = product.prus ?? [];
        const isSelectedProduct = selectedIds.includes(product.id);

        if (editingPruRef && product.id === editingPruRef.productId && !isSelectedProduct) {
          return { ...product, prus: productPrus.filter((pru) => pru.id !== editingPruRef.pruId) };
        }

        if (!isSelectedProduct) {
          return product;
        }

        const existingPru = productPrus.find(
          (pru) =>
            (editingPruRef?.productId === product.id && pru.id === editingPruRef.pruId) ||
            pru.name.trim().toLowerCase() === name.toLowerCase()
        );
        const id =
          existingPru?.id ??
          getUniqueConfigId(
            productPrus.map((pru) => pru.id),
            normalizeId(name, "pru")
          );
        const updatedPru: ProductPruConfig = {
          id,
          name,
          site,
          localProductOwnerId: pruForm.localProductOwnerId,
          modules: existingPru?.modules ?? previousPru?.modules ?? [],
          active: pruForm.active
        };

        return {
          ...product,
          prus: existingPru
            ? productPrus.map((pru) => (pru.id === existingPru.id ? updatedPru : pru))
            : [...productPrus, updatedPru]
        };
      });
      const renamedFrom = previousPru && previousPru.name !== name ? previousPru.name : null;

      return {
        ...current,
        products,
        users: renamedFrom
          ? current.users.map((user) => ({
              ...user,
              pruNames: user.pruNames.map((pruName) => (pruName === renamedFrom ? name : pruName))
            }))
          : current.users,
        responsibilityMappings: renamedFrom
          ? current.responsibilityMappings.map((mapping) => ({
              ...mapping,
              pruNames: mapping.pruNames.map((pruName) =>
                pruName === renamedFrom ? name : pruName
              )
            }))
          : current.responsibilityMappings
      };
    });
    resetPruForm();
    setPruFormNotice(
      `${editingPruRef ? "Saved" : "Created"} PRU "${name}" for ${formatCount(targetProducts.length)} product${targetProducts.length === 1 ? "" : "s"}.`
    );
  }

  function saveModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = moduleForm.name.trim();
    const targetProduct = getConfigProductById(config, moduleForm.productId);
    const selectedPruIds = expandAllSelection(
      moduleForm.pruIds,
      targetProduct?.prus?.map((pru) => pru.id) ?? []
    );
    const selectedPrus = targetProduct?.prus.filter((pru) => selectedPruIds.includes(pru.id)) ?? [];

    setModuleFormError("");
    setModuleFormNotice("");

    if (!name) {
      setModuleFormError("Enter a module name before creating it.");
      return;
    }

    if (!targetProduct) {
      setModuleFormError("Select a product before creating a module.");
      return;
    }

    if (selectedPruIds.length === 0) {
      setModuleFormError("Select at least one PRU before creating a module.");
      return;
    }

    if (selectedPrus.length !== selectedPruIds.length) {
      setModuleFormError("One or more selected PRUs no longer exist. Refresh the page and try again.");
      return;
    }

    onConfigChange((current) => {
      const currentTargetProduct = getConfigProductById(current, moduleForm.productId);
      const targetPruIds = expandAllSelection(
        moduleForm.pruIds,
        currentTargetProduct?.prus?.map((pru) => pru.id) ?? []
      );

      return {
        ...current,
        products: current.products.map((product) => {
        const productPrus = product.prus ?? [];

        if (editingModuleRef && product.id === editingModuleRef.productId && product.id !== moduleForm.productId) {
          return {
            ...product,
            prus: productPrus.map((pru) =>
              pru.id === editingModuleRef.pruId
                ? {
                    ...pru,
                    modules: (pru.modules ?? []).filter((module) => module.id !== editingModuleRef.moduleId)
                  }
                : pru
            )
          };
        }

        if (product.id !== moduleForm.productId) {
          return product;
        }

        return {
          ...product,
          prus: productPrus.map((pru) => {
            const pruModules = pru.modules ?? [];
            const isTargetPru = targetPruIds.includes(pru.id);

            if (!isTargetPru) {
              return editingModuleRef && product.id === editingModuleRef.productId && pru.id === editingModuleRef.pruId
                ? {
                    ...pru,
                    modules: pruModules.filter((module) => module.id !== editingModuleRef.moduleId)
                  }
                : pru;
            }

            const existingModule = pruModules.find(
              (module) =>
                (editingModuleRef?.productId === product.id &&
                  editingModuleRef.pruId === pru.id &&
                  module.id === editingModuleRef.moduleId) ||
                module.name.trim().toLowerCase() === name.toLowerCase()
            );
            const id =
              existingModule?.id ??
              getUniqueConfigId(
                pruModules.map((module) => module.id),
                normalizeId(name, "module")
              );
            const updatedModule: ProductModuleConfig = {
              id,
              name,
              jiraComponent: moduleForm.jiraComponent.trim() || undefined,
              active: moduleForm.active
            };

            return {
              ...pru,
              modules: existingModule
                ? pruModules.map((module) => (module.id === existingModule.id ? updatedModule : module))
                : [...pruModules, updatedModule]
            };
          })
        };
      })
      };
    });
    resetModuleForm();
    setModuleFormNotice(
      `${editingModuleRef ? "Saved" : "Created"} module "${name}" for ${formatCount(selectedPrus.length)} PRU${selectedPrus.length === 1 ? "" : "s"}.`
    );
  }

  function saveTicketType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const label = ticketTypeForm.label.trim();

    if (!label) {
      return;
    }

    const id =
      editingTicketTypeId ??
      getUniqueConfigId(
        config.requestTypes.map((type) => type.id),
        normalizeId(label, "ticket-type")
      );
    const ticketType: ConfigOption = {
      id,
      label,
      color: ticketTypeForm.color,
      active: ticketTypeForm.active,
      sortOrder: Number(ticketTypeForm.sortOrder) || config.requestTypes.length + 1
    };
    const defaultWorkflow = workflowTemplates.find((workflow) => workflow.id === "standard-governance") ?? workflowTemplates[0];

    onConfigChange((current) => ({
      ...current,
      requestTypes: editingTicketTypeId
        ? current.requestTypes.map((type) => (type.id === editingTicketTypeId ? ticketType : type))
        : [...current.requestTypes, ticketType],
      ticketTypeWorkflows: current.ticketTypeWorkflows.some((workflow) => workflow.ticketTypeId === id)
        ? current.ticketTypeWorkflows.map((workflow) =>
            workflow.ticketTypeId === id ? { ...workflow, active: ticketType.active } : workflow
          )
        : [
            ...current.ticketTypeWorkflows,
            {
              id: `workflow-${id}`,
              ticketTypeId: id,
              workflowTemplateId: defaultWorkflow?.id ?? "standard-governance",
              stepIds: defaultWorkflow?.steps.map((step) => step.id) ?? [],
              jiraCreatorStepId: "release-gate",
              jiraCreatorStepIds: ["release-gate"],
              stepOverrides: {},
              active: ticketType.active,
              updatedAt: new Date().toISOString()
            }
          ]
    }));
    resetTicketTypeForm();
  }

  function renderActiveTab() {
    if (activeTab === "users") {
      return (
        <div className="admin-editor-layout">
          <form className="admin-editor-form admin-form" onSubmit={saveUser}>
            <h3>{editingUserId ? "Edit user" : "Create user"}</h3>
            <label className="form-field">
              <span>Name</span>
              <input
                value={userForm.displayName}
                onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })}
                placeholder="Full name"
              />
            </label>
            <label className="form-field">
              <span>Email</span>
              <input
                type="email"
                value={userForm.email}
                onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
                placeholder="name@scania.com"
              />
            </label>
            <label className="form-field">
              <span>Primary role</span>
              <select
                value={userForm.primaryRole}
                onChange={(event) =>
                  setUserForm({ ...userForm, primaryRole: event.target.value as RoleKey })
                }
              >
                {roleOptions.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Acting / additional roles</span>
              <select
                multiple
                value={userForm.actionRoles}
                onChange={(event) => setUserForm({ ...userForm, actionRoles: getSelectedValues(event) as RoleKey[] })}
              >
                {roleOptions.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Region</span>
              <select
                value={userForm.region}
                onChange={(event) =>
                  setUserForm({
                    ...userForm,
                    region: event.target.value,
                    site: event.target.value === ALL_SCOPE_LABEL ? ALL_SCOPE_LABEL : userForm.site
                  })
                }
              >
                <option value={ALL_SCOPE_LABEL}>All regions</option>
                {regionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Site</span>
              <select
                value={userForm.site}
                onChange={(event) => {
                  const selectedSite = getConfigSiteByName(config, event.target.value);
                  setUserForm({
                    ...userForm,
                    site: event.target.value,
                    region: event.target.value === ALL_SCOPE_LABEL ? ALL_SCOPE_LABEL : selectedSite?.region ?? userForm.region
                  });
                }}
              >
                <option value={ALL_SCOPE_LABEL}>All sites</option>
                {userSiteOptions.map((siteName) => {
                  const configuredSite = getConfigSiteByName(config, siteName);

                  return (
                    <option key={siteName} value={siteName}>
                      {configuredSite?.label ?? siteName}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="form-field">
              <span>Product visibility</span>
              <select
                multiple
                value={userForm.productIds}
                onChange={(event) => setUserForm({ ...userForm, productIds: normalizeAllSelection(getSelectedValues(event)) })}
              >
                <option value={ALL_SCOPE_VALUE}>All products</option>
                {config.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.productName}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>PRU visibility</span>
              <select
                multiple
                value={userForm.pruNames}
                onChange={(event) => setUserForm({ ...userForm, pruNames: normalizeAllSelection(getSelectedValues(event)) })}
              >
                <option value={ALL_SCOPE_VALUE}>All PRUs</option>
                {getUniquePruNames(config).map((pruName) => (
                  <option key={pruName} value={pruName}>
                    {pruName}
                  </option>
                ))}
              </select>
            </label>
            <AdminCheckbox
              checked={userForm.active}
              label="Active user"
              onChange={(active) => setUserForm({ ...userForm, active })}
            />
            <AdminFormActions editing={Boolean(editingUserId)} onCancel={resetUserForm} />
          </form>
          <div className="admin-editable-list">
            {config.users.map((user) => (
              <AdminEditableRecord
                active={user.active}
                key={user.id}
                title={user.displayName}
                meta={`${user.email} - ${getConfigRoleLabel(config, user.primaryRole)} - ${user.region || "No region"} / ${user.site || "No site"}`}
                tags={[
                  ...user.actionRoles.map((role) => `Acting: ${getConfigRoleLabel(config, role)}`),
                  formatScopedCount(user.productIds, "product", "products"),
                  formatScopedCount(user.pruNames, "PRU", "PRUs")
                ]}
                onEdit={() => {
                  setEditingUserId(user.id);
                  setUserForm(buildUserForm(config, user));
                }}
                onDelete={
                  user.active
                    ? () => {
                        onConfigChange((current) => deactivateUserInConfig(current, user.id));
                        if (editingUserId === user.id) {
                          resetUserForm();
                        }
                      }
                    : undefined
                }
                onHardDelete={
                  !user.active
                    ? () => {
                        onConfigChange((current) => removeUserFromConfig(current, user.id));
                        if (editingUserId === user.id) {
                          resetUserForm();
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === "roles") {
      return (
        <div className="admin-editor-layout">
          <form className="admin-editor-form admin-form" onSubmit={saveRole}>
            <h3>{editingRole ? "Edit role visibility" : "Configure role visibility"}</h3>
            <label className="form-field">
              <span>Existing role</span>
              <select
                value={roleForm.role}
                disabled={Boolean(editingRole && !isBuiltInRole(editingRole))}
                onChange={(event) => setRoleForm({ ...roleForm, role: event.target.value as RoleKey })}
              >
                {roleOptions.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>New role name</span>
              <input
                value={roleForm.label}
                disabled={Boolean(editingRole && isBuiltInRole(editingRole))}
                onChange={(event) => {
                  const label = event.target.value;
                  setRoleForm({
                    ...roleForm,
                    label,
                    customKey: editingRole ? roleForm.customKey : label.trim() ? normalizeRoleKey(label) : ""
                  });
                }}
                placeholder="Example: QA Reviewer"
              />
            </label>
            <label className="form-field">
              <span>Role key</span>
              <input
                value={roleForm.customKey}
                disabled={Boolean(editingRole)}
                onChange={(event) => setRoleForm({ ...roleForm, customKey: normalizeRoleKey(event.target.value) })}
                placeholder="qa_reviewer"
              />
            </label>
            <label className="form-field">
              <span>Description</span>
              <input
                value={roleForm.description}
                disabled={Boolean(editingRole && isBuiltInRole(editingRole))}
                onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })}
                placeholder="What this role reviews or owns"
              />
            </label>
            <label className="form-field">
              <span>Visibility domain</span>
              <select
                value={roleForm.domain}
                onChange={(event) => setRoleForm({ ...roleForm, domain: event.target.value as RoleDomain })}
              >
                {roleDomainOptions.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Workflow participation</span>
              <select
                value={roleForm.workflowType}
                onChange={(event) => setRoleForm({ ...roleForm, workflowType: event.target.value as WorkflowRoleType })}
              >
                {workflowRoleTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="admin-hint">
              Select an existing role to configure its domain and workflow participation, or enter a new role name and key to create a custom role.
            </p>
            <AdminFormActions editing={Boolean(editingRole)} onCancel={resetRoleForm} />
          </form>
          <div className="admin-editable-list">
            {config.roleDomains.map((roleDomain) => {
              const role = roleOptions.find((item) => item.key === roleDomain.role);

              if (!role) {
                return null;
              }

              return (
                <AdminEditableRecord
                  active
                  key={role.key}
                  title={role.label}
                  meta={role.description}
                  tags={[
                    roleDomain.domain,
                    getWorkflowRoleTypeLabel(roleDomain.workflowType),
                    isBuiltInRole(role.key) ? "System role" : "Custom role"
                  ]}
                  onEdit={() => {
                    setEditingRole(role.key);
                    setRoleForm(buildRoleForm(config, roleDomain));
                  }}
                  onDelete={() => {
                    onConfigChange((current) => deactivateRoleInConfig(current, role.key));
                    if (editingRole === role.key) {
                      resetRoleForm();
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      );
    }

    if (activeTab === "regions") {
      return (
        <div className="admin-editor-layout">
          <form className="admin-editor-form admin-form" onSubmit={saveRegionSite}>
            <h3>{editingRegionSiteId ? "Edit region/site" : "Create region/site"}</h3>
            <label className="form-field">
              <span>Region</span>
              <input
                value={regionSiteForm.region}
                onChange={(event) => setRegionSiteForm({ ...regionSiteForm, region: event.target.value })}
                placeholder="Europe"
              />
            </label>
            <label className="form-field">
              <span>Site</span>
              <input
                value={regionSiteForm.site}
                onChange={(event) => setRegionSiteForm({ ...regionSiteForm, site: event.target.value })}
                placeholder="Sodertalje"
              />
            </label>
            <label className="form-field">
              <span>Local Product Owner</span>
              <select
                value={regionSiteForm.localProductOwnerId}
                onChange={(event) =>
                  setRegionSiteForm({ ...regionSiteForm, localProductOwnerId: event.target.value })
                }
              >
                <option value="">Unassigned</option>
                {config.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <AdminCheckbox
              checked={regionSiteForm.active}
              label="Active region/site"
              onChange={(active) => setRegionSiteForm({ ...regionSiteForm, active })}
            />
            <AdminFormActions editing={Boolean(editingRegionSiteId)} onCancel={resetRegionSiteForm} />
          </form>
          <div className="admin-editable-list">
            {config.regionSites.map((site) => (
              <AdminEditableRecord
                active={site.active}
                key={site.id}
                title={site.label}
                meta={`Local PO: ${getConfigUserName(config, site.localProductOwnerId)}`}
                tags={[site.region, site.site]}
                onEdit={() => {
                  setEditingRegionSiteId(site.id);
                  setRegionSiteForm(buildRegionSiteForm(config, site));
                }}
                onDelete={
                  site.active
                    ? () => {
                        onConfigChange((current) => deactivateRegionSiteInConfig(current, site.id));
                        if (editingRegionSiteId === site.id) {
                          resetRegionSiteForm();
                        }
                      }
                    : undefined
                }
                onHardDelete={
                  !site.active
                    ? () => {
                        onConfigChange((current) => removeRegionSiteFromConfig(current, site.id));
                        if (editingRegionSiteId === site.id) {
                          resetRegionSiteForm();
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === "products") {
      return (
        <div className="admin-editor-layout">
          <form className="admin-editor-form admin-form" onSubmit={saveProduct}>
            <h3>{editingProductId ? "Edit product" : "Create product"}</h3>
            <label className="form-field">
              <span>Product</span>
              <input
                value={productForm.productName}
                onChange={(event) => setProductForm({ ...productForm, productName: event.target.value })}
                placeholder="Product name"
              />
            </label>
            <label className="form-field">
              <span>Product owner</span>
              <input
                value={productForm.productOwnerName}
                onChange={(event) => setProductForm({ ...productForm, productOwnerName: event.target.value })}
                placeholder="Owner name"
              />
            </label>
            <label className="form-field">
              <span>Jira project key</span>
              <input
                value={productForm.jiraProjectKey}
                onChange={(event) => setProductForm({ ...productForm, jiraProjectKey: event.target.value })}
                placeholder="NEXUS"
              />
            </label>
            <AdminCheckbox
              checked={productForm.active}
              label="Active product"
              onChange={(active) => setProductForm({ ...productForm, active })}
            />
            <AdminFormActions editing={Boolean(editingProductId)} onCancel={resetProductForm} />
          </form>
          <div className="admin-editable-list">
            {config.products.map((product) => (
              <AdminEditableRecord
                active={product.active}
                key={product.id}
                title={product.productName}
                meta={`${product.productOwnerName || "No owner"} - Jira ${product.jiraProjectKey}`}
                tags={[`${product.prus.length} PRUs`, `${product.roleAssignments.length} role assignments`]}
                onEdit={() => {
                  setEditingProductId(product.id);
                  setProductForm(buildProductForm(product));
                }}
                onDelete={
                  product.active
                    ? () => {
                        onConfigChange((current) => deactivateProductInConfig(current, product.id));
                        if (editingProductId === product.id) {
                          resetProductForm();
                        }
                      }
                    : undefined
                }
                onHardDelete={
                  !product.active
                    ? () => {
                        onConfigChange((current) => removeProductFromConfig(current, product.id));
                        if (editingProductId === product.id) {
                          resetProductForm();
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === "prus") {
      return (
        <div className="admin-editor-layout">
          <form className="admin-editor-form admin-form" onSubmit={savePru}>
            <h3>{editingPruRef ? "Edit PRU" : "Create PRU"}</h3>
            <label className="form-field">
              <span>Products</span>
              <select
                multiple
                value={pruForm.productIds}
                onChange={(event) => updatePruForm({ ...pruForm, productIds: normalizeAllSelection(getSelectedValues(event)) })}
              >
                {config.products.length === 0 ? (
                  <option value="">Create a product first</option>
                ) : null}
                {config.products.length > 0 ? <option value={ALL_SCOPE_VALUE}>All products</option> : null}
                {config.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.productName}
                  </option>
                ))}
              </select>
              <small>Select several products to attach the same PRU in one save.</small>
            </label>
            <label className="form-field">
              <span>PRU</span>
              <input
                value={pruForm.name}
                onChange={(event) => updatePruForm({ ...pruForm, name: event.target.value })}
                placeholder="PRU E-Mobility"
              />
            </label>
            <label className="form-field">
              <span>Site</span>
              <select
                value={pruForm.site}
                onChange={(event) => updatePruForm({ ...pruForm, site: event.target.value })}
              >
                <option value="" disabled={config.regionSites.length > 0}>
                  {config.regionSites.length === 0 ? "Create a region/site first" : "Select one site"}
                </option>
                {config.regionSites.map((site) => (
                  <option key={site.id} value={site.site}>
                    {site.label}
                  </option>
                ))}
              </select>
              <small>Each PRU belongs to exactly one site.</small>
            </label>
            <label className="form-field">
              <span>Local Product Owner</span>
              <select
                value={pruForm.localProductOwnerId}
                onChange={(event) => updatePruForm({ ...pruForm, localProductOwnerId: event.target.value })}
              >
                <option value="">Unassigned</option>
                {config.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <AdminCheckbox
              checked={pruForm.active}
              label="Active PRU"
              onChange={(active) => updatePruForm({ ...pruForm, active })}
            />
            {pruFormError ? (
              <p className="admin-form-error" role="alert">
                {pruFormError}
              </p>
            ) : null}
            {pruFormNotice ? (
              <p className="admin-form-success" role="status">
                {pruFormNotice}
              </p>
            ) : null}
            <AdminFormActions editing={Boolean(editingPruRef)} onCancel={resetPruForm} />
          </form>
          <div className="admin-editable-list">
            {allPrus.map((pru) => (
              <AdminEditableRecord
                active={pru.active}
                key={`${pru.productId}-${pru.id}`}
                title={pru.name}
                meta={`${pru.productName} - ${pru.site || "No site"} - Local PO: ${getConfigUserName(config, pru.localProductOwnerId)}`}
                tags={[`${pru.modules.length} modules`]}
                onEdit={() => {
                  const product = getConfigProductById(config, pru.productId);
                  setEditingPruRef({ productId: pru.productId, pruId: pru.id });
                  setPruForm(buildPruForm(config, product, pru));
                }}
                onDelete={
                  pru.active
                    ? () => {
                        onConfigChange((current) => deactivatePruInConfig(current, pru.productId, pru.id));
                        if (editingPruRef?.pruId === pru.id) {
                          resetPruForm();
                        }
                      }
                    : undefined
                }
                onHardDelete={
                  !pru.active
                    ? () => {
                        onConfigChange((current) => removePruFromConfig(current, pru.productId, pru.id));
                        if (editingPruRef?.pruId === pru.id) {
                          resetPruForm();
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === "modules") {
      return (
        <div className="admin-editor-layout">
          <form className="admin-editor-form admin-form" onSubmit={saveModule}>
            <h3>{editingModuleRef ? "Edit module" : "Create module"}</h3>
            <label className="form-field">
              <span>Product</span>
              <select
                value={moduleForm.productId}
                onChange={(event) => {
                  const product = getConfigProductById(config, event.target.value);
                  const firstPruId = product?.prus[0]?.id;
                  setModuleForm({
                    ...moduleForm,
                    productId: event.target.value,
                    pruIds: firstPruId ? [firstPruId] : []
                  });
                }}
              >
                {config.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.productName}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>PRUs</span>
              <select
                multiple
                value={moduleForm.pruIds}
                onChange={(event) => setModuleForm({ ...moduleForm, pruIds: normalizeAllSelection(getSelectedValues(event)) })}
              >
                {modulePruOptions.length > 0 ? <option value={ALL_SCOPE_VALUE}>All PRUs</option> : null}
                {modulePruOptions.map((pru) => (
                  <option key={pru.id} value={pru.id}>
                    {pru.name}
                  </option>
                ))}
              </select>
              <small>Select several PRUs to create or update the module in one save.</small>
            </label>
            <label className="form-field">
              <span>Module</span>
              <input
                value={moduleForm.name}
                onChange={(event) => setModuleForm({ ...moduleForm, name: event.target.value })}
                placeholder="Module name"
              />
            </label>
            <label className="form-field">
              <span>Jira component</span>
              <input
                value={moduleForm.jiraComponent}
                onChange={(event) => setModuleForm({ ...moduleForm, jiraComponent: event.target.value })}
                placeholder="Exact Jira component name"
              />
              <small>Leave empty to create or update Jira without a component for this module.</small>
            </label>
            <AdminCheckbox
              checked={moduleForm.active}
              label="Active module"
              onChange={(active) => setModuleForm({ ...moduleForm, active })}
            />
            {moduleFormError ? (
              <p className="admin-form-error" role="alert">
                {moduleFormError}
              </p>
            ) : null}
            {moduleFormNotice ? (
              <p className="admin-form-success" role="status">
                {moduleFormNotice}
              </p>
            ) : null}
            <AdminFormActions editing={Boolean(editingModuleRef)} onCancel={resetModuleForm} />
          </form>
          <div className="admin-editable-list">
            {allModules.map((module) => (
              <AdminEditableRecord
                active={module.active}
                key={`${module.productId}-${module.pruId}-${module.id}`}
                title={module.name}
                meta={`${module.productName} - ${module.pruName}${module.jiraComponent ? ` - Jira component: ${module.jiraComponent}` : ""}`}
                tags={[module.productName, module.pruName, module.jiraComponent ? `Jira: ${module.jiraComponent}` : "No Jira component"]}
                onEdit={() => {
                  const product = getConfigProductById(config, module.productId);
                  const pru = product?.prus.find((item) => item.id === module.pruId);
                  setEditingModuleRef({
                    productId: module.productId,
                    pruId: module.pruId,
                    moduleId: module.id
                  });
                  setModuleForm(buildModuleForm(config, product, pru, module));
                }}
                onDelete={
                  module.active
                    ? () => {
                        onConfigChange((current) =>
                          deactivateModuleInConfig(current, module.productId, module.pruId, module.id)
                        );
                        if (editingModuleRef?.moduleId === module.id) {
                          resetModuleForm();
                        }
                      }
                    : undefined
                }
                onHardDelete={
                  !module.active
                    ? () => {
                        onConfigChange((current) =>
                          removeModuleFromConfig(current, module.productId, module.pruId, module.id)
                        );
                        if (editingModuleRef?.moduleId === module.id) {
                          resetModuleForm();
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="admin-editor-layout">
        <form className="admin-editor-form admin-form" onSubmit={saveTicketType}>
          <h3>{editingTicketTypeId ? "Edit ticket type" : "Create ticket type"}</h3>
          <label className="form-field">
            <span>Ticket type</span>
            <input
              value={ticketTypeForm.label}
              onChange={(event) => setTicketTypeForm({ ...ticketTypeForm, label: event.target.value })}
              placeholder="Change Request"
            />
          </label>
          <label className="form-field">
            <span>Tegel status color</span>
            <select
              value={ticketTypeForm.color}
              onChange={(event) =>
                setTicketTypeForm({ ...ticketTypeForm, color: event.target.value as TegelTagVariant })
              }
            >
              {tagVariantOptions.map((variant) => (
                <option key={variant} value={variant}>
                  {variant}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Sort order</span>
            <input
              type="number"
              min="1"
              value={ticketTypeForm.sortOrder}
              onChange={(event) => setTicketTypeForm({ ...ticketTypeForm, sortOrder: event.target.value })}
            />
          </label>
          <AdminCheckbox
            checked={ticketTypeForm.active}
            label="Active ticket type"
            onChange={(active) => setTicketTypeForm({ ...ticketTypeForm, active })}
          />
          <AdminFormActions editing={Boolean(editingTicketTypeId)} onCancel={resetTicketTypeForm} />
        </form>
        <div className="admin-editable-list">
          {[...config.requestTypes]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((ticketType) => (
              <AdminEditableRecord
                active={ticketType.active}
                key={ticketType.id}
                title={ticketType.label}
                meta={`ID: ${ticketType.id} - sort ${ticketType.sortOrder}`}
                tags={[ticketType.color]}
                onEdit={() => {
                  setEditingTicketTypeId(ticketType.id);
                  setTicketTypeForm(buildTicketTypeForm(ticketType));
                }}
                onDelete={
                  ticketType.active
                    ? () => {
                        onConfigChange((current) => deactivateTicketTypeInConfig(current, ticketType.id));
                        if (editingTicketTypeId === ticketType.id) {
                          resetTicketTypeForm();
                        }
                      }
                    : undefined
                }
                onHardDelete={
                  !ticketType.active
                    ? () => {
                        onConfigChange((current) => removeTicketTypeFromConfig(current, ticketType.id));
                        if (editingTicketTypeId === ticketType.id) {
                          resetTicketTypeForm();
                        }
                      }
                    : undefined
                }
              />
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-master-manager">
      <div className="admin-metric-grid">
        <AdminSummaryCard label="Active users" value={config.users.filter((user) => user.active).length} />
        <AdminSummaryCard label="Configured roles" value={config.roleDomains.length} />
        <AdminSummaryCard label="Regions / sites" value={config.regionSites.length} />
        <AdminSummaryCard label="Products" value={config.products.length} />
        <AdminSummaryCard label="PRUs" value={allPrus.length} />
        <AdminSummaryCard label="Modules" value={allModules.length} />
        <AdminSummaryCard label="Ticket types" value={config.requestTypes.length} />
        <AdminSummaryCard label="Mappings" value={dedupeResponsibilityMappings(config.responsibilityMappings).length} />
      </div>
      <div className="admin-master-tabs" role="tablist" aria-label="Admin master data">
        {adminMasterTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={`admin-master-tab ${activeTab === tab.id ? "is-active" : ""}`}
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            role="tab"
            type="button"
          >
            <TegelIcon name={tab.iconName} size="17px" />
            {tab.label}
          </button>
        ))}
      </div>
      {renderActiveTab()}
    </div>
  );
}

function TicketWorkflowManager({
  config,
  onConfigChange
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
}) {
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [workflowForm, setWorkflowForm] = useState<WorkflowRouteFormState>(() =>
    buildWorkflowRouteForm(config)
  );
  const [workflowError, setWorkflowError] = useState("");
  const selectedTemplate = getWorkflowTemplateById(workflowForm.workflowTemplateId) ?? workflowTemplates[0];
  const selectedSteps = getWorkflowTemplateStepsByRouteOrder(
    selectedTemplate,
    workflowForm.stepIds,
    workflowForm.stepOverrides
  );
  const availableSteps = selectedTemplate.steps.filter((step) => !workflowForm.stepIds.includes(step.id));
  const activeWorkflowCount = config.ticketTypeWorkflows.filter((workflow) => workflow.active).length;
  const roleOptions = getRoleOptions(config);
  const selectedOwnerRoles = new Set(
    selectedSteps.map((step) => {
      const stepForm = workflowForm.stepOverrides[step.id] ?? buildWorkflowStepForm(step);

      return stepForm.ownerRole;
    })
  );
  const availableWorkflowRoles = getWorkflowRoleOptions(config).filter((role) => !selectedOwnerRoles.has(role.key));
  const selectedJiraCreatorSteps = selectedSteps.filter((step) => workflowForm.jiraCreatorStepIds.includes(step.id));
  const selectedJiraCreatorLabels = selectedJiraCreatorSteps.map(
    (step) => workflowForm.stepOverrides[step.id]?.label || step.label
  );

  function getEligibleJiraCreatorStepIds(stepIds: string[], stepOverrides: Record<string, WorkflowStepFormState>): string[] {
    return stepIds.filter((stepId) => {
      const stepForm = stepOverrides[stepId];

      return stepForm ? workflowStepCanCreateJira(config, stepForm) : false;
    });
  }

  function normalizeJiraCreatorStepIds(
    stepIds: string[],
    stepOverrides: Record<string, WorkflowStepFormState>,
    selectedStepIds: string[]
  ): string[] {
    const eligibleStepIds = new Set(getEligibleJiraCreatorStepIds(stepIds, stepOverrides));

    return Array.from(new Set(selectedStepIds.filter((stepId) => eligibleStepIds.has(stepId))));
  }

  function resetWorkflowForm() {
    setEditingWorkflowId(null);
    setWorkflowError("");
    setWorkflowForm(buildWorkflowRouteForm(config));
  }

  function changeWorkflowTemplate(templateId: string) {
    const nextTemplate = getWorkflowTemplateById(templateId) ?? workflowTemplates[0];
    const nextStepIds = nextTemplate.steps.map((step) => step.id);
    const releaseGate = nextTemplate.steps.find((step) => step.id === "release-gate")?.id;
    const nextStepOverrides = Object.fromEntries(
      nextTemplate.steps.map((step) => [step.id, buildWorkflowStepForm(step)])
    );
    const eligibleCreatorStepIds = getEligibleJiraCreatorStepIds(nextStepIds, nextStepOverrides);
    const nextJiraCreatorStepId =
      releaseGate && eligibleCreatorStepIds.includes(releaseGate)
        ? releaseGate
        : eligibleCreatorStepIds[0] ?? "";

    setWorkflowForm({
      ...workflowForm,
      workflowTemplateId: nextTemplate.id,
      escalationPolicyId: nextTemplate.escalationPolicyId ?? config.escalationPolicies[0]?.id ?? "",
      stepIds: nextStepIds,
      jiraCreatorStepIds: nextJiraCreatorStepId ? [nextJiraCreatorStepId] : [],
      stepOverrides: nextStepOverrides
    });
    setWorkflowError("");
  }

  function addWorkflowStep(stepId: string) {
    const templateStep = selectedTemplate.steps.find((step) => step.id === stepId);

    if (!templateStep || workflowForm.stepIds.includes(stepId)) {
      return;
    }

    const nextStepIds = [...workflowForm.stepIds, stepId];
    setWorkflowForm({
      ...workflowForm,
      stepIds: nextStepIds,
      stepOverrides: {
        ...workflowForm.stepOverrides,
        [stepId]: workflowForm.stepOverrides[stepId] ?? buildWorkflowStepForm(templateStep)
      }
    });
    setWorkflowError("");
  }

  function addWorkflowRoleStep(roleKey: RoleKey) {
    const roleOption = roleOptions.find((role) => role.key === roleKey);

    if (!roleOption) {
      return;
    }

    const workflowType = getRoleWorkflowType(config, roleKey);
    const stepId = getUniqueConfigId(
      [
        ...selectedTemplate.steps.map((step) => step.id),
        ...workflowForm.stepIds,
        ...Object.keys(workflowForm.stepOverrides)
      ],
      normalizeId(`${roleKey}-${workflowType}`, "role-step")
    );
    const stepLabel =
      workflowType === "inform"
        ? `Inform ${roleOption.label}`
        : `${roleOption.label} ${workflowType === "approval" ? "Approval" : "Review"}`;
    const nextStepForm: WorkflowStepFormState = {
      label: stepLabel,
      ownerRole: roleKey,
      workflowType,
      required: workflowType === "approval",
      parallelGroup: "",
      slaHours: workflowType === "inform" ? "1" : "24",
      allowDelegation: workflowType !== "inform",
      allowClarification: workflowType !== "inform"
    };

    setWorkflowForm({
      ...workflowForm,
      stepIds: [...workflowForm.stepIds, stepId],
      stepOverrides: {
        ...workflowForm.stepOverrides,
        [stepId]: nextStepForm
      }
    });
    setWorkflowError("");
  }

  function removeWorkflowStep(stepId: string) {
    const nextStepIds = workflowForm.stepIds.filter((id) => id !== stepId);

    setWorkflowForm({
      ...workflowForm,
      stepIds: nextStepIds,
      jiraCreatorStepIds: workflowForm.jiraCreatorStepIds.filter((creatorStepId) =>
        nextStepIds.includes(creatorStepId)
      )
    });
    setWorkflowError("");
  }

  function moveWorkflowStep(stepId: string, direction: -1 | 1) {
    const currentIndex = workflowForm.stepIds.indexOf(stepId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= workflowForm.stepIds.length) {
      return;
    }

    const nextStepIds = [...workflowForm.stepIds];
    [nextStepIds[currentIndex], nextStepIds[nextIndex]] = [nextStepIds[nextIndex], nextStepIds[currentIndex]];

    setWorkflowForm({
      ...workflowForm,
      stepIds: nextStepIds
    });
    setWorkflowError("");
  }

  function changeWorkflowStepType(stepId: string, workflowType: WorkflowRoleType) {
    const stepForm = workflowForm.stepOverrides[stepId];

    if (!stepForm) {
      return;
    }

    const matchingRoles = getWorkflowRoleOptions(config, workflowType);
    const ownerRole = matchingRoles.some((role) => role.key === stepForm.ownerRole)
      ? stepForm.ownerRole
      : matchingRoles[0]?.key ?? stepForm.ownerRole;

    updateWorkflowStep(stepId, {
      ownerRole,
      workflowType,
      required: workflowType === "approval" ? true : stepForm.required && workflowType !== "inform",
      allowDelegation: workflowType === "inform" ? false : stepForm.allowDelegation,
      allowClarification: workflowType === "inform" ? false : stepForm.allowClarification
    });
  }

  function updateWorkflowStep(stepId: string, patch: Partial<WorkflowStepFormState>) {
    const stepForm = workflowForm.stepOverrides[stepId];

    if (!stepForm) {
      return;
    }

    const nextStepOverrides = {
      ...workflowForm.stepOverrides,
      [stepId]: {
        ...stepForm,
        ...patch
      }
    };

    setWorkflowForm({
      ...workflowForm,
      jiraCreatorStepIds: normalizeJiraCreatorStepIds(
        workflowForm.stepIds,
        nextStepOverrides,
        workflowForm.jiraCreatorStepIds
      ),
      stepOverrides: nextStepOverrides
    });
    setWorkflowError("");
  }

  function toggleJiraCreatorStep(stepId: string, checked: boolean) {
    const stepForm = workflowForm.stepOverrides[stepId];

    if (!stepForm || !workflowStepCanCreateJira(config, stepForm)) {
      return;
    }

    const nextCreatorStepIds = checked
      ? [...workflowForm.jiraCreatorStepIds, stepId]
      : workflowForm.jiraCreatorStepIds.filter((creatorStepId) => creatorStepId !== stepId);

    setWorkflowForm({
      ...workflowForm,
      jiraCreatorStepIds: normalizeJiraCreatorStepIds(
        workflowForm.stepIds,
        workflowForm.stepOverrides,
        nextCreatorStepIds
      )
    });
    setWorkflowError("");
  }

  function saveWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workflowForm.ticketTypeId) {
      setWorkflowError("Select a request type for this workflow route.");
      return;
    }

    if (!workflowForm.stepIds.length) {
      setWorkflowError("Select at least one workflow step.");
      return;
    }

    if (!config.escalationPolicies.some((policy) => policy.id === workflowForm.escalationPolicyId)) {
      setWorkflowError("Select an escalation policy for this workflow route.");
      return;
    }

    const jiraCreatorStepIds = normalizeJiraCreatorStepIds(
      workflowForm.stepIds,
      workflowForm.stepOverrides,
      workflowForm.jiraCreatorStepIds
    );

    if (!jiraCreatorStepIds.length) {
      setWorkflowError("Select at least one IT-domain approval or review step as Jira creator.");
      return;
    }

    const duplicateWorkflow = config.ticketTypeWorkflows.some(
      (workflow) => workflow.id !== editingWorkflowId && workflow.ticketTypeId === workflowForm.ticketTypeId
    );

    if (duplicateWorkflow) {
      setWorkflowError("This request type already has a workflow route. Edit the existing route or remove it first.");
      return;
    }

    const id =
      editingWorkflowId ??
      getUniqueConfigId(
        config.ticketTypeWorkflows.map((workflow) => workflow.id),
        normalizeId(workflowForm.ticketTypeId, "workflow")
      );
    const route = normalizeTicketTypeWorkflow({
      id,
      ticketTypeId: workflowForm.ticketTypeId,
      workflowTemplateId: selectedTemplate.id,
      escalationPolicyId: workflowForm.escalationPolicyId,
      stepIds: workflowForm.stepIds,
      jiraCreatorStepId: jiraCreatorStepIds[0],
      jiraCreatorStepIds,
      stepOverrides: buildWorkflowStepOverridesFromForm(workflowForm, selectedTemplate),
      active: workflowForm.active,
      updatedAt: new Date().toISOString()
    });

    onConfigChange((current) => ({
      ...current,
      ticketTypeWorkflows: editingWorkflowId
        ? current.ticketTypeWorkflows.map((workflow) => (workflow.id === editingWorkflowId ? route : workflow))
        : [...current.ticketTypeWorkflows, route]
    }));
    resetWorkflowForm();
  }

  function startEditWorkflow(workflow: TicketTypeWorkflowConfig) {
    setEditingWorkflowId(workflow.id);
    setWorkflowError("");
    setWorkflowForm(buildWorkflowRouteForm(config, workflow));
  }

  return (
    <div className="admin-master-manager">
      <div className="admin-metric-grid">
        <AdminSummaryCard label="Routes" value={config.ticketTypeWorkflows.length} />
        <AdminSummaryCard label="Active routes" value={activeWorkflowCount} />
        <AdminSummaryCard label="Templates" value={workflowTemplates.length} />
        <AdminSummaryCard label="Configured steps" value={config.ticketTypeWorkflows.reduce(
          (count, workflow) => count + getConfiguredWorkflowStepsForRoute(workflow, config).length,
          0
        )} />
      </div>
      <div className="admin-editor-layout workflow-editor-layout">
        <form className="admin-editor-form admin-form workflow-route-form" onSubmit={saveWorkflow}>
          <div className="workflow-route-form-heading">
            <div>
              <h3>Workflow by request type</h3>
              <span>{editingWorkflowId ? "Editing existing route" : "Create a governed route"}</span>
            </div>
          </div>
          {workflowError ? <p className="admin-form-error">{workflowError}</p> : null}
          <div className="workflow-route-top-grid">
            <label className="form-field">
              <span>Request type</span>
              <select
                value={workflowForm.ticketTypeId}
                disabled={Boolean(editingWorkflowId)}
                onChange={(event) => setWorkflowForm({ ...workflowForm, ticketTypeId: event.target.value })}
              >
                {config.requestTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Workflow template</span>
              <select
                value={workflowForm.workflowTemplateId}
                onChange={(event) => changeWorkflowTemplate(event.target.value)}
              >
                {workflowTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Escalation policy</span>
              <select
                value={workflowForm.escalationPolicyId}
                onChange={(event) => setWorkflowForm({ ...workflowForm, escalationPolicyId: event.target.value })}
              >
                {config.escalationPolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-field workflow-jira-summary">
              <span>Jira creators</span>
              <strong>{selectedJiraCreatorLabels.length ? selectedJiraCreatorLabels.join(", ") : "Select IT steps below"}</strong>
              <small>Only IT-domain approval or review levels can create Jira tickets.</small>
            </div>
            <div className="workflow-route-toggle-cell">
              <AdminCheckbox
                checked={workflowForm.active}
                label="Active workflow route"
                onChange={(active) => setWorkflowForm({ ...workflowForm, active })}
              />
            </div>
          </div>
          <div className="workflow-route-designer">
            <section className="workflow-level-config-panel" aria-labelledby="workflow-level-config-title">
              <div className="workflow-panel-heading">
                <div>
                  <h4 id="workflow-level-config-title">Approval levels</h4>
                  <span>{formatCount(selectedSteps.length)} configured level{selectedSteps.length === 1 ? "" : "s"}</span>
                </div>
              </div>
              <div className="workflow-level-list">
                {selectedSteps.map((step, index) => {
                  const stepForm = workflowForm.stepOverrides[step.id] ?? buildWorkflowStepForm(step);
                  const isJiraCreator = workflowForm.jiraCreatorStepIds.includes(step.id);
                  const canStepCreateJira = workflowStepCanCreateJira(config, stepForm);
                  const ownerRoleOptions = getWorkflowRoleOptionsForStep(
                    config,
                    stepForm.workflowType,
                    stepForm.ownerRole
                  );

                  return (
                    <article className="workflow-level-editor-card" key={step.id}>
                      <div className="workflow-level-card-heading">
                        <span className="workflow-level-marker">{index + 1}</span>
                        <div>
                          <strong>Level {index + 1}</strong>
                          <small>{step.id}</small>
                        </div>
                        {canStepCreateJira ? (
                          <label className="workflow-jira-radio">
                            <input
                              checked={isJiraCreator}
                              onChange={(event) => toggleJiraCreatorStep(step.id, event.target.checked)}
                              type="checkbox"
                            />
                            Jira creator
                          </label>
                        ) : (
                          <span className="workflow-jira-domain-note">Not IT domain</span>
                        )}
                      </div>
                      <div className="workflow-level-field-grid">
                        <label className="form-field">
                          <span>Step label</span>
                          <input
                            value={stepForm.label}
                            onChange={(event) => updateWorkflowStep(step.id, { label: event.target.value })}
                          />
                        </label>
                        <label className="form-field">
                          <span>Level type</span>
                          <select
                            value={stepForm.workflowType}
                            onChange={(event) => changeWorkflowStepType(step.id, event.target.value as WorkflowRoleType)}
                          >
                            {workflowRoleTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-field">
                          <span>Responsible role</span>
                          <select
                            value={stepForm.ownerRole}
                            onChange={(event) => updateWorkflowStep(step.id, { ownerRole: event.target.value as RoleKey })}
                          >
                            {ownerRoleOptions.map((role) => (
                              <option key={role.key} value={role.key}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-field">
                          <span>SLA hours</span>
                          <input
                            min="1"
                            type="number"
                            value={stepForm.slaHours}
                            onChange={(event) => updateWorkflowStep(step.id, { slaHours: event.target.value })}
                          />
                        </label>
                        <label className="form-field">
                          <span>Parallel group</span>
                          <input
                            value={stepForm.parallelGroup}
                            onChange={(event) => updateWorkflowStep(step.id, { parallelGroup: event.target.value })}
                            placeholder="Optional"
                          />
                        </label>
                      </div>
                      <div className="workflow-step-toggle-grid">
                        <AdminCheckbox
                          checked={stepForm.required}
                          label="Required"
                          onChange={(required) => updateWorkflowStep(step.id, { required })}
                        />
                        <AdminCheckbox
                          checked={stepForm.allowDelegation}
                          label="Delegation"
                          onChange={(allowDelegation) => updateWorkflowStep(step.id, { allowDelegation })}
                        />
                        <AdminCheckbox
                          checked={stepForm.allowClarification}
                          label="More info"
                          onChange={(allowClarification) => updateWorkflowStep(step.id, { allowClarification })}
                        />
                      </div>
                      <div className="workflow-level-order-actions">
                        <button
                          className="secondary-button"
                          disabled={index === 0}
                          onClick={() => moveWorkflowStep(step.id, -1)}
                          type="button"
                        >
                          Up
                        </button>
                        <button
                          className="secondary-button"
                          disabled={index === selectedSteps.length - 1}
                          onClick={() => moveWorkflowStep(step.id, 1)}
                          type="button"
                        >
                          Down
                        </button>
                        <button
                          className="secondary-button danger-button hard-delete-button"
                          disabled={selectedSteps.length <= 1}
                          onClick={() => removeWorkflowStep(step.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {availableSteps.length > 0 ? (
                <div className="workflow-available-steps">
                  <span>Available template steps</span>
                  <div>
                    {availableSteps.map((step) => (
                      <button
                        className="secondary-button"
                        key={step.id}
                        onClick={() => addWorkflowStep(step.id)}
                        type="button"
                      >
                        Add {step.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {availableWorkflowRoles.length > 0 ? (
                <div className="workflow-available-steps">
                  <span>Available configured roles</span>
                  <div>
                    {availableWorkflowRoles.map((role) => (
                      <button
                        className="secondary-button workflow-role-add-button"
                        key={role.key}
                        onClick={() => addWorkflowRoleStep(role.key)}
                        type="button"
                      >
                        Add {role.label} - {getWorkflowRoleTypeLabel(getRoleWorkflowType(config, role.key))}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="workflow-preview-panel" aria-labelledby="workflow-preview-title">
              <div className="workflow-preview-header">
                <div>
                  <h4 id="workflow-preview-title">{getConfigTicketTypeLabel(config, workflowForm.ticketTypeId)}</h4>
                  <span>{selectedTemplate.name}</span>
                </div>
                <strong>{formatCount(selectedSteps.length)} workflow level{selectedSteps.length === 1 ? "" : "s"}</strong>
              </div>
              <div className="workflow-preview-card-grid">
                {selectedSteps.map((step, index) => {
                  const stepForm = workflowForm.stepOverrides[step.id] ?? buildWorkflowStepForm(step);
                  const nextStep = selectedSteps[index + 1];
                  const nextStepForm = nextStep ? workflowForm.stepOverrides[nextStep.id] ?? buildWorkflowStepForm(nextStep) : undefined;
                  const ownerLabel = getConfigRoleLabel(config, stepForm.ownerRole);
                  const nextOwnerLabel = nextStepForm ? getConfigRoleLabel(config, nextStepForm.ownerRole) : "Jira draft";
                  const isJiraCreator = workflowForm.jiraCreatorStepIds.includes(step.id);
                  const workflowTypeLabel = getWorkflowRoleTypeLabel(stepForm.workflowType);
                  const waitingAction =
                    stepForm.workflowType === "inform"
                      ? `Inform ${ownerLabel}`
                      : `Waiting for ${ownerLabel} ${stepForm.workflowType === "approval" ? "approval" : "review"}`;

                  return (
                    <article className={`workflow-preview-card ${isJiraCreator ? "is-jira-creator" : ""}`} key={step.id}>
                      <div className="workflow-preview-card-header">
                        <span className="workflow-level-marker">{index + 1}</span>
                        <div>
                          <strong>{stepForm.label.trim() || step.label}</strong>
                          <small>{ownerLabel}</small>
                        </div>
                        <span className="workflow-role-pill">{ownerLabel}</span>
                      </div>
                      <p>{workflowTypeLabel}</p>
                      <div className="workflow-preview-action-grid">
                        <div>
                          <span>Status</span>
                          <strong>{isJiraCreator ? `${waitingAction} and Jira creation` : waitingAction}</strong>
                        </div>
                        <div>
                          <span>Proceed</span>
                          <strong>{isJiraCreator ? "Create Jira ticket" : `${nextOwnerLabel} approval next`}</strong>
                        </div>
                        <div>
                          <span>More info</span>
                          <strong>{stepForm.allowClarification ? "Return to submitter, then resume here" : "Not available"}</strong>
                        </div>
                        <div>
                          <span>Reject</span>
                          <strong>Close as Rejected</strong>
                        </div>
                        <div>
                          <span>SLA</span>
                          <strong>{stepForm.slaHours || step.slaHours}h target</strong>
                        </div>
                        <div>
                          <span>Parallel</span>
                          <strong>{stepForm.parallelGroup.trim() || "Sequential review"}</strong>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
          <AdminFormActions editing={Boolean(editingWorkflowId)} onCancel={resetWorkflowForm} />
        </form>
        <div className="admin-route-list">
          {config.ticketTypeWorkflows.map((workflow) => {
            const template = getWorkflowTemplateById(workflow.workflowTemplateId);
            const configuredSteps = getConfiguredWorkflowStepsForRoute(workflow, config);
            const jiraCreatorStepIds = getJiraCreatorStepIds(workflow);
            const jiraCreatorSteps = configuredSteps.filter((step) => jiraCreatorStepIds.includes(step.id));
            const escalationPolicy = config.escalationPolicies.find((policy) =>
              policy.id === (workflow.escalationPolicyId ?? template?.escalationPolicyId)
            );

            return (
              <article className="admin-route-card" key={workflow.id}>
                <div className="admin-record-header">
                  <div>
                    <strong>{getConfigTicketTypeLabel(config, workflow.ticketTypeId)}</strong>
                    <span>
                      {template?.name ?? workflow.workflowTemplateId} - {escalationPolicy?.name ?? "No escalation policy"} - Jira creators: {jiraCreatorSteps.length ? jiraCreatorSteps.map((step) => step.label).join(", ") : "Not set"}
                    </span>
                  </div>
                  <AdminStatusPill active={workflow.active} />
                </div>
                <div className="admin-step-chain">
                  {configuredSteps.map((step) => (
                    <span className="admin-step-chip" key={`${workflow.id}-${step.id}`}>
                      {step.label}
                      <small>
                        {getConfigRoleLabel(config, step.ownerRole)} - {getWorkflowRoleTypeLabel(step.workflowType ?? getDefaultWorkflowRoleType(step.ownerRole))} - {step.slaHours}h
                      </small>
                    </span>
                  ))}
                </div>
                <div className="admin-record-actions">
                  <button className="secondary-button" type="button" onClick={() => startEditWorkflow(workflow)}>
                    <TegelIcon name="edit" size="16px" />
                    Edit
                  </button>
                  {workflow.active ? (
                    <button
                      className="secondary-button danger-button"
                      type="button"
                      onClick={() => {
                        onConfigChange((current) => ({
                          ...current,
                          ticketTypeWorkflows: current.ticketTypeWorkflows.map((item) =>
                            item.id === workflow.id ? { ...item, active: false, updatedAt: new Date().toISOString() } : item
                          )
                        }));
                        if (editingWorkflowId === workflow.id) {
                          resetWorkflowForm();
                        }
                      }}
                    >
                      <TegelIcon name="cross" size="16px" />
                      Deactivate
                    </button>
                  ) : (
                    <button
                      className="secondary-button danger-button hard-delete-button"
                      type="button"
                      onClick={() => {
                        onConfigChange((current) => ({
                          ...current,
                          ticketTypeWorkflows: current.ticketTypeWorkflows.filter((item) => item.id !== workflow.id)
                        }));
                        if (editingWorkflowId === workflow.id) {
                          resetWorkflowForm();
                        }
                      }}
                    >
                      <TegelIcon name="trash" size="16px" />
                      Hard delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SlaRulesManager({
  config,
  onConfigChange
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
}) {
  const [slaForm, setSlaForm] = useState<SlaRuleFormState>(() =>
    buildSlaRuleForm(config, config.slaRules.find((rule) => rule.priority === "2 - Medium") ?? config.slaRules[0])
  );
  const [slaError, setSlaError] = useState("");
  const [editingEscalationPolicyId, setEditingEscalationPolicyId] = useState<string | null>(
    () => config.escalationPolicies[0]?.id ?? null
  );
  const [escalationPolicyForm, setEscalationPolicyForm] = useState<EscalationPolicyFormState>(() =>
    buildEscalationPolicyForm(config, config.escalationPolicies[0])
  );
  const [escalationPolicyError, setEscalationPolicyError] = useState("");
  const activePriorities = config.priorities.filter((priority) => priority.active);
  const selectedRule = config.slaRules.find((rule) => rule.priority === slaForm.priority);
  const selectedEscalationPolicy = editingEscalationPolicyId
    ? config.escalationPolicies.find((policy) => policy.id === editingEscalationPolicyId)
    : undefined;
  const missingPriority = activePriorities.find(
    (priority) => !config.slaRules.some((rule) => rule.priority === priority.label)
  );
  const referencedEscalationPolicyIds = new Set(
    config.ticketTypeWorkflows
      .map((workflow) => {
        const template = getWorkflowTemplateById(workflow.workflowTemplateId);

        return workflow.escalationPolicyId ?? template?.escalationPolicyId;
      })
      .filter((policyId): policyId is string => Boolean(policyId))
  );
  const sortedSlaRules = [...config.slaRules].sort((left, right) => {
    const leftIndex = config.priorities.find((priority) => priority.label === left.priority)?.sortOrder ?? 999;
    const rightIndex = config.priorities.find((priority) => priority.label === right.priority)?.sortOrder ?? 999;

    return leftIndex - rightIndex;
  });
  const sortedEscalationPolicies = [...config.escalationPolicies].sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  useEffect(() => {
    if (!editingEscalationPolicyId) {
      return;
    }

    const policy = config.escalationPolicies.find((item) => item.id === editingEscalationPolicyId);

    if (policy) {
      setEscalationPolicyForm(buildEscalationPolicyForm(config, policy));
      return;
    }

    const fallbackPolicy = config.escalationPolicies[0];
    setEditingEscalationPolicyId(fallbackPolicy?.id ?? null);
    setEscalationPolicyForm(buildEscalationPolicyForm(config, fallbackPolicy));
  }, [config, editingEscalationPolicyId]);

  function changePriority(priority: Ticket["priority"]) {
    const nextRule = config.slaRules.find((rule) => rule.priority === priority);

    setSlaForm(buildSlaRuleForm(config, nextRule ?? { id: normalizeId(priority, "sla"), priority, targetHours: 240, warningHours: 168 }));
    setSlaError("");
  }

  function startNewSlaRule() {
    if (!missingPriority) {
      return;
    }

    setSlaForm({
      priority: missingPriority.label as Ticket["priority"],
      targetHours: "240",
      warningHours: "168"
    });
    setSlaError("");
  }

  function editSlaRule(rule: SlaRule) {
    setSlaForm(buildSlaRuleForm(config, rule));
    setSlaError("");
  }

  function deleteSlaRule(ruleId: string) {
    onConfigChange((current) => ({
      ...current,
      slaRules: current.slaRules.filter((rule) => rule.id !== ruleId)
    }));

    const remainingRules = config.slaRules.filter((rule) => rule.id !== ruleId);
    setSlaForm(buildSlaRuleForm({ ...config, slaRules: remainingRules }, remainingRules[0]));
    setSlaError("");
  }

  function saveSlaRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const targetHours = Number.parseInt(slaForm.targetHours, 10);
    const warningHours = Number.parseInt(slaForm.warningHours, 10);

    if (!Number.isFinite(targetHours) || targetHours <= 0) {
      setSlaError("Target hours must be a positive number.");
      return;
    }

    if (!Number.isFinite(warningHours) || warningHours <= 0) {
      setSlaError("Warning hours must be a positive number.");
      return;
    }

    if (warningHours >= targetHours) {
      setSlaError("Warning hours must be lower than target hours.");
      return;
    }

    const nextRule: SlaRule = {
      id: selectedRule?.id ?? getUniqueConfigId(config.slaRules.map((rule) => rule.id), normalizeId(slaForm.priority, "sla")),
      priority: slaForm.priority,
      targetHours,
      warningHours
    };

    onConfigChange((current) => {
      const nextRules = current.slaRules.some((rule) => rule.priority === nextRule.priority)
        ? current.slaRules.map((rule) => (rule.priority === nextRule.priority ? nextRule : rule))
        : [...current.slaRules, nextRule];

      return {
        ...current,
        slaRules: nextRules
      };
    });
    setSlaForm(buildSlaRuleForm(config, nextRule));
    setSlaError("");
  }

  function startNewEscalationPolicy() {
    setEditingEscalationPolicyId(null);
    setEscalationPolicyForm({
      id: "",
      name: "",
      priority: activePriorities[0]?.label ?? "2 - Medium",
      responseHours: "24",
      resolutionHours: "120",
      escalationMatrixId: "standard"
    });
    setEscalationPolicyError("");
  }

  function editEscalationPolicy(policy: SlaPolicy) {
    setEditingEscalationPolicyId(policy.id);
    setEscalationPolicyForm(buildEscalationPolicyForm(config, policy));
    setEscalationPolicyError("");
  }

  function deleteEscalationPolicy(policyId: string) {
    if (referencedEscalationPolicyIds.has(policyId)) {
      setEscalationPolicyError("This escalation policy is used by at least one workflow route. Assign another policy before deleting it.");
      return;
    }

    onConfigChange((current) => ({
      ...current,
      escalationPolicies: current.escalationPolicies.filter((policy) => policy.id !== policyId)
    }));

    const remainingPolicies = config.escalationPolicies.filter((policy) => policy.id !== policyId);
    const nextPolicy = remainingPolicies[0];
    setEditingEscalationPolicyId(nextPolicy?.id ?? null);
    setEscalationPolicyForm(buildEscalationPolicyForm({ ...config, escalationPolicies: remainingPolicies }, nextPolicy));
    setEscalationPolicyError("");
  }

  function saveEscalationPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = escalationPolicyForm.name.trim();
    const priority = escalationPolicyForm.priority.trim();
    const escalationMatrixId = escalationPolicyForm.escalationMatrixId.trim();
    const responseHours = Number.parseInt(escalationPolicyForm.responseHours, 10);
    const resolutionHours = Number.parseInt(escalationPolicyForm.resolutionHours, 10);

    if (!name) {
      setEscalationPolicyError("Escalation policy name is required.");
      return;
    }

    if (!priority) {
      setEscalationPolicyError("Escalation policy priority is required.");
      return;
    }

    if (!escalationMatrixId) {
      setEscalationPolicyError("Escalation matrix key is required.");
      return;
    }

    if (!Number.isFinite(responseHours) || responseHours <= 0) {
      setEscalationPolicyError("Response hours must be a positive number.");
      return;
    }

    if (!Number.isFinite(resolutionHours) || resolutionHours <= 0) {
      setEscalationPolicyError("Resolution hours must be a positive number.");
      return;
    }

    if (responseHours > resolutionHours) {
      setEscalationPolicyError("Response hours cannot be greater than resolution hours.");
      return;
    }

    const nextPolicyId =
      selectedEscalationPolicy?.id ??
      getUniqueConfigId(
        config.escalationPolicies.map((policy) => policy.id),
        normalizeId(name, "sla-policy")
      );
    const duplicateName = config.escalationPolicies.some(
      (policy) => policy.id !== nextPolicyId && policy.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicateName) {
      setEscalationPolicyError("An escalation policy with this name already exists.");
      return;
    }

    const nextPolicy: SlaPolicy = {
      id: nextPolicyId,
      name,
      priority,
      responseHours,
      resolutionHours,
      escalationMatrixId
    };

    onConfigChange((current) => ({
      ...current,
      escalationPolicies: current.escalationPolicies.some((policy) => policy.id === nextPolicy.id)
        ? current.escalationPolicies.map((policy) => (policy.id === nextPolicy.id ? nextPolicy : policy))
        : [...current.escalationPolicies, nextPolicy]
    }));
    setEditingEscalationPolicyId(nextPolicy.id);
    setEscalationPolicyForm(buildEscalationPolicyForm(config, nextPolicy));
    setEscalationPolicyError("");
  }

  return (
    <div className="sla-rules-manager">
      <section className="sla-rule-editor-card" aria-labelledby="sla-rules-editor-title">
        <div className="admin-form-heading">
          <div>
            <h3 id="sla-rules-editor-title">SLA rules</h3>
            <p className="admin-hint">Tune warning and target hours for each support priority.</p>
          </div>
          <button
            className="secondary-button"
            disabled={!missingPriority}
            onClick={startNewSlaRule}
            type="button"
          >
            <TegelIcon name="plus" size="16px" />
            Add SLA
          </button>
        </div>
        {slaError ? <p className="admin-form-error">{slaError}</p> : null}
        <form className="sla-rule-form" onSubmit={saveSlaRule}>
          <label className="form-field">
            <span>Priority</span>
            <select
              value={slaForm.priority}
              onChange={(event) => changePriority(event.target.value as Ticket["priority"])}
            >
              {activePriorities.map((priority) => (
                <option key={priority.id} value={priority.label}>
                  {priority.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Target hours</span>
            <input
              min="1"
              type="number"
              value={slaForm.targetHours}
              onChange={(event) => {
                setSlaForm({ ...slaForm, targetHours: event.target.value });
                setSlaError("");
              }}
            />
          </label>
          <label className="form-field">
            <span>Warning hours</span>
            <input
              min="1"
              type="number"
              value={slaForm.warningHours}
              onChange={(event) => {
                setSlaForm({ ...slaForm, warningHours: event.target.value });
                setSlaError("");
              }}
            />
          </label>
          <button className="primary-button" type="submit">
            <TegelIcon name="save" size="16px" />
            {selectedRule ? "Update SLA" : "Add SLA"}
          </button>
        </form>
        <div className="sla-rule-list" aria-label="Configured SLA rules">
          {sortedSlaRules.length === 0 ? (
            <EmptyState
              title="No SLA rules configured"
              body="Add a rule to define warning and target hours for a priority."
            />
          ) : null}
          {sortedSlaRules.map((rule) => (
            <article className="sla-rule-row" key={rule.id}>
              <div>
                <strong>{rule.priority}</strong>
                <span>
                  Warn at {rule.warningHours}h, target {rule.targetHours}h
                </span>
              </div>
              <div className="sla-rule-row-actions">
                <button className="secondary-button" type="button" onClick={() => editSlaRule(rule)}>
                  <TegelIcon name="edit" size="16px" />
                  Edit
                </button>
                <button className="secondary-button danger-button hard-delete-button" type="button" onClick={() => deleteSlaRule(rule.id)}>
                  <TegelIcon name="trash" size="16px" />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="sla-rule-editor-card" aria-labelledby="escalation-policies-editor-title">
        <div className="admin-form-heading">
          <div>
            <h3 id="escalation-policies-editor-title">Escalation policies</h3>
            <p className="admin-hint">Configure response, resolution, and matrix policy used by request workflows.</p>
          </div>
          <button className="secondary-button" onClick={startNewEscalationPolicy} type="button">
            <TegelIcon name="plus" size="16px" />
            Add policy
          </button>
        </div>
        {escalationPolicyError ? <p className="admin-form-error">{escalationPolicyError}</p> : null}
        <form className="sla-rule-form escalation-policy-form" onSubmit={saveEscalationPolicy}>
          <label className="form-field">
            <span>Policy name</span>
            <input
              value={escalationPolicyForm.name}
              onChange={(event) => {
                setEscalationPolicyForm({ ...escalationPolicyForm, name: event.target.value });
                setEscalationPolicyError("");
              }}
              placeholder="Standard Request SLA"
            />
          </label>
          <label className="form-field">
            <span>Priority</span>
            <select
              value={escalationPolicyForm.priority}
              onChange={(event) => {
                setEscalationPolicyForm({ ...escalationPolicyForm, priority: event.target.value });
                setEscalationPolicyError("");
              }}
            >
              {activePriorities.map((priority) => (
                <option key={priority.id} value={priority.label}>
                  {priority.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Response hours</span>
            <input
              min="1"
              type="number"
              value={escalationPolicyForm.responseHours}
              onChange={(event) => {
                setEscalationPolicyForm({ ...escalationPolicyForm, responseHours: event.target.value });
                setEscalationPolicyError("");
              }}
            />
          </label>
          <label className="form-field">
            <span>Resolution hours</span>
            <input
              min="1"
              type="number"
              value={escalationPolicyForm.resolutionHours}
              onChange={(event) => {
                setEscalationPolicyForm({ ...escalationPolicyForm, resolutionHours: event.target.value });
                setEscalationPolicyError("");
              }}
            />
          </label>
          <label className="form-field">
            <span>Matrix key</span>
            <input
              value={escalationPolicyForm.escalationMatrixId}
              onChange={(event) => {
                setEscalationPolicyForm({ ...escalationPolicyForm, escalationMatrixId: event.target.value });
                setEscalationPolicyError("");
              }}
              placeholder="standard"
            />
          </label>
          <button className="primary-button" type="submit">
            <TegelIcon name="save" size="16px" />
            {selectedEscalationPolicy ? "Update policy" : "Add policy"}
          </button>
        </form>
        <div className="sla-rule-list" aria-label="Configured escalation policies">
          {sortedEscalationPolicies.length === 0 ? (
            <EmptyState
              title="No escalation policies configured"
              body="Add a policy before assigning escalation behavior to workflow routes."
            />
          ) : null}
          {sortedEscalationPolicies.map((policy) => (
            <article className="sla-rule-row" key={policy.id}>
              <div>
                <strong>{policy.name}</strong>
                <span>
                  {policy.responseHours}h response / {formatHours(policy.resolutionHours)} resolution - Matrix {policy.escalationMatrixId} - {policy.priority}
                </span>
              </div>
              <div className="sla-rule-row-actions">
                <button className="secondary-button" type="button" onClick={() => editEscalationPolicy(policy)}>
                  <TegelIcon name="edit" size="16px" />
                  Edit
                </button>
                <button
                  className="secondary-button danger-button hard-delete-button"
                  disabled={referencedEscalationPolicyIds.has(policy.id)}
                  type="button"
                  onClick={() => deleteEscalationPolicy(policy.id)}
                >
                  <TegelIcon name="trash" size="16px" />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        <AdminListBlock
          title="Request type assignments"
          items={slaPolicyItems(config)}
        />
      </section>
    </div>
  );
}

function ResponsibilityMappingManager({
  config,
  onConfigChange
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
}) {
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [mappingForm, setMappingForm] = useState<ResponsibilityMappingFormState>(() => buildMappingForm(config));
  const [mappingError, setMappingError] = useState("");
  const uniquePrus = getUniquePruNames(config);
  const roleOptions = getRoleOptions(config);
  const normalizedMappings = useMemo(
    () => dedupeResponsibilityMappings(config.responsibilityMappings),
    [config.responsibilityMappings]
  );

  useEffect(() => {
    const hasNormalizedChanges =
      normalizedMappings.length !== config.responsibilityMappings.length ||
      normalizedMappings.some(
        (mapping, index) => JSON.stringify(mapping) !== JSON.stringify(config.responsibilityMappings[index])
      );

    if (hasNormalizedChanges) {
      onConfigChange((current) => ({
        ...current,
        responsibilityMappings: dedupeResponsibilityMappings(current.responsibilityMappings)
      }));
    }
  }, [config.responsibilityMappings, normalizedMappings, onConfigChange]);

  function resetMappingForm() {
    setEditingMappingId(null);
    setMappingError("");
    setMappingForm(buildMappingForm(config));
  }

  function saveMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const roleIds = Array.from(new Set(mappingForm.roleIds));

    if (!roleIds.length) {
      setMappingError("Select at least one responsibility role.");
      return;
    }

    if (!mappingForm.userIds.length) {
      setMappingError("Select at least one user for this responsibility.");
      return;
    }

    const id =
      editingMappingId ??
      getUniqueConfigId(
        normalizedMappings.map((mapping) => mapping.id),
        normalizeId(`${roleIds.join("-")}-${mappingForm.productIds[0] ?? "global"}`, "map")
      );
    const mapping = normalizeResponsibilityMapping({
      id,
      role: roleIds[0] ?? "requester",
      roles: roleIds,
      productIds: mappingForm.productIds,
      regionSiteIds: mappingForm.regionSiteIds,
      pruNames: mappingForm.pruNames,
      userIds: mappingForm.userIds,
      actingRole: mappingForm.actingRole,
      active: mappingForm.active
    });
    const duplicateMapping = normalizedMappings.some(
      (item) => item.id !== id && getResponsibilityMappingFingerprint(item) === getResponsibilityMappingFingerprint(mapping)
    );

    if (duplicateMapping) {
      setMappingError("This responsibility mapping already exists. Edit the existing mapping or change role, user, or scope.");
      return;
    }

    onConfigChange((current) => ({
      ...current,
      responsibilityMappings: dedupeResponsibilityMappings(
        editingMappingId
          ? current.responsibilityMappings.map((item) => (item.id === editingMappingId ? mapping : item))
          : [...current.responsibilityMappings, mapping]
      )
    }));
    resetMappingForm();
  }

  return (
    <div className="admin-master-manager">
      <div className="admin-metric-grid">
        <AdminSummaryCard label="Mappings" value={normalizedMappings.length} />
        <AdminSummaryCard label="Mapped roles" value={new Set(normalizedMappings.flatMap((mapping) => getResponsibilityMappingRoles(mapping))).size} />
        <AdminSummaryCard label="Mapped sites" value={new Set(normalizedMappings.flatMap((mapping) => mapping.regionSiteIds)).size} />
        <AdminSummaryCard label="Mapped users" value={new Set(normalizedMappings.flatMap((mapping) => mapping.userIds)).size} />
      </div>
      <div className="admin-editor-layout">
        <form className="admin-editor-form admin-form" onSubmit={saveMapping}>
          <h3>{editingMappingId ? "Edit responsibility mapping" : "Create responsibility mapping"}</h3>
          {mappingError ? <p className="admin-form-error">{mappingError}</p> : null}
          <label className="form-field">
            <span>Roles</span>
            <select
              multiple
              value={mappingForm.roleIds}
              onChange={(event) => setMappingForm({ ...mappingForm, roleIds: getSelectedValues(event) as RoleKey[] })}
            >
              {roleOptions.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.label}
                </option>
              ))}
            </select>
            <small>One user can hold several responsibility roles for the same product, PRU, or site scope.</small>
          </label>
          <label className="form-field">
            <span>Products</span>
            <select
              multiple
              value={mappingForm.productIds}
              onChange={(event) => setMappingForm({ ...mappingForm, productIds: normalizeAllSelection(getSelectedValues(event)) })}
            >
              <option value={ALL_SCOPE_VALUE}>All products</option>
              {config.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.productName}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Regions / sites</span>
            <select
              multiple
              value={mappingForm.regionSiteIds}
              onChange={(event) => setMappingForm({ ...mappingForm, regionSiteIds: normalizeAllSelection(getSelectedValues(event)) })}
            >
              <option value={ALL_SCOPE_VALUE}>All regions / sites</option>
              {config.regionSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>PRUs</span>
            <select
              multiple
              value={mappingForm.pruNames}
              onChange={(event) => setMappingForm({ ...mappingForm, pruNames: normalizeAllSelection(getSelectedValues(event)) })}
            >
              <option value={ALL_SCOPE_VALUE}>All PRUs</option>
              {uniquePrus.map((pruName) => (
                <option key={pruName} value={pruName}>
                  {pruName}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Users</span>
            <select
              multiple
              value={mappingForm.userIds}
              onChange={(event) => setMappingForm({ ...mappingForm, userIds: getSelectedValues(event) })}
            >
              {config.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
          <AdminCheckbox
            checked={mappingForm.actingRole}
            label="Acting role assignment"
            onChange={(actingRole) => setMappingForm({ ...mappingForm, actingRole })}
          />
          <AdminCheckbox
            checked={mappingForm.active}
            label="Active mapping"
            onChange={(active) => setMappingForm({ ...mappingForm, active })}
          />
          <AdminFormActions editing={Boolean(editingMappingId)} onCancel={resetMappingForm} />
        </form>
        <div className="admin-editable-list">
          {normalizedMappings.map((mapping) => (
            <AdminEditableRecord
              active={mapping.active}
              key={mapping.id}
              title={getResponsibilityMappingRoles(mapping).map((role) => getConfigRoleLabel(config, role)).join(" + ")}
              meta={`${mapping.userIds.map((id) => getConfigUserName(config, id)).join(", ")} - ${mapping.productIds.map((id) => getConfigProductName(config, id)).join(", ") || "Any product"}`}
              tags={[
                mapping.actingRole ? "Acting role" : "Primary assignment",
                ...mapping.regionSiteIds.map((id) => getConfigRegionSiteLabel(config, id)),
                ...mapping.pruNames.map((pruName) => (pruName === ALL_SCOPE_VALUE ? "All PRUs" : pruName))
              ]}
              onEdit={() => {
                setEditingMappingId(mapping.id);
                setMappingError("");
                setMappingForm(buildMappingForm(config, mapping));
              }}
              onDelete={
                mapping.active
                  ? () => {
                      onConfigChange((current) => deactivateResponsibilityMappingInConfig(current, mapping.id));
                      if (editingMappingId === mapping.id) {
                        resetMappingForm();
                      }
                    }
                  : undefined
              }
              onHardDelete={
                !mapping.active
                  ? () => {
                      onConfigChange((current) => ({
                        ...current,
                        responsibilityMappings: current.responsibilityMappings.filter((item) => item.id !== mapping.id)
                      }));
                      if (editingMappingId === mapping.id) {
                        resetMappingForm();
                      }
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationTemplateManager({
  config,
  onConfigChange
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
}) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<NotificationTemplateFormState>(() =>
    buildNotificationTemplateForm()
  );
  const [error, setError] = useState("");
  const roleOptions = getRoleOptions(config);
  const previewTemplate = buildNotificationTemplateFromForm(
    templateForm,
    editingTemplateId ?? "notification-preview"
  );

  function resetTemplateForm() {
    setEditingTemplateId(null);
    setError("");
    setTemplateForm(buildNotificationTemplateForm());
  }

  function startEditTemplate(template: NotificationTemplate) {
    setEditingTemplateId(template.id);
    setError("");
    setTemplateForm(buildNotificationTemplateForm(template));
  }

  function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!templateForm.subject.trim()) {
      setError("Notification subject is required.");
      return;
    }

    if (!templateForm.body.trim()) {
      setError("Notification body is required.");
      return;
    }

    if (templateForm.enabledRoles.length === 0) {
      setError("Select at least one role that can receive this notification.");
      return;
    }

    const id =
      editingTemplateId ??
      getUniqueConfigId(
        config.notificationTemplates.map((template) => template.id),
        normalizeId(`${templateForm.eventType}-${templateForm.subject}`, "tpl")
      );
    const template = buildNotificationTemplateFromForm(templateForm, id);

    onConfigChange((current) => ({
      ...current,
      notificationTemplates: editingTemplateId
        ? current.notificationTemplates.map((item) => (item.id === editingTemplateId ? template : item))
        : [...current.notificationTemplates, template]
    }));
    setEditingTemplateId(id);
    setTemplateForm(buildNotificationTemplateForm(template));
    setError("");
  }

  return (
    <div className="notification-template-manager">
      <div className="admin-metric-grid">
        <AdminSummaryCard label="Templates" value={config.notificationTemplates.length} />
        <AdminSummaryCard
          label="Active templates"
          value={config.notificationTemplates.filter((template) => template.active).length}
        />
        <AdminSummaryCard
          label="Email-enabled"
          value={config.notificationTemplates.filter((template) => template.deliveryMode !== "inAppOnly").length}
        />
        <AdminSummaryCard label="Role routes" value={new Set(config.notificationTemplates.flatMap((template) => template.enabledRoles)).size} />
      </div>
      <div className="admin-editor-layout notification-template-layout">
        <form className="admin-editor-form admin-form" onSubmit={saveTemplate}>
          <div className="admin-form-heading">
            <h3>{editingTemplateId ? "Edit notification template" : "Create notification template"}</h3>
            <button className="secondary-button" type="button" onClick={resetTemplateForm}>
              New template
            </button>
          </div>
          {error ? <p className="admin-form-error">{error}</p> : null}
          <label className="form-field">
            <span>Trigger event</span>
            <select
              value={templateForm.eventType}
              onChange={(event) => {
                const eventType = event.target.value as NotificationEventType;

                setTemplateForm({
                  ...templateForm,
                  eventType,
                  severity: getDefaultNotificationSeverity(eventType)
                });
              }}
            >
              {notificationEventOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Severity</span>
            <select
              value={templateForm.severity}
              onChange={(event) =>
                setTemplateForm({ ...templateForm, severity: event.target.value as NotificationSeverity })
              }
            >
              {notificationSeverityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Delivery mode</span>
            <select
              value={templateForm.deliveryMode}
              onChange={(event) =>
                setTemplateForm({ ...templateForm, deliveryMode: event.target.value as NotificationDeliveryMode })
              }
            >
              {notificationDeliveryModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Subject</span>
            <input
              value={templateForm.subject}
              onChange={(event) => setTemplateForm({ ...templateForm, subject: event.target.value })}
              placeholder="Approval required: {{ticketKey}}"
            />
          </label>
          <label className="form-field">
            <span>Body</span>
            <textarea
              value={templateForm.body}
              onChange={(event) => setTemplateForm({ ...templateForm, body: event.target.value })}
              placeholder="{{ticketTitle}} is waiting for your review."
            />
          </label>
          <label className="form-field">
            <span>Recipient role visibility</span>
            <select
              multiple
              value={templateForm.enabledRoles}
              onChange={(event) =>
                setTemplateForm({ ...templateForm, enabledRoles: getSelectedValues(event) as RoleKey[] })
              }
            >
              {roleOptions.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <p className="admin-hint">
            Supported tokens: {notificationTokenList.map((token) => `{{${token}}}`).join(", ")}.
          </p>
          <AdminCheckbox
            checked={templateForm.active}
            label="Active template"
            onChange={(active) => setTemplateForm({ ...templateForm, active })}
          />
          <AdminFormActions editing={Boolean(editingTemplateId)} onCancel={resetTemplateForm} />
        </form>

        <div className="notification-template-main">
          <NotificationTemplatePreview config={config} template={previewTemplate} />
          <div className="admin-editable-list">
            {config.notificationTemplates.map((template) => (
              <article className="admin-editable-record notification-template-record" key={template.id}>
                <div className="admin-record-main">
                  <div className="admin-record-header">
                    <div>
                      <strong>{template.subject}</strong>
                      <span>{getNotificationEventLabel(template.eventType)}</span>
                    </div>
                    <div className="notification-record-status">
                      <NotificationSeverityBadge severity={template.severity} />
                      <AdminStatusPill active={template.active} />
                    </div>
                  </div>
                  <div className="notification-record-meta">
                    <span>Delivery</span>
                    <strong>{getNotificationDeliveryModeLabel(template.deliveryMode)}</strong>
                    <span>Visible roles</span>
                    <strong>
                      {template.enabledRoles.map((role) => getConfigRoleLabel(config, role)).join(", ") || "No roles selected"}
                    </strong>
                  </div>
                </div>
                <div className="admin-record-actions">
                  <button className="secondary-button" type="button" onClick={() => startEditTemplate(template)}>
                    <TegelIcon name="edit" size="16px" />
                    Edit
                  </button>
                  {template.active ? (
                    <button
                      className="secondary-button danger-button"
                      type="button"
                      onClick={() => {
                        onConfigChange((current) => ({
                          ...current,
                          notificationTemplates: current.notificationTemplates.map((item) =>
                            item.id === template.id ? { ...item, active: false } : item
                          )
                        }));
                        if (editingTemplateId === template.id) {
                          resetTemplateForm();
                        }
                      }}
                    >
                      <TegelIcon name="cross" size="16px" />
                      Deactivate
                    </button>
                  ) : (
                    <button
                      className="secondary-button danger-button hard-delete-button"
                      type="button"
                      onClick={() => {
                        onConfigChange((current) => ({
                          ...current,
                          notificationTemplates: current.notificationTemplates.filter((item) => item.id !== template.id)
                        }));
                        if (editingTemplateId === template.id) {
                          resetTemplateForm();
                        }
                      }}
                    >
                      <TegelIcon name="trash" size="16px" />
                      Hard delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationSeverityBadge({ severity }: { severity: NotificationSeverity }) {
  return (
    <span className={`notification-severity-badge severity-${severity}`}>
      {getNotificationSeverityLabel(severity)}
    </span>
  );
}

function NotificationTemplatePreview({ config, template }: { config: AdminConfig; template: NotificationTemplate }) {
  const renderedSubject = renderNotificationTemplate(template.subject || defaultNotificationTemplates[0].subject);
  const renderedBody = renderNotificationTemplate(template.body || defaultNotificationTemplates[0].body);

  return (
    <section className="notification-template-preview" aria-label="Notification template preview">
      <div className="preview-topline">
        <span>Template preview</span>
        <div className="notification-record-status">
          <NotificationSeverityBadge severity={template.severity} />
          <AdminStatusPill active={template.active} />
        </div>
      </div>
      <div className={`notification-envelope severity-${template.severity}`}>
        <div>
          <span>{getNotificationEventLabel(template.eventType)}</span>
          <strong>{renderedSubject}</strong>
          <p>{renderedBody}</p>
        </div>
        <div className="admin-record-grid">
          <span>Delivery</span>
          <strong>{getNotificationDeliveryModeLabel(template.deliveryMode)}</strong>
          <span>Severity</span>
          <strong>{getNotificationSeverityLabel(template.severity)}</strong>
          <span>Visible to</span>
          <strong>{template.enabledRoles.map((role) => getConfigRoleLabel(config, role)).join(", ") || "No roles selected"}</strong>
        </div>
      </div>
    </section>
  );
}

function IntegrationConfigurationPanel({
  config,
  onConfigChange
}: {
  config: AdminConfig;
  onConfigChange: AdminConfigUpdater;
}) {
  const [jiraForm, setJiraForm] = useState<JiraConfigFormState>(() =>
    buildJiraConfigForm(config.integrations.jira)
  );
  const [smtpForm, setSmtpForm] = useState<SmtpConfigFormState>(() =>
    buildSmtpConfigForm(config.integrations.smtp)
  );
  const [activeIntegration, setActiveIntegration] = useState<IntegrationProviderKey>("jira");
  const [jiraError, setJiraError] = useState("");
  const [jiraSuccessMessage, setJiraSuccessMessage] = useState("");
  const [smtpError, setSmtpError] = useState("");
  const [smtpSuccessMessage, setSmtpSuccessMessage] = useState("");
  const [jiraTestResult, setJiraTestResult] = useState<IntegrationTestResult | null>(null);
  const [smtpTestResult, setSmtpTestResult] = useState<IntegrationTestResult | null>(null);
  const [localSecrets, setLocalSecrets] = useState<LocalIntegrationSecrets>({});
  const [isCreatingJiraTask, setIsCreatingJiraTask] = useState(false);
  const [isSyncingJiraData, setIsSyncingJiraData] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  useEffect(() => {
    setJiraForm((current) => {
      const next = buildJiraConfigForm(config.integrations.jira);

      return {
        ...next,
        token: current.token,
        testIssueSummary: current.testIssueSummary || next.testIssueSummary
      };
    });
  }, [config.integrations.jira]);

  useEffect(() => {
    setSmtpForm((current) => {
      const next = buildSmtpConfigForm(config.integrations.smtp);

      return {
        ...next,
        username: current.username,
        password: current.password,
        testRecipient: current.testRecipient,
        testSubject: current.testSubject || next.testSubject,
        testBody: current.testBody || next.testBody
      };
    });
  }, [config.integrations.smtp]);

  useEffect(() => {
    const secrets = readLocalIntegrationSecrets();

    setLocalSecrets(secrets);
    setJiraForm((current) => ({
      ...current,
      token: secrets.jiraToken ?? current.token
    }));
    setSmtpForm((current) => ({
      ...current,
      username: secrets.smtpUsername ?? current.username,
      password: secrets.smtpPassword ?? current.password,
      testRecipient: secrets.smtpTestRecipient ?? current.testRecipient,
      testSubject: secrets.smtpTestSubject ?? current.testSubject,
      testBody: secrets.smtpTestBody ?? current.testBody
    }));
  }, []);

  useEffect(() => {
    setJiraTestResult(null);
  }, [jiraForm]);

  useEffect(() => {
    setSmtpTestResult(null);
  }, [smtpForm]);

  function updateLocalSecrets(patch: Partial<LocalIntegrationSecrets>) {
    const nextSecrets = {
      ...localSecrets,
      ...patch
    };

    setLocalSecrets(nextSecrets);

    try {
      writeLocalIntegrationSecrets(nextSecrets);
    } catch {
      const result: IntegrationTestResult = {
        tone: "warning",
        title: "Local credential save failed",
        detail: "The browser blocked localStorage, so credentials will need to be entered again after refresh.",
        checkedAt: new Date().toISOString()
      };

      if (activeIntegration === "smtp") {
        setSmtpTestResult(result);
      } else {
        setJiraTestResult(result);
      }
    }
  }

  function clearLocalJiraToken() {
    updateLocalSecrets({ jiraToken: "" });
    setJiraForm((current) => ({ ...current, token: "" }));
    setJiraSuccessMessage("");
    setJiraTestResult({
      tone: "warning",
      title: "Local Jira token cleared",
      detail: "The saved browser-local Jira token was removed. Paste a token and save again before live Jira actions.",
      checkedAt: new Date().toISOString()
    });
  }

  function clearLocalSmtpCredentials() {
    updateLocalSecrets({ smtpUsername: "", smtpPassword: "" });
    setSmtpForm((current) => ({ ...current, username: "", password: "" }));
    setSmtpSuccessMessage("");
    setSmtpTestResult({
      tone: "warning",
      title: "Local SMTP credentials cleared",
      detail: "The saved browser-local SMTP username and password were removed.",
      checkedAt: new Date().toISOString()
    });
  }

  function saveJiraConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const apiBaseUrl = normalizeJiraBaseUrl(jiraForm.apiBaseUrl);
    const defaultProjectKey = getValidJiraProjectKey(jiraForm.defaultProjectKey);
    const defaultIssueType = jiraForm.defaultIssueType.trim();
    const projectUrl = jiraForm.projectUrl.trim();
    const username = jiraForm.username.trim();
    const token = jiraForm.token.trim();
    const hasConfiguredToken = Boolean(token || localSecrets.jiraToken?.trim() || config.integrations.jira.tokenConfigured);

    if (jiraForm.enabled && !apiBaseUrl) {
      setJiraError("Jira API base URL is required when Jira sync is enabled.");
      setJiraSuccessMessage("");
      return;
    }

    if (apiBaseUrl && !isValidHttpUrl(apiBaseUrl)) {
      setJiraError("Jira API base URL must be a valid HTTP or HTTPS URL.");
      setJiraSuccessMessage("");
      return;
    }

    if (projectUrl && !isValidHttpUrl(projectUrl)) {
      setJiraError("Jira project URL must be a valid HTTP or HTTPS URL.");
      setJiraSuccessMessage("");
      return;
    }

    if (!defaultProjectKey) {
      setJiraError("Default Jira project key is required.");
      setJiraSuccessMessage("");
      return;
    }

    if (!defaultIssueType) {
      setJiraError("Default Jira issue type is required.");
      setJiraSuccessMessage("");
      return;
    }

    if (jiraForm.enabled && jiraForm.authMode === "emailApiToken" && !username) {
      setJiraError("Username or email is required for email + API token authentication.");
      setJiraSuccessMessage("");
      return;
    }

    if (jiraForm.enabled && !hasConfiguredToken) {
      setJiraError("Enter a Jira token before enabling Jira sync.");
      setJiraSuccessMessage("");
      return;
    }

    const updatedAt = new Date().toISOString();
    const tokenConfigured = hasConfiguredToken;
    const effectiveToken = token || localSecrets.jiraToken?.trim() || "";
    const jira: JiraIntegrationConfig = {
      ...config.integrations.jira,
      enabled: jiraForm.enabled,
      apiBaseUrl,
      apiVersion: jiraForm.apiVersion,
      projectUrl: projectUrl ? getJiraProjectUrl(projectUrl, defaultProjectKey) || projectUrl : getJiraProjectUrl(apiBaseUrl, defaultProjectKey),
      defaultProjectKey,
      defaultIssueType,
      authMode: jiraForm.authMode,
      username,
      tokenConfigured,
      tokenLastFour: effectiveToken ? effectiveToken.slice(-4) : config.integrations.jira.tokenLastFour,
      tokenUpdatedAt: token ? updatedAt : config.integrations.jira.tokenUpdatedAt ?? (effectiveToken ? updatedAt : undefined),
      metadataMode: "dynamic",
      syncDirection: "bidirectional",
      updatedAt
    };

    onConfigChange((current) => ({
      ...current,
      integrations: {
        ...current.integrations,
        jira
      }
    }));
    if (token) {
      updateLocalSecrets({ jiraToken: token });
    }
    setJiraError("");
    setJiraSuccessMessage(token ? "Jira API configuration and local token saved." : "Jira API configuration saved.");
    setJiraForm({ ...buildJiraConfigForm(jira), token: token || localSecrets.jiraToken || "" });
  }

  function saveSmtpConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const port = Number.parseInt(smtpForm.port, 10);
    const host = smtpForm.host.trim();
    const fromEmail = smtpForm.fromEmail.trim();

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setSmtpError("SMTP port must be between 1 and 65535.");
      setSmtpSuccessMessage("");
      return;
    }

    if (smtpForm.enabled && !host) {
      setSmtpError("SMTP host is required when outbound email is enabled.");
      setSmtpSuccessMessage("");
      return;
    }

    if (!fromEmail || !isValidEmailAddress(fromEmail)) {
      setSmtpError("A valid sender email address is required.");
      setSmtpSuccessMessage("");
      return;
    }

    const smtp: SmtpConfig = {
      ...config.integrations.smtp,
      enabled: smtpForm.enabled,
      deliveryMode: smtpForm.deliveryMode,
      host,
      port,
      security: smtpForm.security,
      fromName: smtpForm.fromName.trim() || "NEXUS Portal",
      fromEmail,
      updatedAt: new Date().toISOString()
    };

    onConfigChange((current) => ({
      ...current,
      integrations: {
        ...current.integrations,
        smtp
      }
    }));
    updateLocalSecrets({
      smtpUsername: smtpForm.username.trim(),
      smtpPassword: smtpForm.password,
      smtpTestRecipient: smtpForm.testRecipient.trim(),
      smtpTestSubject: smtpForm.testSubject.trim(),
      smtpTestBody: smtpForm.testBody
    });
    setSmtpError("");
    setSmtpSuccessMessage("Email notification configuration and local SMTP test settings saved.");
  }

  function testJiraConnection() {
    const apiBaseUrl = normalizeJiraBaseUrl(jiraForm.apiBaseUrl);
    const defaultProjectKey = getValidJiraProjectKey(jiraForm.defaultProjectKey);
    const defaultIssueType = jiraForm.defaultIssueType.trim();
    const projectUrl = jiraForm.projectUrl.trim();
    const username = jiraForm.username.trim();
    const hasConfiguredToken = Boolean(jiraForm.token.trim() || localSecrets.jiraToken?.trim());
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!jiraForm.enabled) {
      warnings.push("Jira sync is disabled.");
    }

    if (!apiBaseUrl) {
      errors.push("Jira API base URL is required.");
    } else if (!isValidHttpUrl(apiBaseUrl)) {
      errors.push("Jira API base URL must be a valid HTTP or HTTPS URL.");
    }

    if (projectUrl && !isValidHttpUrl(projectUrl)) {
      errors.push("Jira project URL must be a valid HTTP or HTTPS URL.");
    }

    if (!defaultProjectKey) {
      errors.push("Default Jira project key is required.");
    }

    if (!defaultIssueType) {
      errors.push("Default Jira issue type is required.");
    }

    if (jiraForm.authMode === "emailApiToken" && !username) {
      errors.push("Username or email is required for email + API token authentication.");
    }

    if (!hasConfiguredToken) {
      errors.push("Jira API token or PAT is not saved locally in this browser.");
    }

    setJiraError("");
    setJiraSuccessMessage("");
    setJiraTestResult({
      tone: errors.length > 0 ? "danger" : warnings.length > 0 ? "warning" : "success",
      title:
        errors.length > 0
          ? "Jira readiness check failed"
          : warnings.length > 0
            ? "Jira readiness check has warnings"
            : "Jira readiness check passed",
      detail:
        errors.length > 0
          ? errors.join(" ")
          : warnings.length > 0
            ? `${warnings.join(" ")} Local settings are otherwise valid; enable Jira before a production probe.`
            : `Local settings are valid for ${apiBaseUrl}/${jiraForm.apiVersion}. Live Jira connectivity requires a server-side probe endpoint.`,
      checkedAt: new Date().toISOString()
    });
  }

  function testSmtpConnection() {
    const port = Number.parseInt(smtpForm.port, 10);
    const host = smtpForm.host.trim();
    const fromEmail = smtpForm.fromEmail.trim();
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!smtpForm.enabled) {
      warnings.push("Outbound email delivery is disabled.");
    }

    if (!host) {
      errors.push("SMTP host is required.");
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push("SMTP port must be between 1 and 65535.");
    }

    if (!fromEmail || !isValidEmailAddress(fromEmail)) {
      errors.push("A valid sender email address is required.");
    }

    setSmtpError("");
    setSmtpSuccessMessage("");
    setSmtpTestResult({
      tone: errors.length > 0 ? "danger" : warnings.length > 0 ? "warning" : "success",
      title:
        errors.length > 0
          ? "SMTP readiness check failed"
          : warnings.length > 0
            ? "SMTP readiness check has warnings"
            : "SMTP readiness check passed",
      detail:
        errors.length > 0
          ? errors.join(" ")
          : warnings.length > 0
            ? `${warnings.join(" ")} Local settings are otherwise valid; enable outbound email before a production probe.`
            : `Local settings are valid for ${host}:${port} using ${getSmtpSecurityLabel(smtpForm.security)}. Live SMTP connectivity requires a server-side probe endpoint.`,
      checkedAt: new Date().toISOString()
    });
  }

  function buildJiraActionConfig() {
    return {
      enabled: jiraForm.enabled,
      apiBaseUrl: normalizeJiraBaseUrl(jiraForm.apiBaseUrl),
      apiVersion: jiraForm.apiVersion,
      authMode: jiraForm.authMode,
      username: jiraForm.username.trim(),
      token: jiraForm.token.trim() || localSecrets.jiraToken?.trim() || "",
      defaultProjectKey: getValidJiraProjectKey(jiraForm.defaultProjectKey),
      defaultIssueType: jiraForm.defaultIssueType.trim()
    };
  }

  function buildSmtpActionConfig() {
    return {
      enabled: smtpForm.enabled,
      host: smtpForm.host.trim(),
      port: Number.parseInt(smtpForm.port, 10),
      security: smtpForm.security,
      fromName: smtpForm.fromName.trim() || "NEXUS Portal",
      fromEmail: smtpForm.fromEmail.trim(),
      username: smtpForm.username.trim() || localSecrets.smtpUsername?.trim() || "",
      password: smtpForm.password || localSecrets.smtpPassword || ""
    };
  }

  async function createJiraTask() {
    setIsCreatingJiraTask(true);
    setJiraError("");
    setJiraSuccessMessage("");

    try {
      const response = await fetch("/api/integrations/jira/create-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: buildJiraActionConfig(),
          issue: {
            summary: jiraForm.testIssueSummary.trim(),
            sourceTicketKey: "NEXUS-INTEGRATION-TEST",
            labels: ["nexus-portal", "integration-test"]
          }
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | IntegrationApiErrorPayload
        | { data?: { jiraKey?: string; jiraUrl?: string | null; status?: string } }
        | null;

      if (!response.ok) {
        setJiraTestResult({
          tone: "danger",
          title: "Jira task creation failed",
          detail: formatIntegrationApiError(payload as IntegrationApiErrorPayload | null, "Jira task creation failed."),
          checkedAt: new Date().toISOString()
        });
        return;
      }

      const data = (payload as { data?: { jiraKey?: string; jiraUrl?: string | null } } | null)?.data;
      setJiraTestResult({
        tone: "success",
        title: "Jira task created",
        detail: data?.jiraKey
          ? `Created ${data.jiraKey}${data.jiraUrl ? ` at ${data.jiraUrl}` : ""}.`
          : "Jira accepted the create issue request.",
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      setJiraTestResult({
        tone: "danger",
        title: "Jira task creation failed",
        detail: error instanceof Error ? error.message : "Unknown Jira task creation failure.",
        checkedAt: new Date().toISOString()
      });
    } finally {
      setIsCreatingJiraTask(false);
    }
  }

  async function syncJiraData() {
    setIsSyncingJiraData(true);
    setJiraError("");
    setJiraSuccessMessage("");

    try {
      const response = await fetch("/api/integrations/jira/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: buildJiraActionConfig()
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | IntegrationApiErrorPayload
        | {
            data?: {
              project?: { key?: string; name?: string };
              issueType?: { name?: string } | null;
              issueTypes?: Array<{ name?: string }>;
              components?: unknown[];
              versions?: unknown[];
              warnings?: string[];
            };
          }
        | null;

      if (!response.ok) {
        setJiraTestResult({
          tone: "danger",
          title: "Jira data sync failed",
          detail: formatIntegrationApiError(payload as IntegrationApiErrorPayload | null, "Jira data sync failed."),
          checkedAt: new Date().toISOString()
        });
        return;
      }

      const data = (
        payload as {
          data?: {
            project?: { key?: string; name?: string };
            issueType?: { name?: string } | null;
            issueTypes?: Array<{ name?: string }>;
            components?: unknown[];
            versions?: unknown[];
            warnings?: string[];
          };
        } | null
      )?.data;
      const warningText = data?.warnings?.length ? ` Warnings: ${data.warnings.join(" ")}` : "";

      setJiraTestResult({
        tone: data?.warnings?.length ? "warning" : "success",
        title: data?.warnings?.length ? "Jira data synced with warnings" : "Jira data synced",
        detail: `Project ${data?.project?.key ?? jiraForm.defaultProjectKey} ${data?.project?.name ? `(${data.project.name})` : ""}; issue type ${data?.issueType?.name ?? "not matched"}; ${data?.issueTypes?.length ?? 0} issue types, ${data?.components?.length ?? 0} components, ${data?.versions?.length ?? 0} versions.${warningText}`,
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      setJiraTestResult({
        tone: "danger",
        title: "Jira data sync failed",
        detail: error instanceof Error ? error.message : "Unknown Jira data sync failure.",
        checkedAt: new Date().toISOString()
      });
    } finally {
      setIsSyncingJiraData(false);
    }
  }

  async function sendTestEmail() {
    setIsSendingTestEmail(true);
    setSmtpError("");
    setSmtpSuccessMessage("");

    try {
      const response = await fetch("/api/integrations/smtp/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: buildSmtpActionConfig(),
          message: {
            to: smtpForm.testRecipient.trim(),
            subject: smtpForm.testSubject.trim(),
            body: smtpForm.testBody.trim()
          }
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | IntegrationApiErrorPayload
        | { data?: { status?: string; messageId?: string; accepted?: string[]; rejected?: string[] } }
        | null;

      if (!response.ok) {
        setSmtpTestResult({
          tone: "danger",
          title: "Test email failed",
          detail: formatIntegrationApiError(payload as IntegrationApiErrorPayload | null, "SMTP test email failed."),
          checkedAt: new Date().toISOString()
        });
        return;
      }

      const data = (payload as { data?: { status?: string; messageId?: string; accepted?: string[]; rejected?: string[] } } | null)?.data;
      setSmtpTestResult({
        tone: data?.rejected?.length ? "warning" : "success",
        title: data?.rejected?.length ? "Test email partially sent" : "Test email sent",
        detail: `SMTP accepted ${data?.accepted?.length ?? 0} recipient(s)${data?.messageId ? ` with message ID ${data.messageId}` : ""}${data?.rejected?.length ? `; rejected ${data.rejected.length}.` : "."}`,
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      setSmtpTestResult({
        tone: "danger",
        title: "Test email failed",
        detail: error instanceof Error ? error.message : "Unknown SMTP test email failure.",
        checkedAt: new Date().toISOString()
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  }

  return (
    <div className="integration-settings-layout">
      <aside className="integration-secondary-sidebar" aria-label="Integration providers">
        <button
          className={`integration-provider-button ${activeIntegration === "jira" ? "is-active" : ""}`}
          type="button"
          aria-pressed={activeIntegration === "jira"}
          onClick={() => setActiveIntegration("jira")}
        >
          <span className="integration-provider-heading">
            <span className="integration-provider-icon">
              <TegelIcon name="route" size="18px" />
            </span>
            <span>
              <strong>Jira</strong>
              <small>Issue sync and handoff</small>
            </span>
          </span>
          <span className={`integration-provider-status ${config.integrations.jira.enabled ? "is-active" : "is-inactive"}`}>
            {config.integrations.jira.enabled ? "Enabled" : "Disabled"}
          </span>
          <span className="integration-provider-meta">Project {config.integrations.jira.defaultProjectKey || "not set"}</span>
          <span className="integration-provider-meta">{jiraForm.token ? "Local token saved" : `Token ${getJiraTokenStatus(config.integrations.jira).toLowerCase()}`}</span>
        </button>

        <button
          className={`integration-provider-button ${activeIntegration === "smtp" ? "is-active" : ""}`}
          type="button"
          aria-pressed={activeIntegration === "smtp"}
          onClick={() => setActiveIntegration("smtp")}
        >
          <span className="integration-provider-heading">
            <span className="integration-provider-icon">
              <TegelIcon name="send" size="18px" />
            </span>
            <span>
              <strong>SMTP</strong>
              <small>Email delivery</small>
            </span>
          </span>
          <span className={`integration-provider-status ${config.integrations.smtp.enabled ? "is-active" : "is-inactive"}`}>
            {config.integrations.smtp.enabled ? "Enabled" : "Disabled"}
          </span>
          <span className="integration-provider-meta">{config.integrations.smtp.host || "Host not configured"}</span>
          <span className="integration-provider-meta">
            {smtpForm.password ? "Local SMTP credentials saved" : getNotificationDeliveryModeLabel(config.integrations.smtp.deliveryMode)}
          </span>
        </button>
      </aside>

      <div className="integration-settings-main">
        {activeIntegration === "jira" ? (
          <div className="integration-settings-grid" aria-label="Jira settings">
            <form className="admin-editor-form admin-form integration-config-form" onSubmit={saveJiraConfig}>
              <h3>Jira settings</h3>
              {jiraError ? <p className="admin-form-error">{jiraError}</p> : null}
              {jiraSuccessMessage ? <p className="admin-form-success">{jiraSuccessMessage}</p> : null}
              <AdminCheckbox
                checked={jiraForm.enabled}
                label="Enable Jira sync"
                onChange={(enabled) => {
                  setJiraForm({ ...jiraForm, enabled });
                  setJiraSuccessMessage("");
                }}
              />
              <label className="form-field">
                <span>Jira API base URL</span>
                <input
                  value={jiraForm.apiBaseUrl}
                  onChange={(event) => {
                    setJiraForm({ ...jiraForm, apiBaseUrl: event.target.value });
                    setJiraSuccessMessage("");
                  }}
                  placeholder="https://issues.scania.com"
                />
              </label>
              <label className="form-field">
                <span>API version</span>
                <select
                  value={jiraForm.apiVersion}
                  onChange={(event) => {
                    setJiraForm({ ...jiraForm, apiVersion: event.target.value as JiraApiVersion });
                    setJiraSuccessMessage("");
                  }}
                >
                  {jiraApiVersionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Authentication</span>
                <select
                  value={jiraForm.authMode}
                  onChange={(event) => {
                    setJiraForm({ ...jiraForm, authMode: event.target.value as JiraAuthMode });
                    setJiraSuccessMessage("");
                  }}
                >
                  {jiraAuthModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Username / email</span>
                <input
                  value={jiraForm.username}
                  onChange={(event) => {
                    setJiraForm({ ...jiraForm, username: event.target.value });
                    setJiraSuccessMessage("");
                  }}
                  placeholder="service.account@scania.com"
                />
              </label>
              <label className="form-field">
                <span>API token / PAT</span>
                <input
                  autoComplete="off"
                  type="password"
                  value={jiraForm.token}
                  onChange={(event) => {
                    setJiraForm({ ...jiraForm, token: event.target.value });
                    setJiraSuccessMessage("");
                  }}
                  placeholder={
                    jiraForm.token
                      ? "Using locally saved token"
                      : config.integrations.jira.tokenConfigured
                      ? "Paste token to save locally"
                      : "Paste token"
                  }
                />
              </label>
              <div className="admin-record-grid compact-record-grid">
                <span>Token status</span>
                <strong>{getJiraTokenStatus(config.integrations.jira)}</strong>
                <span>Local token</span>
                <strong>{jiraForm.token ? "Saved in this browser" : "Not saved locally"}</strong>
                <span>API endpoint</span>
                <strong>{jiraForm.apiBaseUrl ? `${jiraForm.apiBaseUrl.replace(/\/+$/, "")}/${jiraForm.apiVersion}` : "Not configured"}</strong>
              </div>
              <label className="form-field">
                <span>Default project key</span>
                <input
                  value={jiraForm.defaultProjectKey}
                  onChange={(event) => {
                    setJiraForm({ ...jiraForm, defaultProjectKey: event.target.value });
                    setJiraSuccessMessage("");
                  }}
                  placeholder="NEXUS"
                />
              </label>
              <label className="form-field">
                <span>Default issue type</span>
                <input
                  value={jiraForm.defaultIssueType}
                  onChange={(event) => {
                    setJiraForm({ ...jiraForm, defaultIssueType: event.target.value });
                    setJiraSuccessMessage("");
                  }}
                  placeholder="Task"
                />
              </label>
              <label className="form-field">
                <span>Project browser URL</span>
                <input
                  value={jiraForm.projectUrl}
                  onChange={(event) => {
                    setJiraForm({ ...jiraForm, projectUrl: event.target.value });
                    setJiraSuccessMessage("");
                  }}
                  placeholder="https://issues.scania.com/projects/NEXUS/issues/?filter=allopenissues"
                />
              </label>
              <div className="integration-operation-panel">
                <h4>Live Jira actions</h4>
                <label className="form-field">
                  <span>Test task summary</span>
                  <input
                    value={jiraForm.testIssueSummary}
                    onChange={(event) => {
                      setJiraForm({ ...jiraForm, testIssueSummary: event.target.value });
                      setJiraSuccessMessage("");
                    }}
                    placeholder="NEXUS integration test task"
                  />
                </label>
                <div className="integration-action-row">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isSyncingJiraData || isCreatingJiraTask}
                    onClick={syncJiraData}
                  >
                    <TegelIcon name="route" size="16px" />
                    {isSyncingJiraData ? "Syncing..." : "Sync Jira data"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isCreatingJiraTask || isSyncingJiraData}
                    onClick={createJiraTask}
                  >
                    <TegelIcon name="document" size="16px" />
                    {isCreatingJiraTask ? "Creating..." : "Create Jira task"}
                  </button>
                </div>
                <p className="admin-hint">
                  Live Jira actions use the token saved in this browser. This is local developer persistence; production should use a managed secret store.
                </p>
              </div>
              <p className="admin-hint">
                Saving with a token stores it in this browser localStorage so refreshes and app restarts can reuse it locally.
              </p>
              <div className="admin-form-actions">
                <button className="secondary-button" type="button" disabled={!jiraForm.token} onClick={clearLocalJiraToken}>
                  <TegelIcon name="cross" size="16px" />
                  Clear local token
                </button>
                <button className="secondary-button" type="button" onClick={testJiraConnection}>
                  <TegelIcon name="route" size="16px" />
                  Test connection
                </button>
                <button className="primary-button" type="submit">
                  <TegelIcon name="save" size="16px" />
                  Save Jira configuration
                </button>
              </div>
              <IntegrationTestResultBanner result={jiraTestResult} />
            </form>

            <article className="integration-card jira-config-summary">
              <div className="admin-record-header">
                <div>
                  <strong>Jira integration</strong>
                  <span>{config.integrations.jira.syncDirection} sync</span>
                </div>
                <AdminStatusPill active={config.integrations.jira.enabled} />
              </div>
              <div className="admin-record-grid">
                <span>API base</span>
                <strong>{getJiraApiBaseUrl(config.integrations.jira) || "Not configured"}</strong>
                <span>API endpoint</span>
                <strong>{getJiraApiEndpoint(config.integrations.jira)}</strong>
                <span>API version</span>
                <strong>{getJiraApiVersionLabel(config.integrations.jira.apiVersion ?? "rest/api/2")}</strong>
                <span>Authentication</span>
                <strong>{getJiraAuthModeLabel(config.integrations.jira.authMode ?? "personalAccessToken")}</strong>
                <span>Token</span>
                <strong>{getJiraTokenStatus(config.integrations.jira)}</strong>
                <span>Default project</span>
                <strong>{config.integrations.jira.defaultProjectKey}</strong>
                <span>Issue type</span>
                <strong>{config.integrations.jira.defaultIssueType}</strong>
                <span>Metadata</span>
                <strong>{config.integrations.jira.metadataMode}</strong>
                <span>Updated</span>
                <strong>{formatLocalDateTime(new Date(config.integrations.jira.updatedAt))}</strong>
              </div>
            </article>
          </div>
        ) : (
          <div className="integration-settings-grid" aria-label="SMTP settings">
            <form className="admin-editor-form admin-form integration-config-form" onSubmit={saveSmtpConfig}>
              <h3>SMTP settings</h3>
              {smtpError ? <p className="admin-form-error">{smtpError}</p> : null}
              {smtpSuccessMessage ? <p className="admin-form-success">{smtpSuccessMessage}</p> : null}
              <AdminCheckbox
                checked={smtpForm.enabled}
                label="Enable outbound email delivery"
                onChange={(enabled) => {
                  setSmtpForm({ ...smtpForm, enabled });
                  setSmtpSuccessMessage("");
                }}
              />
              <label className="form-field">
                <span>Default delivery mode</span>
                <select
                  value={smtpForm.deliveryMode}
                  onChange={(event) => {
                    setSmtpForm({ ...smtpForm, deliveryMode: event.target.value as NotificationDeliveryMode });
                    setSmtpSuccessMessage("");
                  }}
                >
                  {notificationDeliveryModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>SMTP host</span>
                <input
                  value={smtpForm.host}
                  onChange={(event) => {
                    setSmtpForm({ ...smtpForm, host: event.target.value });
                    setSmtpSuccessMessage("");
                  }}
                  placeholder="smtp.company.example"
                />
              </label>
              <label className="form-field">
                <span>SMTP port</span>
                <input
                  min="1"
                  max="65535"
                  type="number"
                  value={smtpForm.port}
                  onChange={(event) => {
                    setSmtpForm({ ...smtpForm, port: event.target.value });
                    setSmtpSuccessMessage("");
                  }}
                />
              </label>
              <label className="form-field">
                <span>Security</span>
                <select
                  value={smtpForm.security}
                  onChange={(event) => {
                    setSmtpForm({ ...smtpForm, security: event.target.value as SmtpConfig["security"] });
                    setSmtpSuccessMessage("");
                  }}
                >
                  {smtpSecurityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Sender name</span>
                <input
                  value={smtpForm.fromName}
                  onChange={(event) => {
                    setSmtpForm({ ...smtpForm, fromName: event.target.value });
                    setSmtpSuccessMessage("");
                  }}
                  placeholder="NEXUS Portal"
                />
              </label>
              <label className="form-field">
                <span>Sender email</span>
                <input
                  type="email"
                  value={smtpForm.fromEmail}
                  onChange={(event) => {
                    setSmtpForm({ ...smtpForm, fromEmail: event.target.value });
                    setSmtpSuccessMessage("");
                  }}
                  placeholder="noreply@scania.com"
                />
              </label>
              <div className="integration-operation-panel">
                <h4>Live SMTP test</h4>
                <div className="integration-field-grid">
                  <label className="form-field">
                    <span>SMTP username</span>
                    <input
                      autoComplete="off"
                      value={smtpForm.username}
                      onChange={(event) => {
                        setSmtpForm({ ...smtpForm, username: event.target.value });
                        setSmtpSuccessMessage("");
                      }}
                      placeholder="Leave empty for relay/no-auth SMTP"
                    />
                  </label>
                  <label className="form-field">
                    <span>SMTP password</span>
                    <input
                      autoComplete="off"
                      type="password"
                      value={smtpForm.password}
                      onChange={(event) => {
                        setSmtpForm({ ...smtpForm, password: event.target.value });
                        setSmtpSuccessMessage("");
                      }}
                      placeholder="Not saved"
                    />
                  </label>
                </div>
                <label className="form-field">
                  <span>Test recipient</span>
                  <input
                    type="email"
                    value={smtpForm.testRecipient}
                    onChange={(event) => {
                      setSmtpForm({ ...smtpForm, testRecipient: event.target.value });
                      setSmtpSuccessMessage("");
                    }}
                    placeholder="you@scania.com"
                  />
                </label>
                <label className="form-field">
                  <span>Test subject</span>
                  <input
                    value={smtpForm.testSubject}
                    onChange={(event) => {
                      setSmtpForm({ ...smtpForm, testSubject: event.target.value });
                      setSmtpSuccessMessage("");
                    }}
                  />
                </label>
                <label className="form-field">
                  <span>Test body</span>
                  <textarea
                    rows={4}
                    value={smtpForm.testBody}
                    onChange={(event) => {
                      setSmtpForm({ ...smtpForm, testBody: event.target.value });
                      setSmtpSuccessMessage("");
                    }}
                  />
                </label>
                <div className="integration-action-row">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isSendingTestEmail}
                    onClick={sendTestEmail}
                  >
                    <TegelIcon name="send" size="16px" />
                    {isSendingTestEmail ? "Sending..." : "Send test email"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!smtpForm.username && !smtpForm.password}
                    onClick={clearLocalSmtpCredentials}
                  >
                    <TegelIcon name="cross" size="16px" />
                    Clear local credentials
                  </button>
                </div>
                <p className="admin-hint">
                  Saving stores SMTP test credentials and recipient in this browser localStorage for local development.
                </p>
              </div>
              <p className="admin-hint">
                Backend delivery should validate credentials and enforce role visibility before sending in production.
              </p>
              <div className="admin-form-actions">
                <button className="secondary-button" type="button" onClick={testSmtpConnection}>
                  <TegelIcon name="send" size="16px" />
                  Test connection
                </button>
                <button className="primary-button" type="submit">
                  <TegelIcon name="save" size="16px" />
                  Save email configuration
                </button>
              </div>
              <IntegrationTestResultBanner result={smtpTestResult} />
            </form>

            <article className="integration-card email-config-summary">
              <div className="admin-record-header">
                <div>
                  <strong>Email notifications</strong>
                  <span>{getNotificationDeliveryModeLabel(config.integrations.smtp.deliveryMode)}</span>
                </div>
                <AdminStatusPill active={config.integrations.smtp.enabled} />
              </div>
              <div className="admin-record-grid">
                <span>Host</span>
                <strong>{config.integrations.smtp.host || "Not configured"}</strong>
                <span>Port</span>
                <strong>{config.integrations.smtp.port}</strong>
                <span>Security</span>
                <strong>{getSmtpSecurityLabel(config.integrations.smtp.security)}</strong>
                <span>From</span>
                <strong>{`${config.integrations.smtp.fromName} <${config.integrations.smtp.fromEmail}>`}</strong>
                <span>Updated</span>
                <strong>{formatLocalDateTime(new Date(config.integrations.smtp.updatedAt))}</strong>
              </div>
            </article>
          </div>
        )}
      </div>
    </div>
  );
}

function IntegrationTestResultBanner({ result }: { result: IntegrationTestResult | null }) {
  if (!result) {
    return null;
  }

  return (
    <div className={`integration-test-result tone-${result.tone}`} role={result.tone === "danger" ? "alert" : "status"}>
      <strong>{result.title}</strong>
      <p>{result.detail}</p>
      <span>Checked {formatLocalDateTime(new Date(result.checkedAt))}</span>
    </div>
  );
}

function AdminEditableRecord({
  title,
  meta,
  tags,
  active,
  onEdit,
  onDelete,
  onHardDelete
}: {
  title: string;
  meta: string;
  tags: string[];
  active: boolean;
  onEdit: () => void;
  onDelete?: () => void;
  onHardDelete?: () => void;
}) {
  return (
    <article className="admin-editable-record">
      <div className="admin-record-main">
        <div className="admin-record-header">
          <div>
            <strong>{title}</strong>
            <span>{meta}</span>
          </div>
          <AdminStatusPill active={active} />
        </div>
        <div className="admin-pill-list">
          {tags.filter(Boolean).map((tag) => (
            <span className="admin-pill" key={`${title}-${tag}`}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="admin-record-actions">
        <button className="secondary-button" type="button" onClick={onEdit}>
          <TegelIcon name="edit" size="16px" />
          Edit
        </button>
        {onDelete ? (
          <button className="secondary-button danger-button" type="button" onClick={onDelete}>
            <TegelIcon name="cross" size="16px" />
            Deactivate
          </button>
        ) : null}
        {onHardDelete ? (
          <button className="secondary-button danger-button hard-delete-button" type="button" onClick={onHardDelete}>
            <TegelIcon name="trash" size="16px" />
            Hard delete
          </button>
        ) : null}
      </div>
    </article>
  );
}

function AdminCheckbox({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="admin-checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function AdminFormActions({ editing, onCancel }: { editing: boolean; onCancel: () => void }) {
  return (
    <div className="admin-form-actions">
      {editing ? (
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
      <button className="primary-button" type="submit">
        <TegelIcon name="save" size="16px" />
        {editing ? "Save changes" : "Create"}
      </button>
    </div>
  );
}

function AdminSummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="admin-summary-card">
      <span>{label}</span>
      <strong>{formatCount(value)}</strong>
    </article>
  );
}

function AdminListBlock({
  title,
  items
}: {
  title: string;
  items: Array<{ id: string; title: string; meta: string; tags: string[] }>;
}) {
  return (
    <article className="admin-list-block">
      <h3>{title}</h3>
      <div className="admin-list">
        {items.map((item) => (
          <div className="admin-record" key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.meta}</span>
            <div className="admin-pill-list">
              {item.tags.filter(Boolean).map((tag) => (
                <span className="admin-pill" key={`${item.id}-${tag}`}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function AdminStatusPill({ active }: { active: boolean }) {
  return <span className={`admin-status-pill ${active ? "is-active" : "is-inactive"}`}>{active ? "Active" : "Inactive"}</span>;
}

function formatHours(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    return `${hours / 24}d`;
  }

  return `${hours}h`;
}

function slaPolicyItems(config: AdminConfig) {
  return config.ticketTypeWorkflows.flatMap((workflow) => {
    const template = workflowTemplates.find((item) => item.id === workflow.workflowTemplateId);
    const escalationPolicyId = workflow.escalationPolicyId ?? template?.escalationPolicyId;
    const policy = config.escalationPolicies.find((candidate) => candidate.id === escalationPolicyId);

    if (!policy) {
      return [];
    }

    return [
      {
        id: `${workflow.id}-${policy.id}`,
        title: `${getConfigTicketTypeLabel(config, workflow.ticketTypeId)} - ${policy.name}`,
        meta: `${policy.responseHours}h response / ${formatHours(policy.resolutionHours)} resolution`,
        tags: [`Matrix ${policy.escalationMatrixId}`, policy.priority]
      }
    ];
  });
}

function AnalyticsPanel({
  tickets,
  expanded = false,
  config,
  selectedPersona
}: {
  tickets: Ticket[];
  expanded?: boolean;
  config: AdminConfig;
  selectedPersona: RolePersonaOption;
}) {
  const [filters, setFilters] = useState<AnalyticsReportFilters>(() => ({ ...emptyAnalyticsReportFilters }));
  const [reportSnapshot, setReportSnapshot] = useState<AnalyticsReportSnapshot | null>(null);

  const regionOptions = useMemo(
    () =>
      buildReportOptions(
        [
          ...config.regionSites.filter((site) => site.active).map((site) => site.region),
          ...tickets.map((ticket) => getReportRegionForTicket(config, ticket))
        ],
        "All regions"
      ),
    [config, tickets]
  );
  const siteOptions = useMemo(
    () =>
      buildReportOptions(
        [
          ...config.regionSites.filter((site) => site.active).map((site) => site.site),
          ...tickets.map((ticket) => ticket.site)
        ],
        "All sites"
      ),
    [config.regionSites, tickets]
  );
  const productOptions = useMemo(
    () =>
      buildReportOptions(
        [
          ...config.products.filter((product) => product.active).map((product) => product.productName),
          ...tickets.map((ticket) => ticket.product)
        ],
        "All products"
      ),
    [config.products, tickets]
  );
  const pruOptions = useMemo(
    () =>
      buildReportOptions(
        [
          ...config.products.flatMap((product) =>
            product.prus.filter((pru) => product.active && pru.active).map((pru) => pru.name)
          ),
          ...tickets.map((ticket) => ticket.pru)
        ],
        "All PRUs"
      ),
    [config.products, tickets]
  );
  const typeOptions = useMemo(() => {
    const configuredTypes = config.requestTypes
      .filter((type) => type.active)
      .map((type) => ({ value: type.id, label: type.label }));
    const configuredTypeIds = new Set(configuredTypes.map((type) => type.value));
    const ticketTypesInUse = new Map<string, string>();

    for (const ticket of tickets) {
      if (!configuredTypeIds.has(ticket.typeId)) {
        ticketTypesInUse.set(ticket.typeId, getReportTicketTypeLabel(config, ticket));
      }
    }

    return [
      { value: REPORT_ALL_VALUE, label: "All types" },
      ...configuredTypes,
      ...Array.from(ticketTypesInUse.entries())
        .sort((left, right) => left[1].localeCompare(right[1]))
        .map(([value, label]) => ({ value, label }))
    ];
  }, [config, tickets]);
  const stateOptions = useMemo(
    () => [
      { value: REPORT_ALL_VALUE, label: "All workflow states" },
      ...ticketStateOptions.map((option) => ({ value: option.value, label: option.label }))
    ],
    []
  );
  const priorityOptions = useMemo(
    () =>
      buildReportOptions(
        [
          ...config.priorities.filter((priority) => priority.active).map((priority) => priority.label),
          ...tickets.map((ticket) => ticket.priority)
        ],
        "All priorities"
      ),
    [config.priorities, tickets]
  );
  const slaStateOptions = useMemo(
    () => [
      { value: REPORT_ALL_VALUE, label: "All SLA states" },
      ...(["healthy", "watch", "breach", "paused"] as const satisfies readonly SlaState[]).map((state) => ({
        value: state,
        label: getSlaLabel(state)
      }))
    ],
    []
  );

  const reportFilters = reportSnapshot?.filters ?? filters;
  const previewTickets = useMemo(
    () => filterAnalyticsReportTickets(tickets, config, filters),
    [config, filters, tickets]
  );
  const reportTickets = useMemo(
    () => filterAnalyticsReportTickets(tickets, config, reportFilters),
    [config, reportFilters, tickets]
  );
  const reportIsStale = reportSnapshot ? !analyticsReportFiltersMatch(reportSnapshot.filters, filters) : false;
  const roleActionableGates = getApprovalQueueItems(reportTickets, config, selectedPersona).filter(
    (item) => item.actionable && item.step.status !== "blocked"
  ).length;
  const bugTickets = reportTickets.filter((ticket) => isBugReportTicket(config, ticket)).length;
  const openTickets = reportTickets.filter((ticket) => ticket.state !== "closed").length;
  const slaBreaches = reportTickets.filter((ticket) => ticket.slaState === "breach").length;
  const typeBuckets = useMemo(
    () => buildReportBuckets(reportTickets, (ticket) => getReportTicketTypeLabel(config, ticket)),
    [config, reportTickets]
  );
  const reportFilterTags = [
    reportFilters.region !== REPORT_ALL_VALUE ? `Region: ${getReportFilterLabel(regionOptions, reportFilters.region)}` : "",
    reportFilters.site !== REPORT_ALL_VALUE ? `Site: ${getReportFilterLabel(siteOptions, reportFilters.site)}` : "",
    reportFilters.product !== REPORT_ALL_VALUE
      ? `Product: ${getReportFilterLabel(productOptions, reportFilters.product)}`
      : "",
    reportFilters.pru !== REPORT_ALL_VALUE ? `PRU: ${getReportFilterLabel(pruOptions, reportFilters.pru)}` : "",
    reportFilters.typeId !== REPORT_ALL_VALUE ? `Type: ${getReportFilterLabel(typeOptions, reportFilters.typeId)}` : "",
    reportFilters.state !== REPORT_ALL_VALUE ? `State: ${getReportFilterLabel(stateOptions, reportFilters.state)}` : "",
    reportFilters.priority !== REPORT_ALL_VALUE
      ? `Priority: ${getReportFilterLabel(priorityOptions, reportFilters.priority)}`
      : "",
    reportFilters.slaState !== REPORT_ALL_VALUE
      ? `SLA: ${getReportFilterLabel(slaStateOptions, reportFilters.slaState)}`
      : ""
  ].filter(Boolean);

  function updateFilter(key: keyof AnalyticsReportFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function createReport() {
    setReportSnapshot({
      filters: { ...filters },
      generatedAt: new Date().toISOString()
    });
  }

  function resetReportFilters() {
    setFilters({ ...emptyAnalyticsReportFilters });
    setReportSnapshot(null);
  }

  return (
    <section className={`panel analytics-panel ${expanded ? "is-expanded" : ""}`}>
      <PanelHeader
        title="Reporting and analytics"
        description="Filter-driven ticket counts by region, site, product, PRU, type, workflow, and SLA."
        iconName="report"
      />
      <form
        className="report-filter-panel"
        onSubmit={(event) => {
          event.preventDefault();
          createReport();
        }}
      >
        <div className="report-filter-grid">
          <ReportFilterSelect
            label="Region"
            value={filters.region}
            options={regionOptions}
            onChange={(value) => updateFilter("region", value)}
          />
          <ReportFilterSelect
            label="Site"
            value={filters.site}
            options={siteOptions}
            onChange={(value) => updateFilter("site", value)}
          />
          <ReportFilterSelect
            label="Product"
            value={filters.product}
            options={productOptions}
            onChange={(value) => updateFilter("product", value)}
          />
          <ReportFilterSelect
            label="PRU"
            value={filters.pru}
            options={pruOptions}
            onChange={(value) => updateFilter("pru", value)}
          />
          <ReportFilterSelect
            label="Ticket type"
            value={filters.typeId}
            options={typeOptions}
            onChange={(value) => updateFilter("typeId", value)}
          />
          <ReportFilterSelect
            label="Workflow state"
            value={filters.state}
            options={stateOptions}
            onChange={(value) => updateFilter("state", value)}
          />
          <ReportFilterSelect
            label="Priority"
            value={filters.priority}
            options={priorityOptions}
            onChange={(value) => updateFilter("priority", value)}
          />
          <ReportFilterSelect
            label="SLA"
            value={filters.slaState}
            options={slaStateOptions}
            onChange={(value) => updateFilter("slaState", value)}
          />
        </div>
        <div className="report-action-row">
          <button className="primary-button" type="submit">
            <TegelIcon name="report" size="16px" />
            Create report
          </button>
          <button className="secondary-button" type="button" onClick={resetReportFilters}>
            Reset filters
          </button>
          <span className={`report-generation-status ${reportIsStale ? "is-stale" : ""}`}>
            {reportSnapshot
              ? `Created ${formatLocalDateTime(new Date(reportSnapshot.generatedAt))}`
              : "Live preview"}
          </span>
        </div>
      </form>

      {reportIsStale ? (
        <p className="report-filter-note">
          Current filters match {formatCount(previewTickets.length)} tickets. Create report to refresh the charts.
        </p>
      ) : null}

      <div className="report-filter-tags" aria-label="Report scope">
        {reportFilterTags.length > 0 ? (
          reportFilterTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))
        ) : (
          <span>All visible tickets</span>
        )}
      </div>

      <div className="report-summary-grid">
        <ReportSummaryMetric label="Tickets" value={reportTickets.length} />
        <ReportSummaryMetric label="Bugs" value={bugTickets} />
        <ReportSummaryMetric label="Open" value={openTickets} />
        <ReportSummaryMetric label="Approval gates" value={roleActionableGates} />
        <ReportSummaryMetric label="SLA breaches" value={slaBreaches} />
      </div>

      {reportTickets.length === 0 ? (
        <EmptyState title="No report data" body="No visible tickets match the selected filters." />
      ) : (
        <div className="report-visual-stack">
          <div className="report-visual-grid">
            <ReportBarChart
              title="Tickets by region"
              buckets={buildReportBuckets(reportTickets, (ticket) => getReportRegionForTicket(config, ticket))}
            />
            <ReportBarChart
              title="Tickets by site"
              buckets={buildReportBuckets(reportTickets, (ticket) => getReportValue(ticket.site, "Unassigned site"))}
            />
            <ReportPieChart title="Ticket type mix" buckets={typeBuckets} />
          </div>
          <div className="report-visual-grid">
            <ReportBarChart
              title="Tickets by product"
              buckets={buildReportBuckets(reportTickets, (ticket) => getReportValue(ticket.product, "Unassigned product"))}
            />
            <ReportBarChart
              title="Tickets by PRU"
              buckets={buildReportBuckets(reportTickets, (ticket) => getReportValue(ticket.pru, "Unassigned PRU"))}
            />
            <ReportBarChart
              title="Tickets by workflow state"
              buckets={buildReportBuckets(reportTickets, (ticket) => getTicketStateLabel(ticket.state))}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ReportFilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: ReportOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="report-filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReportSummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <article className="report-summary-metric">
      <span>{label}</span>
      <strong>{formatCount(value)}</strong>
    </article>
  );
}

function ReportBarChart({ title, buckets }: { title: string; buckets: ReportBucket[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);

  return (
    <article className="report-chart-block">
      <header>
        <h3>{title}</h3>
        <span>{formatCount(total)}</span>
      </header>
      <div className="report-bar-list">
        {buckets.length === 0 ? (
          <p className="report-empty-chart">No matching tickets</p>
        ) : null}
        {buckets.map((bucket) => (
          <div className="report-bar-row" key={`${title}-${bucket.label}`}>
            <div className="report-bar-label">
              <span>{bucket.label}</span>
              <strong>{formatCount(bucket.value)}</strong>
            </div>
            <div className="report-bar-track" aria-label={`${bucket.label}: ${bucket.value} tickets`}>
              <span
                style={{
                  backgroundColor: bucket.color,
                  width: `${(bucket.value / max) * 100}%`
                }}
              />
            </div>
            <small>{Math.round(bucket.percentage)}%</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function ReportPieChart({ title, buckets }: { title: string; buckets: ReportBucket[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);

  return (
    <article className="report-chart-block report-pie-block">
      <header>
        <h3>{title}</h3>
        <span>{formatCount(total)}</span>
      </header>
      <div className="report-pie-layout">
        <div
          aria-label={`${title}: ${formatCount(total)} tickets`}
          className="report-pie"
          role="img"
          style={{ background: getReportPieGradient(buckets) }}
        />
        <div className="report-pie-legend">
          {buckets.length === 0 ? (
            <p className="report-empty-chart">No matching tickets</p>
          ) : null}
          {buckets.map((bucket) => (
            <div className="report-pie-legend-row" key={`${title}-${bucket.label}`}>
              <span style={{ backgroundColor: bucket.color }} />
              <strong>{bucket.label}</strong>
              <small>
                {formatCount(bucket.value)} / {Math.round(bucket.percentage)}%
              </small>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function SlaBoard({
  tickets,
  expanded = false,
  onOpenTicket
}: {
  tickets: Ticket[];
  expanded?: boolean;
  onOpenTicket?: (ticketKey: string) => void;
}) {
  return (
    <section className={`panel sla-board ${expanded ? "is-expanded" : ""}`}>
      <PanelHeader
        title="SLA monitoring"
        description="Operational SLA board optimized for desktop, mobile, and wallboard use."
        iconName="timer"
      />
      <div className="sla-grid">
        {tickets.length === 0 ? (
          <EmptyState title="No SLA records" body="SLA cards will appear after tickets are created." />
        ) : null}
        {tickets.map((ticket) => (
          <button
            className={`sla-card state-${ticket.slaState} ${onOpenTicket ? "is-clickable" : ""}`}
            key={ticket.key}
            type="button"
            onClick={() => onOpenTicket?.(ticket.key)}
          >
            <div>
              <strong>{ticket.key}</strong>
              <span>{ticket.slaLabel}</span>
            </div>
            <p>{ticket.title}</p>
            <span>{ticket.product}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CommentPanel({
  ticket,
  comments,
  embedded = false,
  role,
  onAddComment
}: {
  ticket: Ticket;
  comments: Ticket["comments"];
  embedded?: boolean;
  role?: RoleKey;
  onAddComment?: (ticketKey: string, body: string, visibility: VisibilityLevel) => void;
}) {
  const [commentBody, setCommentBody] = useState("");
  const [visibility, setVisibility] = useState<VisibilityLevel>("public");
  const visibilityOptions = useMemo(() => (role ? getVisibleVisibilityOptions(role) : []), [role]);

  useEffect(() => {
    if (visibilityOptions.length > 0 && !visibilityOptions.some((option) => option.value === visibility)) {
      setVisibility(visibilityOptions[0].value);
    }
  }, [visibility, visibilityOptions]);

  return (
    <section className={embedded ? "comment-section embedded-section" : "panel comment-section"}>
      <PanelHeader
        title="Comments and visibility"
        description="Public, internal, architecture, Jira, system, and audit-aware communication."
        iconName="message"
      />
      <div className="comment-list">
        {comments.length === 0 ? (
          <EmptyState title="No visible comments" body={`${ticket.key} has no comments for this role.`} />
        ) : (
          comments.map((comment) => (
            <article className="comment-row" key={comment.id}>
              <div className="comment-topline">
                <strong>{comment.author}</strong>
                <span>
                  {comment.role} · {comment.source}
                </span>
              </div>
              {comment.source === "jira" ? (
                <JiraCommentContent value={comment.body} fallback="No comment body." />
              ) : (
                <RichTextContent value={comment.body} fallback="No comment body." compact />
              )}
            </article>
          ))
        )}
      </div>
      {role && onAddComment ? (
        <form
          className="comment-composer admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAddComment(ticket.key, commentBody, visibility);
            setCommentBody("");
          }}
        >
          <RichTextEditor
            label="Add comment"
            value={commentBody}
            onChange={setCommentBody}
            placeholder="Write a public update, internal note, or architecture comment."
            rows={3}
          />
          <div className="comment-composer-row">
            <label className="form-field">
              <span>Visibility</span>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as VisibilityLevel)}
              >
                {visibilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" type="submit">
              <TegelIcon name="send" size="16px" />
              Post comment
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function PanelHeader({
  title,
  description,
  iconName
}: {
  title: string;
  description: string;
  iconName: TegelIconName;
}) {
  return (
    <header className="panel-header">
      <div className="panel-icon">
        <TegelIcon name={iconName} size="19px" />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <TegelIcon name="info" size="20px" />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
