import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb as db } from "../firebase/admin";
import { ApiException } from "../api/errors";
import { decodeCursor } from "../api/pagination";
import { propertyAccess } from "../partner/pms/access";
import { authorizeFinanceAdmin } from "../finance-settings/service";
import { hash } from "../accounting/domain";
import {
  journalCollection,
  readEvidence,
  stateCollection,
  summary,
} from "../accounting/posting";
import { assertBalanced } from "../accounting/domain";
import {
  copyPrivateObject,
  createPrivateReadUrl,
  createPrivateUploadUrl,
  deletePrivateObject,
  getPrivateObject,
  verifyR2Object,
} from "../r2";
import { buildSearchTokens, markOwnerFinanceDirty } from "../finances/projections";
import { backgroundMode } from "../background/config";
import { writeProjection } from "../background/enqueue";
import {
  duesPosition,
  idSchema,
  normalizeReference,
  referenceKey,
  validatePaymentDate,
  type Allocation,
  type Correction,
  type Receipt,
} from "./domain";
import {
  duesCollections,
  journalFindings,
  receiptJournal,
} from "./journal";
import {
  deterministicReportNotificationId,
  duesReportRequestsCollection,
  duesReportsCollection,
  isValidProofSignature,
  matchesExistingReceipt,
  MAX_PROOF_BYTES,
  submitReportSchema,
  uploadProofSchema,
  withdrawReportSchema,
  type DuesReport,
  type OwnerDuesReportDto,
  type ReportAttachment,
} from "./report-domain";

import { scanFinancePage, validFinanceDate } from "../finances/pagination";

function conflict(message: string, code = "DUES_REQUIRES_REVIEW"): never {
  throw new ApiException(code, 409, message);
}

export async function authorizeCurrentOwner(
  uid: string,
  propertyId: string,
  tx?: FirebaseFirestore.Transaction,
) {
  idSchema.parse(propertyId);
  const access = await propertyAccess(uid, propertyId, "property.manage", tx);
  if (
    access.role !== "owner" ||
    (access.property.ownerId || access.property.partnerId) !== uid
  ) {
    throw new ApiException(
      "FORBIDDEN",
      403,
      "Only the current hotel owner can access hotel finances.",
    );
  }
  return access;
}

