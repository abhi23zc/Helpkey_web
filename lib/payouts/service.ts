import "server-only";
import { readinessInTransaction } from "../payout-readiness/service";
import {
  readinessStatus,
  requiresBankAcknowledgement,
  type Business,
  type MaskedBank,
} from "../payout-readiness/domain";
import { z } from "zod";
import { adminDb as db } from "../firebase/admin";
import { authorizeFinanceAdmin } from "../finance-settings/service";
import { policySchema, resolvePolicy } from "../finance-settings/domain";
import { propertyAccess } from "../partner/pms/access";
import { ApiException } from "../api/errors";
import { hash, assertBalanced } from "../accounting/domain";
import {
  readEvidence,
  journalCollection,
  stateCollection,
  summary,
} from "../accounting/posting";
import {
  categories,
  bookingPosition,
  deductionsSchema,
  deductionTotal,
  dueGuidance,
  payoutLines,
  type Assessment,
  type Evidence,
} from "./domain";
import type { RecordData } from "../partner/dashboard/domain";

export const collections = {
  payouts: "hotelPayoutsV1",
  assessments: "hotelPayoutAssessmentsV1",
  reservations: "hotelPayoutReservationsV1",
  requests: "hotelPayoutRequestsV1",
};
const id = z
  .string()
  .min(1)
  .max(200)
  .refine((s) => !s.includes("/"));
const bookingIdsSchema = z
  .array(id)
  .min(1)
  .max(
    50,
    "Prepare up to 50 bookings; use another batch for the remaining bookings.",
  )
  .refine((a) => new Set(a).size === a.length);
