import { NextRequest, NextResponse } from "next/server";
import { requireAdminPrincipal } from "@/lib/auth/api-auth";
import {
  claimOutboxJobs,
  completeOutboxJob,
  enqueueOutboxJob,
  failOutboxJob,
  listOutboxJobs
} from "@/lib/database";
import type { OutboxEnqueueInput } from "@/lib/outbox";
import { processOutboxJob } from "@/lib/outbox-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const principal = await requireAdminPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  return NextResponse.json({
    data: {
      jobs: await listOutboxJobs(40)
    }
  });
}

export async function POST(request: NextRequest) {
  const principal = await requireAdminPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

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

    const job = await enqueueOutboxJob(body.job);
    return NextResponse.json({ data: { job } }, { status: 202 });
  }

  const claimed = await claimOutboxJobs(Math.min(Math.max(body.limit ?? 10, 1), 50));
  const results: Array<{ id: string; status: "completed" | "failed"; error?: string }> = [];

  for (const job of claimed) {
    try {
      await processOutboxJob(job);
      await completeOutboxJob(job.id);
      results.push({ id: job.id, status: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown outbox failure.";
      await failOutboxJob(job.id, message);
      results.push({ id: job.id, status: "failed", error: message });
    }
  }

  return NextResponse.json({
    data: {
      claimed: claimed.length,
      results,
      pending: (await listOutboxJobs(100)).filter((job) => job.status === "pending").length
    }
  });
}