export async function createDuesReportUploadUrl(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  await authorizeCurrentOwner(uid, propertyId);
  const input = uploadProofSchema.parse(raw);
  const uploadId = randomUUID();
  const objectKey = `uploads/finance-proofs/${propertyId}/${uploadId}`;
  const signed = await createPrivateUploadUrl(
    objectKey,
    input.mimeType,
    input.checksum.toLowerCase(),
  );
  await db.collection("pendingUploads").doc(uploadId).set({
    propertyId,
    ownerId: uid,
    kind: "finance_proof",
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksum: input.checksum.toLowerCase(),
    objectKey,
    expiresAt: Date.now() + 15 * 60_000,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {
    uploadId,
    expiresAt: signed.expiresAt,
    private: true,
    uploadUrl: signed.uploadUrl,
    headers: signed.headers,
  };
}

async function computeAuthoritativeCollectibleDues(
  tx: FirebaseFirestore.Transaction,
  propertyId: string,
  receipts: Receipt[],
  corrections: Correction[],
) {
  const bookingsSnap = await tx.get(
    db.collection("bookings").where("propertyId", "==", propertyId),
  );
  const bookingIds = [
    ...new Set([
      ...bookingsSnap.docs.map((b) => b.id),
      ...receipts.flatMap((r) => r.allocations.map((a) => a.bookingId)),
    ]),
  ];
  const positions = await Promise.all(
    bookingIds.sort().map(async (bookingId) => {
      const evidence = await readEvidence(db, tx, bookingId);
      if (evidence.booking?.propertyId !== propertyId) {
        evidence.booking = undefined;
      }
      const historyReasons = journalFindings(
        bookingId,
        propertyId,
        evidence.journal,
        receipts,
        corrections,
      );
      if (evidence.journal.some((j) => j.propertyId !== propertyId)) {
        historyReasons.push(
          "The booking journal includes another hotel's entries. Review accounting.",
        );
      }
      return duesPosition(bookingId, evidence, historyReasons);
    }),
  );
  const collectible = positions
    .filter((p) => p.collectible && p.firstRecordedAt)
    .sort(
      (a, b) =>
        a.firstRecordedAt!.localeCompare(b.firstRecordedAt!) ||
        a.bookingId.localeCompare(b.bookingId),
    );
  const oldest50 = collectible.slice(0, 50);
  const maxReportablePaise = oldest50.reduce((n, p) => n + p.duesPaise, 0);
  const totalCollectiblePaise = collectible.reduce(
    (n, p) => n + p.duesPaise,
    0,
  );
  return {
    collectible,
    oldest50,
    maxReportablePaise,
    totalCollectiblePaise,
  };
}

export async function submitDuesReport(
  uid: string,
  propertyId: string,
  raw: unknown,
  now = new Date(),
): Promise<{ reportId: string; reference: string; status: string }> {
  await authorizeCurrentOwner(uid, propertyId);
  const input = submitReportSchema.parse(raw);
  const fingerprint = hash([propertyId, input]);
  const requestDocId = hash([uid, input.requestId]);
  const existingRequest = await db
    .collection(duesReportRequestsCollection)
    .doc(requestDocId)
    .get();
  if (existingRequest.exists) {
    if (existingRequest.get("fingerprint") !== fingerprint) {
      conflict(
        "This request ID was already used with different report details.",
        "IDEMPOTENCY_CONFLICT",
      );
    }
    return existingRequest.get("result") as {
      reportId: string;
      reference: string;
      status: string;
    };
  }

  const reportId = hash([uid, propertyId, input.requestId]);
  const reportReference = `HDR-${reportId.slice(0, 12).toUpperCase()}`;

  let pendingUploadRef: FirebaseFirestore.DocumentReference | null = null;
  let pendingObjectKey: string | null = null;
  let finalAttachmentKey: string | null = null;
  let attachment: ReportAttachment | null = null;

  if (input.uploadId) {
    pendingUploadRef = db.collection("pendingUploads").doc(input.uploadId);
    const uploadSnap = await pendingUploadRef.get();
    const uploadData = uploadSnap.data();
    if (
      !uploadData ||
      uploadData.ownerId !== uid ||
      uploadData.propertyId !== propertyId ||
      uploadData.kind !== "finance_proof" ||
      Number(uploadData.expiresAt ?? 0) < Date.now()
    ) {
      throw new ApiException(
        "UPLOAD_EXPIRED",
        422,
        "The uploaded payment proof expired or does not belong to this submission. Upload it again.",
      );
    }
    pendingObjectKey = String(uploadData.objectKey);
    const expectedSize = Number(uploadData.sizeBytes);
    const expectedChecksum = String(uploadData.checksum).toLowerCase();
    const mimeType = String(uploadData.mimeType) as ReportAttachment["mimeType"];

    await verifyR2Object(pendingObjectKey, expectedSize, expectedChecksum);
    const bytes = await getPrivateObject(pendingObjectKey);
    if (bytes.byteLength !== expectedSize || bytes.byteLength > MAX_PROOF_BYTES) {
      throw new ApiException(
        "INVALID_DOCUMENT_SIZE",
        422,
        "Uploaded payment proof size does not match metadata.",
      );
    }
    const actualChecksum = createHash("sha256").update(bytes).digest("hex");
    if (actualChecksum !== expectedChecksum) {
      throw new ApiException(
        "INVALID_DOCUMENT_CHECKSUM",
        422,
        "Uploaded payment proof checksum failed verification.",
      );
    }
    if (!isValidProofSignature(bytes, mimeType)) {
      throw new ApiException(
        "INVALID_DOCUMENT_CONTENT",
        422,
        "Payment proof file content does not match JPG, PNG, or PDF.",
      );
    }

    // Each attempt owns its copy: a losing retry must never delete the winner's proof.
    finalAttachmentKey = `finance-proofs/${propertyId}/${reportId}/${randomUUID()}`;
    await copyPrivateObject(pendingObjectKey, finalAttachmentKey);
    await verifyR2Object(finalAttachmentKey, expectedSize, expectedChecksum);

    attachment = {
      objectKey: finalAttachmentKey,
      fileName: String(uploadData.fileName),
      mimeType,
      sizeBytes: expectedSize,
      checksum: expectedChecksum,
      uploadedAt: now.toISOString(),
    };
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      const access = await authorizeCurrentOwner(uid, propertyId, tx);
      const requestRef = db
        .collection(duesReportRequestsCollection)
        .doc(requestDocId);
      const prior = await tx.get(requestRef);
      if (prior.exists) {
        if (prior.get("fingerprint") !== fingerprint) {
          conflict(
            "This request ID was already used with different report details.",
            "IDEMPOTENCY_CONFLICT",
          );
        }
        return prior.get("result") as {
          reportId: string;
          reference: string;
          status: string;
        };
      }

      if (pendingUploadRef) {
        const pending = await tx.get(pendingUploadRef);
        if (!pending.exists || pending.get("ownerId") !== uid ||
            pending.get("propertyId") !== propertyId ||
            pending.get("kind") !== "finance_proof" ||
            pending.get("expiresAt") < Date.now()) {
          throw new ApiException("UPLOAD_EXPIRED", 422, "Upload this payment proof again.");
        }
      }

      const normalizedRef = normalizeReference(input.transactionReference);
      try {
        validatePaymentDate(
          input.paymentDate,
          access.property.timezone ?? null,
          now,
        );
      } catch (error) {
        throw new ApiException(
          "INVALID_PAYMENT_DATE",
          422,
          (error as Error).message,
        );
      }

      const refDocRef = db
        .collection(duesCollections.references)
        .doc(referenceKey(propertyId, input.method, input.transactionReference));
      const [
        pendingReportsSnap,
        refSnap,
        receiptsSnap,
        correctionsSnap,
      ] = await Promise.all([
        tx.get(
          db
            .collection(duesReportsCollection)
            .where("propertyId", "==", propertyId)
            .where("status", "==", "awaiting_verification")
            .where("normalizedReference", "==", normalizedRef),
        ),
        tx.get(refDocRef),
        tx.get(
          db
            .collection(duesCollections.receipts)
            .where("propertyId", "==", propertyId),
        ),
        tx.get(
          db
            .collection(duesCollections.corrections)
            .where("propertyId", "==", propertyId),
        ),
      ]);

      if (
        pendingReportsSnap.docs.some(
          (d) => d.get("method") === input.method,
        )
      ) {
        conflict(
          "An awaiting-verification report with this payment method and transaction reference already exists.",
          "DUPLICATE_TRANSACTION_REFERENCE",
        );
      }

      const receipts = receiptsSnap.docs.map((d) => d.data() as Receipt);
      const corrections = correctionsSnap.docs.map(
        (d) => d.data() as Correction,
      );
      const correctedIds = new Set(corrections.map((c) => c.paymentId));

      const existingReceipt = receipts.find(
        (r) =>
          !correctedIds.has(r.id) &&
          r.method === input.method &&
          r.normalizedReference === normalizedRef,
      );
      let matchingExistingReceipt = false;
      if (refSnap.exists || existingReceipt) {
        const candidateReceipt =
          existingReceipt ??
          receipts.find((r) => r.id === refSnap.get("latestPaymentId"));
        const isCorrected =
          candidateReceipt && correctedIds.has(candidateReceipt.id);
        if (candidateReceipt && !isCorrected) {
          const alreadyLinkedSnap = await tx.get(
            db
              .collection(duesReportsCollection)
              .where("propertyId", "==", propertyId)
              .where("linkedReceiptId", "==", candidateReceipt.id)
              .limit(1),
          );
          const matchesAll = matchesExistingReceipt(
            {
              propertyId,
              method: input.method,
              normalizedReference: normalizedRef,
              amountPaise: input.amountPaise,
              paymentDate: input.paymentDate,
            },
            candidateReceipt,
          );
          if (!matchesAll || !alreadyLinkedSnap.empty) {
            conflict(
              "This hotel and payment method already have a confirmed payment with this transaction reference.",
              "DUPLICATE_TRANSACTION_REFERENCE",
            );
          }
          matchingExistingReceipt = true;
        } else {
          conflict("This transaction reference has already been recorded. Review its payment history.", "DUPLICATE_TRANSACTION_REFERENCE");
        }
      }

      const { maxReportablePaise, oldest50 } =
        await computeAuthoritativeCollectibleDues(
          tx,
          propertyId,
          receipts,
          corrections,
        );

      if (!matchingExistingReceipt && maxReportablePaise <= 0) {
        conflict(
          "There are no verified collectible dues to report right now.",
          "NO_COLLECTIBLE_DUES",
        );
      }
      if (!matchingExistingReceipt && input.amountPaise > maxReportablePaise) {
        throw new ApiException(
          "DUES_OVERPAYMENT",
          422,
          `Maximum supported in one report (covering the oldest ${oldest50.length} collectible bookings) is ₹${(maxReportablePaise / 100).toFixed(2)}. Submit separate reports for larger amounts.`,
        );
      }

      const at = now.toISOString();
      const report: DuesReport = {
        id: reportId,
        reference: reportReference,
        propertyId,
        hotelName: String(access.property.name ?? propertyId),
        ownerId: uid,
        amountPaise: input.amountPaise,
        paymentDate: input.paymentDate,
        method: input.method,
        transactionReference: input.transactionReference.trim(),
        normalizedReference: normalizedRef,
        notes: input.notes.trim(),
        attachment,
        status: "awaiting_verification",
        requestId: input.requestId,
        submittedAt: at,
        updatedAt: at,
        withdrawnAt: null,
        withdrawnBy: null,
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
        unrecordableReason: null,
        linkedReceiptId: null,
        linkedReceiptReference: null,
        linkedMode: null,
        searchTokens: buildSearchTokens([
          reportId,
          reportReference,
          input.transactionReference,
          normalizedRef,
        ]),
      };

      const reportRef = db.collection(duesReportsCollection).doc(reportId);
      tx.create(reportRef, report);
      tx.create(reportRef.collection("history").doc("submitted"), {
        type: "Submitted",
        actorId: uid,
        at,
        amountPaise: report.amountPaise,
      });

      const txResult = {
        reportId,
        reference: reportReference,
        status: report.status,
      };
      tx.create(requestRef, {
        fingerprint,
        propertyId,
        actorId: uid,
        at,
        result: txResult,
      });
      if (pendingUploadRef) tx.delete(pendingUploadRef);
      return txResult;
    });

    if (finalAttachmentKey) {
      const saved = await db.collection(duesReportsCollection).doc(reportId).get();
      if (saved.get("attachment.objectKey") !== finalAttachmentKey) {
        await deletePrivateObject(finalAttachmentKey).catch(() => {});
      }
    }
    if (pendingObjectKey) {
      await deletePrivateObject(pendingObjectKey).catch(() => {});
    }
    return result;
  } catch (error) {
    if (finalAttachmentKey) {
      // A lost response can occur after commit. Preserve any referenced object.
      const saved = await db.collection(duesReportsCollection).doc(reportId).get().catch(() => null);
      if (saved && saved.get("attachment.objectKey") !== finalAttachmentKey) {
        await deletePrivateObject(finalAttachmentKey).catch(() => {});
      }
    }
    throw error;
  }
}

