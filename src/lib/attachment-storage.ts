import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const maxAttachmentUploadBytes = 100 * 1024 * 1024;
const defaultAttachmentDownloadExpiresSeconds = 300;
const defaultBucketNameEnv = "S3_BUCKET_NAME";

export type StoredAttachmentBody = {
  mimeType: string;
  content: Buffer;
};

export type StoredAttachmentRecord = {
  id: string;
  ticketId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedBy: string;
  uploadedAt: string;
  storageProvider: "s3";
  bucketName: string;
  s3Key: string;
  previewAvailable: boolean;
};

function readTrimmedEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getAttachmentBucketName(): string {
  const bucketName = readTrimmedEnv(defaultBucketNameEnv);

  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME is not configured.");
  }

  return bucketName;
}

export function getAttachmentRegion(): string {
  return readTrimmedEnv("AWS_REGION") || readTrimmedEnv("AWS_DEFAULT_REGION") || "eu-north-1";
}

let s3Client: S3Client | null = null;

export function getAttachmentS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: getAttachmentRegion()
    });
  }

  return s3Client;
}

export function isPreviewableAttachmentMimeType(mimeType: string, fileName?: string): boolean {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const normalizedFileName = (fileName ?? "").trim().toLowerCase();

  if (normalizedMimeType.startsWith("image/")) {
    return true;
  }

  if (normalizedMimeType === "application/pdf") {
    return true;
  }

  if (normalizedMimeType.startsWith("video/") || normalizedMimeType.startsWith("audio/")) {
    return true;
  }

  return /\.(txt|md|json|xml|csv|yaml|yml|log|ini|conf|css|html?|js|ts|tsx|jsx)$/i.test(normalizedFileName);
}

export function sanitizeAttachmentFileName(value?: string): string {
  const leafName = (value ?? "").trim().split(/[\\/]/).filter(Boolean).pop() ?? "";
  const safeName = leafName
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();

  return safeName || "attachment";
}

export function computeSha256Hex(value: Buffer | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseAttachmentDataUrl(value: string): StoredAttachmentBody | null {
  const commaIndex = value.indexOf(",");

  if (!value.startsWith("data:") || commaIndex < 0) {
    return null;
  }

  const metadata = value.slice("data:".length, commaIndex);
  const data = value.slice(commaIndex + 1);
  const metadataParts = metadata
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const isBase64 = metadataParts.some((part) => part.toLowerCase() === "base64");
  const mimeType = metadataParts.find((part) => part.includes("/")) || "application/octet-stream";

  try {
    return {
      mimeType,
      content: isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8")
    };
  } catch {
    return null;
  }
}

export function createAttachmentS3Key(ticketId: string, attachmentId: string, fileName?: string): string {
  const safeFileName = sanitizeAttachmentFileName(fileName);
  return `attachments/${ticketId}/${attachmentId}-${safeFileName}`;
}

export async function uploadAttachmentObject(input: {
  ticketId: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
  uploadedBy: string;
  uploadedAt: string;
}): Promise<StoredAttachmentRecord> {
  const bucketName = getAttachmentBucketName();
  const s3Key = createAttachmentS3Key(input.ticketId, input.attachmentId, input.fileName);
  const sizeBytes = input.content.byteLength;
  const checksumSha256 = computeSha256Hex(input.content);
  const previewAvailable = isPreviewableAttachmentMimeType(input.mimeType, input.fileName);

  await getAttachmentS3Client().send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: input.content,
      ContentType: input.mimeType || "application/octet-stream",
      ServerSideEncryption: "AES256",
      Metadata: {
        attachment_id: input.attachmentId,
        ticket_id: input.ticketId,
        original_filename: sanitizeAttachmentFileName(input.fileName),
        checksum_sha256: checksumSha256
      }
    })
  );

  return {
    id: input.attachmentId,
    ticketId: input.ticketId,
    fileName: sanitizeAttachmentFileName(input.fileName),
    mimeType: input.mimeType || "application/octet-stream",
    sizeBytes,
    checksumSha256,
    uploadedBy: input.uploadedBy,
    uploadedAt: input.uploadedAt,
    storageProvider: "s3",
    bucketName,
    s3Key,
    previewAvailable
  };
}

export async function deleteAttachmentObject(s3Key: string): Promise<void> {
  if (!s3Key.trim()) {
    return;
  }

  await getAttachmentS3Client().send(
    new DeleteObjectCommand({
      Bucket: getAttachmentBucketName(),
      Key: s3Key
    })
  );
}

export async function createAttachmentDownloadUrl(input: {
  s3Key: string;
  fileName: string;
  mimeType: string;
  download?: boolean;
  expiresInSeconds?: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getAttachmentBucketName(),
    Key: input.s3Key,
    ResponseContentDisposition: `${input.download === true ? "attachment" : "inline"}; filename="${sanitizeAttachmentFileName(
      input.fileName
    )}"`,
    ResponseContentType: input.mimeType || "application/octet-stream"
  });

  return getSignedUrl(getAttachmentS3Client(), command, {
    expiresIn: input.expiresInSeconds ?? defaultAttachmentDownloadExpiresSeconds
  });
}

export async function readAttachmentObjectContentDataUrl(input: {
  s3Key: string;
  mimeType: string;
}): Promise<string> {
  const bytes = await readAttachmentObjectBytes(input.s3Key);
  return `data:${input.mimeType || "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

export async function readAttachmentObjectBytes(s3Key: string): Promise<Buffer> {
  const response = await getAttachmentS3Client().send(
    new GetObjectCommand({
      Bucket: getAttachmentBucketName(),
      Key: s3Key
    })
  );

  if (!response.Body || typeof response.Body.transformToByteArray !== "function") {
    throw new Error("Attachment object body is not readable.");
  }

  return Buffer.from(await response.Body.transformToByteArray());
}
