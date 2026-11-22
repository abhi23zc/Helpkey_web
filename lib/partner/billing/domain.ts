import { z } from "zod";
import { stayFinancials } from "@/lib/stay/domain";
import type { RecordData } from "@/lib/partner/dashboard/domain";

const amount = z.number().int().positive().max(100_000_000);
const details = z
  .object({
    explanation: z.string().trim().min(3).max(1000),
    quantity: z.number().int().positive().max(10000).optional(),
    serviceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
const charge = {
  category: z.enum([
    "laundry",
    "food_beverage",
    "transport",
    "damage",
    "other",
  ]),
  description: z.string().trim().min(3).max(250),
  amountPaise: amount,
  details,
};
const common = {
  expectedStatementVersion: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
};
const adjustment = {
  originalEntryId: z.string().regex(/^[a-f0-9]{64}(?:-replacement)?$/),
  reason: z.string().trim().min(3).max(500),
};
export const billingCommand = z.discriminatedUnion("action", [
  z.object({ ...common, ...charge, action: z.literal("post") }).strict(),
  z
    .object({
      ...common,
      ...charge,
      reason: adjustment.reason,
      action: z.literal("credit"),
    })
    .strict(),
  z
    .object({
      ...common,
      ...charge,
      ...adjustment,
      action: z.literal("correct"),
    })
    .strict(),
  z.object({ ...common, ...adjustment, action: z.literal("void") }).strict(),
]);
export type BillingCommand = z.infer<typeof billingCommand>;
export type BillingEntry = {
  id: string;
  amountPaise: number;
  originalEntryId: string | null;
  type: string;
} & RecordData;
export function remainingEntry(entry: BillingEntry, entries: BillingEntry[]) {
  return (
    entry.amountPaise +
    entries
      .filter(
        (e) => e.originalEntryId === entry.id && e.type === "compensation",
      )
      .reduce((n, e) => n + e.amountPaise, 0)
  );
}
export function reconciliation(
  b: RecordData,
  entries: BillingEntry[],
  property: RecordData[],
  online: RecordData[],
  refunds: RecordData[],
) {
  const warnings: string[] = [];
  const serviceWarnings: string[] = [];
  const notices: string[] = [];
  const add = (text: string) => {
    if (!warnings.includes(text)) warnings.push(text);
  };
  const sum = (rows: RecordData[]) =>
    rows.reduce((n, r) => n + (r.amountPaise ?? 0), 0);
  const received = property.filter((r) => r.type === "collection");
  const reversed = property.filter((r) => r.type === "reversal");
  const returned = property.filter((r) => r.type === "refund");
  const uniqueCaptures = (rows: RecordData[], target: string[]) => {
    const seen = new Map<string, RecordData>();
    for (const row of rows) {
      const source = row.paymentId || row.id;
      if (seen.has(source))
        target.push(`Duplicate capture source ${source}; counted once.`);
      else seen.set(source, row);
    }
    return [...seen.values()];
  };
  const captures = uniqueCaptures(
    online.filter(
      (r) =>
        !r.stayQuote &&
        ["captured", "refund_pending", "refunded"].includes(r.status),
    ),
    warnings,
  );
  const reservationRefunds = refunds.filter((r) => !r.stayQuote);
  const completed =
    returned.reduce((n, r) => n + r.amountPaise, 0) +
    sum(reservationRefunds.filter((r) => r.status === "processed"));
  const pending = sum(
    reservationRefunds.filter(
      (r) => !["processed", "failed"].includes(r.status),
    ),
  );
  const actualReceived = sum(received) - sum(reversed) + sum(captures);
  for (const r of [...reversed, ...returned])
    if (!received.some((c) => c.id === r.receiptId))
      add(`Hotel ${r.type} ${r.id} has no source collection.`);
  for (const r of reservationRefunds)
    if (!captures.some((c) => c.id === r.paymentId))
      add(`Refund ${r.id} has no confirmed source capture.`);
  for (const r of received)
    if (
      sum([...reversed, ...returned].filter((c) => c.receiptId === r.id)) >
      r.amountPaise
    )
      add(`Hotel receipt ${r.id} is over-allocated.`);
  if (actualReceived !== (b.paidPaise ?? 0))
    add(
      `Received ledger ₹${(actualReceived / 100).toFixed(2)} differs from authoritative booking received ₹${((b.paidPaise ?? 0) / 100).toFixed(2)}; receipt history needs review.`,
    );
  if (completed !== (b.refundedPaise ?? 0))
    add(
      `Completed refund history ${completed} paise differs from authoritative booking refunds ${b.refundedPaise ?? 0} paise.`,
    );
  if (pending !== (b.refundDuePaise ?? 0))
    add(
      `Reserved refund history ${pending} paise differs from authoritative pending refunds ${b.refundDuePaise ?? 0} paise.`,
    );
  if (
    (b.totalPaise ?? 0) -
      (b.customizationCreditPaise ?? 0) +
      (b.billingNetPaise ?? 0) <
    0
  )
    add(
      "Effective reservation charges are negative; review existing credits and billing history.",
    );
  for (const e of entries) {
    if (!Number.isSafeInteger(e.amountPaise) || e.amountPaise === 0)
      add(`Billing entry ${e.id} has an invalid amount.`);
    if (
      e.originalEntryId &&
      !entries.some(
        (root) => root.id === e.originalEntryId && !root.originalEntryId,
      )
    )
      add(`Billing entry ${e.id} has no original root entry.`);
    if (
      !e.originalEntryId &&
      entries.filter(
        (c) => c.originalEntryId === e.id && c.type === "compensation",
      ).length > 1
    )
      add(`Billing entry ${e.id} has duplicate compensations.`);
  }
  const net = sum(entries);
  if (net !== (b.billingNetPaise ?? 0))
    add("Billing entry history differs from the booking billing projection.");
  const openCount = entries.filter(
    (e) => !e.originalEntryId && remainingEntry(e, entries) !== 0,
  ).length;
  if (openCount !== (b.billingOpenCount ?? 0))
    add("Billing open-entry count differs from immutable history.");
  const financials = stayFinancials(b);
  for (const n of [
    net,
    actualReceived,
    completed,
    pending,
    financials.effectiveTotalPaise,
    b.totalPaise ?? 0,
    b.billingRevision ?? 0,
  ])
    if (!Number.isSafeInteger(n))
      add("Financial sources contain an unsafe integer total.");
  const allocations = new Map<string, RecordData>();
  for (const r of b.stayPaymentReceipts ?? []) {
    const key = `${r.paymentId}:${r.requestId}:${r.quoteVersion}`;
    if (allocations.has(key))
      serviceWarnings.push(
        `Duplicate service receipt allocation ${key}; counted once.`,
      );
    else allocations.set(key, r);
  }
  const requests: RecordData[] = b.customizations ?? [];
  // Older paid quotes predate allocated receipts. Preserve their money once,
  // while making the missing source history explicit to the operator.
  for (const r of requests) {
    const q = r.quote;
    if (
      r.agreementVersion !== 2 &&
      r.settlement !== "included" &&
      q?.paymentId &&
      ![...allocations.values()].some(
        (a) => a.requestId === r.id && a.paymentId === q.paymentId,
      )
    ) {
      allocations.set(`${q.paymentId}:${r.id}:${q.version}`, {
        requestId: r.id,
        quoteVersion: q.version,
        paymentId: q.paymentId,
        amountPaise: q.amountPaise,
        status: q.paymentStatus ?? "paid",
      });
      serviceWarnings.push(
        `Legacy service ${r.id} uses its paid quote snapshot; allocated receipt history needs review.`,
      );
    }
  }
  const serviceCaptures = uniqueCaptures(
    online.filter(
      (r) =>
        r.stayQuote &&
        ["captured", "refund_pending", "refunded"].includes(r.status),
    ),
    serviceWarnings,
  );
  for (const r of serviceCaptures)
    if (
      sum(
        [...allocations.values()].filter(
          (a) => a.paymentId === (r.paymentId || r.id),
        ),
      ) !== r.amountPaise
    )
      serviceWarnings.push(
        `Service capture ${r.id} differs from its allocated receipts.`,
      );
  const agreements: RecordData[] = requests
    .filter(
      (r: RecordData) =>
        r.settlement !== "included" && (r.agreementVersion === 2 || r.quote),
    )
    .map((r: RecordData) => ({
      id: r.id,
      title: r.name ?? r.title,
      status: r.status,
      settlement: r.settlement,
      agreementVersion: r.agreementVersion ?? null,
      quote: r.quote
        ? {
            status: r.quote.status,
            amountPaise: r.quote.amountPaise,
            paymentId: r.quote.paymentId ?? null,
            paymentStatus: r.quote.paymentStatus ?? null,
          }
        : null,
    }));
  const agreed = agreements.filter(
    (r: RecordData) =>
      !["cancelled", "declined"].includes(r.status) &&
      !["refund_pending", "refunded"].includes(r.quote?.paymentStatus) &&
      r.quote?.status === "accepted",
  );
  for (const r of allocations.values())
    if (!serviceCaptures.some((c) => (c.paymentId || c.id) === r.paymentId))
      serviceWarnings.push(
        `Service receipt ${r.paymentId} has no confirmed capture history.`,
      );
  const serviceRefunds = refunds.filter((r) => r.stayQuote);
  const servicePaid =
    sum(serviceCaptures) +
    sum(
      [...allocations.values()].filter(
        (r) =>
          !serviceCaptures.some((c) => (c.paymentId || c.id) === r.paymentId),
      ),
    );
  const missingRefundHistory = [...allocations.values()].filter(
    (a) =>
      ["refunded", "refund_pending"].includes(a.status) &&
      !serviceRefunds.some((r) => r.paymentId === a.paymentId),
  );
  for (const a of missingRefundHistory)
    serviceWarnings.push(
      `Service receipt ${a.paymentId} has ${a.status} status without linked refund history; its receipt total is retained.`,
    );
  const serviceCompleted =
    sum(serviceRefunds.filter((r) => r.status === "processed")) +
    sum(missingRefundHistory.filter((a) => a.status === "refunded"));
  const servicePending =
    sum(
      serviceRefunds.filter((r) => !["processed", "failed"].includes(r.status)),
    ) + sum(missingRefundHistory.filter((a) => a.status === "refund_pending"));
  if (
    !b.calculation && ["subtotalPaise", "taxPaise", "customerFeePaise"].every((field) =>
      Number.isSafeInteger(b[field]),
    ) &&
    b.subtotalPaise +
      b.taxPaise +
      b.customerFeePaise +
      (b.extrasTotalPaise ?? 0) !==
      b.totalPaise
  )
    notices.push(
      "Original component breakdown differs from the authoritative original booking total; detailed price history needs review.",
    );
  for (const field of ["subtotalPaise", "taxPaise", "customerFeePaise"])
    if (b[field] == null)
      notices.push(
        `Original ${field.replace("Paise", "").replace("customerFee", "fee")} breakdown is unavailable; the original booking total remains authoritative.`,
      );
  for (const c of captures)
    if (
      sum(
        reservationRefunds.filter(
          (r) => r.paymentId === c.id && r.status !== "failed",
        ),
      ) > c.amountPaise
    )
      add(
        `Provider receipt ${c.id} has refunds exceeding its captured amount.`,
      );
  const serviceTotal = agreed.reduce(
    (n: number, r: RecordData) => n + (r.settlement === "hotel_collection" ? 0 : r.quote?.amountPaise ?? 0),
    0,
  );
  for (const a of allocations.values()) {
    const request = requests.find((r) => r.id === a.requestId);
    if (!request?.quote || request.settlement === "included")
      serviceWarnings.push(
        `Service receipt ${a.paymentId} has no separate quoted agreement for ${a.requestId}; charge history needs review.`,
      );
    else if (
      a.status === "paid" &&
      (request.quote.status !== "accepted" ||
        request.quote.version !== a.quoteVersion ||
        request.quote.amountPaise !== a.amountPaise ||
        request.quote.paymentId !== a.paymentId ||
        ["cancelled", "declined"].includes(request.status))
    )
      serviceWarnings.push(
        `Service receipt ${a.paymentId} differs from its current paid agreement for ${a.requestId}; charge history needs review.`,
      );
    if (!Number.isSafeInteger(a.amountPaise) || a.amountPaise < 0)
      serviceWarnings.push(
        `Service receipt ${a.paymentId} has an invalid amount.`,
      );
  }
  if (
    ![serviceTotal, servicePaid, serviceCompleted, servicePending].every(
      Number.isSafeInteger,
    )
  )
    serviceWarnings.push(
      "Service financial sources contain an unsafe integer total.",
    );
  const serviceNetPaid = Math.max(
    0,
    servicePaid - serviceCompleted - servicePending,
  );
  const statementRefunds: RecordData[] = [
    ...returned.map((r) => ({
      ...r,
      status: "completed",
      paymentId: r.receiptId,
    })),
    ...refunds,
  ];
  return {
    notices,
    warnings,
    serviceWarnings,
    revision: b.billingRevision ?? 0,
    reservation: {
      ...financials,
      originalTotalPaise: b.totalPaise ?? 0,
      existingCreditPaise: b.customizationCreditPaise ?? 0,
      billingNetPaise: b.billingNetPaise ?? 0,
      receivedPaise: b.paidPaise ?? 0,
      ledgerReceivedPaise: actualReceived,
      completedRefundPaise: b.refundedPaise ?? 0,
      pendingRefundPaise: b.refundDuePaise ?? 0,
      refundableExcessPaise: Math.max(
        0,
        financials.netPaidPaise -
          (["cancelled", "no_show"].includes(b.bookingStatus)
            ? 0
            : financials.effectiveTotalPaise),
      ),
    },
    services: {
      agreements,
      allocations: [...allocations.values()],
      totalPaise: serviceTotal,
      balanceDuePaise: Math.max(0, serviceTotal - serviceNetPaid),
      // Incomplete history is not evidence that service money is returnable.
      refundableExcessPaise: serviceWarnings.length
        ? 0
        : Math.max(0, serviceNetPaid - serviceTotal),
      receivedPaise: servicePaid,
      completedRefundPaise: serviceCompleted,
      pendingRefundPaise: servicePending,
      awaitingPaymentPaise: agreed
        .filter((r: RecordData) => !r.quote?.paymentId)
        .reduce((n: number, r: RecordData) => n + r.quote.amountPaise, 0),
    },
    components: {
      accommodationPaise: b.calculation?.version === 2 ? b.calculation.lines.filter((l: { kind: string }) => l.kind === "room").reduce((n: number, l: { taxablePaise: number }) => n + l.taxablePaise, 0) : b.subtotalPaise ?? null,
      taxPaise: b.taxPaise ?? null,
      feesPaise: b.calculation?.version === 2 ? b.calculation.lines.filter((l: { kind: string }) => l.kind === "customer_fee").reduce((n: number, l: { taxablePaise: number }) => n + l.taxablePaise, 0) : b.customerFeePaise ?? null,
      bookedExtrasPaise: b.calculation?.version === 2 ? b.calculation.lines.filter((l: { kind: string }) => l.kind === "extra").reduce((n: number, l: { taxablePaise: number }) => n + l.taxablePaise, 0) : b.extrasTotalPaise ?? 0,
      bookedExtras: (b.customizations ?? [])
        .filter(
          (r: RecordData) =>
            r.settlement === "included" ||
            (r.agreementVersion !== 2 && !r.quote),
        )
        .map((r: RecordData) => ({
          id: r.id,
          name: r.name ?? r.title,
          quantity: r.quantity,
          amountPaise: r.totalPaise ?? 0,
          status: r.status,
        })),
    },
    payments: [...property.filter((r) => r.type !== "refund"), ...online],
    refunds: statementRefunds,
  };
}
