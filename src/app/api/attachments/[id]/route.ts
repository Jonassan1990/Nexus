import { NextRequest, NextResponse } from "next/server";
import { canAccessTicket, requireApiPrincipal } from "@/lib/auth/api-auth";
import {
  deleteAttachmentObject,
  createAttachmentDownloadUrl,
  parseAttachmentDataUrl,
  readAttachmentObjectBytes
} from "@/lib/attachment-storage";
import { listTickets, saveTicket } from "@/lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const request = _request;
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const attachmentId = (await context.params).id.trim();
  const rawRequested = request.nextUrl.searchParams.get("raw") === "1";

  if (!attachmentId) {
    return jsonError(400, "validation_failed", "Attachment id is required.");
  }

  const tickets = await listTickets();
  const ticket = tickets.find((candidate) => candidate.attachments.some((attachment) => attachment.id === attachmentId));
  const attachment = ticket?.attachments.find((candidate) => candidate.id === attachmentId);

  if (!ticket || !attachment) {
    return jsonError(404, "attachment_not_found", "The attachment could not be found.");
  }

  if (!canAccessTicket(ticket, principal)) {
    return jsonError(403, "forbidden", "You do not have access to this attachment.");
  }

  if (rawRequested && attachment.s3Key) {
    const bytes = await readAttachmentObjectBytes(attachment.s3Key);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${attachment.fileName.replace(/"/g, '\\"')}"`,
        "Cache-Control": "no-store, max-age=0"
      }
    });
  }

  if (attachment.contentDataUrl?.trim()) {
    const decoded = parseAttachmentDataUrl(attachment.contentDataUrl.trim());

    if (!decoded) {
      return jsonError(500, "attachment_unavailable", "Stored attachment content could not be decoded.");
    }

    const response = new Response(new Uint8Array(decoded.content), {
      status: 200,
      headers: {
        "Content-Type": decoded.mimeType || attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/"/g, '\\"')}"`,
        "Cache-Control": "no-store, max-age=0"
      }
    });

    return response;
  }

  const downloadUrl = attachment.downloadUrl
    ? attachment.downloadUrl
    : attachment.s3Key
      ? await createAttachmentDownloadUrl({
          s3Key: attachment.s3Key,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          download: true
        })
      : "";

  if (!downloadUrl) {
    return jsonError(404, "attachment_unavailable", "The attachment does not have a downloadable source.");
  }

  return NextResponse.redirect(downloadUrl, 302);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const principal = await requireApiPrincipal(_request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  const attachmentId = (await context.params).id.trim();

  if (!attachmentId) {
    return jsonError(400, "validation_failed", "Attachment id is required.");
  }

  const tickets = await listTickets();
  const ticket = tickets.find((candidate) => candidate.attachments.some((attachment) => attachment.id === attachmentId));
  const attachment = ticket?.attachments.find((candidate) => candidate.id === attachmentId);

  if (!ticket || !attachment) {
    return jsonError(404, "attachment_not_found", "The attachment could not be found.");
  }

  if (!canAccessTicket(ticket, principal)) {
    return jsonError(403, "forbidden", "You do not have access to this attachment.");
  }

  const nextTicket = {
    ...ticket,
    attachments: ticket.attachments.filter((candidate) => candidate.id !== attachmentId),
    updatedAt: new Date().toISOString()
  };

  await saveTicket(nextTicket);

  if (attachment.s3Key) {
    await deleteAttachmentObject(attachment.s3Key);
  }

  return NextResponse.json(
    {
      data: {
        deleted: true,
        attachmentId,
        ticketId: ticket.id,
        ticketKey: ticket.key
      }
    },
    { status: 200 }
  );
}