export async function withdrawDuesReport(
  uid: string,
  propertyId: string,
  raw: unknown,
  now = new Date(),
): Promise<{ reportId: string; status: string }> {
  const input = withdrawReportSchema.parse(raw);
  const fingerprint = hash([propertyId, input]);
  return db.runTransaction(async (tx) => {
    await authorizeCurrentOwner(uid, propertyId, tx);
    const requestRef = db
      .collection(duesReportRequestsCollection)
      .doc(hash([uid, input.requestId]));
    const prior = await tx.get(requestRef);
    if (prior.exists) {
      if (prior.get("fingerprint") !== fingerprint) {
        conflict(
          "This request ID was already used with different details.",
          "IDEMPOTENCY_CONFLICT",
        );
      }
      return prior.get("result") as { reportId: string; status: string };
    }

    const reportRef = db.collection(duesReportsCollection).doc(input.reportId);
    const snap = await tx.get(reportRef);
    const report = snap.data() as DuesReport | undefined;
    if (!report || report.propertyId !== propertyId) {
      throw new ApiException("NOT_FOUND", 404, "Reported payment not found.");
    }
    if (report.ownerId !== uid) {
      throw new ApiException(
        "FORBIDDEN",
        403,
        "Only the submitting current owner can withdraw this report.",
      );
    }
    if (report.status !== "awaiting_verification") {
      conflict(
        "Only reports awaiting verification can be withdrawn.",
        "REPORT_STATUS_CONFLICT",
      );
    }

    const at = now.toISOString();
    tx.update(reportRef, {
      status: "withdrawn",
      withdrawnAt: at,
      withdrawnBy: uid,
      updatedAt: at,
    });
    tx.create(reportRef.collection("history").doc("withdrawn"), {
      type: "Withdrawn",
      actorId: uid,
      at,
    });

    const result = { reportId: report.id, status: "withdrawn" };
    tx.create(requestRef, {
      fingerprint,
      propertyId,
      actorId: uid,
      at,
      result,
    });
    return result;
  });
}

