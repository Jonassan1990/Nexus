import type { OutboxJob } from "@/lib/outbox";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Local/AWS worker handler for claimed outbox jobs.
 * Email/Jira side effects stay server-side; AWS can replace the SMTP/Jira calls
 * with secret-backed clients without changing the queue contract.
 */
export async function processOutboxJob(job: OutboxJob): Promise<void> {
  let payload: unknown;

  try {
    payload = JSON.parse(job.payload);
  } catch {
    throw new Error("Outbox payload is not valid JSON.");
  }

  if (!isRecord(payload)) {
    throw new Error("Outbox payload must be a JSON object.");
  }

  if (job.type === "email_notification") {
    if (!isRecord(payload.message) || !Array.isArray(payload.message.to)) {
      throw new Error("Email outbox jobs require message.to recipients.");
    }

    if (typeof payload.message.subject !== "string" || !payload.message.subject.trim()) {
      throw new Error("Email outbox jobs require a subject.");
    }

    // Production worker (AWS) should call SMTP with vault secrets here.
    // Locally we validate the contract so the queue is exercisable end-to-end.
    return;
  }

  if (job.type === "jira_sync" || job.type === "jira_create" || job.type === "jira_update") {
    if (typeof payload.ticketKey !== "string" || !payload.ticketKey.trim()) {
      throw new Error("Jira outbox jobs require ticketKey.");
    }

    return;
  }

  throw new Error(`Unsupported outbox job type: ${job.type}`);
}
