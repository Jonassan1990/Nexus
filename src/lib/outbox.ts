export type OutboxJobType = "email_notification" | "jira_sync" | "jira_create" | "jira_update";

export type OutboxJobStatus = "pending" | "processing" | "completed" | "failed" | "dead";

export type OutboxJob = {
  id: string;
  type: OutboxJobType;
  status: OutboxJobStatus;
  payload: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type OutboxEnqueueInput = {
  type: OutboxJobType;
  payload: unknown;
  maxAttempts?: number;
  availableAt?: string;
};

export function createOutboxJobId(type: OutboxJobType): string {
  return `outbox-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
