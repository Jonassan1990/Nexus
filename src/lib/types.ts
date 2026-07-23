export type BuiltInRoleKey =
  | "requester"
  | "local_product_owner"
  | "global_product_owner"
  | "business_architect"
  | "solution_architect"
  | "software_architect"
  | "release_manager"
  | "service_manager"
  | "developer"
  | "scrum_master"
  | "it_reviewer"
  | "security_reviewer"
  | "admin";

export type RoleKey = BuiltInRoleKey | (string & {});

export type VisibilityLevel = "public" | "approvers_only" | "it_only" | "architecture_only" | "admin_only";

export type TicketState =
  "intake" | "clarification" | "approval" | "jira_draft" | "jira_synced" | "escalated" | "closed";

export type WorkflowStepStatus = "complete" | "active" | "waiting" | "blocked" | "delegated" | "optional";

export type WorkflowRoleType = "approval" | "review" | "inform";

export type SlaState = "healthy" | "watch" | "breach" | "paused";

export type AccessLevel = "viewer" | "contributor" | "reviewer" | "temporary_approver";

export type AttachmentRelation =
  | "ticket_information"
  | "clarification_response"
  | "approval_comment"
  | "escalation"
  | "globalization_material"
  | "jira_sync";

export interface TicketTypeDefinition {
  id: string;
  label: string;
  description: string;
  defaultWorkflowTemplateId: string;
  enabled: boolean;
}

export interface RoleDefinition {
  key: RoleKey;
  label: string;
  description: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  appliesToTicketTypes: string[];
  escalationPolicyId: string;
  steps: WorkflowTemplateStep[];
}

export interface WorkflowTemplateStep {
  id: string;
  label: string;
  ownerRole: RoleKey;
  workflowType?: WorkflowRoleType;
  required: boolean;
  parallelGroup?: string;
  slaHours: number;
  allowDelegation: boolean;
  allowClarification: boolean;
}

export interface Participant {
  id: string;
  name: string;
  role: string;
  accessLevel: AccessLevel;
  expiresAt?: string;
}

export interface WorkflowStep {
  id: string;
  label: string;
  ownerRole: RoleKey;
  workflowType?: WorkflowRoleType;
  ownerName: string;
  status: WorkflowStepStatus;
  statusReason?: string;
  statusUpdatedAt?: string;
  slaState: SlaState;
  dueAt: string;
  parallelGroup?: string;
}

export interface ClarificationMessage {
  id: string;
  author: string;
  role: string;
  body: string;
  createdAt: string;
  visibility: VisibilityLevel;
}

export interface ClarificationThread {
  id: string;
  level: string;
  question: string;
  status: "open" | "answered" | "reopened";
  requestedBy: string;
  assignedTo: string;
  dueAt: string;
  messages: ClarificationMessage[];
}

export interface JiraDraft {
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
  linkedEpic?: string;
  status: "metadata_loaded" | "estimation_review" | "release_gate" | "ready_to_create" | "synced";
  syncedStatus?: string;
  followUpStatus?: JiraFollowUpStatus;
  followUpUpdatedAt?: string;
}

export type JiraFollowUpStatus =
  | "not_created"
  | "created"
  | "in_progress"
  | "blocked"
  | "it_test"
  | "business_test"
  | "testing"
  | "done"
  | "rejected";

export interface Escalation {
  id: string;
  type: "sla" | "technical" | "business" | "management";
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  impact: string;
  urgency: string;
  requestedAction: string;
  mitigationPlan: string;
  decisionMaker: string;
  dueAt: string;
  status: "open" | "decision_pending" | "mitigating" | "resolved";
  createdBy?: string;
  createdAt?: string;
  statusNote?: string;
  statusUpdatedAt?: string;
  actionPlan?: string;
  meetingSeries?: string;
  meetingType?: "single" | "series";
  meetingStartAt?: string;
  meetingEndAt?: string;
  meetingDurationMinutes?: number;
  meetingTimeZone?: string;
  meetingRecurrenceFrequency?: "none" | "daily" | "weekly" | "biweekly" | "monthly";
  meetingRecurrenceInterval?: number;
  meetingRecurrenceDays?: string[];
  meetingRecurrenceUntil?: string;
  meetingAvailabilityStatus?: "not_checked" | "ready_for_outlook" | "checked_externally";
  meetingAvailabilityCheckedAt?: string;
  meetingAvailabilityNote?: string;
  managerName?: string;
  managerEmail?: string;
  managerInviteStatus?: "not_sent" | "pending" | "sent" | "failed";
  managerInvitedAt?: string;
  managerInviteError?: string;
  people?: EscalationPerson[];
  actionItems?: EscalationActionItem[];
  statusUpdates?: EscalationStatusUpdate[];
}

