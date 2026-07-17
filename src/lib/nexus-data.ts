import type {
  NotificationItem,
  RoleDefinition,
  SlaPolicy,
  Ticket,
  TicketTypeDefinition,
  WorkflowTemplate
} from "./types";
import { buildDemoTickets } from "./demo-tickets";

export const roles: RoleDefinition[] = [
  {
    key: "requester",
    label: "User",
    description: "Creates tickets and answers clarification requests."
  },
  {
    key: "local_product_owner",
    label: "Local Product Owner",
    description: "Validates local product fit, urgency, and site impact."
  },
  {
    key: "global_product_owner",
    label: "Global Product Owner",
    description: "Owns portfolio priority and global product alignment."
  },
  {
    key: "business_architect",
    label: "Business Architect",
    description: "Reviews process fit, governance impact, and business rules."
  },
  {
    key: "solution_architect",
    label: "Solution Architect",
    description: "Owns solution-level architecture decisions across product, business, and software scope."
  },
  {
    key: "software_architect",
    label: "Software Architect",
    description: "Reviews architecture, integration, and delivery feasibility."
  },
  {
    key: "release_manager",
    label: "Release Manager",
    description: "Controls release readiness and Jira creation gates."
  },
  {
    key: "service_manager",
    label: "Service Manager",
    description: "Owns service readiness, support model, and operational continuity."
  },
  {
    key: "developer",
    label: "Developer",
    description: "Provides estimates, technical input, and execution comments."
  },
  {
    key: "scrum_master",
    label: "Scrum Master",
    description: "Supports delivery flow, sprint coordination, and impediment removal."
  },
  {
    key: "it_reviewer",
    label: "IT Reviewer",
    description: "Reviews operational, support, and service implications."
  },
  {
    key: "security_reviewer",
    label: "Security Reviewer",
    description: "Reviews identity, data, access, and compliance risk."
  },
  {
    key: "admin",
    label: "Admin",
    description: "Manages configuration, permissions, and master data."
  }
];