const common = { requestId: z.string().uuid() };
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("assess"),
      bookingId: id,
      expectedVersion: z.number().int().nonnegative(),
      items: deductionsSchema,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("prepare"),
      bookingIds: bookingIdsSchema,
      expectedReviewFingerprint: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("cancel"),
      payoutId: id,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("pay"),
      payoutId: id,
      paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      method: z.enum(["bank_transfer", "upi", "cheque", "cash", "other"]),
      reference: z.string().trim().min(1).max(200),
      notes: z.string().trim().max(1000).default(""),
      acknowledgedBankVersion: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .strict(),
]);
export type PayoutBooking = {
  bookingId: string;
  reference: string;
  fingerprint: string;
  assessment: Assessment;
  grossPaise: number;
  deductionsPaise: number;
  finalPaise: number;
  verifiedOnlinePaise: number;
  hotelCollectionsPaise: number;
  commissionPaise: number | null;
  checkoutAt: string | null;
  savedDelayDays: number | null;
  eligibleAt: string | null;
  agreementGlobalRevision: number | null;
  agreementHotelRevision: number | null;
};
export type Payout = {
  id: string;
  reference: string;
  propertyId: string;
  hotelName: string;
  status: "Prepared" | "Paid" | "Cancelled";
  bookings: PayoutBooking[];
  grossPaise: number;
  deductionsPaise: number;
  finalPaise: number;
  createdAt: string;
  actorId: string;
  policy: RecordData;
  readinessSnapshot?: {
    business: Business;
    bank: MaskedBank | null;
    ownerId: string;
  };
  payment?: {
    bank?: MaskedBank | null;
    acknowledgedBankVersion?: string | null;
    paymentDate: string;
    method: string;
    reference: string;
    notes: string;
    actorId: string;
    recordedAt: string;
  };
};
async function authorize(
  uid: string,
  propertyId: string,
  tx: FirebaseFirestore.Transaction,
  owner = false,
) {
  id.parse(propertyId);
  if (owner) {
    if (
      (await propertyAccess(uid, propertyId, "property.manage", tx)).role !==
      "owner"
    )
      throw new ApiException(
        "FORBIDDEN",
        403,
        "Only the hotel owner can view payouts.",
      );
    const property = await tx.get(db.collection("properties").doc(propertyId));
    if ((property.get("ownerId") || property.get("partnerId")) !== uid)
      throw new ApiException("FORBIDDEN", 403);
  } else await authorizeFinanceAdmin(uid, tx);
}
async function settings(tx: FirebaseFirestore.Transaction, propertyId: string) {
  const [hotel, global, local] = await Promise.all([
    tx.get(db.collection("properties").doc(propertyId)),
    tx.get(db.collection("hotelFinanceSettingsV1").doc("global")),
    tx.get(db.collection("hotelFinanceSettingsV1").doc(`hotel_${propertyId}`)),
  ]);
  if (!hotel.exists) throw new ApiException("NOT_FOUND", 404);
  const policy = resolvePolicy(
    policySchema.parse(global.get("settings") ?? {}),
    policySchema.parse(local.get("settings") ?? {}),
  ).effective;
  return {
    hotel,
    policy,
    globalRevision: global.get("revision") ?? 0,
    hotelRevision: local.get("revision") ?? 0,
  };
}
async function booking(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  propertyId: string,
  now: Date,
) {
  const [evidence, assessment, reservation] = await Promise.all([
    readEvidence(db, tx, bookingId),
    tx.get(db.collection(collections.assessments).doc(bookingId)),
    tx.get(db.collection(collections.reservations).doc(bookingId)),
  ]);
  if (!evidence.booking || evidence.booking.propertyId !== propertyId)
    throw new ApiException("NOT_FOUND", 404);
  return {
    evidence,
    position: bookingPosition(
      bookingId,
      evidence,
      assessment.exists ? (assessment.data() as Assessment) : null,
      now,
    ),
    reservation: reservation.data() ?? null,
  };
}
function blocked(message: string): never {
  throw new ApiException("PAYOUT_REQUIRES_REVIEW", 409, message);
}
function snapshot(
  position: ReturnType<typeof bookingPosition>,
  evidence: Evidence,
): PayoutBooking {
  return {
    bookingId: position.bookingId,
    reference: position.reference,
    fingerprint: position.fingerprint,
    assessment: position.assessment!,
    grossPaise: position.grossPaise,
    deductionsPaise: position.deductionsPaise!,
    finalPaise: position.finalPaise!,
    verifiedOnlinePaise: position.verifiedOnlinePaise,
    hotelCollectionsPaise: position.hotelCollectionsPaise,
    commissionPaise: position.commissionPaise,
    checkoutAt: position.checkoutAt,
    savedDelayDays: position.savedDelayDays,
    eligibleAt: position.eligibleAt,
    agreementGlobalRevision: evidence.agreement?.globalRevision ?? null,
    agreementHotelRevision: evidence.agreement?.hotelRevision ?? null,
  };
}
async function preparation(
  tx: FirebaseFirestore.Transaction,
  propertyId: string,
  bookingIds: string[],
  now: Date,
) {
  const config = await settings(tx, propertyId);
  const readiness = await readinessInTransaction(tx, propertyId);
  if (config.policy.minimumPayoutPaise === undefined)
    blocked("Configure the current hotel minimum payout before preparation.");
  const rows = await Promise.all(
    [...bookingIds].sort().map((b) => booking(tx, b, propertyId, now)),
  );
  for (const row of rows) {
    if (!row.position.eligible)
      blocked(`${row.position.reference}: ${row.position.reasons.join(" ")}`);
    if (row.reservation && row.reservation.status !== "released")
      blocked("A selected booking is already reserved or paid.");
  }
  const bookings = rows.map((r) => snapshot(r.position, r.evidence));
  const finalPaise = bookings.reduce((n, b) => n + b.finalPaise, 0),
    grossPaise = bookings.reduce((n, b) => n + b.grossPaise, 0);
  if (
    !Number.isSafeInteger(grossPaise) ||
    !Number.isSafeInteger(finalPaise) ||
    finalPaise < config.policy.minimumPayoutPaise!
  )
    blocked(
      "Combined payment after deductions is below the current hotel minimum.",
    );
  const reviewFingerprint = hash([
    propertyId,
    config.hotel.get("name") ?? propertyId,
    bookings,
    config.policy,
    config.hotel.get("timezone") ?? null,
    config.globalRevision,
    config.hotelRevision,
    readiness.business,
    readiness.masked,
    readiness.ownerId,
  ]);
  return {
    config,
    bookings,
    finalPaise,
    grossPaise,
    reviewFingerprint,
    readiness,
  };
}
export async function previewPayout(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  const input = z.object({ bookingIds: bookingIdsSchema }).strict().parse(raw);
  return db.runTransaction(async (tx) => {
    await authorize(uid, propertyId, tx);
    const p = await preparation(tx, propertyId, input.bookingIds, new Date());
    return {
      reviewFingerprint: p.reviewFingerprint,
      hotel: {
        id: propertyId,
        name: String(p.config.hotel.get("name") ?? propertyId),
      },
      bookings: p.bookings.map((b) => ({
        bookingId: b.bookingId,
        reference: b.reference,
        grossPaise: b.grossPaise,
        deductionsPaise: b.deductionsPaise,
        finalPaise: b.finalPaise,
      })),
      grossPaise: p.grossPaise,
      deductionsPaise: p.grossPaise - p.finalPaise,
      finalPaise: p.finalPaise,
      minimumPayoutPaise: p.config.policy.minimumPayoutPaise!,
      deductions: Object.fromEntries(
        categories.map((k) => [
          k,
          p.bookings.reduce((n, b) => {
            const item = b.assessment.items[k];
            return n + (item.status === "amount" ? item.amountPaise : 0);
          }, 0),
        ]),
      ) as Record<(typeof categories)[number], number>,
    };
  });
}
export async function payoutCommand(
  uid: string,
  propertyId: string,
  raw: unknown,
  beforeWrite?: () => void,
) {
  const input = commandSchema.parse(raw),
    fingerprint = hash([propertyId, input]);
  return db.runTransaction(async (tx) => {
    await authorize(uid, propertyId, tx);
    const receiptRef = db
        .collection(collections.requests)
        .doc(hash([uid, input.requestId])),
      receipt = await tx.get(receiptRef);
    if (receipt.exists) {
      if (receipt.get("fingerprint") !== fingerprint)
        throw new ApiException(
          "IDEMPOTENCY_CONFLICT",
          409,
          "Request ID already used with different content.",
        );
      return receipt.get("result") as { id: string; status: string };
    }
    const now = new Date(),
      at = now.toISOString();
    let result: { id: string; status: string };
    if (input.action === "assess") {
      const { position, reservation } = await booking(
        tx,
        input.bookingId,
        propertyId,
        now,
      );
      if (reservation && reservation.status !== "released")
        blocked(
          "Booking is reserved or already paid. Cancel its unpaid payout before changing an assessment.",
        );
      if (position.baseReasons.length) blocked(position.baseReasons.join(" "));
      if ((position.assessment?.version ?? 0) !== input.expectedVersion)
        throw new ApiException(
          "ASSESSMENT_CONFLICT",
          409,
          "Assessment changed. Refresh before saving.",
        );
      const deduction = deductionTotal(input.items);
      if (deduction !== null && deduction >= position.grossPaise)
        blocked(
          "Deductions must leave a positive hotel payment. Credits and unrelated dues are unsupported.",
        );
      const assessment: Assessment = {
        version: input.expectedVersion + 1,
        fingerprint: position.fingerprint,
        items: input.items,
        actorId: uid,
        assessedAt: at,
      };
      const ref = db.collection(collections.assessments).doc(input.bookingId);
      tx.set(ref, assessment);
      tx.create(ref.collection("versions").doc(String(assessment.version)), {
        ...assessment,
        propertyId,
        bookingId: input.bookingId,
      });
      result = { id: input.bookingId, status: "Assessed" };
    } else if (input.action === "prepare") {
      const {
        config,
        bookings,
        finalPaise,
        grossPaise,
        reviewFingerprint,
        readiness,
      } = await preparation(tx, propertyId, input.bookingIds, now);
      if (
        input.expectedReviewFingerprint &&
        input.expectedReviewFingerprint !== reviewFingerprint
      )
        throw new ApiException(
          "PAYOUT_REVIEW_STALE",
          409,
          "This payout changed since your review. Refresh the bookings and review the payout again.",
        );
      const payoutId = hash([uid, input.requestId]),
        ref = db.collection(collections.payouts).doc(payoutId);
      const payout: Payout = {
        id: payoutId,
        reference: `HKP-${payoutId.slice(0, 16).toUpperCase()}`,
        propertyId,
        hotelName: config.hotel.get("name") ?? propertyId,
        status: "Prepared",
        readinessSnapshot: {
          business: readiness.business,
          bank: readiness.masked,
          ownerId: readiness.ownerId,
        },
        bookings,
        grossPaise,
        deductionsPaise: grossPaise - finalPaise,
        finalPaise,
        createdAt: at,
        actorId: uid,
        policy: {
          ...config.policy,
          timezone: config.hotel.get("timezone") ?? null,
          globalRevision: config.globalRevision,
          hotelRevision: config.hotelRevision,
          due: dueGuidance(config.policy, config.hotel.get("timezone"), now),
        },
      };
      tx.create(ref, payout);
      tx.create(ref.collection("history").doc("prepared"), {
        type: "Prepared",
        actorId: uid,
        at,
        amountPaise: finalPaise,
      });
      for (const b of bookings)
        tx.set(db.collection(collections.reservations).doc(b.bookingId), {
          propertyId,
          bookingId: b.bookingId,
          payoutId,
          status: "reserved",
          grossPaise: b.grossPaise,
          deductionsPaise: b.deductionsPaise,
          finalPaise: b.finalPaise,
          fingerprint: b.fingerprint,
          assessmentVersion: b.assessment.version,
          at,
        });
      result = { id: payoutId, status: "Prepared" };
    } else {
      const ref = db.collection(collections.payouts).doc(input.payoutId),
        snap = await tx.get(ref),
        payout = snap.data() as Payout | undefined;
      if (!payout || payout.propertyId !== propertyId)
        throw new ApiException("NOT_FOUND", 404);
      if (payout.status !== "Prepared")
        blocked(
          "Only Prepared payouts can be cancelled or recorded as paid. Paid records are immutable.",
        );
      const reservations = await tx.getAll(
        ...payout.bookings.map((b) =>
          db.collection(collections.reservations).doc(b.bookingId),
        ),
      );
      for (const row of reservations)
        if (
          row.get("propertyId") !== propertyId ||
          row.get("payoutId") !== payout.id ||
          row.get("status") !== "reserved"
        )
          blocked("Reservation changed; reconcile before continuing.");
      if (input.action === "cancel") {
        for (const b of payout.bookings)
          tx.update(db.collection(collections.reservations).doc(b.bookingId), {
            status: "released",
            releasedAt: at,
            releasedBy: uid,
          });
        tx.update(ref, { status: "Cancelled" });
        tx.create(ref.collection("history").doc("cancelled"), {
          type: "Cancelled",
          actorId: uid,
          at,
          reason: input.reason,
        });
        result = { id: payout.id, status: "Cancelled" };
      } else {
        const rows = await Promise.all(
          payout.bookings.map((b) => booking(tx, b.bookingId, propertyId, now)),
        );
        const banking = await readinessInTransaction(tx, propertyId);
        if (
          requiresBankAcknowledgement(
            payout.readinessSnapshot?.bank,
            banking.bankVersion,
          ) &&
          input.acknowledgedBankVersion !== banking.bankVersion
        )
          throw new ApiException(
            "BANK_ACKNOWLEDGEMENT_REQUIRED",
            409,
            "Bank details changed or this payout has no saved bank baseline. Refresh and acknowledge the current bank details before recording payment.",
          );
        const config = await settings(tx, propertyId),
          localToday = dueGuidance(
            { payoutCycle: "daily" },
            config.hotel.get("timezone"),
            now,
          ).date;
        const parsedDate = new Date(`${input.paymentDate}T00:00:00Z`);
        if (
          !localToday ||
          !Number.isFinite(parsedDate.getTime()) ||
          parsedDate.toISOString().slice(0, 10) !== input.paymentDate ||
          input.paymentDate > localToday
        )
          throw new ApiException(
            "INVALID_PAYMENT_DATE",
            422,
            "Payment date must be valid and cannot be in the future in the hotel timezone.",
          );
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i],
            saved = payout.bookings[i];
          if (
            !row.position.eligible ||
            row.position.fingerprint !== saved.fingerprint ||
            row.position.assessment?.version !== saved.assessment.version ||
            hash(row.position.assessment) !== hash(saved.assessment) ||
            row.position.finalPaise !== saved.finalPaise ||
            row.reservation!.finalPaise !== saved.finalPaise ||
            row.reservation!.grossPaise !== saved.grossPaise ||
            row.reservation!.deductionsPaise !== saved.deductionsPaise ||
            row.reservation!.fingerprint !== saved.fingerprint ||
            row.reservation!.assessmentVersion !== saved.assessment.version
          )
            blocked(
              `${saved.reference}: evidence, accounting, reservation or assessment changed. Review or cancel the entire payout; its amount cannot change.`,
            );
        }
        const journalRefs = payout.bookings.map((b) =>
          db
            .collection(journalCollection)
            .doc(hash(["payout", payout.id, b.bookingId])),
        );
        const existing = await tx.getAll(...journalRefs);
        if (existing.some((e) => e.exists))
          blocked(
            "Payout journal already exists; reconcile before continuing.",
          );
        const payment = {
          bank: banking.masked,
          acknowledgedBankVersion: requiresBankAcknowledgement(
            payout.readinessSnapshot?.bank,
            banking.bankVersion,
          )
            ? input.acknowledgedBankVersion!
            : null,
          paymentDate: input.paymentDate,
          method: input.method,
          reference: input.reference,
          notes: input.notes,
          actorId: uid,
          recordedAt: at,
        };
        payout.bookings.forEach((b, i) => {
          const key = journalRefs[i].id,
            evidence = rows[i].evidence;
          const event = {
            id: key,
            key,
            bookingId: b.bookingId,
            propertyId,
            currency: "INR",
            type: "payout",
            sourcePath: `${collections.payouts}/${payout.id}`,
            sourceFingerprint: hash([payout.id, b, payment]),
            occurredAt: `${input.paymentDate}T00:00:00Z`,
            recordedAt: at,
            amountPaise: b.finalPaise,
            status: "recognized",
            lines: payoutLines(b.grossPaise, b.assessment.items),
            payoutId: payout.id,
            deductions: b.assessment.items,
            agreementVersion: evidence.agreement?.agreementVersion ?? null,
            calculationVersion: evidence.agreement?.calculationVersion ?? null,
            globalRevision: b.agreementGlobalRevision,
            hotelRevision: b.agreementHotelRevision,
          };
          assertBalanced(event.lines);
          tx.create(journalRefs[i], event);
          tx.set(
            db.collection(stateCollection).doc(b.bookingId),
            { summary: summary([...evidence.journal, event]) },
            { merge: true },
          );
          tx.update(db.collection(collections.reservations).doc(b.bookingId), {
            status: "consumed",
            consumedAt: at,
          });
        });
        tx.update(ref, { status: "Paid", payment });
        tx.create(ref.collection("history").doc("paid"), {
          type: "Paid",
          actorId: uid,
          at,
          payment,
          amountPaise: payout.finalPaise,
        });
        result = { id: payout.id, status: "Paid" };
      }
    }
    tx.create(receiptRef, {
      fingerprint,
      result,
      actorId: uid,
      propertyId,
      at,
    });
    beforeWrite?.();
    return result;
  });
}