export interface EscalationPerson {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface EscalationActionItem {
  id: string;
  label: string;
  done: boolean;
}

export interface EscalationStatusUpdate {
  id: string;
  author: string;
  role: string;
  status: Escalation["status"];
  note: string;
  actionPlan?: string;
  actionItems?: EscalationActionItem[];
  meetingSeries?: string;
  meetingType?: Escalation["meetingType"];
  meetingStartAt?: string;
  meetingEndAt?: string;
  meetingDurationMinutes?: number;
  meetingTimeZone?: string;
  meetingRecurrenceFrequency?: Escalation["meetingRecurrenceFrequency"];
  meetingRecurrenceInterval?: number;
  meetingRecurrenceDays?: string[];
  meetingRecurrenceUntil?: string;
  meetingAvailabilityStatus?: Escalation["meetingAvailabilityStatus"];
  meetingAvailabilityCheckedAt?: string;
  meetingAvailabilityNote?: string;
  people?: EscalationPerson[];
  createdAt: string;
  managerInvite?: {
    name: string;
    email: string;
    status: "pending" | "sent" | "failed";
    sentAt?: string;
    error?: string;
  };
}

export interface AuditEntry {
  id: string;
  eventType: string;
  actor: string;
  createdAt: string;
  visibility: VisibilityLevel;
  reason?: string;
  oldValue?: string;
  newValue?: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize?: number;
  sizeLabel: string;
  relation: AttachmentRelation;
  uploadedBy: string;
  uploadedAt: string;
  storageProvider: "local" | "s3";
  previewAvailable: boolean;
  contentDataUrl?: string;
}

export interface CommentItem {
  id: string;
  author: string;
  role: string;
  body: string;
  createdAt: string;
  visibility: VisibilityLevel;
  source: "portal" | "jira" | "system";
}

export type GlobalLpoApprovalDecision = "needs_global" | "local_only" | "needs_discussion";
export type GlobalLpoApprovalOutcome =
  | "globalize_request"
  | "keep_local"
  | "pru_specific"
  | "split_requests"
  | "architecture_review"
  | "no_action";

export interface GlobalLpoApprovalTarget {
  userId: string;
  displayName: string;
  email: string;
  site: string;
  productIds: string[];
  pruNames: string[];
  targetRoles?: RoleKey[];
}

export interface GlobalLpoApprovalResponse extends GlobalLpoApprovalTarget {
  decision: GlobalLpoApprovalDecision;
  note: string;
  respondedAt: string;
}

export interface GlobalLpoApprovalRequest {
  id: string;
  globalTicketKey?: string;
  question: string;
  status: "open" | "closed";
  requestedBy: string;
  requestedByRole: string;
  createdAt: string;
  dueAt: string;
  sourceStepId?: string;
  targetLpos: GlobalLpoApprovalTarget[];
  responses: GlobalLpoApprovalResponse[];
  closedAt?: string;
  closedBy?: string;
  finalOutcome?: GlobalLpoApprovalOutcome;
  finalDecisionNote?: string;
}

export type FunctionMappingReviewStatus = "open" | "ready_for_gpo" | "closed";
export type FunctionMappingReviewStepStatus = "active" | "waiting" | "complete";

export interface FunctionMappingDiscussionEntry {
  id: string;
  author: string;
  role: string;
  body: string;
  createdAt: string;
}

export interface FunctionMappingReviewStep {
  id: "solution_architecture" | "business_architecture" | "gpo_scope_decision";
  label: string;
  ownerRole: RoleKey;
  ownerName: string;
  status: FunctionMappingReviewStepStatus;
  note?: string;
  discussion?: FunctionMappingDiscussionEntry[];
  completedBy?: string;
  completedAt?: string;
}

export interface FunctionMappingReview {
  id: string;
  status: FunctionMappingReviewStatus;
  requestedBy: string;
  requestedByRole: string;
  createdAt: string;
  dueAt: string;
  sourceGlobalLpoRequestId?: string;
  scopeSummary: string;
  decisionContext: string;
  targetPlacement?: string;
  meetingNotes?: string;
  decisionMaterials?: string;
  materialAttachmentIds?: string[];
  materialUpdatedBy?: string;
  materialUpdatedAt?: string;
  steps: FunctionMappingReviewStep[];
  finalDecisionNote?: string;
  closedBy?: string;
  closedAt?: string;
}

export interface Ticket {
  id: string;
  key: string;
  title: string;
  typeId: string;
  state: TicketState;
  pru: string;
  site: string;
  product: string;
  module: string;
  priority: string;
  risk: string;
  slaLabel: string;
  slaState: SlaState;
  description: string;
  dynamicFields: Record<string, string>;
  relatedJiraKey?: string;
  workflow: WorkflowStep[];
  participants: Participant[];
  clarifications: ClarificationThread[];
  escalations: Escalation[];
  jiraDraft: JiraDraft;
  attachments: Attachment[];
  audit: AuditEntry[];
  comments: CommentItem[];
  globalLpoApprovalRequests?: GlobalLpoApprovalRequest[];
  functionMappingReviews?: FunctionMappingReview[];
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  readKey?: string;
  title: string;
  body: string;
  ticketKey: string;
  actionLabel: string;
  visibility: VisibilityLevel;
  createdAt: string;
  unread: boolean;
}

export interface SlaPolicy {
  id: string;
  name: string;
  priority: string;
  responseHours: number;
  resolutionHours: number;
  escalationMatrixId: string;
}
