import "server-only";
import { z } from "zod";
import { adminDb as db } from "../firebase/admin";
import { ApiException } from "../api/errors";
import { authorizeFinanceAdmin } from "../finance-settings/service";
import { propertyAccess } from "../partner/pms/access";
import { policySchema, resolvePolicy } from "../finance-settings/domain";
import { hash, assertBalanced } from "../accounting/domain";
import {
  readEvidence,
  eligible,
  stateCollection,
  journalCollection,
  summary,
} from "../accounting/posting";
import {
  allocate,
  duesPosition,
  idSchema,
  normalizeReference,
  paymentInput,
  referenceKey,
  validatePaymentDate,
  type Allocation,
  type Correction,
  type PaymentInput,
  type Receipt,
} from "./domain";
import {
  duesCollections as collections,
  receiptJournal,
  correctionJournal,
  journalFindings,
} from "./journal";
export { duesCollections as collections } from "./journal";
const uuid = z.string().uuid();
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("preview_payment"),
      requestId: uuid,
      payment: paymentInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("preview_correction"),
      requestId: uuid,
      paymentId: idSchema,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.enum(["record_payment", "correct_payment"]),
      requestId: uuid,
      confirmationId: idSchema,
    })
    .strict(),
]);
type Snapshot = { bookingId: string; fingerprint: string; duesPaise: number };
export type Confirmation = {
  id: string;
  propertyId: string;
  actorId: string;
  hotelName: string;
  createdAt: string;
  expiresAt: string;
  snapshots: Snapshot[];
  allocations: Allocation[];
} & (
  | { kind: "payment"; payment: PaymentInput; maximumPaise: number }
  | {
      kind: "correction";
      paymentId: string;
      reason: string;
      receiptFingerprint: string;
      amountPaise: number;
    }
);
export type CommandResult =
  | { confirmation: Confirmation }
  | { paymentId: string; status: "Received" | "Corrected" };
