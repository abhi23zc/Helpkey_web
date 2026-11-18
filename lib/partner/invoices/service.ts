import "server-only";
import type { RecordData } from "../dashboard/domain";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { propertyAccess, operationalAccess } from "../pms/access";
import { readBillingSources, requireReconciled } from "../billing/service";
import { safeData } from "../reservations/operations";
import { reconciliation } from "../billing/domain";
import {
  settingsSchema,
  detailsSchema,
  issueSchema,
  emptyState,
  documentSources,
  reductions,
  settingsBlockers,
  validateParticular,
  particularsTotal,
  hotelDate,
  documentNumber,
  type InvoiceSettings,
  type DocumentDetails,
  type ClaimState,
  type Particular,
  type SourceLine,
} from "./domain";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (message: string, code = "INVOICE_REVIEW_REQUIRED") => {
  throw new ApiException(code, 409, message);
};
const settingsRef = (propertyId: string) =>
  adminDb
    .collection("properties")
    .doc(propertyId)
    .collection("invoiceConfiguration")
    .doc("current");
const stateRef = (bookingId: string) =>
  adminDb
    .collection("bookings")
    .doc(bookingId)
    .collection("invoiceWorkspace")
    .doc("state");
const detailRef = (bookingId: string) =>
  adminDb
    .collection("bookings")
    .doc(bookingId)
    .collection("invoiceWorkspace")
    .doc("details");
