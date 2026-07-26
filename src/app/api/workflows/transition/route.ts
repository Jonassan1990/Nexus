import { NextRequest, NextResponse } from "next/server";
import { canAccessTicket, requireApiPrincipal } from "@/lib/auth/api-auth";
import { getTicketByKeyFromDatabase, saveTicket } from "@/lib/database";
import { evaluateTransition, type TransitionRequest } from "@/lib/workflow-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const payload = (await request.json().catch(() => null)) as TransitionRequest | null;

  if (!payload) {
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

  const ticket = await getTicketByKeyFromDatabase(payload.ticketKey);

  if (!ticket) {
    return NextResponse.json(
      {
        error: {
          code: "ticket_not_found",
          message: `Ticket ${payload.ticketKey} was not found.`
        }
      },
      { status: 404 }
    );
  }

  if (!canAccessTicket(ticket, principal)) {
    return NextResponse.json(
      {
        error: {
          code: "forbidden",
          message: "You do not have access to this ticket."
        }
      },
      { status: 403 }
    );
  }

  const result = evaluateTransition(ticket, payload);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "transition_denied",
          message: "Workflow transition is not allowed.",
          details: result.errors
        }
      },
      { status: 409 }
    );
  }

  const updatedTicket = {
    ...ticket,
    state: payload.targetState,
    updatedAt: new Date().toISOString(),
    audit: result.auditEntry ? [...ticket.audit, result.auditEntry] : ticket.audit
  };

  await saveTicket(updatedTicket);

  return NextResponse.json({
    data: {
      transitionAccepted: true,
      auditEntry: result.auditEntry,
      ticket: updatedTicket
    }
  });
}
