import { NextRequest, NextResponse } from "next/server";
import {
  claimOutboxJobs,
  completeOutboxJob,
  enqueueOutboxJob,
  failOutboxJob,
  listOutboxJobs
} from "@/lib/local-database";
import type { OutboxEnqueueInput } from "@/lib/outbox";
import { processOutboxJob } from "@/lib/outbox-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    data: {
      jobs: listOutboxJobs(40)
    }
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: "enqueue" | "process";
    job?: OutboxEnqueueInput;
    limit?: number;
  };

  if (body.action === "enqueue") {
    if (!body.job?.type || body.job.payload === undefined) {
      return NextResponse.json(
        { error: { code: "invalid_job", message: "type and payload are required." } },
        { status: 400 }
      );
    }

    const job = enqueueOutboxJob(body.job);
    return NextResponse.json({ data: { job } }, { status: 202 });
  }

  const claimed = claimOutboxJobs(Math.min(Math.max(body.limit ?? 10, 1), 50));
  const results: Array<{ id: string; status: "completed" | "failed"; error?: string }> = [];

  for (const job of claimed) {
    try {
      await processOutboxJob(job);
      completeOutboxJob(job.id);
      results.push({ id: job.id, status: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown outbox failure.";
      failOutboxJob(job.id, message);
      results.push({ id: job.id, status: "failed", error: message });
    }
  }

  return NextResponse.json({
    data: {
      claimed: claimed.length,
      results,
      pending: listOutboxJobs(100).filter((job) => job.status === "pending").length
    }
  });
}
