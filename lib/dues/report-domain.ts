import { z } from "zod";
import { hash } from "../accounting/domain";
import { idSchema, methods, normalizeReference, type Receipt } from "./domain";

export const duesReportsCollection = "hotelDuesReportsV1";
export const duesReportRequestsCollection = "hotelDuesReportRequestsV1";

export const ALLOWED_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

export const uploadProofSchema = z
  .object({
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(ALLOWED_PROOF_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(MAX_PROOF_BYTES),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

export const submitReportSchema = z
  .object({
    requestId: z.string().uuid(),
    amountPaise: z
      .number()
      .int("Amount must be a whole number of paise.")
      .positive("Enter an amount greater than zero.")
      .max(1_000_000_000, "Amount cannot exceed ₹1 crore."),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.enum(methods),
    transactionReference: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(1000).default(""),
    uploadId: z.string().uuid().nullable().optional().default(null),
  })
  .strict();

export const withdrawReportSchema = z
  .object({
    action: z.literal("withdraw"),
    reportId: idSchema,
    requestId: z.string().uuid(),
  })
  .strict();

export type ReportStatus =
  | "awaiting_verification"
  | "recorded"
  | "rejected"
  | "withdrawn";

export type ReportAttachment = {
  objectKey: string;
  fileName: string;
  mimeType: (typeof ALLOWED_PROOF_MIME_TYPES)[number];
  sizeBytes: number;
  checksum: string;
  uploadedAt: string;
};

export type DuesReport = {
  id: string;
  reference: string;
  propertyId: string;
  hotelName: string;
  ownerId: string;
  amountPaise: number;
  paymentDate: string;
  method: (typeof methods)[number];
  transactionReference: string;
  normalizedReference: string;
  notes: string;
  attachment: ReportAttachment | null;
  status: ReportStatus;
  requestId: string;
  submittedAt: string;
  updatedAt: string;
  withdrawnAt: string | null;
  withdrawnBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  unrecordableReason: string | null;
  linkedReceiptId: string | null;
  linkedReceiptReference: string | null;
  linkedMode: "created" | "linked_existing" | null;
  searchTokens: string[];
};

export type OwnerDuesReportDto = {
  id: string;
  reference: string;
  propertyId: string;
  amountPaise: number;
  paymentDate: string;
  method: (typeof methods)[number];
  transactionReference: string;
  notes: string;
  status: ReportStatus;
  submittedAt: string;
  withdrawnAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  attachment: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    canAccess: boolean;
  } | null;
  linkedReceipt: {
    id: string;
    reference: string;
    recordedAt: string;
    mode: "created" | "linked_existing";
    corrected: boolean;
    correctionReason: string | null;
    correctedAt: string | null;
    replacement: {
      id: string;
      reference: string;
      amountPaise: number;
      paymentDate: string;
      recordedAt: string;
    } | null;
  } | null;
  canWithdraw: boolean;
  canCopyToDraft: boolean;
};

/** Validates JPEG, PNG, or PDF magic bytes against the declared MIME type. */
export function isValidProofSignature(
  bytes: Uint8Array,
  mimeType: string,
): boolean {
  if (bytes.byteLength < 5) return false;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const pdf =
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;
  return (
    (mimeType === "image/jpeg" && jpeg) ||
    (mimeType === "image/png" && png) ||
    (mimeType === "application/pdf" && pdf)
  );
}

export function matchesExistingReceipt(
  report: Pick<
    DuesReport,
    "propertyId" | "method" | "normalizedReference" | "amountPaise" | "paymentDate"
  >,
  receipt: Pick<
    Receipt,
    "propertyId" | "method" | "normalizedReference" | "amountPaise" | "paymentDate"
  >,
): boolean {
  return (
    receipt.propertyId === report.propertyId &&
    receipt.method === report.method &&
    normalizeReference(receipt.normalizedReference) ===
      normalizeReference(report.normalizedReference) &&
    receipt.amountPaise === report.amountPaise &&
    receipt.paymentDate === report.paymentDate
  );
}

export function deterministicReportNotificationId(
  reportId: string,
  outcome: "recorded" | "rejected",
): string {
  return hash(["dues_report_outcome", reportId, outcome]);
}