function conflict(message: string, code = "DUES_REQUIRES_REVIEW"): never {
  throw new ApiException(code, 409, message);
}
async function authorize(
  uid: string,
  propertyId: string,
  tx: FirebaseFirestore.Transaction,
  owner = false,
) {
  idSchema.parse(propertyId);
  if (owner) {
    if (
      (await propertyAccess(uid, propertyId, "property.manage", tx)).role !==
      "owner"
    )
      throw new ApiException(
        "FORBIDDEN",
        403,
        "Only the hotel owner can view hotel dues.",
      );
  } else await authorizeFinanceAdmin(uid, tx);
}
async function context(tx: FirebaseFirestore.Transaction, propertyId: string) {
  const [hotel, payments, corrections] = await Promise.all([
    tx.get(db.collection("properties").doc(propertyId)),
    tx.get(
      db.collection(collections.receipts).where("propertyId", "==", propertyId),
    ),
    tx.get(
      db
        .collection(collections.corrections)
        .where("propertyId", "==", propertyId),
    ),
  ]);
  if (!hotel.exists) throw new ApiException("NOT_FOUND", 404);
  return {
    hotel,
    receipts: payments.docs.map((d) => d.data() as Receipt),
    corrections: corrections.docs.map((d) => d.data() as Correction),
  };
}
async function rows(
  tx: FirebaseFirestore.Transaction,
  propertyId: string,
  bookingIds: string[],
  ctx: Awaited<ReturnType<typeof context>>,
  allowMissing = false,
) {
  return Promise.all(
    [...bookingIds].sort().map(async (bookingId) => {
      const evidence = await readEvidence(db, tx, bookingId);
      if (
        !allowMissing &&
        (!evidence.booking || evidence.booking.propertyId !== propertyId)
      )
        throw new ApiException("NOT_FOUND", 404);
      if (evidence.booking?.propertyId !== propertyId)
        evidence.booking = undefined;
      const historyReasons = journalFindings(
        bookingId,
        propertyId,
        evidence.journal,
        ctx.receipts,
        ctx.corrections,
      );
      if (evidence.journal.some((j) => j.propertyId !== propertyId))
        historyReasons.push(
          "The booking journal includes another hotel's entries. Review accounting.",
        );
      return {
        evidence,
        historyReasons,
        position: duesPosition(bookingId, evidence, historyReasons),
      };
    }),
  );
}
function snapshots(data: Awaited<ReturnType<typeof rows>>): Snapshot[] {
  return data.map((r) => ({
    bookingId: r.position.bookingId,
    fingerprint: r.position.fingerprint,
    duesPaise: r.position.duesPaise,
  }));
}
async function referenceGuard(
  tx: FirebaseFirestore.Transaction,
  propertyId: string,
  input: PaymentInput,
  ctx: Awaited<ReturnType<typeof context>>,
) {
  const ref = db
      .collection(collections.references)
      .doc(referenceKey(propertyId, input.method, input.transactionReference)),
    stored = await tx.get(ref);
  if (input.replacesId) {
    const original = ctx.receipts.find((r) => r.id === input.replacesId),
      correction = ctx.corrections.find(
        (c) => c.paymentId === input.replacesId,
      );
    if (
      !original ||
      !correction ||
      correction.receiptFingerprint !== hash(original) ||
      original.method !== input.method ||
      original.normalizedReference !==
        normalizeReference(input.transactionReference) ||
      stored.get("latestPaymentId") !== original.id
    )
      conflict(
        "A replacement must use the corrected record's method and reference and cannot replace it twice.",
        "DUES_REPLACEMENT_CONFLICT",
      );
  } else if (
    stored.exists ||
    ctx.receipts.some(
      (r) =>
        r.method === input.method &&
        r.normalizedReference ===
          normalizeReference(input.transactionReference),
    )
  )
    conflict(
      "This hotel and payment method already have a payment with this transaction reference. Open its history instead of recording it again.",
      "DUPLICATE_TRANSACTION_REFERENCE",
    );
  return ref;
}
export async function duesCommand(
  uid: string,
  propertyId: string,
  raw: unknown,
  beforeWrite?: () => void,
): Promise<CommandResult> {
  const input = commandSchema.parse(raw),
    fingerprint = hash([propertyId, input]);
  return db.runTransaction(async (tx) => {
    await authorize(uid, propertyId, tx);
    const requestRef = db
        .collection(collections.requests)
        .doc(hash([uid, input.requestId])),
      prior = await tx.get(requestRef);
    if (prior.exists) {
      if (prior.get("fingerprint") !== fingerprint)
        conflict(
          "This request ID was already used with different details.",
          "IDEMPOTENCY_CONFLICT",
        );
      return prior.get("result") as CommandResult;
    }
    const ctx = await context(tx, propertyId),
      now = new Date(),
      at = now.toISOString();
    let result: CommandResult;
    if (
      input.action === "preview_payment" ||
      input.action === "preview_correction"
    ) {
      const base = {
        id: hash([uid, input.requestId]),
        propertyId,
        actorId: uid,
        hotelName: String(ctx.hotel.get("name") ?? propertyId),
        createdAt: at,
        expiresAt: new Date(now.getTime() + 600000).toISOString(),
      };
      let confirmation: Confirmation;
      if (input.action === "preview_payment") {
        try {
          validatePaymentDate(
            input.payment.paymentDate,
            ctx.hotel.get("timezone"),
            now,
          );
        } catch (error) {
          throw new ApiException(
            "INVALID_PAYMENT_DATE",
            422,
            (error as Error).message,
          );
        }
        await referenceGuard(tx, propertyId, input.payment, ctx);
        const data = await rows(tx, propertyId, input.payment.bookingIds, ctx);
        if (data.some((r) => !r.position.collectible))
          conflict(
            "A selected booking needs attention. Refresh the outstanding dues and review accounting.",
          );
        const maximumPaise = data.reduce((n, r) => n + r.position.duesPaise, 0);
        if (input.payment.amountPaise > maximumPaise)
          throw new ApiException(
            "DUES_OVERPAYMENT",
            422,
            `Maximum for the selected bookings is ₹${(maximumPaise / 100).toFixed(2)}. Enter this amount or less.`,
          );
        confirmation = {
          ...base,
          kind: "payment",
          payment: input.payment,
          maximumPaise,
          snapshots: snapshots(data),
          allocations: allocate(
            data.map((r) => r.position),
            input.payment.amountPaise,
          ),
        };
      } else {
        const receipt = ctx.receipts.find((r) => r.id === input.paymentId);
        if (!receipt) throw new ApiException("NOT_FOUND", 404);
        if (ctx.corrections.some((c) => c.paymentId === receipt.id))
          conflict(
            "This payment record has already been corrected.",
            "DUES_ALREADY_CORRECTED",
          );
        const data = await rows(
          tx,
          propertyId,
          receipt.allocations.map((a) => a.bookingId),
          ctx,
          true,
        );
        if (data.some((r) => r.historyReasons.length))
          conflict(
            "Reconcile the original payment journal before correcting it.",
          );
        confirmation = {
          ...base,
          kind: "correction",
          paymentId: receipt.id,
          reason: input.reason,
          amountPaise: receipt.amountPaise,
          receiptFingerprint: hash(receipt),
          snapshots: snapshots(data),
          allocations: receipt.allocations,
        };
      }
      tx.create(
        db.collection(collections.confirmations).doc(confirmation.id),
        confirmation,
      );
      result = { confirmation };
    } else {
      const stored = await tx.get(
          db.collection(collections.confirmations).doc(input.confirmationId),
        ),
        preview = stored.data() as Confirmation | undefined;
      if (
        !preview ||
        preview.actorId !== uid ||
        preview.propertyId !== propertyId
      )
        throw new ApiException("NOT_FOUND", 404);
      if (
        preview.kind !==
        (input.action === "record_payment" ? "payment" : "correction")
      )
        conflict("The confirmation does not match this action.");
      if (Date.parse(preview.expiresAt) <= now.getTime())
        conflict(
          "This confirmation expired. Review the allocation again.",
          "DUES_CONFIRMATION_EXPIRED",
        );
      const data = await rows(
        tx,
        propertyId,
        preview.snapshots.map((s) => s.bookingId),
        ctx,
        preview.kind === "correction",
      );
      if (hash(snapshots(data)) !== hash(preview.snapshots))
        conflict(
          "Outstanding dues or supporting evidence changed. Review an updated allocation before confirming again.",
          "DUES_CONFIRMATION_STALE",
        );
      if (preview.kind === "payment") {
        try {
          validatePaymentDate(
            preview.payment.paymentDate,
            ctx.hotel.get("timezone"),
            now,
          );
        } catch (error) {
          throw new ApiException(
            "INVALID_PAYMENT_DATE",
            422,
            (error as Error).message,
          );
        }
        const referenceRef = await referenceGuard(
          tx,
          propertyId,
          preview.payment,
          ctx,
        );
        if (
          data.some((r) => !r.position.collectible) ||
          hash(
            allocate(
              data.map((r) => r.position),
              preview.payment.amountPaise,
            ),
          ) !== hash(preview.allocations)
        )
          conflict(
            "Review an updated allocation before confirming again.",
            "DUES_CONFIRMATION_STALE",
          );
        const paymentId = preview.id,
          paymentRef = db.collection(collections.receipts).doc(paymentId);
        const existing = await tx.get(paymentRef);
        if (existing.exists)
          conflict(
            "This confirmation has already been recorded. Refresh payment history.",
            "DUES_CONFIRMATION_USED",
          );
        const payment: Receipt = {
          id: paymentId,
          reference: `HKD-${paymentId.slice(0, 16).toUpperCase()}`,
          propertyId,
          hotelName: preview.hotelName,
          amountPaise: preview.payment.amountPaise,
          paymentDate: preview.payment.paymentDate,
          method: preview.payment.method,
          transactionReference: preview.payment.transactionReference,
          normalizedReference: normalizeReference(
            preview.payment.transactionReference,
          ),
          notes: preview.payment.notes,
          allocations: preview.allocations,
          actorId: uid,
          recordedAt: at,
          replacesId: preview.payment.replacesId,
        };
        const events = payment.allocations.map((a) =>
          receiptJournal(payment, a.bookingId),
        );
        const existingEvents = await tx.getAll(
          ...events.map((e) => db.collection(journalCollection).doc(e.id)),
        );
        if (existingEvents.some((e) => e.exists))
          conflict(
            "A payment journal reference already exists; review accounting.",
          );
        tx.create(paymentRef, payment);
        tx.create(paymentRef.collection("history").doc("received"), {
          type: "Payment received",
          actorId: uid,
          at,
          amountPaise: payment.amountPaise,
          replacesId: payment.replacesId,
        });
        if (payment.replacesId)
          tx.create(
            db
              .collection(collections.receipts)
              .doc(payment.replacesId)
              .collection("history")
              .doc("replacement"),
            { type: "Replacement recorded", paymentId, actorId: uid, at },
          );
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
        result = { paymentId, status: "Received" };
      } else {
        const receipt = ctx.receipts.find((r) => r.id === preview.paymentId);
        if (!receipt || hash(receipt) !== preview.receiptFingerprint)
          conflict("The original payment needs review.");
        if (ctx.corrections.some((c) => c.paymentId === receipt.id))
          conflict(
            "This payment record has already been corrected.",
            "DUES_ALREADY_CORRECTED",
          );
        if (data.some((r) => r.historyReasons.length))
          conflict(
            "Reconcile the original payment journal before correcting it.",
          );
        const correction: Correction = {
          id: receipt.id,
          paymentId: receipt.id,
          propertyId,
          actorId: uid,
          reason: preview.reason,
          recordedAt: at,
          receiptFingerprint: hash(receipt),
        };
        const events = receipt.allocations.map((a) =>
          correctionJournal(receipt, correction, a.bookingId),
        );
        const existingEvents = await tx.getAll(
          ...events.map((e) => db.collection(journalCollection).doc(e.id)),
        );
        if (existingEvents.some((e) => e.exists))
          conflict("The correction journal already exists; review accounting.");
        tx.create(
          db.collection(collections.corrections).doc(correction.id),
          correction,
        );
        tx.create(
          db
            .collection(collections.receipts)
            .doc(receipt.id)
            .collection("history")
            .doc("corrected"),
          {
            type: "Recording corrected",
            reason: correction.reason,
            actorId: uid,
            at,
            amountPaise: receipt.amountPaise,
          },
        );
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
        result = { paymentId: receipt.id, status: "Corrected" };
      }
    }
    tx.create(requestRef, {
      fingerprint,
      propertyId,
      actorId: uid,
      at,
      result,
    });
    beforeWrite?.();
    return result;
  });
}
export async function readDues(
  uid: string,
  propertyId: string,
  owner = false,
  paymentId?: string | null,
) {
  return db.runTransaction(async (tx) => {
    await authorize(uid, propertyId, tx, owner);
    const ctx = await context(tx, propertyId);
    const [bookings, global, local] = await Promise.all([
      tx.get(db.collection("bookings").where("propertyId", "==", propertyId)),
      tx.get(db.collection("hotelFinanceSettingsV1").doc("global")),
      tx.get(
        db.collection("hotelFinanceSettingsV1").doc(`hotel_${propertyId}`),
      ),
    ]);
    const bookingIds = [
      ...new Set([
        ...bookings.docs.map((b) => b.id),
        ...ctx.receipts.flatMap((r) => r.allocations.map((a) => a.bookingId)),
      ]),
    ];
    const data = await rows(tx, propertyId, bookingIds, ctx, true);
    const positions = data.map((r) => r.position),
      outstanding = positions
        .filter((p) => p.collectible)
        .sort(
          (a, b) =>
            a.firstRecordedAt!.localeCompare(b.firstRecordedAt!) ||
            a.bookingId.localeCompare(b.bookingId),
        );
    const attention = data
      .filter(({ position: p, evidence, historyReasons }) => {
        // Unenrolled historical bookings with no posted money have no dues to review.
        const untouchedHistorical =
          evidence.booking &&
          !eligible(evidence.booking, evidence.state ?? {}) &&
          p.duesPaise === 0 &&
          Object.values(evidence.state?.summary ?? {}).every(
            (value) => value === 0,
          ) &&
          historyReasons.length === 0 &&
          !evidence.journal.some((event) =>
            event.lines.some(
              (line) => line.debitPaise !== 0 || line.creditPaise !== 0,
            ),
          ) &&
          !ctx.receipts.some((r) =>
            r.allocations.some((a) => a.bookingId === p.bookingId),
          );
        return p.reasons.length > 0 && !untouchedHistorical;
      })
      .map(({ position }) => position);
    const policy = resolvePolicy(
      policySchema.parse(global.get("settings") ?? {}),
      policySchema.parse(local.get("settings") ?? {}),
    ).effective;
    const outstandingPaise = outstanding.reduce((n, p) => n + p.duesPaise, 0);
    const history = await Promise.all(
      ctx.receipts
        .sort(
          (a, b) =>
            b.recordedAt.localeCompare(a.recordedAt) ||
            b.id.localeCompare(a.id),
        )
        .map(async (r) => {
          const correction =
            ctx.corrections.find((c) => c.paymentId === r.id) ?? null;
          return {
            ...r,
            status: correction ? "Corrected" : "Received",
            correction,
            replacedBy:
              ctx.receipts.find((p) => p.replacesId === r.id)?.id ?? null,
            needsAttention: r.allocations.some(
              (a) =>
                positions.find((p) => p.bookingId === a.bookingId)?.reasons
                  .length,
            ),
            history: (
              await tx.get(
                db
                  .collection(collections.receipts)
                  .doc(r.id)
                  .collection("history"),
              )
            ).docs
              .map((d) => d.data())
              .sort((a, b) => a.at.localeCompare(b.at)),
          };
        }),
    );
    if (paymentId && !history.some((r) => r.id === idSchema.parse(paymentId)))
      throw new ApiException("NOT_FOUND", 404);
    return {
      hotel: {
        id: propertyId,
        name: String(ctx.hotel.get("name") ?? propertyId),
        timezone: (ctx.hotel.get("timezone") as string | undefined) ?? null,
      },
      totals: {
        outstandingPaise,
        paymentsReceivedPaise: ctx.receipts
          .filter((r) => !ctx.corrections.some((c) => c.paymentId === r.id))
          .reduce((n, r) => n + r.amountPaise, 0),
        bookingsNeedingAttention: attention.length,
      },
      outstanding,
      attention,
      payments: paymentId ? history.filter((r) => r.id === paymentId) : history,
      policy: {
        duesLimit: policy.duesLimit ?? null,
        duesWarningPaise: policy.duesWarningPaise ?? null,
        duesGraceDays: policy.duesGraceDays ?? null,
      },
      warnings: [
        ...(outstandingPaise > 0 &&
        policy.duesWarningPaise !== undefined &&
        outstandingPaise >= policy.duesWarningPaise
          ? [
              "Hotel owes Helpkey an amount at or above the configured warning threshold.",
            ]
          : []),
        ...(outstandingPaise > 0 &&
        policy.duesLimit?.type === "limited" &&
        outstandingPaise >= policy.duesLimit.amountPaise
          ? [
              "Hotel owes Helpkey an amount at or above the configured dues limit.",
            ]
          : []),
      ],
    };
  });
}
