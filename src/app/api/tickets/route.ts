import { NextRequest, NextResponse } from "next/server";
import { getLocalDatabasePath, listTickets, replaceTickets, saveTicket } from "@/lib/local-database";
import { getTicketTypeLabel } from "@/lib/nexus-data";
import { filterVisible } from "@/lib/rbac";
import type { RoleKey, Ticket, TicketState } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isRoleKey(value: string | null): value is RoleKey {
  return value !== null && /^[a-z0-9_-]{2,64}$/i.test(value);
}

function toTicketResponse(ticket: Ticket, role: RoleKey) {
  return {
    ...ticket,
    comments: filterVisible(ticket.comments, role),
    audit: filterVisible(ticket.audit, role)
  };
}

const ticketStates: TicketState[] = [
  "intake",
  "clarification",
  "approval",
  "jira_draft",
  "jira_synced",
  "escalated",
  "closed"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateTicket(value: unknown, index?: number): string[] {
  const prefix = typeof index === "number" ? `tickets[${index}]` : "ticket";
  const errors: string[] = [];

  if (!isRecord(value)) {
    return [`${prefix} must be an object.`];
  }

  const stringFields = [
    "id",
    "key",
    "title",
    "typeId",
    "pru",
    "site",
    "product",
    "module",
    "slaLabel",
    "description",
    "updatedAt"
  ];

  for (const field of stringFields) {
    if (typeof value[field] !== "string" || !value[field].trim()) {
      errors.push(`${prefix}.${field} is required.`);
    }
  }

  if (!ticketStates.includes(value.state as TicketState)) {
    errors.push(`${prefix}.state is invalid.`);
  }

  if (typeof value.priority !== "string" || !value.priority.trim()) {
    errors.push(`${prefix}.priority is required.`);
  }

  if (typeof value.risk !== "string" || !value.risk.trim()) {
    errors.push(`${prefix}.risk is required.`);
  }

  const arrayFields = [
    "workflow",
    "participants",
    "clarifications",
    "escalations",
    "attachments",
    "audit",
    "comments"
  ];

  for (const field of arrayFields) {
    if (!Array.isArray(value[field])) {
      errors.push(`${prefix}.${field} must be an array.`);
    }
  }

  if (!isRecord(value.dynamicFields)) {
    errors.push(`${prefix}.dynamicFields must be an object.`);
  }

  if (!isRecord(value.jiraDraft)) {
    errors.push(`${prefix}.jiraDraft must be an object.`);
  }

  return errors;
}

function getTicketPayload(payload: unknown): unknown {
  if (isRecord(payload) && "ticket" in payload) {
    return payload.ticket;
  }

  return payload;
}

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const role = isRoleKey(searchParams.get("role")) ? searchParams.get("role") : "requester";

  const result = listTickets()
    .filter((ticket) => {
      if (!query) {
        return true;
      }

      return [
        ticket.key,
        ticket.title,
        ticket.product,
        ticket.module,
        ticket.site,
        getTicketTypeLabel(ticket.typeId)
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .map((ticket) => toTicketResponse(ticket, role as RoleKey));

  return NextResponse.json({
    data: result,
    meta: {
      count: result.length,
      role,
      databasePath: getLocalDatabasePath()
    }
  });
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const ticketPayload = getTicketPayload(payload);

  if (!ticketPayload) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_json",
          message: "Request body must be valid JSON."
        }
      },
      { status: 400 }
    );
  }

  const errors = validateTicket(ticketPayload);

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Ticket payload failed validation.",
          details: errors
        }
      },
      { status: 400 }
    );
  }

  const ticket = ticketPayload as Ticket;
  saveTicket(ticket);

  return NextResponse.json(
    {
      data: ticket,
      meta: {
        databasePath: getLocalDatabasePath()
      }
    },
    { status: 201 }
  );
}

export async function PUT(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as { tickets?: unknown } | null;
  const ticketPayloads = payload?.tickets;

  if (!Array.isArray(ticketPayloads)) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "tickets must be an array."
        }
      },
      { status: 400 }
    );
  }

  const errors = ticketPayloads.flatMap((ticket, index) => validateTicket(ticket, index));
  const keys = new Set<string>();

  for (const ticket of ticketPayloads) {
    if (!isRecord(ticket) || typeof ticket.key !== "string") {
      continue;
    }

    if (keys.has(ticket.key)) {
      errors.push(`Duplicate ticket key ${ticket.key}.`);
    }

    keys.add(ticket.key);
  }

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Ticket payload failed validation.",
          details: errors
        }
      },
      { status: 400 }
    );
  }

  replaceTickets(ticketPayloads as Ticket[]);

  return NextResponse.json({
    data: {
      count: ticketPayloads.length
    },
    meta: {
      databasePath: getLocalDatabasePath()
    }
  });
}
