import type { AuditEntry, Ticket, TicketState, WorkflowStepStatus } from "./types";

export interface TransitionRequest {
  ticketKey: string;
  targetState: TicketState;
  actor: string;
  reason: string;
}

export interface TransitionResult {
  allowed: boolean;
  errors: string[];
  auditEntry?: AuditEntry;
}

const allowedTransitions: Record<TicketState, TicketState[]> = {
  intake: ["clarification", "approval", "escalated", "closed"],
  clarification: ["approval", "intake", "escalated", "closed"],
  approval: ["clarification", "jira_draft", "escalated", "closed"],
  jira_draft: ["approval", "jira_synced", "escalated", "closed"],
  jira_synced: ["closed", "escalated"],
  escalated: ["clarification", "approval", "jira_draft", "jira_synced", "closed"],
  closed: []
};

export function evaluateTransition(ticket: Ticket, request: TransitionRequest): TransitionResult {
  const errors: string[] = [];

  if (ticket.key !== request.ticketKey) {
    errors.push("Ticket key does not match the supplied ticket.");
  }

  if (!request.actor.trim()) {
    errors.push("Actor is required.");
  }

  if (!request.reason.trim()) {
    errors.push("A reason is required for audit history.");
  }

  if (!allowedTransitions[ticket.state].includes(request.targetState)) {
    errors.push(`Transition from ${ticket.state} to ${request.targetState} is not allowed.`);
  }

  if (request.targetState === "jira_synced" && ticket.jiraDraft.status !== "ready_to_create") {
    errors.push("Jira draft must pass estimation and release gates before sync.");
  }

  const activeRequiredSteps = ticket.workflow.filter(
    (step) => step.status === "active" || step.status === "blocked"
  );

  if (request.targetState === "jira_draft" && activeRequiredSteps.length > 0) {
    errors.push("Active or blocked workflow steps must be resolved before Jira draft gate.");
  }

  if (errors.length > 0) {
    return {
      allowed: false,
      errors
    };
  }

  return {
    allowed: true,
    errors: [],
    auditEntry: {
      id: `audit-${ticket.key}-${Date.now()}`,
      eventType: "Status changed",
      actor: request.actor,
      createdAt: new Date().toISOString(),
      visibility: "admin_only",
      oldValue: ticket.state,
      newValue: request.targetState,
      reason: request.reason
    }
  };
}

export function summarizeWorkflowHealth(ticket: Ticket): {
  completed: number;
  active: number;
  blocked: number;
  waiting: number;
  total: number;
} {
  return ticket.workflow.reduce(
    (summary, step) => {
      summary.total += 1;

      if (step.status === "complete") {
        summary.completed += 1;
      } else if (step.status === "active") {
        summary.active += 1;
      } else if (step.status === "blocked") {
        summary.blocked += 1;
      } else if (step.status === "waiting") {
        summary.waiting += 1;
      }

      return summary;
    },
    {
      completed: 0,
      active: 0,
      blocked: 0,
      waiting: 0,
      total: 0
    }
  );
}

export function nextActionLabel(status: WorkflowStepStatus): string {
  if (status === "complete") {
    return "Completed";
  }

  if (status === "active") {
    return "Needs action";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  if (status === "delegated") {
    return "Delegated";
  }

  if (status === "optional") {
    return "Optional";
  }

  return "Waiting";
}
