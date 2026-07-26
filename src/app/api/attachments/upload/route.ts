import { createHash, randomUUID } from "node:crypto";
import { Transform, Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteAttachmentObject,
  createAttachmentS3Key,
  getAttachmentBucketName,
  getAttachmentS3Client,
  isPreviewableAttachmentMimeType,
  maxAttachmentUploadBytes,
  sanitizeAttachmentFileName,
} from "@/lib/attachment-storage";
import { requireApiPrincipal, canAccessTicket } from "@/lib/auth/api-auth";
import { listTickets, saveTicket } from "@/lib/database";
import type { Attachment, Ticket } from "@/lib/types";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(status: number, code: string, message: string, details?: string[]) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details?.length ? { details } : {})
      }
    },
    { status }
  );
}

function readChecksum(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function runVirusScanHookPlaceholder(_fileName: string, _mimeType: string, _sizeBytes: number): Promise<void> {
  return Promise.resolve();
}

function buildAttachmentRecord(params: {
  attachmentId: string;
  ticket: Ticket;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedBy: string;
  uploadedAt: string;
  bucketName: string;
  s3Key: string;
  previewAvailable: boolean;
}): Attachment {
  return {
    id: params.attachmentId,
    ticketId: params.ticket.id,
    fileName: sanitizeAttachmentFileName(params.fileName),
    mimeType: params.mimeType,
    byteSize: params.sizeBytes,
    sizeLabel:
      params.sizeBytes >= 1024 * 1024
        ? `${(params.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(Math.round(params.sizeBytes / 1024), 1)} KB`,
    relation: "ticket_information",
    uploadedBy: params.uploadedBy,
    uploadedAt: params.uploadedAt,
    storageProvider: "s3",
    bucketName: params.bucketName,
    s3Key: params.s3Key,
    checksumSha256: params.checksumSha256,
    previewAvailable: params.previewAvailable,
    downloadUrl: undefined,
    contentDataUrl: undefined
  };
}

export async function POST(request: NextRequest) {
  const principal = await requireApiPrincipal(request);

  if (principal instanceof NextResponse) {
    return principal;
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "invalid_form_data", "Request body must be multipart/form-data.");
  }

  const ticketId = (formData.get("ticketId") || formData.get("ticketKey") || "").toString().trim();
  const fileEntry = formData.get("file");
  const expectedChecksum = readChecksum(formData.get("checksumSha256"));

  if (!ticketId) {
    return jsonError(400, "validation_failed", "ticketId is required.");
  }

  if (!(fileEntry instanceof File)) {
    return jsonError(400, "validation_failed", "file is required.");
  }

  if (fileEntry.size > maxAttachmentUploadBytes) {
    return jsonError(
      413,
      "file_too_large",
      `Attachment exceeds the ${Math.round(maxAttachmentUploadBytes / 1024 / 1024)} MB limit.`
    );
  }

  const ticketList = await listTickets();
  const ticket = ticketList.find((candidate) => candidate.id === ticketId || candidate.key === ticketId);

  if (!ticket) {
    return jsonError(404, "ticket_not_found", "The target ticket could not be found.");
  }

  if (!canAccessTicket(ticket, principal)) {
    return jsonError(403, "forbidden", "You do not have access to this ticket.");
  }

  const fileName = sanitizeAttachmentFileName(fileEntry.name);
  const mimeType = fileEntry.type?.trim() || "application/octet-stream";
  const sizeBytes = fileEntry.size;
  const checksumHash = createHash("sha256");
  const attachmentId = randomUUID();
  const uploadStream = Readable.fromWeb(fileEntry.stream() as any).pipe(
    new Transform({
      transform(chunk, _encoding, callback) {
        checksumHash.update(chunk);
        callback(null, chunk);
      }
    })
  );
  const s3Key = createAttachmentS3Key(ticket.id, attachmentId, fileName);
  const bucketName = getAttachmentBucketName();

  await runVirusScanHookPlaceholder(fileName, mimeType, sizeBytes);

  const uploadedAt = new Date().toISOString();

  try {
    await getAttachmentS3Client().send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: uploadStream,
        ContentType: mimeType || "application/octet-stream",
        ContentLength: sizeBytes,
        ServerSideEncryption: "AES256",
        Metadata: {
          attachment_id: attachmentId,
          ticket_id: ticket.id,
          original_filename: fileName
        }
      })
    );
  } catch (error) {
    await deleteAttachmentObject(s3Key).catch(() => undefined);
    throw error;
  }

  const checksumSha256 = checksumHash.digest("hex");

  if (expectedChecksum && expectedChecksum !== checksumSha256) {
    await deleteAttachmentObject(s3Key).catch(() => undefined);
    return jsonError(400, "checksum_mismatch", "The provided SHA256 checksum did not match the uploaded file.");
  }

  const attachment = buildAttachmentRecord({
    attachmentId,
    ticket,
    fileName,
    mimeType,
    sizeBytes,
    checksumSha256,
    uploadedBy: principal.name,
    uploadedAt,
    bucketName,
    s3Key,
    previewAvailable: isPreviewableAttachmentMimeType(mimeType, fileName)
  });
  const nextAttachment: Attachment = {
    ...attachment,
    downloadUrl: `/api/attachments/${attachmentId}`
  };
  const nextTicket: Ticket = {
    ...ticket,
    attachments: [...ticket.attachments, nextAttachment],
    updatedAt: uploadedAt
  };

  try {
    await saveTicket(nextTicket);
  } catch (error) {
    await deleteAttachmentObject(s3Key);
    throw error;
  }

  return NextResponse.json(
    {
      data: {
        attachment: nextAttachment,
        ticketId: ticket.id,
        ticketKey: ticket.key
      }
    },
    { status: 201 }
  );
}
