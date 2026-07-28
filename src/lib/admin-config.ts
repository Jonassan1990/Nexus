import type {
  RoleDefinition,
  RoleKey,
  SlaPolicy,
  Ticket,
  WorkflowRoleType,
  WorkflowTemplate,
  WorkflowTemplateStep
} from "./types";
import { roles, slaPolicies, ticketTypes, workflowTemplates } from "./nexus-data";

export type TegelTagVariant = "success" | "warning" | "new" | "neutral" | "information" | "error";

export type RoleDomain = "Business" | "IT" | "Admin";
export type ProductTicketSource = "jira" | "nexus";

export type UserEmailNotificationEventType =
  | "ticketSubmitted"
  | "approvalRequested"
  | "clarificationRequested"
  | "clarificationAnswered"
  | "decisionMade"
  | "ticketApproved"
  | "ticketRejected"
  | "jiraReadyToCreate"
  | "jiraCreated"
  | "slaBreach"
  | "escalationTriggered"
  | "workflowDeviation"
  | "participantAdded";

export const userEmailNotificationEventTypes = [
  "ticketSubmitted",
  "approvalRequested",
  "clarificationRequested",
  "clarificationAnswered",
  "decisionMade",
  "ticketApproved",
  "ticketRejected",
  "jiraReadyToCreate",
  "jiraCreated",
  "slaBreach",
  "escalationTriggered",
  "workflowDeviation",
  "participantAdded"
] as const satisfies readonly UserEmailNotificationEventType[];

export interface AdminUserNotificationPreferences {
  emailEnabled: boolean;
  emailEventTypes: UserEmailNotificationEventType[];
}

export interface AdminUser {
  id: string;
  displayName: string;
  email: string;
  primaryRole: RoleKey;
  actionRoles: RoleKey[];
  region: string;
  site: string;
  productIds: string[];
  pruNames: string[];
  active: boolean;
  notificationPreferences: AdminUserNotificationPreferences;
}

type AdminUserConfigInput = Omit<AdminUser, "notificationPreferences"> & {
  notificationPreferences?: Partial<AdminUserNotificationPreferences>;
};

function isUserEmailNotificationEventType(value: string): value is UserEmailNotificationEventType {
  return userEmailNotificationEventTypes.some((eventType) => eventType === value);
}

export function getDefaultAdminUserNotificationPreferences(): AdminUserNotificationPreferences {
  return {
    emailEnabled: true,
    emailEventTypes: [...userEmailNotificationEventTypes]
  };
}

export function normalizeAdminUserNotificationPreferences(
  preferences?: Partial<AdminUserNotificationPreferences>
): AdminUserNotificationPreferences {
  const defaultPreferences = getDefaultAdminUserNotificationPreferences();
  const emailEventTypes = Array.isArray(preferences?.emailEventTypes)
    ? Array.from(
        new Set(
          preferences.emailEventTypes.filter((eventType): eventType is UserEmailNotificationEventType =>
            isUserEmailNotificationEventType(eventType)
          )
        )
      )
    : defaultPreferences.emailEventTypes;

  return {
    emailEnabled: preferences?.emailEnabled ?? defaultPreferences.emailEnabled,
    emailEventTypes
  };
}

export function normalizeAdminUser(user: AdminUserConfigInput): AdminUser {
  return {
    ...user,
    actionRoles: Array.isArray(user.actionRoles) ? user.actionRoles : [],
    productIds: Array.isArray(user.productIds) ? user.productIds : [],
    pruNames: Array.isArray(user.pruNames) ? user.pruNames : [],
    active: user.active ?? true,
    notificationPreferences: normalizeAdminUserNotificationPreferences(user.notificationPreferences)
  };
}

export interface RoleDomainConfig {
  role: RoleKey;
  domain: RoleDomain;
  workflowType: WorkflowRoleType;
  active: boolean;
}

export interface RegionSiteConfig {
  id: string;
  label: string;
  region: string;
  site: string;
  localProductOwnerId: string;
  active: boolean;
}

export interface ProductRoleAssignment {
  id: string;
  role: RoleKey;
  userIds: string[];
  active: boolean;
}

export interface ProductModuleConfig {
  id: string;
  name: string;
  jiraComponent?: string;
  active: boolean;
}

export interface ProductPruConfig {
  id: string;
  name: string;
  site: string;
  localProductOwnerId: string;
  modules: ProductModuleConfig[];
  active: boolean;
}