export async function readSettings(uid: string, propertyId: string) {
  return adminDb.runTransaction(async (tx) => {
    await propertyAccess(uid, propertyId, "invoice.settings", tx);
    const ref = settingsRef(propertyId);
    const [current, history] = await Promise.all([
      tx.get(ref),
      tx.get(ref.collection("history").orderBy("revision", "desc").limit(30)),
    ]);
    const actorIds = [
      ...new Set(
        history.docs
          .map((d) => d.get("actorId"))
          .filter(
            (id): id is string =>
              typeof id === "string" && !!id && !id.includes("/"),
          ),
      ),
    ];
    const actors = actorIds.length
      ? await tx.getAll(
          ...actorIds.map((id) => adminDb.collection("users").doc(id)),
        )
      : [];
    const actorNames = new Map(
      actors.map((u) => [u.id, String(u.get("fullName") || u.id)]),
    );
    return {
      settings:
        (current.get("settings") as InvoiceSettings | undefined) ?? null,
      revision: current.get("revision") ?? 0,
      used: current.get("used") === true,
      history: history.docs.map((d): RecordData => {
        const data = safeData(d.data());
        const actorId = typeof data.actorId === "string" ? data.actorId : "";
        return {
          ...data,
          actorName: actorNames.get(actorId) || actorId || "Staff",
        };
      }),
    };
  });
}
export async function saveSettings(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  const { z } = await import("zod");
  const input = z
    .object({
      expectedRevision: z.number().int().nonnegative(),
      settings: settingsSchema,
    })
    .strict()
    .parse(raw);
  return adminDb.runTransaction(async (tx) => {
    await operationalAccess(uid, propertyId, "invoice.settings", tx);
    const ref = settingsRef(propertyId),
      previous = await tx.get(ref);
    if ((previous.get("revision") ?? 0) !== input.expectedRevision)
      fail("Invoice settings changed. Refresh and review your retained draft.");
    if (previous.get("used"))
      for (const field of [
        "invoiceSeries",
        "creditSeries",
        "invoiceStart",
        "creditStart",
        "gstin",
        "registration",
      ] as const) {
        if (input.settings[field] !== previous.get(`settings.${field}`))
          fail(
            "Issued series, starting numbers and registration identity are locked after first use. Contact support for a new legal seller.",
          );
      }
    const revision = input.expectedRevision + 1;
    const event = {
      revision,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
      before: previous.get("settings") ?? null,
      after: input.settings,
    };
    tx.set(ref, {
      settings: input.settings,
      revision,
      used: previous.get("used") ?? false,
    });
    tx.create(ref.collection("history").doc(String(revision)), event);
    return { revision };
  });
}
async function workspace(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  bookingId: string,
  write = false,
) {
  const b = (
    await tx.get(adminDb.collection("bookings").doc(bookingId))
  ).data();
  if (!b) throw new ApiException("NOT_FOUND", 404);
  const access = write
    ? await operationalAccess(uid, b.propertyId, "invoice.issue", tx)
    : await propertyAccess(uid, b.propertyId, "invoice.read", tx);
  const [config, details, state, sources, history] = await Promise.all([
    tx.get(settingsRef(b.propertyId)),
    tx.get(detailRef(bookingId)),
    tx.get(stateRef(bookingId)),
    readBillingSources(tx, bookingId),
    tx.get(adminDb.collection("invoices").where("bookingId", "==", bookingId)),
  ]);
  const settings = config.get("settings") as InvoiceSettings | undefined;
  const documentDetails = details.get("details") as DocumentDetails | undefined;
  const claims = (state.data() ?? emptyState()) as ClaimState;
  const model = reconciliation(
    b,
    sources.entries,
    sources.property,
    sources.online,
    sources.refunds,
  );
  let lines: SourceLine[] = [];
  const sourceBlockers: string[] = [];
  try {
    lines = documentSources(b, sources.entries);
  } catch {
    sourceBlockers.push(
      "Booking, booked-extra or correction-family source history is incomplete or inconsistent. Ask support to reconcile the folio before issuing documents.",
    );
  }
  if (lines.some((l) => !Number.isSafeInteger(l.amountPaise)))
    sourceBlockers.push(
      "Source amounts contain unsafe values. Ask support to reconcile the folio.",
    );
  const hasIssuedInvoice = history.docs.some(
    (d) =>
      d.get("contract") === "hotel_v1" &&
      d.get("propertyId") === b.propertyId &&
      d.get("documentType") !== "credit_note",
  );
  const remaining = lines
    .map((l) => ({
      ...l,
      amountPaise: l.amountPaise - (claims.claims[l.id] ?? 0),
    }))
    .filter(
      (l) =>
        l.amountPaise > 0 ||
        (l.amountPaise < 0 && !(l.id in claims.claims) && !hasIssuedInvoice),
    );
  const blockers = [
    ...settingsBlockers(settings),
    ...model.warnings,
    ...sourceBlockers,
  ];
  if (!access.property.pms?.activatedAt)
    blockers.push("Activate PMS in Settings before issuing documents.");
  if (
    !["confirmed", "checked_in", "checked_out", "completed"].includes(
      b.bookingStatus,
    )
  )
    blockers.push("This reservation state does not support issuance.");
  if ((b.customerFeePaise ?? 0) !== 0)
    blockers.push(
      "This booking contains fees without supported hotel document ownership. Ask support to review source ownership.",
    );
  if (!documentDetails)
    blockers.push(
      "Review and save customer billing details and accountant-confirmed source particulars.",
    );
  if (documentDetails?.irpRequired)
    blockers.push(
      "IRP registration is required for this transaction. Local issuance is unavailable.",
    );
  if (
    documentDetails?.customer.gstin &&
    documentDetails.customer.gstin.slice(0, 2) !==
      documentDetails.customer.stateCode
  )
    blockers.push(
      "Customer GSTIN and state code disagree. Correct customer billing details.",
    );
  for (const line of remaining) {
    const p = documentDetails?.lines.find((p) => p.sourceId === line.id);
    if (!p) blockers.push(`Record document details for ${line.description}.`);
    else if (settings)
      blockers.push(
        ...validateParticular(p, Math.abs(line.amountPaise), settings).map(
          (e) => `${line.description}: ${e}`,
        ),
      );
  }
  const originalParticulars = documentDetails?.lines.find(
    (p) => p.sourceId === "booking",
  );
  if (
    remaining.some((l) => l.id === "booking") &&
    originalParticulars &&
    Number.isSafeInteger(b.taxPaise) &&
    originalParticulars.cgstPaise +
      originalParticulars.sgstPaise +
      originalParticulars.igstPaise !==
      b.taxPaise
  )
    blockers.push(
      "Original booking tax particulars disagree with existing source tax. Ask your accountant to review; document metadata cannot change taxes owed.",
    );
  if (
    new Set(documentDetails?.lines.map((p) => p.sourceId)).size !==
    documentDetails?.lines.length
  )
    blockers.push("Each source needs exactly one set of document particulars.");
  const documents = history.docs
    .filter(
      (d) =>
        d.get("contract") === "hotel_v1" &&
        d.get("propertyId") === b.propertyId,
    )
    .map((d) => ({ id: d.id, ...safeData(d.data()) }));
  const version = hash({
    b: safeData(b),
    config: {
      settings: settings ?? null,
      revision: config.get("revision") ?? 0,
    },
    details: safeData(details.data() ?? {}),
    claims,
    model,
    documents,
  });
  return {
    b,
    access,
    config,
    documentDetails,
    settings,
    claims,
    sources,
    model,
    lines,
    remaining,
    blockers,
    sourceBlockers,
    documents,
    version,
    detailsRevision: details.get("revision") ?? 0,
  };
}
export async function reviewInvoice(uid: string, bookingId: string) {
  return adminDb.runTransaction(async (tx) => {
    const w = await workspace(tx, uid, bookingId);
    const writable = w.access.permissions.includes("invoice.issue");
    return {
      version: w.version,
      propertyId: w.b.propertyId,
      settings: w.settings ?? null,
      details: writable ? (w.documentDetails ?? null) : null,
      detailsRevision: w.detailsRevision,
      sources: w.lines,
      remaining: w.remaining,
      reductions: reductions(w.lines, w.claims).map((l) => ({
        ...l,
        remainingPaise: l.amountPaise - (w.claims.reductionClaims[l.id] ?? 0),
      })),
      previouslyInvoicedPaise: Object.values(w.claims.claims).reduce(
        (n, v) => n + v,
        0,
      ),
      blockers: w.blockers,
      documents: w.documents,
      settlement: w.model.reservation,
      services: w.model.services,
      canIssue: writable,
      canCredit: w.access.permissions.includes("invoice.credit"),
    };
  });
}
export async function saveDocumentDetails(
  uid: string,
  bookingId: string,
  raw: unknown,
) {
  const { z } = await import("zod");
  const input = z
    .object({ expectedVersion: z.string(), details: detailsSchema })
    .strict()
    .parse(raw);
  return adminDb.runTransaction(async (tx) => {
    const w = await workspace(tx, uid, bookingId, true);
    if (w.version !== input.expectedVersion)
      fail(
        "Sources or document details changed. Refresh and review your retained draft.",
      );
    if (
      new Set(input.details.lines.map((l) => l.sourceId)).size !==
      input.details.lines.length
    )
      fail("Duplicate source particulars.");
    for (const p of input.details.lines) {
      const source = w.remaining.find((l) => l.id === p.sourceId);
      if (!source || !w.settings)
        fail("Choose a current source and save Invoice settings first.");
      const errors = validateParticular(
        p,
        Math.abs(source!.amountPaise),
        w.settings!,
      );
      if (errors.length) fail(errors.join(" "));
    }
    const ref = detailRef(bookingId),
      revision = w.detailsRevision + 1;
    tx.set(ref, { details: input.details, revision });
    tx.create(ref.collection("history").doc(String(revision)), {
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
      revision,
      before: w.documentDetails ?? null,
      after: input.details,
    });
    return { revision };
  });
}
export type HotelDocumentLine = Particular & {
  id: string;
  originalLineId?: string;
  originalSourceId?: string;
  amountPaise: number;
  sign: number;
};
export async function issueDocument(
  uid: string,
  bookingId: string,
  raw: unknown,
  key: string,
) {
  const input = issueSchema.parse(raw);
  if (!key || key.length > 180)
    throw new ApiException("IDEMPOTENCY_KEY_REQUIRED", 422);
  const requestId = hash([bookingId, uid, key]),
    fingerprint = hash(input);
  return adminDb.runTransaction(async (tx) => {
    const bookingRef = adminDb.collection("bookings").doc(bookingId);
    const b = (await tx.get(bookingRef)).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    const access = await operationalAccess(
      uid,
      b.propertyId,
      input.action === "invoice" ? "invoice.issue" : "invoice.credit",
      tx,
    );
    const receiptRef = bookingRef.collection("invoiceRequests").doc(requestId),
      receipt = await tx.get(receiptRef);
    if (receipt.exists) {
      if (receipt.get("fingerprint") !== fingerprint)
        throw new ApiException("IDEMPOTENCY_CONFLICT", 409);
      return receipt.get("result") as { id: string; number: string };
    }
    const w = await workspace(tx, uid, bookingId, true);
    if (w.version !== input.expectedVersion)
      fail(
        "Invoice review changed. Refresh and review your retained draft.",
        "INVOICE_REVIEW_STALE",
      );
    requireReconciled(w.b, w.sources);
    const commonBlockers = [
      ...settingsBlockers(w.settings),
      ...w.sourceBlockers,
      ...(!access.property.pms?.activatedAt
        ? ["Activate PMS before issuance."]
        : []),
      ...(!["confirmed", "checked_in", "checked_out", "completed"].includes(
        b.bookingStatus,
      )
        ? ["Unsupported booking state."]
        : []),
    ];
    if (w.documentDetails?.irpRequired)
      commonBlockers.push(
        "IRP registration is required for this transaction; local issuance is unavailable.",
      );
    if (commonBlockers.length) fail(commonBlockers.join(" "));
    const s = w.settings!,
      state: ClaimState = structuredClone(w.claims);
    let documentSeller = s;
    let lines: HotelDocumentLine[] = [],
      original: Record<string, unknown> | null = null;
    let customer = w.documentDetails?.customer;
    if (input.action === "invoice") {
      if (w.blockers.length) fail(w.blockers.join(" "));
      if (!w.remaining.length)
        fail("All current eligible sources have already been invoiced.");
      lines = w.remaining.map((l, i) => ({
        ...w.documentDetails!.lines.find((p) => p.sourceId === l.id)!,
        id: String(i + 1),
        amountPaise: l.amountPaise,
        sign: Math.sign(l.amountPaise),
      }));
      for (const line of w.remaining)
        state.claims[line.id] = line.amountPaise + (state.claims[line.id] ?? 0);
    } else {
      if (
        !input.invoiceId ||
        !input.reductionId ||
        !input.reason ||
        !input.allocations?.length
      )
        fail(
          "Choose an invoice, saved folio reduction, reason and explicit line allocations.",
        );
      const invoice = w.documents.find((d) => d.id === input.invoiceId) as
        RecordData | undefined;
      if (!invoice || invoice.documentType === "credit_note")
        fail("Choose an original invoice from this reservation.");
      // Registration changes require external review. Other setting edits must
      // never rewrite the seller represented by the original document.
      if (
        invoice!.seller.gstin !== s.gstin ||
        invoice!.seller.registration !== s.registration
      )
        fail(
          "Seller identity changed. Ask your accountant to review externally.",
        );
      documentSeller = invoice!.seller;
      customer = invoice!.customer;
      original = {
        id: input.invoiceId!,
        number: invoice!.invoiceNumber,
        date: invoice!.date,
        settingsRevision: invoice!.settingsRevision,
      };
      const reduction = reductions(w.lines, state).find(
        (l) => l.id === input.reductionId,
      );
      const entitlement =
        (reduction?.amountPaise ?? 0) -
        (state.reductionClaims[input.reductionId!] ?? 0);
      let allocated = 0;
      const seen = new Set<string>();
      for (const [index, a] of input.allocations!.entries()) {
        if (seen.has(a.lineId))
          fail("Allocate each original line once per note.");
        seen.add(a.lineId);
        const line = (invoice!.lines as HotelDocumentLine[]).find(
          (l) => l.id === a.lineId && l.sign > 0,
        );
        if (!line || a.particulars.sourceId !== input.reductionId)
          fail(
            "Allocation must reference a positive original invoice line and the saved reduction.",
          );
        const p = a.particulars,
          total = particularsTotal(p);
        const errors = validateParticular(p, total, invoice!.seller);
        if (errors.length || !total)
          fail(errors.join(" ") || "Enter a positive credited amount.");
        for (const field of [
          "sac",
          "placeOfSupplyCode",
          "cgstRate",
          "sgstRate",
          "igstRate",
        ] as const)
          if (p[field] !== line![field])
            fail("Credited tax treatment must match the original line.");
        // Family reductions must stay within their original family; generic credits require explicit staff allocation.
        if (
          (state.claims[input.reductionId!] ?? 0) > 0 &&
          line!.sourceId !== input.reductionId
        )
          fail("Allocate this correction to its original source line.");
        const capKey = `${input.invoiceId}:${a.lineId}`;
        const prior = state.credited[capKey] ?? {
          amountPaise: 0,
          taxablePaise: 0,
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 0,
        };
        for (const field of [
          "taxablePaise",
          "cgstPaise",
          "sgstPaise",
          "igstPaise",
        ] as const) {
          if (prior[field] + p[field] > line![field])
            fail(
              "Allocation exceeds the original line's remaining value or tax components.",
            );
          prior[field] += p[field];
        }
        prior.amountPaise += total;
        if (prior.amountPaise > line!.amountPaise)
          fail("Allocation exceeds the original line's remaining amount.");
        state.credited[capKey] = prior;
        allocated += total;
        lines.push({
          ...p,
          id: String(index + 1),
          originalLineId: line!.id,
          originalSourceId: line!.sourceId,
          amountPaise: total,
          sign: 1,
        });
      }
      if (allocated > entitlement)
        fail(
          "This saved reduction has insufficient remaining amount to document.",
        );
      state.reductionClaims[input.reductionId!] =
        (state.reductionClaims[input.reductionId!] ?? 0) + allocated;
    }
    const totalPaise = lines.reduce((n, l) => n + l.amountPaise, 0);
    if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0)
      fail("The document total must be positive and safe.");
    const { date, financialYear } = hotelDate(
      new Date(),
      access.property.timezone || "Asia/Kolkata",
    );
    const series =
      input.action === "invoice" ? s.invoiceSeries : s.creditSeries;
    const sequenceRef = settingsRef(b.propertyId)
      .collection("sequences")
      .doc(hash([series, financialYear]));
    const sequence = await tx.get(sequenceRef);
    const next =
      sequence.get("next") ??
      (input.action === "invoice" ? s.invoiceStart : s.creditStart);
    let number: string;
    try {
      number = documentNumber(series, financialYear, next);
    } catch (error) {
      return fail(
        error instanceof Error
          ? error.message
          : "Document numbering is unavailable.",
      );
    }
    const id = requestId;
    const totals = Object.fromEntries(
      (["taxablePaise", "cgstPaise", "sgstPaise", "igstPaise"] as const).map(
        (field) => [field, lines.reduce((n, l) => n + l[field] * l.sign, 0)],
      ),
    );
    const snapshot = {
      contract: "hotel_v1",
      bookingId,
      propertyId: b.propertyId,
      partyType: "customer",
      partyId: b.customerId || b.userId || bookingId,
      invoiceType: input.action === "invoice" ? "booking" : "adjustment",
      status: "issued",
      documentType:
        input.action === "credit_note"
          ? "credit_note"
          : s.registration === "registered"
            ? "tax_invoice"
            : "ordinary_invoice",
      invoiceNumber: number,
      date,
      financialYear,
      seller: documentSeller,
      customer,
      lines,
      totalPaise,
      amounts: { totalPaise },
      taxBreakdown: totals,
      original,
      reason: input.reason ?? null,
      reductionId: input.reductionId ?? null,
      reviewedVersion: w.version,
      settingsRevision: w.config.get("revision"),
      detailsRevision: w.detailsRevision,
      settlementAtIssuance: w.model.reservation,
      issuerId: uid,
      issuerName: access.user.fullName || "Staff",
      issuedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      r2ObjectKey: null,
    };
    tx.create(adminDb.collection("invoices").doc(id), snapshot);
    tx.set(sequenceRef, { series, financialYear, next: next + 1 });
    tx.update(settingsRef(b.propertyId), { used: true });
    tx.set(stateRef(bookingId), state);
    tx.create(bookingRef.collection("events").doc(id), {
      type: `hotel_${input.action}_issued`,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
      documentId: id,
      number,
    });
    const result = { id, number };
    tx.create(receiptRef, {
      fingerprint,
      result,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}
export async function readDocument(uid: string, bookingId: string, id: string) {
  return adminDb.runTransaction(async (tx) => {
    const b = (
      await tx.get(adminDb.collection("bookings").doc(bookingId))
    ).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    await propertyAccess(uid, b.propertyId, "invoice.read", tx);
    const doc = await tx.get(adminDb.collection("invoices").doc(id));
    if (
      !doc.exists ||
      doc.get("contract") !== "hotel_v1" ||
      doc.get("bookingId") !== bookingId ||
      doc.get("propertyId") !== b.propertyId
    )
      throw new ApiException("NOT_FOUND", 404);
    return { id, ...safeData(doc.data()!) };
  });
}