export async function getOwnerReportAttachmentUrl(
  uid: string,
  propertyId: string,
  reportId: string,
) {
  idSchema.parse(reportId);
  await authorizeCurrentOwner(uid, propertyId);
  const snap = await db.collection(duesReportsCollection).doc(reportId).get();
  const report = snap.data() as DuesReport | undefined;
  if (!report || report.propertyId !== propertyId) {
    throw new ApiException("NOT_FOUND", 404, "Reported payment not found.");
  }
  if (report.ownerId !== uid) {
    throw new ApiException(
      "FORBIDDEN",
      403,
      "Only the submitting current owner can access this payment proof.",
    );
  }
  if (!report.attachment?.objectKey) {
    throw new ApiException("NOT_FOUND", 404, "No attachment for this report.");
  }
  const signed = await createPrivateReadUrl(report.attachment.objectKey, {
    expiresSeconds: 300,
  });
  return {
    ...signed,
    fileName: report.attachment.fileName,
    mimeType: report.attachment.mimeType,
    sizeBytes: report.attachment.sizeBytes,
  };
}

export async function getAdminReportAttachmentUrl(
  uid: string,
  propertyId: string,
  reportId: string,
) {
  idSchema.parse(propertyId);
  idSchema.parse(reportId);
  await db.runTransaction(async (tx) => {
    await authorizeFinanceAdmin(uid, tx);
  });
  const snap = await db.collection(duesReportsCollection).doc(reportId).get();
  const report = snap.data() as DuesReport | undefined;
  if (!report || report.propertyId !== propertyId) {
    throw new ApiException("NOT_FOUND", 404, "Reported payment not found.");
  }
  if (!report.attachment?.objectKey) {
    throw new ApiException("NOT_FOUND", 404, "No attachment for this report.");
  }
  const signed = await createPrivateReadUrl(report.attachment.objectKey, {
    expiresSeconds: 300,
  });
  return {
    ...signed,
    fileName: report.attachment.fileName,
    mimeType: report.attachment.mimeType,
    sizeBytes: report.attachment.sizeBytes,
  };
}

