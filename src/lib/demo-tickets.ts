import type { RoleKey, SlaState, Ticket, WorkflowStep, WorkflowStepStatus } from "./types";

type DemoWorkflowStep = {
  id: string;
  label: string;
  ownerRole: RoleKey;
  ownerName: string;
  status: WorkflowStepStatus;
  slaState?: SlaState;
  dueAt?: string;
  parallelGroup?: string;
};

const owners = {
  maja: "Jesper",
  sara: "Mate",
  oskar: "Yoones Sanjbai",
  erik: "Håkan",
  jonas: "Nikhil",
  karin: "Adityha",
  nina: "Ricardo",
  requester: "Alex",
  anton: "Anton",
  ricard: "Ricard"
} as const;

function ts(dayOffset: number, hour = 10, minute = 0): string {
  const date = new Date(2026, 6, 17 + dayOffset, hour, minute, 0);
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildWorkflow(ticketKey: string, steps: DemoWorkflowStep[]): WorkflowStep[] {
  return steps.map((step, index) => ({
    id: `${step.id}-${ticketKey}-${index}`,
    label: step.label,
    ownerRole: step.ownerRole,
    ownerName: step.ownerName,
    status: step.status,
    slaState: step.slaState ?? "healthy",
    dueAt: step.dueAt ?? ts(2, 16),
    parallelGroup: step.parallelGroup
  }));
}

export function buildDemoTickets(): Ticket[] {
  return [
    {
      id: "ticket-demo-2401",
      key: "NEX-2401",
      title: "Calibration export fails for battery variant B12",
      typeId: "bug",
      state: "clarification",
      pru: "DM",
      site: "Global",
      product: "IIoT",
      module: "Device Connectivity",
      priority: "1 - High",
      risk: "High",
      slaLabel: "5d response target",
      slaState: "watch",
      description:
        "Operators cannot export calibration evidence for battery variant B12 after the June release. The export dialog closes without error and no file is generated.",
      dynamicFields: {
        environment: "Production",
        affectedUsers: "12 operators",
        reproductionSteps: "Open Calibration Release > Export evidence > Select B12 variant"
      },
      workflow: buildWorkflow("NEX-2401", [
        {
          id: "local-po",
          label: "Local PO Review",
          ownerRole: "local_product_owner",
          ownerName: owners.maja,
          status: "complete",
          dueAt: ts(-2, 14)
        },
        {
          id: "global-po",
          label: "Global PO Review",
          ownerRole: "global_product_owner",
          ownerName: owners.sara,
          status: "active",
          slaState: "watch",
          dueAt: ts(0, 18)
        },
        {
          id: "developer-estimate",
          label: "Developer Estimate",
          ownerRole: "developer",
          ownerName: owners.jonas,
          status: "waiting"
        },
        {
          id: "release-gate",
          label: "Release Gate",
          ownerRole: "release_manager",
          ownerName: owners.erik,
          status: "waiting"
        }
      ]),
      participants: [],
      clarifications: [
        {
          id: "clarification-2401-1",
          level: "Global PO Review",
          question: "Does the issue affect all B-series variants or only B12?",
          status: "open",
          requestedBy: owners.sara,
          assignedTo: owners.requester,
          dueAt: ts(1, 12),
          messages: [
            {
              id: "clarification-msg-2401-1",
              author: owners.sara,
              role: "Global Product Owner",
              body: "Please confirm whether B11 and B13 exports still work in production.",
              createdAt: ts(-1, 11),
              visibility: "public"
            }
          ]
        }
      ],
      escalations: [],
      jiraDraft: {
        summary: "Calibration export fails for battery variant B12",
        description: "Export dialog closes without error for B12 variant evidence export.",
        project: "CAL",
        board: "Calibration Hub board",
        backlog: "Governance intake",
        fixVersion: "2026.07",
        components: ["Calibration Release"],
        labels: ["nexus-draft", "battery-variant"],
        priority: "1 - High",
        status: "metadata_loaded",
        followUpStatus: "not_created"
      },
      attachments: [],
      audit: [
        {
          id: "audit-2401-created",
          eventType: "Ticket created",
          actor: owners.requester,
          createdAt: ts(-3, 9),
          visibility: "admin_only",
          newValue: "NEX-2401"
        },
        {
          id: "audit-2401-clarification",
          eventType: "Clarification requested",
          actor: owners.sara,
          createdAt: ts(-1, 11),
          visibility: "approvers_only",
          reason: "Variant scope confirmation required before estimate."
        }
      ],
      comments: [
        {
          id: "comment-2401-1",
          author: owners.requester,
          role: "User",
          body: "Issue started after the June calibration package rollout.",
          createdAt: ts(-3, 9, 30),
          visibility: "public",
          source: "portal"
        },
        {
          id: "comment-2401-2",
          author: owners.maja,
          role: "Local Product Owner",
          body: "Confirmed at Sodertalje line 3. Escalating to global review.",
          createdAt: ts(-2, 14, 15),
          visibility: "public",
          source: "portal"
        }
      ],
      updatedAt: ts(-1, 11)
    },
    {
      id: "ticket-demo-2402",
      key: "NEX-2402",
      title: "Add SSO timeout policy for plant gateway sessions",
      typeId: "change_request",
      state: "approval",
      pru: "DX",
      site: "Global",
      product: "PROMO",
      module: "Gateway",
      priority: "2 - Medium",
      risk: "Medium",
      slaLabel: "10d response target",
      slaState: "healthy",
      description:
        "Plant gateway sessions remain active beyond the corporate SSO policy. Requesting a configurable idle timeout aligned with Entra ID conditional access.",
      dynamicFields: {
        changeType: "Security policy",
        rollbackPlan: "Revert gateway session policy to previous default"
      },
      workflow: buildWorkflow("NEX-2402", [
        {
          id: "local-po",
          label: "Local PO Review",
          ownerRole: "local_product_owner",
          ownerName: owners.maja,
          status: "complete",
          dueAt: ts(-4, 10)
        },
        {
          id: "architecture-parallel",
          label: "Solution Architecture Review",
          ownerRole: "solution_architect",
          ownerName: owners.oskar,
          status: "active",
          parallelGroup: "architecture",
          dueAt: ts(1, 15)
        },
        {
          id: "business-architecture",
          label: "Business Review",
          ownerRole: "business_architect",
          ownerName: owners.sara,
          status: "active",
          parallelGroup: "architecture",
          dueAt: ts(1, 15)
        },
        {
          id: "security-review",
          label: "Security Review",
          ownerRole: "security_reviewer",
          ownerName: owners.nina,
          status: "waiting"
        },
        {
          id: "release-gate",
          label: "Release Gate",
          ownerRole: "release_manager",
          ownerName: owners.erik,
          status: "waiting"
        }
      ]),
      participants: [],
      clarifications: [],
      escalations: [],
      jiraDraft: {
        summary: "Add SSO timeout policy for plant gateway sessions",
        project: "PLANT",
        board: "Plant Portal board",
        backlog: "Governance intake",
        fixVersion: "2026.08",
        components: ["Gateway"],
        labels: ["nexus-draft", "sso"],
        priority: "2 - Medium",
        status: "metadata_loaded",
        followUpStatus: "not_created"
      },
      attachments: [],
      audit: [
        {
          id: "audit-2402-created",
          eventType: "Ticket created",
          actor: owners.karin,
          createdAt: ts(-5, 8),
          visibility: "admin_only",
          newValue: "NEX-2402"
        }
      ],
      comments: [
        {
          id: "comment-2402-1",
          author: owners.karin,
          role: "IT Reviewer",
          body: "Security review should include conditional access alignment.",
          createdAt: ts(-4, 16),
          visibility: "it_only",
          source: "portal"
        }
      ],
      updatedAt: ts(-1, 9)
    },
    {
      id: "ticket-demo-2403",
      key: "NEX-2403",
      title: "Battery variant workflow template for Lulea line",
      typeId: "feature_request",
      state: "jira_draft",
      pru: "DL",
      site: "Luleå",
      product: "DIDRIK",
      module: "Workflow Templates",
      priority: "2 - Medium",
      risk: "Low",
      slaLabel: "10d response target",
      slaState: "healthy",
      description:
        "Lulea battery line needs a dedicated variant workflow template with export-control checkpoints before release.",
      dynamicFields: {
        businessValue: "Reduce manual variant approval steps by 30%",
        targetRelease: "2026.09"
      },
      workflow: buildWorkflow("NEX-2403", [
        {
          id: "global-po",
          label: "Global PO Intake",
          ownerRole: "global_product_owner",
          ownerName: owners.sara,
          status: "complete"
        },
        {
          id: "business-architecture",
          label: "Business Architecture",
          ownerRole: "business_architect",
          ownerName: owners.sara,
          status: "complete"
        },
        {
          id: "solution-architecture",
          label: "Solution Architecture",
          ownerRole: "solution_architect",
          ownerName: owners.oskar,
          status: "complete"
        },
        {
          id: "developer-estimate",
          label: "Developer Estimate",
          ownerRole: "developer",
          ownerName: owners.jonas,
          status: "complete"
        },
        {
          id: "release-gate",
          label: "Release Gate",
          ownerRole: "release_manager",
          ownerName: owners.erik,
          status: "active",
          dueAt: ts(0, 17)
        }
      ]),
      participants: [],
      clarifications: [],
      escalations: [],
      jiraDraft: {
        summary: "Battery variant workflow template for Lulea line",
        description: "Dedicated variant workflow with export-control checkpoints.",
        releaseNote: "Adds Lulea battery variant workflow template with export-control gates.",
        project: "VAR",
        board: "Variant Manager board",
        backlog: "Portfolio intake",
        fixVersion: "2026.09",
        fixVersionReleaseDate: "2026-09-15",
        components: ["Workflow Templates"],
        labels: ["nexus-draft", "lulea", "export-control"],
        priority: "2 - Medium",
        estimateHours: 40,
        remainingHours: 40,
        storyPoints: 8,
        assignee: owners.jonas,
        status: "ready_to_create",
        followUpStatus: "not_created"
      },
      attachments: [],
      audit: [
        {
          id: "audit-2403-ready",
          eventType: "Jira draft ready",
          actor: owners.erik,
          createdAt: ts(-1, 15),
          visibility: "approvers_only",
          newValue: "ready_to_create"
        }
      ],
      comments: [
        {
          id: "comment-2403-1",
          author: owners.jonas,
          role: "Developer",
          body: "Estimate includes template authoring, validation rules, and export-control integration.",
          createdAt: ts(-2, 13),
          visibility: "public",
          source: "portal"
        }
      ],
      updatedAt: ts(-1, 15)
    },
    {
      id: "ticket-demo-2404",
      key: "NEX-2404",
      title: "Shop-floor metrics dashboard unavailable in Angers",
      typeId: "incident",
      state: "escalated",
      pru: "ME",
      site: "Global",
      product: "IIoT",
      module: "Shop-floor Metrics",
      priority: "0 - Highest",
      risk: "Critical",
      slaLabel: "2d response target",
      slaState: "breach",
      description:
        "Production supervisors in Angers cannot access shop-floor metrics dashboards since 06:00 CET. KPI tiles show stale data and refresh fails.",
      dynamicFields: {
        incidentStart: "2026-07-17 06:00",
        affectedLines: "Powertrain lines 1-3",
        workaround: "Manual CSV export from historian"
      },
      workflow: buildWorkflow("NEX-2404", [
        {
          id: "it-triage",
          label: "IT Triage",
          ownerRole: "it_reviewer",
          ownerName: owners.karin,
          status: "complete",
          dueAt: ts(-1, 8)
        },
        {
          id: "security-review",
          label: "Security Check",
          ownerRole: "security_reviewer",
          ownerName: owners.nina,
          status: "complete",
          parallelGroup: "incident-review"
        },
        {
          id: "release-gate",
          label: "Release Decision",
          ownerRole: "release_manager",
          ownerName: owners.erik,
          status: "blocked",
          slaState: "breach",
          parallelGroup: "incident-review",
          dueAt: ts(-1, 12)
        }
      ]),
      participants: [],
      clarifications: [],
      escalations: [
        {
          id: "escalation-2404-1",
          type: "sla",
          severity: "critical",
          reason: "Dashboard outage exceeds incident response SLA",
          impact: "Production KPI visibility lost for 3 lines",
          urgency: "Immediate",
          requestedAction: "Management decision on emergency patch window",
          mitigationPlan: "Restore read-only cached dashboard while root cause is investigated",
          decisionMaker: owners.erik,
          dueAt: ts(0, 14),
          status: "decision_pending",
          createdBy: owners.maja,
          createdAt: ts(-1, 13),
          statusNote: "Awaiting release manager decision on hotfix approval.",
          actionItems: [
            { id: "action-2404-1", label: "Confirm historian connectivity", done: true },
            { id: "action-2404-2", label: "Approve emergency release window", done: false }
          ]
        }
      ],
      jiraDraft: {
        summary: "Shop-floor metrics dashboard unavailable in Angers",
        project: "ANL",
        board: "Production Analytics board",
        backlog: "Incident intake",
        components: ["Shop-floor Metrics"],
        labels: ["nexus-draft", "incident", "angers"],
        priority: "0 - Highest",
        status: "estimation_review",
        followUpStatus: "not_created"
      },
      attachments: [],
      audit: [
        {
          id: "audit-2404-escalation",
          eventType: "Escalation opened",
          actor: owners.maja,
          createdAt: ts(-1, 13),
          visibility: "approvers_only",
          reason: "SLA breach on incident response"
        }
      ],
      comments: [
        {
          id: "comment-2404-1",
          author: owners.karin,
          role: "IT Reviewer",
          body: "Initial triage points to telemetry ingestion lag after nightly maintenance.",
          createdAt: ts(-1, 8, 45),
          visibility: "it_only",
          source: "portal"
        }
      ],
      updatedAt: ts(-1, 13)
    },
    {
      id: "ticket-demo-2405",
      key: "NEX-2405",
      title: "Extend evidence retention for calibration audits",
      typeId: "support_request",
      state: "jira_synced",
      pru: "DM",
      site: "Global",
      product: "PROMO",
      module: "Evidence Store",
      priority: "3 - Low",
      risk: "Low",
      slaLabel: "15d response target",
      slaState: "healthy",
      description:
        "Quality team requested longer retention for calibration audit evidence to support ISO audits.",
      dynamicFields: {
        retentionPeriod: "24 months",
        storageImpact: "Approx. 120 GB additional"
      },
      relatedJiraKey: "CAL-4821",
      workflow: buildWorkflow("NEX-2405", [
        {
          id: "local-po",
          label: "Local PO Review",
          ownerRole: "local_product_owner",
          ownerName: owners.maja,
          status: "complete"
        },
        {
          id: "global-po",
          label: "Global PO Review",
          ownerRole: "global_product_owner",
          ownerName: owners.sara,
          status: "complete"
        },
        {
          id: "developer-estimate",
          label: "Developer Estimate",
          ownerRole: "developer",
          ownerName: owners.jonas,
          status: "complete"
        },
        {
          id: "release-gate",
          label: "Release Gate",
          ownerRole: "release_manager",
          ownerName: owners.erik,
          status: "complete"
        }
      ]),
      participants: [],
      clarifications: [],
      escalations: [],
      jiraDraft: {
        summary: "Extend evidence retention for calibration audits",
        project: "CAL",
        board: "Calibration Hub board",
        backlog: "Governance intake",
        fixVersion: "2026.07",
        components: ["Evidence Store"],
        labels: ["nexus-synced", "retention"],
        priority: "3 - Low",
        estimateHours: 16,
        remainingHours: 8,
        status: "synced",
        syncedStatus: "In Progress",
        followUpStatus: "in_progress",
        followUpUpdatedAt: ts(-2, 10)
      },
      attachments: [],
      audit: [
        {
          id: "audit-2405-jira",
          eventType: "Jira issue created",
          actor: owners.erik,
          createdAt: ts(-3, 11),
          visibility: "public",
          newValue: "CAL-4821"
        }
      ],
      comments: [
        {
          id: "comment-2405-jira-1",
          author: "Jira Sync",
          role: "System",
          body: "Jira issue CAL-4821 created and linked to this ticket.",
          createdAt: ts(-3, 11, 5),
          visibility: "public",
          source: "system"
        },
        {
          id: "comment-2405-jira-2",
          author: owners.jonas,
          role: "Developer",
          body: "Storage policy update in progress on CAL-4821.",
          createdAt: ts(-2, 10),
          visibility: "public",
          source: "jira"
        }
      ],
      updatedAt: ts(-2, 10)
    },
    {
      id: "ticket-demo-2406",
      key: "NEX-2406",
      title: "Document Perspective support runbook for Luleå",
      typeId: "task",
      state: "intake",
      pru: "DL",
      site: "Luleå",
      product: "IIoT",
      module: "Perspective Support",
      priority: "4 - Lowest",
      risk: "Low",
      slaLabel: "20d response target",
      slaState: "healthy",
      description: "Create an operations runbook for Perspective support handover at Oskarshamn plant.",
      dynamicFields: {
        deliverable: "Runbook document",
        targetAudience: "Plant IT support"
      },
      workflow: buildWorkflow("NEX-2406", [
        {
          id: "local-po",
          label: "Local PO Review",
          ownerRole: "local_product_owner",
          ownerName: owners.maja,
          status: "active",
          dueAt: ts(2, 12)
        },
        {
          id: "global-po",
          label: "Global PO Review",
          ownerRole: "global_product_owner",
          ownerName: owners.sara,
          status: "waiting"
        },
        {
          id: "developer-estimate",
          label: "Developer Estimate",
          ownerRole: "developer",
          ownerName: owners.jonas,
          status: "waiting"
        },
        {
          id: "release-gate",
          label: "Release Gate",
          ownerRole: "release_manager",
          ownerName: owners.erik,
          status: "waiting"
        }
      ]),
      participants: [],
      clarifications: [],
      escalations: [],
      jiraDraft: {
        summary: "Document Perspective support runbook for Oskarshamn",
        project: "PLANT",
        board: "Plant Portal board",
        backlog: "Governance intake",
        components: ["Perspective Support"],
        labels: ["nexus-draft", "documentation"],
        priority: "4 - Lowest",
        status: "metadata_loaded",
        followUpStatus: "not_created"
      },
      attachments: [],
      audit: [
        {
          id: "audit-2406-created",
          eventType: "Ticket created",
          actor: owners.requester,
          createdAt: ts(0, 8),
          visibility: "admin_only",
          newValue: "NEX-2406"
        }
      ],
      comments: [
        {
          id: "comment-2406-1",
          author: owners.requester,
          role: "User",
          body: "Draft outline attached in description. Needs PO validation before work starts.",
          createdAt: ts(0, 8, 20),
          visibility: "public",
          source: "portal"
        }
      ],
      updatedAt: ts(0, 8)
    },
    {
      id: "ticket-demo-2407",
      key: "NEX-2407",
      title: "Permissions report export missing site filter",
      typeId: "bug",
      state: "approval",
      pru: "ME",
      site: "Global",
      product: "IIoT",
      module: "Permissions",
      priority: "2 - Medium",
      risk: "Medium",
      slaLabel: "10d response target",
      slaState: "healthy",
      description:
        "The permissions report export ignores the selected site filter and returns all sites, causing incorrect access reviews.",
      dynamicFields: {
        reportName: "Permissions audit export",
        expectedBehavior: "Export only selected site rows"
      },
      workflow: buildWorkflow("NEX-2407", [
        {
          id: "local-po",
          label: "Local PO Review",
          ownerRole: "local_product_owner",
          ownerName: owners.maja,
          status: "complete"
        },
        {
          id: "global-po",
          label: "Global PO Review",
          ownerRole: "global_product_owner",
          ownerName: owners.sara,
          status: "complete"
        },
        {
          id: "developer-estimate",
          label: "Developer Estimate",
          ownerRole: "developer",
          ownerName: owners.jonas,
          status: "active",
          dueAt: ts(1, 11)
        },
        {
          id: "release-gate",
          label: "Release Gate",
          ownerRole: "release_manager",
          ownerName: owners.erik,
          status: "waiting"
        }
      ]),
      participants: [],
      clarifications: [],
      escalations: [],
      jiraDraft: {
        summary: "Permissions report export missing site filter",
        project: "ANL",
        board: "Production Analytics board",
        backlog: "Governance intake",
        fixVersion: "2026.07",
        components: ["Permissions"],
        labels: ["nexus-draft", "reporting"],
        priority: "2 - Medium",
        estimateHours: 12,
        status: "estimation_review",
        followUpStatus: "not_created"
      },
      attachments: [],
      audit: [],
      comments: [],
      updatedAt: ts(-1, 16)
    }
  ];
}
