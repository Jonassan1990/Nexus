/**
 * Seed operational knowledge catalog — runbooks / SOPs used by the Knowledge module.
 * Replace with API persistence in a later migration wave.
 */

import type { KnowledgeArticle, KnowledgeCategory, KnowledgeTreeNode } from "./types";

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  {
    id: "ops",
    label: "Operations",
    description: "Day-to-day support runbooks and handovers."
  },
  {
    id: "escalation",
    label: "Escalation",
    parentId: "ops",
    description: "When and how to escalate incidents."
  },
  {
    id: "release",
    label: "Release",
    description: "Release readiness and cutover procedures."
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Jira, SMTP, and platform integration playbooks."
  },
  {
    id: "governance",
    label: "Governance",
    description: "Policies, approvals, and quality actions."
  }
];

function basePermissions(canWrite: boolean) {
  return {
    read: true,
    edit: canWrite,
    review: canWrite,
    publish: canWrite,
    manage_attachments: canWrite
  };
}

export function buildKnowledgeCatalog(canWrite = false): KnowledgeArticle[] {
  const permissions = basePermissions(canWrite);

  return [
    {
      id: "kb-perspective-lulea",
      key: "KB-OPS-001",
      title: "Perspective support runbook — Luleå",
      summary: "Handover steps for Perspective incidents at Luleå plant.",
      body: [
        "## Purpose",
        "Stabilize Perspective support handovers for Luleå without waiting on tribal knowledge.",
        "",
        "## First response",
        "1. Confirm site, PRU, and product from the ticket.",
        "2. Check open clarifications before changing ownership.",
        "3. Attach the latest Perspective dump if the requester has not.",
        "",
        "## Escalate when",
        "- Production stop lasting more than 30 minutes",
        "- Safety interlock false trip",
        "- No local PO acknowledgement within one business hour",
        "",
        "## Closeout",
        "Update the ticket timeline, link related KB articles, and mark the runbook version used."
      ].join("\n"),
      kind: "runbook",
      status: "published",
      categoryId: "ops",
      categoryLabel: "Operations",
      tags: ["perspective", "lulea", "handover"],
      owner: { name: "Local PO — Luleå", role: "local_po" },
      product: "Perspective",
      site: "Luleå",
      updatedAt: "2026-07-20 09:14",
      publishedAt: "2026-06-02 11:00",
      version: "1.2",
      versions: [
        {
          id: "v1",
          version: "1.0",
          summary: "Initial plant handover",
          author: "Local PO — Luleå",
          createdAt: "2026-05-12 10:00",
          status: "deprecated"
        },
        {
          id: "v2",
          version: "1.1",
          summary: "Added escalation timers",
          author: "Support Lead",
          createdAt: "2026-06-02 11:00",
          status: "deprecated"
        },
        {
          id: "v3",
          version: "1.2",
          summary: "Clarification check before reassignment",
          author: "Support Lead",
          createdAt: "2026-07-20 09:14",
          status: "published"
        }
      ],
      timeline: [
        {
          id: "t1",
          title: "Published",
          detail: "Approved for Luleå operations",
          actor: "Support Lead",
          at: "2026-06-02 11:00",
          tone: "success"
        },
        {
          id: "t2",
          title: "Revised",
          detail: "Clarification gate added",
          actor: "Support Lead",
          at: "2026-07-20 09:14",
          tone: "info"
        }
      ],
      attachments: [
        {
          id: "a1",
          fileName: "lulea-perspective-checklist.pdf",
          mimeType: "application/pdf",
          sizeLabel: "184 KB",
          uploadedBy: "Support Lead",
          uploadedAt: "2026-07-20 09:10"
        }
      ],
      relatedIds: ["kb-escalate-critical", "kb-oskarshamn-runbook"],
      reviews: [],
      permissions,
      aiContext: {
        suggestedQueries: ["Perspective false trip Luleå", "Who owns Perspective at Luleå?"],
        lastIndexedAt: "2026-07-27 18:00"
      }
    },
    {
      id: "kb-oskarshamn-runbook",
      key: "KB-OPS-002",
      title: "Perspective support runbook — Oskarshamn",
      summary: "Operations runbook for Perspective support handover at Oskarshamn.",
      body: [
        "## Purpose",
        "Provide a single operational path for Perspective incidents at Oskarshamn.",
        "",
        "## Intake",
        "Capture shift, line, and last known good state before escalating.",
        "",
        "## Handover",
        "Ping Local PO and attach the Perspective diagnostics pack."
      ].join("\n"),
      kind: "runbook",
      status: "published",
      categoryId: "ops",
      categoryLabel: "Operations",
      tags: ["perspective", "oskarshamn"],
      owner: { name: "Local PO — Oskarshamn", role: "local_po" },
      product: "Perspective",
      site: "Oskarshamn",
      updatedAt: "2026-07-18 14:22",
      publishedAt: "2026-06-18 09:30",
      version: "1.0",
      versions: [
        {
          id: "v1",
          version: "1.0",
          summary: "Initial publish",
          author: "Local PO — Oskarshamn",
          createdAt: "2026-06-18 09:30",
          status: "published"
        }
      ],
      timeline: [
        {
          id: "t1",
          title: "Published",
          actor: "Local PO — Oskarshamn",
          at: "2026-06-18 09:30",
          tone: "success"
        }
      ],
      attachments: [],
      relatedIds: ["kb-perspective-lulea"],
      reviews: [],
      permissions,
      aiContext: {
        suggestedQueries: ["Oskarshamn Perspective handover"]
      }
    },
    {
      id: "kb-escalate-critical",
      key: "KB-ESC-010",
      title: "Critical incident escalation ladder",
      summary: "Who to notify and when for Critical priority tickets.",
      body: [
        "## Rule",
        "Critical tickets must reach an execution owner within 15 minutes.",
        "",
        "## Ladder",
        "1. Assigned Local PO",
        "2. Product owner for the PRU",
        "3. Governance on-call",
        "",
        "## Evidence",
        "Record each rung in the ticket timeline before changing status."
      ].join("\n"),
      kind: "sop",
      status: "published",
      categoryId: "escalation",
      categoryLabel: "Escalation",
      tags: ["critical", "sla", "on-call"],
      owner: { name: "Governance Lead", role: "admin" },
      updatedAt: "2026-07-10 08:00",
      publishedAt: "2026-04-01 12:00",
      version: "2.1",
      versions: [
        {
          id: "v1",
          version: "2.0",
          summary: "Aligned to 15-minute SLA",
          author: "Governance Lead",
          createdAt: "2026-04-01 12:00",
          status: "deprecated"
        },
        {
          id: "v2",
          version: "2.1",
          summary: "Added evidence requirement",
          author: "Governance Lead",
          createdAt: "2026-07-10 08:00",
          status: "published"
        }
      ],
      timeline: [
        {
          id: "t1",
          title: "Policy refresh",
          detail: "Evidence rung mandatory",
          actor: "Governance Lead",
          at: "2026-07-10 08:00",
          tone: "info"
        }
      ],
      attachments: [
        {
          id: "a1",
          fileName: "on-call-contacts.csv",
          mimeType: "text/csv",
          sizeLabel: "12 KB",
          uploadedBy: "Governance Lead",
          uploadedAt: "2026-07-10 07:55"
        }
      ],
      relatedIds: ["kb-perspective-lulea"],
      reviews: [],
      permissions
    },
    {
      id: "kb-jira-sync-playbook",
      key: "KB-INT-004",
      title: "Jira sync failure playbook",
      summary: "Recover when Nexus ↔ Jira sync stalls or duplicates comments.",
      body: [
        "## Symptoms",
        "- Ticket shows stale Jira status",
        "- Duplicate imported comments",
        "",
        "## Recover",
        "1. Open Jira Sync module for the ticket.",
        "2. Re-run activity sync once.",
        "3. If still stale, verify product Jira mapping in Admin.",
        "",
        "## Do not",
        "Do not manually invent Jira keys in ticket fields."
      ].join("\n"),
      kind: "howto",
      status: "in_review",
      categoryId: "integrations",
      categoryLabel: "Integrations",
      tags: ["jira", "sync"],
      owner: { name: "Integrations Admin", role: "admin" },
      reviewers: [{ name: "Execution Lead", role: "execution" }],
      updatedAt: "2026-07-26 16:40",
      version: "0.9",
      versions: [
        {
          id: "v1",
          version: "0.9",
          summary: "Draft for review",
          author: "Integrations Admin",
          createdAt: "2026-07-26 16:40",
          status: "in_review"
        }
      ],
      timeline: [
        {
          id: "t1",
          title: "Submitted for review",
          actor: "Integrations Admin",
          at: "2026-07-26 16:40",
          tone: "warning"
        }
      ],
      attachments: [],
      relatedIds: [],
      reviews: [
        {
          id: "r1",
          label: "Technical accuracy",
          detail: "Confirm rematch steps against current Jira Sync UI",
          state: "pending",
          reviewer: "Execution Lead",
          dueAt: "2026-07-30"
        }
      ],
      permissions
    },
    {
      id: "kb-release-cutover",
      key: "KB-REL-003",
      title: "Release cutover checklist",
      summary: "Pre-prod and production cutover gates for release owners.",
      body: [
        "## Before pre-prod",
        "- All Critical tickets for the fix version are Done or explicitly deferred",
        "- Attachments required for change evidence are stored",
        "",
        "## Production",
        "Use the Release Plan module as the system of record for dates."
      ].join("\n"),
      kind: "sop",
      status: "draft",
      categoryId: "release",
      categoryLabel: "Release",
      tags: ["release", "cutover"],
      owner: { name: "Release Manager", role: "execution" },
      updatedAt: "2026-07-27 11:05",
      version: "0.3",
      versions: [
        {
          id: "v1",
          version: "0.3",
          summary: "Draft checklist",
          author: "Release Manager",
          createdAt: "2026-07-27 11:05",
          status: "draft"
        }
      ],
      timeline: [
        {
          id: "t1",
          title: "Draft created",
          actor: "Release Manager",
          at: "2026-07-27 11:05",
          tone: "neutral"
        }
      ],
      attachments: [],
      relatedIds: ["kb-escalate-critical"],
      reviews: [],
      permissions
    },
    {
      id: "kb-approval-evidence",
      key: "KB-GOV-007",
      title: "Approval evidence standard",
      summary: "What evidence must accompany governance approvals.",
      body: [
        "## Required",
        "- Linked ticket key",
        "- Decision rationale (one short paragraph)",
        "- Attachments when materials were requested",
        "",
        "## Forbidden",
        "Approving with only a Jira status change and no Nexus record."
      ].join("\n"),
      kind: "policy",
      status: "published",
      categoryId: "governance",
      categoryLabel: "Governance",
      tags: ["approvals", "evidence"],
      owner: { name: "Governance Lead", role: "admin" },
      updatedAt: "2026-05-30 13:00",
      publishedAt: "2026-05-30 13:00",
      version: "1.0",
      versions: [
        {
          id: "v1",
          version: "1.0",
          summary: "Initial standard",
          author: "Governance Lead",
          createdAt: "2026-05-30 13:00",
          status: "published"
        }
      ],
      timeline: [
        {
          id: "t1",
          title: "Published",
          actor: "Governance Lead",
          at: "2026-05-30 13:00",
          tone: "success"
        }
      ],
      attachments: [],
      relatedIds: [],
      reviews: [],
      permissions
    }
  ];
}

export function buildKnowledgeTree(
  categories: readonly KnowledgeCategory[],
  articles: readonly KnowledgeArticle[]
): KnowledgeTreeNode[] {
  const byParent = new Map<string | undefined, KnowledgeCategory[]>();

  for (const category of categories) {
    const list = byParent.get(category.parentId) ?? [];
    list.push(category);
    byParent.set(category.parentId, list);
  }

  function buildCategoryNode(category: KnowledgeCategory): KnowledgeTreeNode {
    const childCategories = (byParent.get(category.id) ?? []).map(buildCategoryNode);
    const categoryArticles = articles
      .filter((article) => article.categoryId === category.id)
      .map(
        (article): KnowledgeTreeNode => ({
          id: `article:${article.id}`,
          label: article.title,
          kind: "article",
          parentId: category.id,
          articleId: article.id,
          status: article.status
        })
      );

    return {
      id: category.id,
      label: category.label,
      kind: "category",
      parentId: category.parentId,
      count: categoryArticles.length + childCategories.reduce((sum, node) => sum + (node.count ?? 0), 0),
      children: [...childCategories, ...categoryArticles]
    };
  }

  return (byParent.get(undefined) ?? []).map(buildCategoryNode);
}
