#!/usr/bin/env node

const baseUrl = (process.env.NEXUS_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const limit = Number(process.env.OUTBOX_BATCH_LIMIT || 10);

const response = await fetch(`${baseUrl}/api/outbox/process`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "process", limit })
});

const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error("Outbox process failed.", response.status, payload);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      claimed: payload?.data?.claimed ?? 0,
      pending: payload?.data?.pending ?? 0,
      results: payload?.data?.results ?? []
    },
    null,
    2
  )
);