export interface DepartmentConfig {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface ProductDomainConfig {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface ProductConfig {
  id: string;
  productName: string;
  productOwnerName: string;
  departmentId: string;
  productDomainId: string;
  ticketSource: ProductTicketSource;
  jiraProjectKey: string;
  roleAssignments: ProductRoleAssignment[];
  prus: ProductPruConfig[];
  active: boolean;
}

export interface ResponsibilityMappingConfig {
  id: string;
  productIds: string[];
  regionSiteIds: string[];
  pruNames: string[];
  role: RoleKey;
  roles?: RoleKey[];
  userIds: string[];
  actingRole?: boolean;
  active: boolean;
}

export interface ConfigOption<TValue extends string = string> {
  id: string;
  label: TValue;
  color: TegelTagVariant;
  active: boolean;
  sortOrder: number;
}

export interface StatusColorConfig {
  status: string;
  color: TegelTagVariant;
}

export interface SlaRule {
  id: string;
  priority: Ticket["priority"];
  targetHours: number;
  warningHours: number;
}

export type LeadTimeOwnership = "business" | "it" | "mixed" | "process";

export interface LeadTimeStatusRule {
  id: string;
  status: string;
  ownership: LeadTimeOwnership;
  active: boolean;
  updatedAt: string;
}

export interface LeadTimeTransitionRule {
  id: string;
  fromStatus: string;
  toStatus: string;
  ownership: LeadTimeOwnership;
  active: boolean;
  updatedAt: string;
}

export type NotificationDeliveryMode = "inAppOnly" | "emailOnly" | "inAppAndEmail";
export type NotificationSeverity = "info" | "warning" | "critical" | "success";

export type NotificationEventType =
  | "ticketSubmitted"
  | "approvalRequested"
  | "clarificationRequested"
  | "clarificationAnswered"
  | "decisionMade"
  | "ticketApproved"
  | "ticketRejected"
  | "jiraReadyToCreate"
  | "jiraCreated"
  | "slaBreach"
  | "escalationTriggered"
  | "workflowDeviation"
  | "participantAdded";

export interface NotificationTemplate {
  id: string;
  eventType: NotificationEventType;
  subject: string;
  body: string;
  deliveryMode: NotificationDeliveryMode;
  severity: NotificationSeverity;
  active: boolean;
  enabledRoles: RoleKey[];
}

export type FormFieldType =
  "shortText" | "longText" | "number" | "date" | "singleSelect" | "multiSelect" | "yesNo";

export type FormComponentType =
  | "textField"
  | "textArea"
  | "numberField"
  | "datePicker"
  | "dropdown"
  | "radioGroup"
  | "checkbox"
  | "checkboxGroup";

export type FormTemplateOptionSource =
  | "manual"
  | "portalProducts"
  | "portalPrus"
  | "portalModules"
  | "jiraUnreleasedVersions"
  | "jiraVersions"
  | "jiraSprints"
  | "jiraComponents"
  | "jiraBoards"
  | "jiraPriorities";

export interface FormTemplateField {
  id: string;
  label: string;
  type: FormFieldType;
  component: FormComponentType;
  required: boolean;
  helperText?: string;
  options: string[];
  optionSource?: FormTemplateOptionSource;
  sortOrder: number;
}

export interface ProductFormTemplate {
  id: string;
  productName: string;
  requestTypeId: string;
  title: string;
  description: string;
  fields: FormTemplateField[];
  active: boolean;
  updatedAt: string;
}

export interface TicketTypeWorkflowConfig {
  id: string;
  ticketTypeId: string;
  workflowTemplateId: string;
  escalationPolicyId?: string;
  stepIds: string[];
  jiraCreatorStepId: string;
  jiraCreatorStepIds?: string[];
  stepOverrides?: Record<
    string,
    Partial<
      Pick<
        WorkflowTemplateStep,
        | "label"
        | "ownerRole"
        | "workflowType"
        | "required"
        | "parallelGroup"
        | "slaHours"
        | "allowDelegation"
        | "allowClarification"
      >
    >
  >;
  active: boolean;
  updatedAt: string;
}

export type JiraApiVersion = "rest/api/2" | "rest/api/3";
export type JiraAuthMode = "personalAccessToken" | "emailApiToken" | "oauth2ClientCredentials";
export type AiProvider = "openai";

export interface JiraIntegrationConfig {
  enabled: boolean;
  apiBaseUrl: string;
  apiVersion: JiraApiVersion;
  projectUrl: string;
  defaultProjectKey: string;
  defaultIssueType: string;
  authMode: JiraAuthMode;
  username: string;
  tokenConfigured: boolean;
  tokenLastFour?: string;
  tokenUpdatedAt?: string;
  metadataMode: "dynamic";
  syncDirection: "bidirectional";
  updatedAt: string;
}

export interface SmtpConfig {
  enabled: boolean;
  deliveryMode: NotificationDeliveryMode;
  host: string;
  port: number;
  security: "none" | "starttls" | "sslTls";
  fromName: string;
  fromEmail: string;
  updatedAt: string;
}

export interface AiIntegrationConfig {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyLastFour?: string;
  apiKeyUpdatedAt?: string;
  updatedAt: string;
}

export interface GitLabProductRepositoryMapping {
  productId: string;
  productName: string;
  groupId?: number;
  groupName?: string;
  groupFullPath?: string;
  groupWebUrl?: string;
  projectId: number;
  projectName: string;
  projectPathWithNamespace: string;
  projectWebUrl: string;
  defaultBranch: string;
  ref: string;
  updatedAt: string;
}

export interface GitLabIntegrationConfig {
  enabled: boolean;
  apiBaseUrl: string;
  tokenConfigured: boolean;
  tokenLastFour?: string;
  tokenUpdatedAt?: string;
  defaultRef: string;
  productRepositoryMappings: GitLabProductRepositoryMapping[];
  updatedAt: string;
}

export interface AdminConfig {
  users: AdminUser[];
  customRoles?: RoleDefinition[];
  roleDomains: RoleDomainConfig[];
  deletedRoleKeys?: RoleKey[];
  regionSites: RegionSiteConfig[];
  departments: DepartmentConfig[];
  productDomains: ProductDomainConfig[];
  products: ProductConfig[];
  responsibilityMappings: ResponsibilityMappingConfig[];
  requestTypes: ConfigOption[];
  priorities: ConfigOption<Ticket["priority"]>[];
  riskOptions: ConfigOption<Ticket["risk"]>[];
  statusColors: StatusColorConfig[];
  requestCategories: string[];
  slaRules: SlaRule[];
  escalationPolicies: SlaPolicy[];
  leadTimeStatusRules: LeadTimeStatusRule[];
  leadTimeTransitionRules: LeadTimeTransitionRule[];
  notificationTemplates: NotificationTemplate[];
  formTemplates: ProductFormTemplate[];
  ticketTypeWorkflows: TicketTypeWorkflowConfig[];
  integrations: {
    jira: JiraIntegrationConfig;
    smtp: SmtpConfig;
    ai: AiIntegrationConfig;
    gitlab: GitLabIntegrationConfig;
  };
}

export function normalizeProductModuleConfig(module: ProductModuleConfig): ProductModuleConfig {
  return {
    ...module,
    jiraComponent: module.jiraComponent?.trim() || undefined,
    active: module.active ?? true
  };
}

export function normalizeProductPruConfig(pru: ProductPruConfig): ProductPruConfig {
  return {
    ...pru,
    modules: Array.isArray(pru.modules)
      ? pru.modules.map((module) => normalizeProductModuleConfig(module))
      : [],
    active: pru.active ?? true
  };
}

export function normalizeProductConfig(product: ProductConfig): ProductConfig {
  return {
    ...product,
    departmentId: product.departmentId?.trim() ?? "",
    productDomainId: product.productDomainId?.trim() ?? "",
    ticketSource: product.ticketSource === "nexus" ? "nexus" : "jira",
    jiraProjectKey: product.jiraProjectKey?.trim() ?? "",
    roleAssignments: Array.isArray(product.roleAssignments)
      ? product.roleAssignments.map((assignment) => ({
          ...assignment,
          userIds: Array.isArray(assignment.userIds) ? assignment.userIds : [],
          active: assignment.active ?? true
        }))
      : [],
    prus: Array.isArray(product.prus) ? product.prus.map((pru) => normalizeProductPruConfig(pru)) : [],
    active: product.active ?? true
  };
}

const updatedAt = "2026-05-18T00:00:00.000Z";

export const leadTimeOwnershipOptions = [
  { value: "business", label: "Business" },
  { value: "it", label: "IT" },
  { value: "mixed", label: "Mixed" },
  { value: "process", label: "Process only" }
] as const satisfies readonly { value: LeadTimeOwnership; label: string }[];

export const defaultLeadTimeStatusRules: LeadTimeStatusRule[] = [
  {
    id: "lead-status-new-request",
    status: "New request",
    ownership: "process",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-review",
    status: "Review",
    ownership: "mixed",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-clarification",
    status: "Clarification",
    ownership: "business",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-waiting-clarification",
    status: "Waiting for clarification",
    ownership: "business",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-planning",
    status: "Planning",
    ownership: "it",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-in-progress",
    status: "In progress",
    ownership: "it",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-in-project",
    status: "In project",
    ownership: "it",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-it-test",
    status: "IT Test",
    ownership: "it",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-business-test",
    status: "Business Test",
    ownership: "business",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-close",
    status: "Close",
    ownership: "process",
    active: true,
    updatedAt
  },
  {
    id: "lead-status-planned-release",
    status: "Planned release",
    ownership: "process",
    active: true,
    updatedAt
  }
];

export const defaultLeadTimeTransitionRules: LeadTimeTransitionRule[] = [
  {
    id: "lead-transition-new-request-review",
    fromStatus: "New request",
    toStatus: "Review",
    ownership: "process",
    active: true,
    updatedAt
  },
  {
    id: "lead-transition-review-planning",
    fromStatus: "Review",
    toStatus: "Planning",
    ownership: "mixed",
    active: true,
    updatedAt
  },
  {
    id: "lead-transition-planning-in-progress",
    fromStatus: "Planning",
    toStatus: "In progress",
    ownership: "it",
    active: true,
    updatedAt
  },
  {
    id: "lead-transition-in-progress-it-test",
    fromStatus: "In progress",
    toStatus: "IT Test",
    ownership: "it",
    active: true,
    updatedAt
  },
  {
    id: "lead-transition-it-test-business-test",
    fromStatus: "IT Test",
    toStatus: "Business Test",
    ownership: "it",
    active: true,
    updatedAt
  },
  {
    id: "lead-transition-business-test-close",
    fromStatus: "Business Test",
    toStatus: "Close",
    ownership: "business",
    active: true,
    updatedAt
  },
  {
    id: "lead-transition-close-planned-release",
    fromStatus: "Close",
    toStatus: "Planned release",
    ownership: "process",
    active: true,
    updatedAt
  }
];

function isLeadTimeOwnership(value: unknown): value is LeadTimeOwnership {
  return typeof value === "string" && leadTimeOwnershipOptions.some((option) => option.value === value);
}

function normalizeLeadTimeRuleDate(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : updatedAt;
}

function normalizeLeadTimeRuleId(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeLeadTimeRuleStatus(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeLeadTimeStatusRules(value: unknown): LeadTimeStatusRule[] {
  const rules = value === undefined ? defaultLeadTimeStatusRules : Array.isArray(value) ? value : [];
  const seenStatuses = new Set<string>();

  return rules.flatMap((rule, index) => {
    if (!rule || typeof rule !== "object") {
      return [];
    }

    const candidate = rule as Partial<LeadTimeStatusRule>;
    const status = normalizeLeadTimeRuleStatus(candidate.status);
    const normalizedStatus = status.toLowerCase();

    if (!status || seenStatuses.has(normalizedStatus)) {
      return [];
    }

    seenStatuses.add(normalizedStatus);

    return [
      {
        id: normalizeLeadTimeRuleId(candidate.id, `lead-status-${index + 1}`),
        status,
        ownership: isLeadTimeOwnership(candidate.ownership) ? candidate.ownership : "process",
        active: candidate.active ?? true,
        updatedAt: normalizeLeadTimeRuleDate(candidate.updatedAt)
      }
    ];
  });
}

export function normalizeLeadTimeTransitionRules(value: unknown): LeadTimeTransitionRule[] {
  const rules = value === undefined ? defaultLeadTimeTransitionRules : Array.isArray(value) ? value : [];
  const seenTransitions = new Set<string>();

  return rules.flatMap((rule, index) => {
    if (!rule || typeof rule !== "object") {
      return [];
    }

    const candidate = rule as Partial<LeadTimeTransitionRule>;
    const fromStatus = normalizeLeadTimeRuleStatus(candidate.fromStatus);
    const toStatus = normalizeLeadTimeRuleStatus(candidate.toStatus);
    const transitionKey = `${fromStatus.toLowerCase()}->${toStatus.toLowerCase()}`;

    if (!fromStatus || !toStatus || seenTransitions.has(transitionKey)) {
      return [];
    }

    seenTransitions.add(transitionKey);

    return [
      {
        id: normalizeLeadTimeRuleId(candidate.id, `lead-transition-${index + 1}`),
        fromStatus,
        toStatus,
        ownership: isLeadTimeOwnership(candidate.ownership) ? candidate.ownership : "process",
        active: candidate.active ?? true,
        updatedAt: normalizeLeadTimeRuleDate(candidate.updatedAt)
      }
    ];
  });
}

const rawAdminUsers: AdminUserConfigInput[] = [
  {
    id: "user-maja-lind",
    displayName: "Maja Lind",
    email: "maja.lind@scania.com",
    primaryRole: "local_product_owner",
    actionRoles: [],
    region: "Europe",
    site: "Sodertalje",
    productIds: ["product-calibration-hub", "product-production-analytics"],
    pruNames: ["PRU E-Mobility", "PRU Powertrain"],
    active: true
  },
  {
    id: "user-sara-blom",
    displayName: "Sara Blom",
    email: "sara.blom@scania.com",
    primaryRole: "global_product_owner",
    actionRoles: ["business_architect"],
    region: "Global",
    site: "Global",
    productIds: ["product-calibration-hub", "product-variant-manager"],
    pruNames: ["PRU E-Mobility", "PRU Battery"],
    active: true
  },
  {
    id: "user-oskar-nordin",
    displayName: "Oskar Nordin",
    email: "oskar.nordin@scania.com",
    primaryRole: "software_architect",
    actionRoles: ["solution_architect"],
    region: "Global",
    site: "Global",
    productIds: ["product-calibration-hub", "product-variant-manager"],
    pruNames: ["PRU E-Mobility", "PRU Battery"],
    active: true
  },
  {
    id: "user-erik-holm",
    displayName: "Erik Holm",
    email: "erik.holm@scania.com",
    primaryRole: "release_manager",
    actionRoles: [],
    region: "Global",
    site: "Global",
    productIds: ["product-plant-portal", "product-production-analytics"],
    pruNames: ["PRU Digital Core", "PRU Powertrain"],
    active: true
  },
  {
    id: "user-jonas-ny",
    displayName: "Jonas Ny",
    email: "jonas.ny@scania.com",
    primaryRole: "developer",
    actionRoles: [],
    region: "Europe",
    site: "Sodertalje",
    productIds: ["product-calibration-hub", "product-variant-manager"],
    pruNames: ["PRU E-Mobility", "PRU Battery"],
    active: true
  },
  {
    id: "user-karin-vik",
    displayName: "Karin Vik",
    email: "karin.vik@scania.com",
    primaryRole: "it_reviewer",
    actionRoles: [],
    region: "Europe",
    site: "Oskarshamn",
    productIds: ["product-plant-portal"],
    pruNames: ["PRU Digital Core"],
    active: true
  },
  {
    id: "user-nina-ek",
    displayName: "Nina Ek",
    email: "nina.ek@scania.com",
    primaryRole: "security_reviewer",
    actionRoles: [],
    region: "Global",
    site: "Global",
    productIds: ["product-plant-portal", "product-variant-manager"],
    pruNames: ["PRU Digital Core", "PRU Battery"],
    active: true
  },
  {
    id: "user-admin",
    displayName: "Nexus-support portal Admin",
    email: "nexus.admin@scania.com",
    primaryRole: "admin",
    actionRoles: [],
    region: "Global",
    site: "Global",
    productIds: [],
    pruNames: [],
    active: true
  }
];

export const adminUsers: AdminUser[] = rawAdminUsers.map((user) => normalizeAdminUser(user));

export const roleDomains: RoleDomainConfig[] = roles.map((role) => ({
  role: role.key,
  domain:
    role.key === "admin"
      ? "Admin"
      : role.key === "developer" ||
          role.key === "it_reviewer" ||
          role.key === "security_reviewer" ||
          role.key === "solution_architect" ||
          role.key === "software_architect" ||
          role.key === "release_manager" ||
          role.key === "service_manager" ||
          role.key === "scrum_master"
        ? "IT"
        : "Business",
  workflowType:
    role.key === "local_product_owner" ||
    role.key === "global_product_owner" ||
    role.key === "release_manager"
      ? "approval"
      : role.key === "requester" || role.key === "admin"
        ? "inform"
        : "review",
  active: true
}));

export const regionSites: RegionSiteConfig[] = [
  {
    id: "site-sodertalje",
    label: "Europe - Sodertalje",
    region: "Europe",
    site: "Sodertalje",
    localProductOwnerId: "user-maja-lind",
    active: true
  },
  {
    id: "site-oskarshamn",
    label: "Europe - Oskarshamn",
    region: "Europe",
    site: "Oskarshamn",
    localProductOwnerId: "user-maja-lind",
    active: true
  },
  {
    id: "site-lulea",
    label: "Europe - Lulea",
    region: "Europe",
    site: "Lulea",
    localProductOwnerId: "user-maja-lind",
    active: true
  },
  {
    id: "site-angers",
    label: "Europe - Angers",
    region: "Europe",
    site: "Angers",
    localProductOwnerId: "user-maja-lind",
    active: true
  }
];

export const departments: DepartmentConfig[] = [
  {
    id: "department-industrial-it",
    name: "Industrial IT",
    description: "Shop-floor and industrial operations technology ownership.",
    active: true
  },
  {
    id: "department-manufacturing-engineering",
    name: "Manufacturing Engineering",
    description: "Manufacturing process, product introduction, and plant engineering ownership.",
    active: true
  },
  {
    id: "department-digital-platforms",
    name: "Digital Platforms",
    description: "Shared digital platform and integration ownership.",
    active: true
  }
];

export const productDomains: ProductDomainConfig[] = [
  {
    id: "domain-scada",
    name: "SCADA",
    description: "Supervisory control, monitoring, and plant connectivity products.",
    active: true
  },
  {
    id: "domain-iiot",
    name: "IIoT",
    description: "Industrial IoT, telemetry, analytics, and connected factory products.",
    active: true
  },
  {
    id: "domain-mes",
    name: "MES",
    description: "Manufacturing execution, production workflow, and shop-floor process products.",
    active: true
  }
];

export const productConfigs: ProductConfig[] = [
  {
    id: "product-calibration-hub",
    productName: "Calibration Hub",
    productOwnerName: "Maja Lind",
    departmentId: "department-manufacturing-engineering",
    productDomainId: "domain-mes",
    ticketSource: "jira",
    jiraProjectKey: "CAL",
    roleAssignments: [
      { id: "cal-local-po", role: "local_product_owner", userIds: ["user-maja-lind"], active: true },
      { id: "cal-global-po", role: "global_product_owner", userIds: ["user-sara-blom"], active: true },
      {
        id: "cal-solution-architect",
        role: "solution_architect",
        userIds: ["user-oskar-nordin"],
        active: true
      },
      { id: "cal-architect", role: "software_architect", userIds: ["user-oskar-nordin"], active: true },
      { id: "cal-developer", role: "developer", userIds: ["user-jonas-ny"], active: true }
    ],
    prus: [
      {
        id: "cal-pru-emobility",
        name: "PRU E-Mobility",
        site: "Sodertalje",
        localProductOwnerId: "user-maja-lind",
        active: true,
        modules: [
          { id: "cal-release-governance", name: "Release Governance", active: true },
          { id: "cal-calibration-release", name: "Calibration Release", active: true },
          { id: "cal-evidence-store", name: "Evidence Store", active: true }
        ]
      }
    ],
    active: true
  },
  {
    id: "product-plant-portal",
    productName: "Plant Portal",
    productOwnerName: "Karin Vik",
    departmentId: "department-industrial-it",
    productDomainId: "domain-scada",
    ticketSource: "jira",
    jiraProjectKey: "PLANT",
    roleAssignments: [
      { id: "plant-it", role: "it_reviewer", userIds: ["user-karin-vik"], active: true },
      { id: "plant-release", role: "release_manager", userIds: ["user-erik-holm"], active: true },
      { id: "plant-security", role: "security_reviewer", userIds: ["user-nina-ek"], active: true }
    ],
    prus: [
      {
        id: "plant-pru-digital-core",
        name: "PRU Digital Core",
        site: "Oskarshamn",
        localProductOwnerId: "user-maja-lind",
        active: true,
        modules: [
          { id: "plant-identity", name: "Identity", active: true },
          { id: "plant-gateway", name: "Gateway", active: true },
          { id: "plant-perspective-support", name: "Perspective Support", active: true }
        ]
      }
    ],
    active: true
  },
  {
    id: "product-variant-manager",
    productName: "Variant Manager",
    productOwnerName: "Sara Blom",
    departmentId: "department-manufacturing-engineering",
    productDomainId: "domain-mes",
    ticketSource: "jira",
    jiraProjectKey: "VAR",
    roleAssignments: [
      { id: "variant-global-po", role: "global_product_owner", userIds: ["user-sara-blom"], active: true },
      { id: "variant-business", role: "business_architect", userIds: ["user-sara-blom"], active: true },
      {
        id: "variant-solution-architect",
        role: "solution_architect",
        userIds: ["user-oskar-nordin"],
        active: true
      },
      { id: "variant-architect", role: "software_architect", userIds: ["user-oskar-nordin"], active: true },
      { id: "variant-security", role: "security_reviewer", userIds: ["user-nina-ek"], active: true },
      { id: "variant-developer", role: "developer", userIds: ["user-jonas-ny"], active: true }
    ],
    prus: [
      {
        id: "variant-pru-battery",
        name: "PRU Battery",
        site: "Lulea",
        localProductOwnerId: "user-maja-lind",
        active: true,
        modules: [
          { id: "variant-workflow-templates", name: "Workflow Templates", active: true },
          { id: "variant-battery-variants", name: "Battery Variants", active: true },
          { id: "variant-export-controls", name: "Export Controls", active: true }
        ]
      }
    ],
    active: true
  },
  {
    id: "product-production-analytics",
    productName: "Production Analytics",
    productOwnerName: "Maja Lind",
    departmentId: "department-industrial-it",
    productDomainId: "domain-iiot",
    ticketSource: "jira",
    jiraProjectKey: "ANL",
    roleAssignments: [
      { id: "analytics-local-po", role: "local_product_owner", userIds: ["user-maja-lind"], active: true },
      { id: "analytics-release", role: "release_manager", userIds: ["user-erik-holm"], active: true }
    ],
    prus: [
      {
        id: "analytics-pru-powertrain",
        name: "PRU Powertrain",
        site: "Angers",
        localProductOwnerId: "user-maja-lind",
        active: true,
        modules: [
          { id: "analytics-reports", name: "Reports", active: true },
          { id: "analytics-permissions", name: "Permissions", active: true },
          { id: "analytics-shop-floor-metrics", name: "Shop-floor Metrics", active: true }
        ]
      }
    ],
    active: true
  }
];

export const responsibilityMappings: ResponsibilityMappingConfig[] = productConfigs.flatMap((product) =>
  product.roleAssignments.map((assignment) => ({
    id: `map-${assignment.id}`,
    productIds: [product.id],
    regionSiteIds: regionSites
      .filter((site) => product.prus.some((pru) => pru.site === site.site))
      .map((site) => site.id),
    pruNames: product.prus.map((pru) => pru.name),
    role: assignment.role,
    roles: [assignment.role],
    userIds: assignment.userIds,
    actingRole: false,
    active: assignment.active
  }))
);

export const requestTypeOptions: ConfigOption[] = ticketTypes.map((ticketType, index) => ({
  id: ticketType.id,
  label: ticketType.label,
  color:
    ticketType.id === "incident"
      ? "error"
      : ticketType.id === "change_request"
        ? "information"
        : ticketType.id === "feature_request"
          ? "new"
          : ticketType.id === "bug"
            ? "warning"
            : ticketType.id === "task"
              ? "success"
              : "neutral",
  active: ticketType.enabled,
  sortOrder: index + 1
}));

export const priorityOptions: ConfigOption<Ticket["priority"]>[] = [
  { id: "priority-0-highest", label: "0 - Highest", color: "error", active: true, sortOrder: 0 },
  { id: "priority-1-high", label: "1 - High", color: "warning", active: true, sortOrder: 1 },
  { id: "priority-2-medium", label: "2 - Medium", color: "information", active: true, sortOrder: 2 },
  { id: "priority-3-low", label: "3 - Low", color: "neutral", active: true, sortOrder: 3 },
  { id: "priority-4-lowest", label: "4 - Lowest", color: "success", active: true, sortOrder: 4 }
];

const legacyDefaultPriorityLabels = ["low", "medium", "high", "critical"];
const legacyDefaultPriorityLabelSet = new Set(legacyDefaultPriorityLabels);
const legacyPriorityLabelMigration: Record<string, Ticket["priority"]> = {
  critical: "0 - Highest",
  highest: "0 - Highest",
  high: "1 - High",
  medium: "2 - Medium",
  low: "3 - Low",
  lowest: "4 - Lowest",
  "very low": "4 - Lowest"
};

export function isLegacyDefaultPriorityConfig(priorities: ConfigOption[]): boolean {
  if (priorities.length !== legacyDefaultPriorityLabels.length) {
    return false;
  }

  return priorities.every((priority) =>
    legacyDefaultPriorityLabelSet.has(priority.label.trim().toLowerCase())
  );
}

export function getJiraPriorityOptions(): ConfigOption<Ticket["priority"]>[] {
  return priorityOptions.map((priority) => ({ ...priority }));
}

export function migrateLegacyPriorityLabel(priority: string): Ticket["priority"] {
  const normalizedPriority = priority.trim().toLowerCase();

  return legacyPriorityLabelMigration[normalizedPriority] ?? priority;
}

export function migrateLegacyPriorityReferences<TItem extends { priority: string }>(items: TItem[]): TItem[] {
  return items.map((item) => ({
    ...item,
    priority: migrateLegacyPriorityLabel(item.priority)
  }));
}

export const riskOptions: ConfigOption<Ticket["risk"]>[] = [
  { id: "risk-low", label: "Low", color: "success", active: true, sortOrder: 1 },
  { id: "risk-medium", label: "Medium", color: "information", active: true, sortOrder: 2 },
  { id: "risk-high", label: "High", color: "warning", active: true, sortOrder: 3 },
  { id: "risk-critical", label: "Critical", color: "error", active: true, sortOrder: 4 }
];

export const statusColorOptions: StatusColorConfig[] = [
  { status: "Request", color: "neutral" },
  { status: "New", color: "new" },
  { status: "In progress", color: "information" },
  { status: "Pending", color: "warning" },
  { status: "Waiting", color: "warning" },
  { status: "Review", color: "information" },
  { status: "Planning", color: "information" },
  { status: "Ready to create", color: "new" },
  { status: "Jira created", color: "success" },
  { status: "IT Test", color: "warning" },
  { status: "Business Test", color: "warning" },
  { status: "Blocked", color: "error" },
  { status: "Done", color: "success" },
  { status: "Completed close", color: "success" },
  { status: "Rejected close", color: "error" },
  { status: "Rejected", color: "error" },
  { status: "Intake", color: "neutral" },
  { status: "Clarification", color: "warning" },
  { status: "Approval", color: "information" },
  { status: "Jira draft", color: "new" },
  { status: "Jira synced", color: "success" },
  { status: "Escalated", color: "error" },
  { status: "Closed", color: "success" }
];

export const requestCategories = [
  "Access and authorization",
  "Data quality",
  "Integration",
  "Performance",
  "Reporting",
  "User experience"
];

export const slaRules: SlaRule[] = [
  { id: "sla-0-highest", priority: "0 - Highest", targetHours: 2 * 24, warningHours: 24 },
  { id: "sla-1-high", priority: "1 - High", targetHours: 5 * 24, warningHours: 3 * 24 },
  { id: "sla-2-medium", priority: "2 - Medium", targetHours: 10 * 24, warningHours: 7 * 24 },
  { id: "sla-3-low", priority: "3 - Low", targetHours: 15 * 24, warningHours: 10 * 24 },
  { id: "sla-4-lowest", priority: "4 - Lowest", targetHours: 20 * 24, warningHours: 15 * 24 }
];

export const notificationTemplates: NotificationTemplate[] = [
  {
    id: "tpl-approval-requested",
    eventType: "approvalRequested",
    subject: "Approval required for {{ticketKey}} - {{ticketTitle}}",
    body: `Hello {{participantName}},

A ticket is awaiting your approval.

Ticket: {{ticketKey}}
Title: {{ticketTitle}}

Current stage: Approval Review

Please review the request and approve or reject it in the Support Portal.

Your response is required before the release process can continue.`,
    deliveryMode: "inAppAndEmail",
    severity: "warning",
    active: true,
    enabledRoles: [
      "local_product_owner",
      "global_product_owner",
      "business_architect",
      "solution_architect",
      "software_architect"
    ]
  },
  {
    id: "tpl-clarification-requested",
    eventType: "clarificationRequested",
    subject: "Action required: Clarification needed for {{ticketKey}}",
    body: `Hello {{participantName}},

Additional information is required before the ticket can proceed.

Ticket: {{ticketKey}}
Title: {{ticketTitle}}

Requested by: {{requestedByRole}}

Please review the ticket and provide the requested clarification.

This request may delay implementation or approval until updated information is provided.`,
    deliveryMode: "inAppAndEmail",
    severity: "warning",
    active: true,
    enabledRoles: ["requester", "developer", "business_architect", "solution_architect", "software_architect"]
  },
  {
    id: "tpl-jira-ready-to-create",
    eventType: "jiraReadyToCreate",
    subject: "Jira creation ready for {{ticketKey}} - {{ticketTitle}}",
    body: `Hello {{participantName}},

The portal workflow is complete and this ticket is ready for Jira creation.

Portal Ticket: {{ticketKey}}
Title: {{ticketTitle}}
Priority: {{priority}}
Release version: {{releaseVersion}}

Please open the Support Portal and create the linked Jira issue.`,
    deliveryMode: "inAppAndEmail",
    severity: "warning",
    active: true,
    enabledRoles: ["solution_architect", "software_architect", "release_manager"]
  },
  {
    id: "tpl-jira-created",
    eventType: "jiraCreated",
    subject: "Jira ticket created for {{ticketKey}}",
    body: `Hello {{participantName}},

A Jira issue has been created successfully.

Portal Ticket: {{ticketKey}}
Jira Issue: {{jiraKey}}
Title: {{ticketTitle}}

The issue is now synchronized with Jira and progress updates will continue automatically.`,
    deliveryMode: "inAppAndEmail",
    severity: "success",
    active: true,
    enabledRoles: ["requester", "it_reviewer", "release_manager", "admin"]
  },
  {
    id: "tpl-sla-breach",
    eventType: "slaBreach",
    subject: "SLA breach detected for {{ticketKey}}",
    body: `Attention,

The SLA target has been exceeded for the following ticket:

Ticket: {{ticketKey}}
Title: {{ticketTitle}}

Please review the ticket immediately to avoid further escalation.

Current status: {{ticketStatus}}
Priority: {{priority}}`,
    deliveryMode: "inAppAndEmail",
    severity: "critical",
    active: true,
    enabledRoles: ["release_manager", "it_reviewer", "admin"]
  },
  {
    id: "tpl-workflow-deviation",
    eventType: "workflowDeviation",
    subject: "Workflow deviation: unassigned approval gate for {{ticketKey}}",
    body: `Attention {{participantName}},

The workflow for {{ticketKey}} has an active approval gate without an assigned owner.

Ticket: {{ticketKey}}
Title: {{ticketTitle}}
Missing gate: {{deviationGate}}
Missing role: {{deviationRole}}
Covering approver: {{deviationCoveringOwner}}

The next assigned approval owner can cover the unassigned gate so the ticket does not stop. Please review the ownership configuration in the Support Portal.`,
    deliveryMode: "inAppAndEmail",
    severity: "critical",
    active: true,
    enabledRoles: ["admin"]
  },
  {
    id: "tpl-participant-added",
    eventType: "participantAdded",
    subject: "You were added to {{ticketKey}}",
    body: `Hello {{participantName}},

You have been added as a participant to the following ticket:

Ticket: {{ticketKey}}
Title: {{ticketTitle}}

You now have visibility and collaboration access in the Support Portal.`,
    deliveryMode: "inAppAndEmail",
    severity: "info",
    active: true,
    enabledRoles: ["admin", "solution_architect", "software_architect", "business_architect"]
  }
];

export const formTemplates: ProductFormTemplate[] = [
  {
    id: "form-calibration-change",
    productName: "Calibration Hub",
    requestTypeId: "change_request",
    title: "Calibration release governance intake",
    description: "Captures evidence, release impact, and Jira handoff needs before execution.",
    active: true,
    updatedAt,
    fields: [
      {
        id: "field-release-train",
        label: "Target release version",
        type: "singleSelect",
        component: "dropdown",
        required: true,
        helperText: "Select an available version from Jira.",
        options: [],
        optionSource: "jiraUnreleasedVersions",
        sortOrder: 1
      },
      {
        id: "field-evidence-ready",
        label: "Release evidence ready",
        type: "yesNo",
        component: "dropdown",
        required: true,
        options: ["Yes", "No"],
        sortOrder: 2
      },
      {
        id: "field-affected-integrations",
        label: "Affected integrations",
        type: "multiSelect",
        component: "checkboxGroup",
        required: false,
        options: ["Jira Software", "Release calendar", "Evidence store", "Calibration database"],
        sortOrder: 3
      }
    ]
  },
  {
    id: "form-incident-identity",
    productName: "Plant Portal",
    requestTypeId: "incident",
    title: "Plant incident intake",
    description: "Captures service impact, affected users, and security review needs.",
    active: true,
    updatedAt,
    fields: [
      {
        id: "field-affected-users",
        label: "Affected users",
        type: "number",
        component: "numberField",
        required: true,
        options: [],
        sortOrder: 1
      },
      {
        id: "field-service-dependency",
        label: "Service dependency",
        type: "multiSelect",
        component: "checkboxGroup",
        required: true,
        options: ["Entra ID", "Gateway", "Ignition Perspective", "Network"],
        sortOrder: 2
      }
    ]
  }
];

export const ticketTypeWorkflows: TicketTypeWorkflowConfig[] = ticketTypes.map((ticketType) => {
  const template =
    workflowTemplates.find((workflow) => workflow.id === ticketType.defaultWorkflowTemplateId) ??
    workflowTemplates[0];

  return {
    id: `workflow-${ticketType.id}`,
    ticketTypeId: ticketType.id,
    workflowTemplateId: template.id,
    escalationPolicyId: template.escalationPolicyId,
    stepIds: template.steps.map((step) => step.id),
    jiraCreatorStepId: "release-gate",
    jiraCreatorStepIds: ["release-gate"],
    stepOverrides: {},
    active: ticketType.enabled,
    updatedAt
  };
});

export const jiraIntegration: JiraIntegrationConfig = {
  enabled: true,
  apiBaseUrl: "https://issues.scania.com",
  apiVersion: "rest/api/2",
  projectUrl: "https://issues.scania.com/projects/NEXUS",
  defaultProjectKey: "NEXUS",
  defaultIssueType: "Task",
  authMode: "personalAccessToken",
  username: "",
  tokenConfigured: false,
  metadataMode: "dynamic",
  syncDirection: "bidirectional",
  updatedAt
};

export const smtpConfig: SmtpConfig = {
  enabled: false,
  deliveryMode: "inAppAndEmail",
  host: "",
  port: 587,
  security: "starttls",
  fromName: "Nexus-support portal",
  fromEmail: "",
  updatedAt
};

export const aiIntegration: AiIntegrationConfig = {
  enabled: false,
  provider: "openai",
  model: "gpt-5.5",
  apiKeyConfigured: false,
  updatedAt
};

export const defaultGitLabBaseUrl = "https://gitlab.scania.com";

export const gitlabIntegration: GitLabIntegrationConfig = {
  enabled: false,
  apiBaseUrl: defaultGitLabBaseUrl,
  tokenConfigured: false,
  defaultRef: "main",
  productRepositoryMappings: [],
  updatedAt
};

export const adminConfig: AdminConfig = {
  users: adminUsers,
  customRoles: [],
  roleDomains,
  deletedRoleKeys: [],
  regionSites,
  departments,
  productDomains,
  products: productConfigs,
  responsibilityMappings,
  requestTypes: requestTypeOptions,
  priorities: priorityOptions,
  riskOptions,
  statusColors: statusColorOptions,
  requestCategories,
  slaRules,
  escalationPolicies: slaPolicies,
  leadTimeStatusRules: defaultLeadTimeStatusRules,
  leadTimeTransitionRules: defaultLeadTimeTransitionRules,
  notificationTemplates,
  formTemplates,
  ticketTypeWorkflows,
  integrations: {
    jira: jiraIntegration,
    smtp: smtpConfig,
    ai: aiIntegration,
    gitlab: gitlabIntegration
  }
};

export function getAdminUserName(userId: string): string {
  return adminUsers.find((user) => user.id === userId)?.displayName ?? "Unassigned";
}

export function getAdminRoleLabel(roleKey: RoleKey): string {
  return (
    roles.find((role) => role.key === roleKey)?.label ??
    roleKey.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function workflowStepMentionsProductOwnerRole(value: string, scope: "local" | "global"): boolean {
  const normalizedValue = value.toLowerCase().replace(/[_-]+/g, " ");

  return normalizedValue.includes(`${scope} product owner`) || normalizedValue.includes(`${scope} po`);
}

function workflowStepMentionsSolutionArchitectRole(value: string): boolean {
  const normalizedValue = value.toLowerCase().replace(/[_-]+/g, " ");

  return normalizedValue.includes("solution architect") || normalizedValue.includes("solution architecture");
}

export function normalizeWorkflowStepOwnerRole(
  step: Pick<WorkflowTemplateStep, "id" | "label" | "ownerRole">
): RoleKey {
  const value = `${step.id} ${step.label}`;

  if (workflowStepMentionsSolutionArchitectRole(value)) {
    return "solution_architect";
  }

  if (workflowStepMentionsProductOwnerRole(value, "local")) {
    return "local_product_owner";
  }

  if (workflowStepMentionsProductOwnerRole(value, "global")) {
    return "global_product_owner";
  }

  return step.ownerRole;
}

export function getProductConfig(productName: string): ProductConfig | undefined {
  return productConfigs.find((product) => product.productName === productName && product.active);
}

export function getPrusForProduct(productName: string): ProductPruConfig[] {
  return getProductConfig(productName)?.prus.filter((pru) => pru.active) ?? [];
}

export function getModulesForProductPru(productName: string, pruName: string): ProductModuleConfig[] {
  return (
    getPrusForProduct(productName)
      .find((pru) => pru.name === pruName)
      ?.modules.filter((module) => module.active) ?? []
  );
}

export function getDefaultProductConfig(): ProductConfig | undefined {
  return productConfigs.find((product) => product.active);
}

export function getDefaultWorkflowTemplate(ticketTypeId: string): WorkflowTemplate | undefined {
  const workflow = ticketTypeWorkflows.find((item) => item.ticketTypeId === ticketTypeId && item.active);

  return workflowTemplates.find((template) => template.id === workflow?.workflowTemplateId);
}

export function getSlaPolicyForTicketType(ticketTypeId: string): SlaPolicy | undefined {
  const workflow = ticketTypeWorkflows.find((item) => item.ticketTypeId === ticketTypeId && item.active);
  const template = getDefaultWorkflowTemplate(ticketTypeId);
  const escalationPolicyId = workflow?.escalationPolicyId ?? template?.escalationPolicyId;

  return slaPolicies.find((policy) => policy.id === escalationPolicyId);
}