function enrichReportReceipt(
  report: DuesReport,
  receiptById: Map<string, Receipt>,
  correctionByPaymentId: Map<string, Correction>,
  replacementByOriginalId: Map<string, Receipt>,
): OwnerDuesReportDto["linkedReceipt"] {
  if (!report.linkedReceiptId) return null;
  const receipt = receiptById.get(report.linkedReceiptId);
  const correction = correctionByPaymentId.get(report.linkedReceiptId);
  const replacement = replacementByOriginalId.get(report.linkedReceiptId);
  return {
    id: report.linkedReceiptId,
    reference:
      report.linkedReceiptReference ??
      receipt?.reference ??
      `HKD-${report.linkedReceiptId.slice(0, 16).toUpperCase()}`,
    recordedAt: receipt?.recordedAt ?? report.reviewedAt ?? report.updatedAt,
    mode: report.linkedMode ?? "created",
    corrected: !!correction,
    correctionReason: correction?.reason ?? null,
    correctedAt: correction?.recordedAt ?? null,
    replacement: replacement
      ? {
          id: replacement.id,
          reference: replacement.reference,
          amountPaise: replacement.amountPaise,
          paymentDate: replacement.paymentDate,
          recordedAt: replacement.recordedAt,
        }
      : null,
  };
}

const listReportsFilterSchema = z.object({
  detailId: z.string().min(1).max(200).refine((v) => !v.includes("/")).optional(),
  status: z
    .enum([
      "all",
      "awaiting_verification",
      "recorded",
      "rejected",
      "withdrawn",
    ])
    .default("all"),
  q: z.string().trim().max(120).optional().default(""),
  from: z
    .string()
    .refine(validFinanceDate, "Enter a valid calendar date.")
    .optional(),
  to: z
    .string()
    .refine(validFinanceDate, "Enter a valid calendar date.")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(2048).optional(),
});

