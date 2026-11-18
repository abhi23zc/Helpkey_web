import "server-only";
import {
  documentSources,
  reductions,
  type ClaimState,
} from "../invoices/domain";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import {
  operationalAccess,
  propertyAccess,
  operationalRestriction,
} from "@/lib/partner/pms/access";
import { todayTransaction } from "@/lib/partner/today/cache";
import { safeData } from "@/lib/partner/reservations/operations";
import { stayFinancials } from "@/lib/stay/domain";
import {
  billingCommand,
  reconciliation,
  remainingEntry,
  type BillingEntry,
} from "./domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";

export async function readBillingSources(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
) {
  const ref = adminDb.collection("bookings").doc(bookingId);
  const [entries, property, online, refunds] = await Promise.all([
    tx.get(ref.collection("billingEntries")),
    tx.get(
      adminDb
        .collection("propertyPayments")
        .where("bookingId", "==", bookingId),
    ),
    tx.get(
      adminDb.collection("paymentAttempts").where("bookingId", "==", bookingId),
    ),
    tx.get(adminDb.collection("refunds").where("bookingId", "==", bookingId)),
  ]);
  const rows = (
    s: FirebaseFirestore.QuerySnapshot,
    source: string,
  ): RecordData[] =>
    s.docs.map((d) => ({
      ...safeData(d.data()),
      id: d.id,
      source,
      sourceId: `${source}/${d.id}`,
    }));
  return {
    entries: rows(entries, "billing_entry") as BillingEntry[],
    property: rows(property, "property_payment"),
    online: rows(online, "provider_payment"),
    refunds: rows(refunds, "provider_refund"),
  };
}
export function requireReconciled(
  b: RecordData,
  sources: Awaited<ReturnType<typeof readBillingSources>>,
) {
  const model = reconciliation(
    b,
    sources.entries,
    sources.property,
    sources.online,
    sources.refunds,
  );
  if (model.warnings.length)
    throw new ApiException(
      "BILLING_RECONCILIATION_REQUIRED",
      409,
      model.warnings.join(" "),
    );
  return model;
}
export async function readFolio(
  uid: string,
  bookingId: string,
  before?: string,
  expectedRevision?: number,
  expectedVersion?: string,
) {
  return adminDb.runTransaction(async (tx) => {
    const b = (
      await tx.get(adminDb.collection("bookings").doc(bookingId))
    ).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    const access = await propertyAccess(uid, b.propertyId, "payment.read", tx);
    const restriction = await operationalRestriction(
      access,
      b.propertyId,
      "payment.read",
      tx,
    );
    const sources = await readBillingSources(tx, bookingId);
    const model = reconciliation(
      b,
      sources.entries,
      sources.property,
      sources.online,
      sources.refunds,
    );
    const statementVersion = createHash("sha256")
      .update(JSON.stringify(model))
      .digest("hex");
    if (
      expectedRevision !== undefined &&
      (expectedRevision !== model.revision ||
        expectedVersion !== statementVersion)
    )
      throw new ApiException(
        "BILLING_CHANGED",
        409,
        "Billing changed. Refresh the folio before printing.",
      );
    const sorted = sources.entries.sort(
      (a, b) => b.revision - a.revision || b.id.localeCompare(a.id),
    );
    const offset = before ? sorted.findIndex((e) => e.id === before) + 1 : 0;
    if (before && offset === 0) throw new ApiException("INVALID_CURSOR", 422);
    const page = sorted.slice(offset, offset + 50);
    return {
      ...model,
      statementVersion,
      bookingId,
      reference:
        b.confirmationCode ?? b.bookingReference ?? b.reference ?? bookingId,
      hotel: access.property.name ?? "Hotel",
      timezone: b.timezone ?? access.property.timezone ?? "Asia/Kolkata",
      entries: expectedRevision !== undefined ? sorted : page,
      nextCursor: sorted.length > offset + 50 ? page[49].id : null,
      capabilities: {
        post:
          ["confirmed", "checked_in", "checked_out", "completed"].includes(
            b.bookingStatus,
          ) &&
          !restriction &&
          !model.warnings.length &&
          access.permissions.includes("billing.post"),
        adjust:
          ["confirmed", "checked_in", "checked_out", "completed"].includes(
            b.bookingStatus,
          ) &&
          !restriction &&
          !model.warnings.length &&
          access.permissions.includes("billing.adjust"),
      },
      restriction: restriction?.message ?? null,
    };
  });
}
export async function commandFolio(
  uid: string,
  bookingId: string,
  raw: unknown,
  key: string,
) {
  const input = billingCommand.parse(raw);
  if (!key || key.length > 180)
    throw new ApiException("IDEMPOTENCY_KEY_REQUIRED", 422);
  const id = createHash("sha256")
    .update(`${uid}\0${bookingId}\0${key}`)
    .digest("hex");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  return todayTransaction(async (tx, changed) => {
    const ref = adminDb.collection("bookings").doc(bookingId);
    const b = (await tx.get(ref)).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    const access = await operationalAccess(
      uid,
      b.propertyId,
      input.action === "post" ? "billing.post" : "billing.adjust",
      tx,
    );
    const requestRef = ref.collection("billingRequests").doc(id);
    const previous = await tx.get(requestRef);
    if (previous.exists) {
      if (previous.get("fingerprint") !== fingerprint)
        throw new ApiException("IDEMPOTENCY_CONFLICT", 409);
      return previous.get("result") as { id: string; revision: number };
    }
    if (
      !["confirmed", "checked_in", "checked_out", "completed"].includes(
        b.bookingStatus,
      )
    )
      throw new ApiException(
        "BILLING_STATE_CONFLICT",
        409,
        "This reservation cannot accept billing entries.",
      );
    if ((b.billingRevision ?? 0) !== input.expectedRevision)
      throw new ApiException(
        "BILLING_CHANGED",
        409,
        "Billing changed. Refresh and review your retained draft.",
      );
    const sources = await readBillingSources(tx, bookingId);
    const current = requireReconciled(b, sources);
    if (
      input.expectedStatementVersion &&
      input.expectedStatementVersion !==
        createHash("sha256").update(JSON.stringify(current)).digest("hex")
    )
      throw new ApiException(
        "BILLING_CHANGED",
        409,
        "Financial sources changed. Refresh and review your retained draft.",
      );
    const revision = (b.billingRevision ?? 0) + 1;
    const base = {
      propertyId: b.propertyId,
      bookingId,
      requestId: id,
      actorId: uid,
      actorName: access.user.fullName || "Staff",
      createdAt: FieldValue.serverTimestamp(),
      revision,
    };
    const additions: BillingEntry[] = [];
    if (input.action === "correct" || input.action === "void") {
      const original = sources.entries.find(
        (e) => e.id === input.originalEntryId && !e.originalEntryId,
      );
      if (!original || remainingEntry(original, sources.entries) === 0)
        throw new ApiException(
          "ENTRY_ALREADY_NEUTRALIZED",
          409,
          "Choose an outstanding original billing entry.",
        );
      additions.push({
        ...base,
        id,
        type: "compensation",
        amountPaise: -remainingEntry(original, sources.entries),
        originalEntryId: original.id,
        ...(original.reductionSourceId
          ? { reductionSourceId: original.reductionSourceId }
          : {}),
        ...(original.stayChangeId
          ? { stayChangeId: original.stayChangeId }
          : {}),
        reason: input.reason,
        category: original.category,
        description: original.description,
        details: original.details,
      });
      if (input.action === "correct")
        additions.push({
          ...base,
          id: `${id}-replacement`,
          type: original.type,
          amountPaise: (original.amountPaise < 0 ? -1 : 1) * input.amountPaise,
          originalEntryId: null,
          replacesEntryId: original.id,
          ...(original.reductionSourceId
            ? { reductionSourceId: original.reductionSourceId }
            : {}),
          ...(original.stayChangeId
            ? { stayChangeId: original.stayChangeId }
            : {}),
          reason: input.reason,
          category: input.category,
          description: input.description,
          details: input.details,
        });
    } else {
      additions.push({
        ...base,
        id,
        type: input.action === "credit" ? "credit" : "charge",
        amountPaise: (input.action === "credit" ? -1 : 1) * input.amountPaise,
        originalEntryId: null,
        reason: input.action === "credit" ? input.reason : null,
        category: input.category,
        description: input.description,
        details: input.details,
      });
    }
    const invoiceState = (
      await tx.get(ref.collection("invoiceWorkspace").doc("state"))
    ).data() as ClaimState | undefined;
    const posting = prepareFolioPosting(
      b,
      sources.entries,
      additions,
      invoiceState,
    );
    for (const { id: entryId, ...entry } of additions)
      tx.create(ref.collection("billingEntries").doc(entryId), entry);
    const result = { id, revision };
    tx.create(requestRef, {
      fingerprint,
      result,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(ref.collection("events").doc(id), {
      ...base,
      type: `billing_${input.action}`,
      amountPaise: additions.reduce((n, e) => n + e.amountPaise, 0),
    });
    tx.update(ref, {
      ...posting,
      reservationRevision: (b.reservationRevision ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    changed(b.propertyId);
    return result;
  });
}

/** Pure transaction-safe posting validation. Callers read sources and claims before any writes. */
export function prepareFolioPosting(
  b: RecordData,
  entries: BillingEntry[],
  additions: BillingEntry[],
  invoiceState?: ClaimState,
) {
  const revision = (b.billingRevision ?? 0) + 1;
  const all = [...entries, ...additions];
  if (invoiceState) {
    const currentSources = documentSources(b, all);
    for (const [sourceId, claimed] of Object.entries(invoiceState.claims)) {
      if (
        claimed < 0 &&
        (currentSources.find((l) => l.id === sourceId)?.amountPaise ?? 0) >
          claimed
      )
        throw new ApiException(
          "DEBIT_NOTE_REQUIRED",
          409,
          "This reduction is already documented on an invoice. Reversing it requires external accountant review.",
        );
    }
    const available = reductions(currentSources, invoiceState);
    for (const [sourceId, documented] of Object.entries(
      invoiceState.reductionClaims,
    )) {
      if (
        documented >
        (available.find((l) => l.id === sourceId)?.amountPaise ?? 0)
      )
        throw new ApiException(
          "DEBIT_NOTE_REQUIRED",
          409,
          "This reduction has a credit note. Reversing it requires an unsupported debit-note workflow. Ask your accountant to review externally.",
        );
    }
  }
  const net = all.reduce((n, e) => n + e.amountPaise, 0);
  const effective =
    (b.totalPaise ?? 0) - (b.customizationCreditPaise ?? 0) + net;
  if (![net, effective, revision].every(Number.isSafeInteger) || effective < 0)
    throw new ApiException(
      "BILLING_AMOUNT_INVALID",
      422,
      "This adjustment would create negative or unsafe effective charges.",
    );
  const openCount = all.filter(
    (e) => !e.originalEntryId && remainingEntry(e, all) !== 0,
  ).length;
  const updated = { ...b, billingNetPaise: net };
  const financials = stayFinancials(updated);
  const paymentStatus =
    b.refundDuePaise > 0
      ? "refund_pending"
      : b.refundedPaise > 0
        ? b.refundedPaise >= b.paidPaise
          ? "refunded"
          : "partially_refunded"
        : financials.balanceDuePaise > 0
          ? b.paidPaise > 0
            ? "partially_paid"
            : "pay_at_property"
          : b.paymentStatus === "paid"
            ? "paid"
            : "paid_at_property";

  return {
    billingNetPaise: net,
    billingRevision: revision,
    billingOpenCount: openCount,
    balanceDuePaise: financials.balanceDuePaise,
    paymentStatus,
  };
}
