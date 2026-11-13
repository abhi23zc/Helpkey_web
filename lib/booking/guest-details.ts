import { stayFinancials } from "@/lib/stay/domain";
import { supplementalFinancials } from "@/lib/stay/agreements";
import type { StayRequest, StayPaymentReceipt } from "@/lib/stay/contracts";

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const amount = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
const strings = (v: unknown) =>
  Array.isArray(v) ? v.flatMap((x) => (text(x) ? [text(x)!] : [])) : [];
const contact = (v: unknown) => {
  const r = record(v);
  return { name: text(r.name), email: text(r.email), phone: text(r.phone) };
};
const amenities = (v: unknown) =>
  Array.isArray(v)
    ? v.flatMap((x) => {
        const r = record(x);
        return text(r.code) && text(r.label)
          ? [{ code: text(r.code)!, label: text(r.label)! }]
          : [];
      })
    : [];

/** Additive customer projection. Never consult a current listing or expose the raw document. */
export function guestReservationDetails(
  data: Record<string, unknown>,
  paymentRecords: Record<string, unknown>[] = [],
) {
  const quote = record(data.quoteSnapshot);
  const saved = { ...quote, ...data };
  const room = record(saved.roomType),
    rate = record(saved.ratePlan);
  const snapshot = record(saved.amenitySnapshot ?? quote.includedAmenities);
  const lead = record(saved.leadGuest),
    billing = record(saved.billing),
    address = record(billing.address);
  const policy = record(saved.cancellationPolicy);
  const requests = Array.isArray(saved.customizations)
    ? saved.customizations
    : [];
  const receipts = Array.isArray(saved.stayPaymentReceipts)
    ? saved.stayPaymentReceipts
    : [];
  // A recorded receipt is authoritative over its legacy request quote representation.
  const serviceReceipts = receipts.flatMap((value) => {
    const r = record(value);
    return text(r.paymentId) &&
      amount(r.amountPaise) !== null &&
      ["paid", "refund_pending", "refunded"].includes(String(r.status))
      ? [
          {
            requestId: text(r.requestId) ?? "",
            quoteVersion: amount(r.quoteVersion) ?? 0,
            paymentId: text(r.paymentId)!,
            orderId: text(r.orderId) ?? "",
            amountPaise: amount(r.amountPaise)!,
            status: r.status as StayPaymentReceipt["status"],
            scope: text(r.scope) ?? "Hotel service",
          },
        ]
      : [];
  });
  const seen = new Set<string>();
  const uniqueReceipts = serviceReceipts.filter((r) => {
    const key = JSON.stringify([r.paymentId, r.requestId]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Only the fields used by the shared financial helper enter its legacy fallback.
  const legacyRequests = requests.flatMap((value) => {
    const r = record(value),
      q = record(r.quote);
    if (
      !text(q.paymentId) ||
      amount(q.amountPaise) === null ||
      uniqueReceipts.some(
        (receipt) =>
          receipt.paymentId === q.paymentId && receipt.requestId === r.id,
      ) ||
      seen.has(`legacy:${q.paymentId}:${r.id}`)
    )
      return [];
    seen.add(`legacy:${q.paymentId}:${r.id}`);
    return [
      {
        ...r,
        quote: {
          ...q,
          paymentId: text(q.paymentId),
          amountPaise: amount(q.amountPaise),
        },
      } as StayRequest,
    ];
  });
  const allReceipts = [
    ...uniqueReceipts,
    ...legacyRequests.map((r) => ({
      requestId: r.id,
      quoteVersion: r.quote!.version,
      paymentId: r.quote!.paymentId!,
      orderId: "",
      amountPaise: r.quote!.amountPaise,
      status: (["refund_pending", "refunded"].includes(
        r.quote!.paymentStatus ?? "",
      )
        ? r.quote!.paymentStatus
        : "paid") as StayPaymentReceipt["status"],
      scope: r.quote!.scope ?? r.name,
    })),
  ];
  const summaryRequests = requests.flatMap((value) => {
    const r = record(value),
      q = record(r.quote);
    return amount(q.amountPaise) === null
      ? []
      : [
          {
            status: text(r.status),
            settlement: text(r.settlement),
            quote: {
              amountPaise: amount(q.amountPaise),
              status: text(q.status),
              expiresAt: text(q.expiresAt) ?? "invalid",
            },
          } as StayRequest,
        ];
  });
  const servicePaymentsComplete =
    (saved.stayPaymentReceipts == null ||
      Array.isArray(saved.stayPaymentReceipts)) &&
    (saved.customizations == null || Array.isArray(saved.customizations)) &&
    receipts.every((value) => {
      const r = record(value);
      return (
        Boolean(text(r.paymentId)) &&
        amount(r.amountPaise) !== null &&
        ["paid", "refund_pending", "refunded"].includes(String(r.status))
      );
    }) &&
    requests.every((value) => {
      const q = record(record(value).quote);
      return !text(q.paymentId) || amount(q.amountPaise) !== null;
    });
  const supplemental = supplementalFinancials(summaryRequests, allReceipts);
  const references = new Map<
    string,
    { reference: string; method: string | null }
  >();
  if (text(data.razorpayPaymentId))
    references.set(String(data.razorpayPaymentId), {
      reference: String(data.razorpayPaymentId),
      method: text(data.paymentMethod),
    });
  for (const payment of paymentRecords) {
    if (payment.stayQuote === true || amount(payment.amountPaise) === null)
      continue;
    const reference = text(payment.paymentId) ?? text(payment.reference);
    if (
      reference &&
      (payment.type === "collection" ||
        ["captured", "refund_pending", "refunded"].includes(
          String(payment.status),
        ))
    )
      references.set(reference, {
        reference,
        method: text(payment.method) ?? "online",
      });
  }
  const fields = [
    "subtotalPaise",
    "taxPaise",
    "customerFeePaise",
    "roomTotalPaise",
    "extrasTotalPaise",
    "totalPaise",
    "payableNowPaise",
    "paidPaise",
    "customizationCreditPaise",
    "refundDuePaise",
    "refundedPaise",
  ] as const;
  const financials = Object.fromEntries(
    fields.map((key) => [key, amount(saved[key])]),
  ) as Record<(typeof fields)[number], number | null>;
  const complete = [
    "totalPaise",
    "paidPaise",
    "customizationCreditPaise",
    "refundedPaise",
    "refundDuePaise",
  ].every((key) => amount(saved[key]) !== null);
  const computed = complete
    ? stayFinancials(saved as Parameters<typeof stayFinancials>[0])
    : null;
  return {
    paymentRecoveryAvailable:
      data.bookingStatus === "pending_payment" &&
      data.paymentMethod === "online" &&
      Boolean(text(data.razorpayOrderId)),
    savedDetails: {
      version: 1,
      registrationIncomplete: data.registrationIncomplete === true,
      recordedArrivalAt: text(data.recordedArrivalAt),
      actualCheckInAt: (data.actualCheckInAt as { toDate?: () => Date })?.toDate?.().toISOString() || text(data.actualCheckInAt),
      actualCheckOutAt: (data.actualCheckOutAt as { toDate?: () => Date })?.toDate?.().toISOString() || text(data.actualCheckOutAt),
      propertyName: text(saved.propertyName),
      propertySlug: text(saved.propertySlug),
      propertyAddress: text(saved.propertyAddress),
      propertyPublicPhone: text(saved.propertyPublicPhone),
      propertyPublicEmail: text(saved.propertyPublicEmail),
      roomName: text(room.name),
      ratePlanName: text(rate.name),
      checkIn: text(saved.checkIn),
      checkOut: text(saved.checkOut),
      checkInTime: text(saved.arrivalTime ?? saved.checkInTime),
      checkOutTime: text(saved.departureTime ?? saved.checkOutTime),
      startAt: text(saved.startAt),
      endAt: text(saved.endAt),
      timezone: text(saved.timezone),
      bookingMode: text(saved.bookingMode),
      nights: amount(saved.nights),
      durationMinutes: amount(saved.durationMinutes),
      adults: amount(saved.adults),
      children: amount(saved.children),
      infants: amount(saved.infants),
      leadGuest: contact(lead),
      bookingContact: contact(saved.bookingContact),
      guestNames: strings(
        lead.adultGuestNames ??
          saved.guestNames ??
          (lead.name ? [lead.name] : []),
      ),
      specialRequest: text(saved.specialRequest),
      travelerPreferences: strings(saved.travelerPreferences),
      billing:
        text(billing.legalName) || text(billing.gstin)
          ? {
              legalName: text(billing.legalName),
              gstin: text(billing.gstin),
              address: {
                line1: text(address.line1),
                city: text(address.city),
                state: text(address.state),
                postalCode: text(address.postalCode),
              },
            }
          : null,
      amenitySnapshot: Object.keys(snapshot).length
        ? {
            roomAmenities: amenities(snapshot.roomAmenities),
            propertyAmenities: amenities(snapshot.propertyAmenities),
            rateInclusions: amenities(snapshot.rateInclusions),
          }
        : null,
      cancellationPolicy: Object.keys(policy).length
        ? {
            name: text(policy.name),
            description: text(policy.description),
            refundableUntilHours: amount(policy.refundableUntilHours),
            cancellationFeePercent: amount(policy.cancellationFeePercent),
          }
        : null,
      requests: requests.map((value) => {
        const r = record(value),
          q = record(r.quote);
        return {
          id: text(r.id),
          name: text(r.name),
          description: text(r.description),
          variantName: text(r.variantName),
          variantInclusions: text(r.variantInclusions),
          choiceLabels: strings(Object.values(record(r.choiceLabels))),
          choices: Object.entries(record(record(r.inputs).choices)).flatMap(([id, value]) => text(value) ? [{ label: text(record(r.choiceLabels)[id]) ?? "Option", value: text(value) }] : []),
          pricingUnit: text(r.pricingUnit),
          billableQuantity: amount(r.billableQuantity),
          source: text(r.source),
          priceOnRequest: r.priceOnRequest === true,
          inputs: {
            note: text(record(r.inputs).note),
            serviceAt: text(record(r.inputs).serviceAt),
            people: amount(record(r.inputs).people),
            hours: amount(record(r.inputs).hours),
          },
          offerDraft: r.offerDraft === true,
          quantity: amount(r.quantity),
          status: text(r.status),
          settlement: text(r.settlement),
          totalPaise: amount(r.totalPaise),
          response: text(r.response),
          quote: Object.keys(q).length
            ? {
                amountPaise: amount(q.amountPaise),
                scope: text(q.scope),
                status: text(q.status),
                paymentStatus: text(q.paymentStatus),
                expiresAt: text(q.expiresAt),
              }
            : null,
        };
      }),
    },
    receiptFinancials: {
      ...financials,
      effectiveTotalPaise: computed?.effectiveTotalPaise ?? null,
      netPaidPaise: computed?.netPaidPaise ?? null,
      balanceDuePaise: computed?.balanceDuePaise ?? null,
    },
    servicePaymentsComplete,
    supplementalPayments: Object.fromEntries(
      Object.entries(supplemental).map(([key, value]) => [
        key,
        servicePaymentsComplete ? amount(value) : null,
      ]),
    ),
    servicePaymentReceipts: allReceipts.map((r) => ({
      reference: r.paymentId,
      amountPaise: r.amountPaise,
      status: r.status,
      scope: r.scope,
    })),
    paymentReferences: [...references.values()],
  };
}