export async function listOwnerDuesReports(
  uid: string,
  propertyId: string,
  rawQuery: Record<string, unknown>,
) {
  await authorizeCurrentOwner(uid, propertyId);
  const f = listReportsFilterSchema.parse(rawQuery);
  if ((f.from && !f.to) || (!f.from && f.to) || (f.from && f.to && f.from > f.to)) {
    throw new ApiException(
      "INVALID_DATE_RANGE",
      422,
      "Provide a valid hotel-local date range.",
    );
  }
  const hasRange = !!(f.from && f.to);
  const qNorm = f.q.trim().toLowerCase();
  const filterFingerprint = hash({
    propertyId,
    status: f.status,
    q: qNorm,
    from: f.from ?? null,
    to: f.to ?? null,
  });

  const cursor = f.cursor ? decodeCursor(f.cursor) : null;
  if (cursor && cursor.values[0] !== filterFingerprint) {
    throw new ApiException(
      "INVALID_CURSOR",
      422,
      "Filters changed. Start from the first page.",
    );
  }

  let query: FirebaseFirestore.Query = db
    .collection(duesReportsCollection)
    .where("propertyId", "==", propertyId);

  if (f.detailId) {
    query = query.where(FieldPath.documentId(), "==", f.detailId);
  } else if (qNorm) {
    query = query.where("searchTokens", "array-contains", qNorm);
  } else if (f.status !== "all") {
    query = query.where("status", "==", f.status);
  }

  if (hasRange) {
    query = query
      .where("paymentDate", ">=", f.from!)
      .where("paymentDate", "<=", f.to!)
      .orderBy("paymentDate", "desc")
      .orderBy("submittedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
  } else {
    query = query
      .orderBy("submittedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
  }

  // If q is provided together with status, post-filter in bounded batches.
  const { items: collected, nextCursor } = await scanFinancePage<DuesReport>({
    query, cursor, fingerprint: filterFingerprint, limit: f.limit,
    matches: (r) => f.status === "all" || r.status === f.status,
    sortValues: (r) => hasRange ? [r.paymentDate, r.submittedAt] : [r.submittedAt],
  });

  // Enrich linked receipts if any recorded reports exist in this page.
  const receiptIds = [
    ...new Set(
      collected.map((r) => r.linkedReceiptId).filter((v): v is string => !!v),
    ),
  ];
  const receiptById = new Map<string, Receipt>();
  const correctionByPaymentId = new Map<string, Correction>();
  const replacementByOriginalId = new Map<string, Receipt>();
  if (receiptIds.length) {
    const records = await db.getAll(...receiptIds.flatMap((id) => [
      db.collection(duesCollections.receipts).doc(id),
      db.collection(duesCollections.corrections).doc(id),
      db.collection(duesCollections.receipts).doc(id).collection("history").doc("replacement"),
    ]));
    const replacements: { originalId: string; paymentId: string }[] = [];
    for (let i = 0; i < receiptIds.length; i++) {
      const [receipt, correction, replacement] = records.slice(i * 3, i * 3 + 3);
      if (receipt.exists && receipt.get("propertyId") === propertyId) {
        receiptById.set(receipt.id, receipt.data() as Receipt);
      }
      if (correction.exists && correction.get("propertyId") === propertyId) {
        correctionByPaymentId.set(correction.id, correction.data() as Correction);
      }
      if (replacement.exists && typeof replacement.get("paymentId") === "string") {
        replacements.push({ originalId: receiptIds[i], paymentId: replacement.get("paymentId") });
      }
    }
    if (replacements.length) {
      const snapshots = await db.getAll(...replacements.map((r) => db.collection(duesCollections.receipts).doc(r.paymentId)));
      snapshots.forEach((snapshot, i) => {
        if (snapshot.exists && snapshot.get("propertyId") === propertyId) {
          replacementByOriginalId.set(replacements[i].originalId, snapshot.data() as Receipt);
        }
      });
    }
  }


  return {
    items: collected.map((r): OwnerDuesReportDto => ({
      id: r.id,
      reference: r.reference,
      propertyId: r.propertyId,
      amountPaise: r.amountPaise,
      paymentDate: r.paymentDate,
      method: r.method,
      transactionReference: r.transactionReference,
      notes: r.notes,
      status: r.status,
      submittedAt: r.submittedAt,
      withdrawnAt: r.withdrawnAt,
      reviewedAt: r.reviewedAt,
      rejectionReason: r.rejectionReason,
      attachment: r.attachment
        ? {
            fileName: r.attachment.fileName,
            mimeType: r.attachment.mimeType,
            sizeBytes: r.attachment.sizeBytes,
            canAccess: r.ownerId === uid,
          }
        : null,
      linkedReceipt: enrichReportReceipt(
        r,
        receiptById,
        correctionByPaymentId,
        replacementByOriginalId,
      ),
      canWithdraw: r.status === "awaiting_verification" && r.ownerId === uid,
      canCopyToDraft:
        r.status === "rejected" || r.status === "withdrawn",
    })),
    nextCursor,
  };
}

/** Transactional admin helpers invoked inside `duesCommand`. */
export function writeDeterministicReportNotificationInTx(
  tx: FirebaseFirestore.Transaction,
  params: {
    actorId: string;
    report: DuesReport;
    outcome: "recorded" | "rejected";
    reason?: string;
  },
) {
  const { actorId, report, outcome, reason } = params;
  const id = deterministicReportNotificationId(report.id, outcome);
  const ref = db.collection("notifications").doc(id);
  const rupees = (report.amountPaise / 100).toFixed(2);
  const title =
    outcome === "recorded"
      ? "Reported dues payment recorded"
      : "Reported dues payment rejected";
  const body =
    outcome === "recorded"
      ? `Your reported payment of ₹${rupees} (${report.transactionReference}) has been verified and recorded.`
      : `Your reported payment of ₹${rupees} (${report.transactionReference}) was rejected: ${reason ?? "see review details"}.`;
  const now = FieldValue.serverTimestamp();
  tx.set(ref, {
    userId: report.ownerId,
    eventType: `dues_report.${outcome}`,
    title,
    body,
    data: {
      propertyId: report.propertyId,
      reportId: report.id,
      reportReference: report.reference,
      reportOwnerId: report.ownerId,
      tab: "reports",
    },
    readAt: null,
    status: "created",
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
    deletedAt: null,
  });
}

export async function linkReportReceiptInTx(
  tx: FirebaseFirestore.Transaction,
  params: {
    uid: string;
    propertyId: string;
    reportId: string;
    paymentId: string;
    receipts: Receipt[];
    corrections: Correction[];
    at: string;
  },
) {
  const { uid, propertyId, reportId, paymentId, receipts, corrections, at } =
    params;
  const reportRef = db.collection(duesReportsCollection).doc(reportId);
  const reportSnap = await tx.get(reportRef);
  const report = reportSnap.data() as DuesReport | undefined;
  if (!report || report.propertyId !== propertyId) {
    throw new ApiException("NOT_FOUND", 404, "Reported payment not found.");
  }
  if (report.status !== "awaiting_verification") {
    conflict(
      "Only awaiting-verification reports can be linked.",
      "REPORT_STATUS_CONFLICT",
    );
  }
  const receipt = receipts.find((r) => r.id === paymentId);
  if (!receipt || receipt.propertyId !== propertyId) {
    throw new ApiException("NOT_FOUND", 404, "Dues receipt not found.");
  }
  if (corrections.some((c) => c.paymentId === receipt.id)) {
    conflict(
      "Cannot link a report to a corrected receipt.",
      "DUES_ALREADY_CORRECTED",
    );
  }
  if (!matchesExistingReceipt(report, receipt)) {
    conflict(
      "The receipt must match the report's hotel, payment method, normalized reference, amount, and payment date.",
      "REPORT_RECEIPT_MISMATCH",
    );
  }
  const alreadyLinked = await tx.get(
    db
      .collection(duesReportsCollection)
      .where("propertyId", "==", propertyId)
      .where("linkedReceiptId", "==", receipt.id)
      .limit(1),
  );
  if (!alreadyLinked.empty) {
    conflict(
      "This receipt is already linked to another reported payment.",
      "REPORT_ALREADY_LINKED",
    );
  }

  tx.update(reportRef, {
    status: "recorded",
    linkedReceiptId: receipt.id,
    linkedReceiptReference: receipt.reference,
    linkedMode: "linked_existing",
    unrecordableReason: null,
    reviewedAt: at,
    reviewedBy: uid,
    updatedAt: at,
  });
  tx.create(reportRef.collection("history").doc(`linked_${receipt.id}`), {
    type: "Linked to existing receipt",
    receiptId: receipt.id,
    receiptReference: receipt.reference,
    actorId: uid,
    at,
  });
  // Receipt contents participate in journal fingerprints and remain immutable.
  // The report and append-only history carry this relationship instead.
  tx.create(
    db
      .collection(duesCollections.receipts)
      .doc(receipt.id)
      .collection("history")
      .doc(`linked_report_${report.id}`),
    {
      type: "Linked owner report",
      reportId: report.id,
      reportReference: report.reference,
      actorId: uid,
      at,
    },
  );
  writeDeterministicReportNotificationInTx(tx, {
    actorId: uid,
    report,
    outcome: "recorded",
  });
  return { reportId: report.id, paymentId: receipt.id, status: "Recorded" as const };
}

export async function rejectReportInTx(
  tx: FirebaseFirestore.Transaction,
  params: {
    uid: string;
    propertyId: string;
    reportId: string;
    reason: string;
    at: string;
  },
) {
  const { uid, propertyId, reportId, reason, at } = params;
  const reportRef = db.collection(duesReportsCollection).doc(reportId);
  const reportSnap = await tx.get(reportRef);
  const report = reportSnap.data() as DuesReport | undefined;
  if (!report || report.propertyId !== propertyId) {
    throw new ApiException("NOT_FOUND", 404, "Reported payment not found.");
  }
  if (report.status !== "awaiting_verification") {
    conflict(
      "Only awaiting-verification reports can be rejected.",
      "REPORT_STATUS_CONFLICT",
    );
  }
  tx.update(reportRef, {
    status: "rejected",
    rejectionReason: reason,
    unrecordableReason: null,
    reviewedAt: at,
    reviewedBy: uid,
    updatedAt: at,
  });
  tx.create(reportRef.collection("history").doc("rejected"), {
    type: "Rejected",
    reason,
    actorId: uid,
    at,
  });
  writeDeterministicReportNotificationInTx(tx, {
    actorId: uid,
    report,
    outcome: "rejected",
    reason,
  });
  return { reportId: report.id, status: "Rejected" as const };
}

export async function flagReportUnrecordableInTx(
  tx: FirebaseFirestore.Transaction,
  params: {
    uid: string;
    propertyId: string;
    reportId: string;
    reason: string;
    at: string;
  },
) {
  const { uid, propertyId, reportId, reason, at } = params;
  const reportRef = db.collection(duesReportsCollection).doc(reportId);
  const reportSnap = await tx.get(reportRef);
  const report = reportSnap.data() as DuesReport | undefined;
  if (!report || report.propertyId !== propertyId) {
    throw new ApiException("NOT_FOUND", 404, "Reported payment not found.");
  }
  if (report.status !== "awaiting_verification") {
    conflict(
      "Only awaiting-verification reports can be marked with an unrecordable note.",
      "REPORT_STATUS_CONFLICT",
    );
  }
  tx.update(reportRef, {
    unrecordableReason: reason,
    updatedAt: at,
  });
  tx.create(reportRef.collection("history").doc(`unrecordable_${hash([at, reason]).slice(0, 12)}`), {
    type: "Unrecordable explanation noted",
    reason,
    actorId: uid,
    at,
  });
  return { reportId: report.id, status: "Pending" as const };
}

export type ReportRecordingCommitParams = {
  uid: string;
  propertyId: string;
  reportId: string;
  reportFingerprint: string;
  payment: {
    amountPaise: number;
    paymentDate: string;
    method: Receipt["method"];
    transactionReference: string;
    notes: string;
  };
  paymentId: string;
  hotelName: string;
  allocations: Allocation[];
  referenceRef: FirebaseFirestore.DocumentReference;
  data: {
    evidence: Awaited<ReturnType<typeof readEvidence>>;
    position: ReturnType<typeof duesPosition>;
  }[];
  at: string;
};

export async function commitReportPaymentInTx(
  tx: FirebaseFirestore.Transaction,
  params: ReportRecordingCommitParams,
) {
  const {
    uid,
    propertyId,
    reportId,
    reportFingerprint,
    payment: payInput,
    paymentId,
    hotelName,
    allocations,
    referenceRef,
    data,
    at,
  } = params;

  const reportRef = db.collection(duesReportsCollection).doc(reportId);
  const reportSnap = await tx.get(reportRef);
  const report = reportSnap.data() as DuesReport | undefined;
  if (!report || report.propertyId !== propertyId) {
    throw new ApiException("NOT_FOUND", 404, "Reported payment not found.");
  }
  if (report.status !== "awaiting_verification") {
    conflict(
      "This reported payment is no longer awaiting verification.",
      "REPORT_STATUS_CONFLICT",
    );
  }
  if (hash(report) !== reportFingerprint) {
    conflict(
      "This reported payment changed since your preview. Refresh and review again.",
      "DUES_CONFIRMATION_STALE",
    );
  }

  const paymentRef = db.collection(duesCollections.receipts).doc(paymentId);
  const existing = await tx.get(paymentRef);
  if (existing.exists) {
    conflict(
      "This confirmation has already been recorded. Refresh payment history.",
      "DUES_CONFIRMATION_USED",
    );
  }

  const payment: Receipt & { linkedReportId?: string } = {
    id: paymentId,
    reference: `HKD-${paymentId.slice(0, 16).toUpperCase()}`,
    propertyId,
    hotelName,
    amountPaise: payInput.amountPaise,
    paymentDate: payInput.paymentDate,
    method: payInput.method,
    transactionReference: payInput.transactionReference,
    normalizedReference: normalizeReference(payInput.transactionReference),
    notes: payInput.notes,
    allocations,
    actorId: uid,
    recordedAt: at,
    replacesId: null,
    linkedReportId: report.id,
  };

  const events = payment.allocations.map((a) =>
    receiptJournal(payment, a.bookingId),
  );
  const existingEvents = await tx.getAll(
    ...events.map((e) => db.collection(journalCollection).doc(e.id)),
  );
  if (existingEvents.some((e) => e.exists)) {
    conflict("A payment journal reference already exists; review accounting.");
  }

  tx.create(paymentRef, payment);
  tx.create(paymentRef.collection("history").doc("received"), {
    type: "Payment received",
    actorId: uid,
    at,
    amountPaise: payment.amountPaise,
    replacesId: null,
    linkedReportId: report.id,
  });
  tx.set(referenceRef, {
    propertyId,
    method: payment.method,
    normalizedReference: payment.normalizedReference,
    latestPaymentId: payment.id,
  });

  for (const event of events) {
    assertBalanced(event.lines);
    tx.create(db.collection(journalCollection).doc(event.id), event);
    const evidence = data.find(
      (r) => r.position.bookingId === event.bookingId,
    )!.evidence;
    tx.set(
      db.collection(stateCollection).doc(event.bookingId),
      { summary: summary([...evidence.journal, event]) },
      { merge: true },
    );
  }

  tx.update(reportRef, {
    status: "recorded",
    linkedReceiptId: payment.id,
    linkedReceiptReference: payment.reference,
    linkedMode: "created",
    unrecordableReason: null,
    reviewedAt: at,
    reviewedBy: uid,
    updatedAt: at,
  });
  tx.create(reportRef.collection("history").doc(`recorded_${payment.id}`), {
    type: "Recorded",
    paymentId: payment.id,
    paymentReference: payment.reference,
    actorId: uid,
    at,
  });
  writeDeterministicReportNotificationInTx(tx, {
    actorId: uid,
    report,
    outcome: "recorded",
  });
  markOwnerFinanceDirty(
    db,
    tx,
    propertyId,
    allocations.map((a) => a.bookingId),
    { activityDirty: true },
  );
  if (backgroundMode() !== "legacy") {
    writeProjection(db, tx, "owner_finance", propertyId);
  }

  return {
    paymentId: payment.id,
    reportId: report.id,
    status: "Received" as const,
  };
}