async function hotelView(
  tx: FirebaseFirestore.Transaction,
  propertyId: string,
  owner: boolean,
) {
  const config = await settings(tx, propertyId),
    now = new Date();
  const payouts = (
    await tx.get(
      db.collection(collections.payouts).where("propertyId", "==", propertyId),
    )
  ).docs
    .map((d) => d.data() as Payout)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const bookings = owner
    ? []
    : (
        await tx.get(
          db.collection("bookings").where("propertyId", "==", propertyId),
        )
      ).docs;
  const rows = await Promise.all(
    bookings.map((b) => booking(tx, b.id, propertyId, now)),
  );
  const positions = rows.map((r) => ({
    ...r.position,
    reservation: r.reservation,
  }));
  const warnings = new Map<string, string[]>();
  // Owner history also checks prepared evidence without exposing assessment drafts.
  for (const payout of payouts.filter((p) => p.status !== "Cancelled")) {
    const checks = owner
      ? (
          await Promise.all(
            payout.bookings.map(async (b) => {
              const source = await tx.get(
                db.collection("bookings").doc(b.bookingId),
              );
              return source.get("propertyId") === propertyId
                ? booking(tx, b.bookingId, propertyId, now)
                : null;
            }),
          )
        ).filter((r): r is NonNullable<typeof r> => r !== null)
      : rows;
    const changed = payout.bookings.filter((b) => {
      const row = checks.find((r) => r.position.bookingId === b.bookingId);
      return (
        !row ||
        row.position.fingerprint !== b.fingerprint ||
        row.position.assessment?.version !== b.assessment.version ||
        row.reservation?.payoutId !== payout.id ||
        (payout.status === "Prepared"
          ? !row.position.eligible || row.reservation?.status !== "reserved"
          : row.evidence.state.dirty ||
            row.evidence.state.status === "review" ||
            row.reservation?.status !== "consumed")
      );
    });
    if (changed.length)
      warnings.set(
        payout.id,
        changed.map(
          (b) =>
            `${b.reference}: evidence changed; ${payout.status === "Paid" ? "recorded payment is preserved; accounting requires review" : "payment recording requires review"}.`,
        ),
      );
  }
  const readiness = await readinessInTransaction(tx, propertyId);
  const history = await Promise.all(
    payouts.map(async (p) => {
      const hideFormerBank =
        owner && p.readinessSnapshot?.ownerId !== readiness.ownerId;
      const events = (
        await tx.get(
          db.collection(collections.payouts).doc(p.id).collection("history"),
        )
      ).docs
        .map((d) => d.data())
        .sort((a, b) => a.at.localeCompare(b.at));
      return {
        ...p,
        ...(hideFormerBank
          ? {
              readinessSnapshot: p.readinessSnapshot
                ? { ...p.readinessSnapshot, bank: null }
                : undefined,
              ...(p.payment ? { payment: { ...p.payment, bank: null } } : {}),
            }
          : {}),
        bankAcknowledgementRequired:
          p.status === "Prepared" &&
          requiresBankAcknowledgement(
            p.readinessSnapshot?.bank,
            readiness.bankVersion,
          ),
        currentBankVersion: readiness.bankVersion,
        currentBank: owner ? null : readiness.masked,
        reviewWarnings: warnings.get(p.id) ?? [],
        history: hideFormerBank
          ? events.map((e) =>
              e.payment ? { ...e, payment: { ...e.payment, bank: null } } : e,
            )
          : events,
      };
    }),
  );
  const sum = (
    filter: (p: (typeof positions)[number]) => boolean,
    key: "grossPaise" | "finalPaise",
  ) =>
    positions.filter(filter).reduce((n, p) => n + Math.max(0, p[key] ?? 0), 0);
  return {
    hotel: { id: propertyId, name: config.hotel.get("name") ?? propertyId },
    readiness: {
      ...readinessStatus(readiness.complete, readiness.reviewed),
      href: owner
        ? `/partner/settings/bank?propertyId=${encodeURIComponent(propertyId)}`
        : `/admin/properties/${encodeURIComponent(propertyId)}/payout-readiness`,
    },
    policy: config.policy,
    due: dueGuidance(config.policy, config.hotel.get("timezone"), now),
    positions,
    payouts: history,
    totals: {
      pendingOnlinePaise: positions.reduce(
        (n, p) => n + p.pendingOnlinePaise,
        0,
      ),
      pendingHotelPaise: positions.reduce((n, p) => n + p.pendingHotelPaise, 0),
      waitingPaise: sum(
        (p) =>
          p.baseReasons.includes(
            "Saved payout waiting period has not elapsed.",
          ),
        "grossPaise",
      ),
      unassessedPaise: sum(
        (p) =>
          !p.baseReasons.length &&
          (!p.assessmentCurrent || p.deductionsPaise === null),
        "grossPaise",
      ),
      eligiblePaise: sum(
        (p) =>
          p.eligible && (!p.reservation || p.reservation.status === "released"),
        "finalPaise",
      ),
      reservedPaise: payouts
        .filter((p) => p.status === "Prepared")
        .reduce((n, p) => n + p.finalPaise, 0),
      paidPaise: payouts
        .filter((p) => p.status === "Paid")
        .reduce((n, p) => n + p.finalPaise, 0),
    },
  };
}
export async function readPayouts(
  uid: string,
  propertyId: string,
  owner = false,
  payoutId?: string | null,
) {
  return db.runTransaction(async (tx) => {
    await authorize(uid, propertyId, tx, owner);
    const view = await hotelView(tx, propertyId, owner);
    if (!payoutId) return view;
    id.parse(payoutId);
    const payout = view.payouts.find((p) => p.id === payoutId);
    if (!payout) throw new ApiException("NOT_FOUND", 404);
    return { ...view, payouts: [payout] };
  });
}
export async function payoutHotels(uid: string, after?: string | null) {
  return db.runTransaction(async (tx) => {
    await authorizeFinanceAdmin(uid, tx);
    let query = db.collection("properties").orderBy("__name__").limit(20);
    if (after) query = query.startAfter(id.parse(after));
    const hotels = await tx.get(query);
    const views = await Promise.all(
      hotels.docs.map((d) => hotelView(tx, d.id, false)),
    );
    return {
      hotels: views.map((v) => ({
        ...v.hotel,
        totals: v.totals,
        readiness: v.readiness,
        due: v.due,
        blockers: [
          ...new Set([
            ...(v.policy.minimumPayoutPaise === undefined
              ? ["Minimum payout is unconfigured."]
              : []),
            ...v.positions.flatMap((p) => p.reasons),
          ]),
        ],
      })),
      nextCursor: hotels.size === 20 ? hotels.docs.at(-1)!.id : null,
    };
  });
}