export const ticketTypes: TicketTypeDefinition[] = [
  {
    id: "bug",
    label: "Bug",
    description: "Defect in existing behavior requiring triage and fix governance.",
    defaultWorkflowTemplateId: "standard-governance",
    enabled: true
  },
  {
    id: "change_request",
    label: "Change Request",
    description: "Controlled change to process, integration, data, or release behavior.",
    defaultWorkflowTemplateId: "architecture-gate",
    enabled: true
  },
  {
    id: "feature_request",
    label: "Feature Request",
    description: "New product capability requiring business and delivery prioritization.",
    defaultWorkflowTemplateId: "portfolio-gate",
    enabled: true
  },
  {
    id: "support_request",
    label: "Support Request",
    description: "Operational help request that may become a governed change.",
    defaultWorkflowTemplateId: "standard-governance",
    enabled: true
  },
  {
    id: "incident",
    label: "Incident",
    description: "Service-impacting event requiring expedited review and escalation.",
    defaultWorkflowTemplateId: "expedited-incident",
    enabled: true
  },
  {
    id: "task",
    label: "Task",
    description: "Governed work item or investigation task.",
    defaultWorkflowTemplateId: "standard-governance",
    enabled: true
  }
];

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "standard-governance",
    name: "Standard Governance",
    appliesToTicketTypes: ["bug", "support_request", "task"],
    escalationPolicyId: "default-sla",
    steps: [
      {
        id: "local-po",
        label: "Local PO Review",
        ownerRole: "local_product_owner",
        required: true,
        slaHours: 24,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "global-po",
        label: "Global PO Review",
        ownerRole: "global_product_owner",
        required: true,
        slaHours: 36,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "developer-estimate",
        label: "Developer Estimate",
        ownerRole: "developer",
        required: true,
        slaHours: 24,
        allowDelegation: false,
        allowClarification: true
      },
      {
        id: "release-gate",
        label: "Release Gate",
        ownerRole: "release_manager",
        required: true,
        slaHours: 18,
        allowDelegation: true,
        allowClarification: false
      }
    ]
  },
  {
    id: "architecture-gate",
    name: "Architecture Gate",
    appliesToTicketTypes: ["change_request"],
    escalationPolicyId: "architecture-sla",
    steps: [
      {
        id: "local-po",
        label: "Local PO Review",
        ownerRole: "local_product_owner",
        required: true,
        slaHours: 24,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "architecture-parallel",
        label: "Solution Architecture Review",
        ownerRole: "solution_architect",
        required: true,
        parallelGroup: "architecture",
        slaHours: 36,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "business-architecture",
        label: "Business Review",
        ownerRole: "business_architect",
        required: true,
        parallelGroup: "architecture",
        slaHours: 36,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "security-review",
        label: "Security Review",
        ownerRole: "security_reviewer",
        required: false,
        slaHours: 48,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "release-gate",
        label: "Release Gate",
        ownerRole: "release_manager",
        required: true,
        slaHours: 18,
        allowDelegation: true,
        allowClarification: false
      }
    ]
  },
  {
    id: "portfolio-gate",
    name: "Portfolio Gate",
    appliesToTicketTypes: ["feature_request"],
    escalationPolicyId: "portfolio-sla",
    steps: [
      {
        id: "global-po",
        label: "Global PO Intake",
        ownerRole: "global_product_owner",
        required: true,
        slaHours: 48,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "business-architecture",
        label: "Business Architecture",
        ownerRole: "business_architect",
        required: true,
        slaHours: 48,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "solution-architecture",
        label: "Solution Architecture",
        ownerRole: "solution_architect",
        required: true,
        slaHours: 48,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "developer-estimate",
        label: "Developer Estimate",
        ownerRole: "developer",
        required: true,
        slaHours: 36,
        allowDelegation: false,
        allowClarification: true
      },
      {
        id: "release-gate",
        label: "Release Gate",
        ownerRole: "release_manager",
        required: true,
        slaHours: 24,
        allowDelegation: true,
        allowClarification: false
      }
    ]
  },
  {
    id: "expedited-incident",
    name: "Expedited Incident",
    appliesToTicketTypes: ["incident"],
    escalationPolicyId: "incident-sla",
    steps: [
      {
        id: "it-triage",
        label: "IT Triage",
        ownerRole: "it_reviewer",
        required: true,
        slaHours: 4,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "security-review",
        label: "Security Check",
        ownerRole: "security_reviewer",
        required: false,
        parallelGroup: "incident-review",
        slaHours: 6,
        allowDelegation: true,
        allowClarification: true
      },
      {
        id: "release-gate",
        label: "Release Decision",
        ownerRole: "release_manager",
        required: true,
        parallelGroup: "incident-review",
        slaHours: 6,
        allowDelegation: true,
        allowClarification: false
      }
    ]
  }
];

export const slaPolicies: SlaPolicy[] = [
  {
    id: "default-sla",
    name: "Standard Request SLA",
    priority: "2 - Medium",
    responseHours: 24,
    resolutionHours: 120,
    escalationMatrixId: "standard"
  },
  {
    id: "architecture-sla",
    name: "Architecture Review SLA",
    priority: "1 - High",
    responseHours: 12,
    resolutionHours: 96,
    escalationMatrixId: "architecture"
  },
  {
    id: "incident-sla",
    name: "Incident Governance SLA",
    priority: "0 - Highest",
    responseHours: 2,
    resolutionHours: 24,
    escalationMatrixId: "incident"
  },
  {
    id: "portfolio-sla",
    name: "Portfolio Prioritization SLA",
    priority: "2 - Medium",
    responseHours: 36,
    resolutionHours: 168,
    escalationMatrixId: "portfolio"
  }
];

export const tickets: Ticket[] = buildDemoTickets();

export const notifications: NotificationItem[] = [];

export const masterData = {
  products: ["Calibration Hub", "Plant Portal", "Variant Manager", "Production Analytics"],
  prus: ["PRU E-Mobility", "PRU Digital Core", "PRU Battery", "PRU Powertrain"],
  sites: ["Sodertalje", "Oskarshamn", "Lulea", "Angers"],
  jiraProjects: ["CAL", "PLANT", "VAR", "ANL"],
  visibilityLevels: ["public", "approvers_only", "it_only", "architecture_only", "admin_only"]
};

export function getTicketTypeLabel(typeId: string): string {
  return ticketTypes.find((type) => type.id === typeId)?.label ?? typeId;
}

export function getTicketByKey(key: string): Ticket | undefined {
  return tickets.find((ticket) => ticket.key === key);
}
