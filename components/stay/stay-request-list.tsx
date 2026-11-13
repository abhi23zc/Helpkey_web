"use client";
import { useHotelCapabilities } from "@/components/partner/dashboard/hotel-capabilities";
import { ExtrasOffers } from "./extras-offers";
import {
  ChevronDown,
  MessageSquare,
  Package,
  Sparkles,
  ConciergeBell,
} from "lucide-react";
import { RequestSelectionEditor } from "./request-selection-editor";
import { requestLabel, requestAmountLabel } from "@/lib/stay/agreements";
import { requestPriceBreakdown } from "@/lib/stay/pricing";
import { getOfferingImageUrl } from "@/lib/stay/imagery";
import {
  RequestAgreementControls,
  type RequestActor,
} from "./request-agreement-controls";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { type StayRequest, statusLabels } from "@/lib/stay/contracts";
export function StayRequestList({
  requests,
  currency,
  timezone,
  staff,
  guest,
  onDraftChange,
  compactStaff = false,
}: {
  requests: StayRequest[];
  currency: string;
  timezone: string;
  guest?: RequestActor;
  compactStaff?: boolean;
  onDraftChange?: (section: string, dirty: boolean, busy?: boolean) => void;
  staff?: {
    bookingId: string;
    revision: number;
    enabled: boolean;
    refresh: () => void;
  };
}) {
  const permits = useHotelCapabilities();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const draftKey = `legacy-requests:${requests.map((r) => r.id).join(":")}`;
  const dirty = Object.values(responses).some(Boolean);
  useEffect(() => {
    onDraftChange?.(draftKey, dirty, busy !== null);
  }, [onDraftChange, draftKey, dirty, busy]);
  useEffect(
    () => () => onDraftChange?.(draftKey, false),
    [onDraftChange, draftKey],
  );
  async function update(r: StayRequest, status: string) {
    if (!staff) return;
    setBusy(r.id);
    setError("");
    try {
      await apiFetch(
        `/api/partner/bookings/${encodeURIComponent(staff.bookingId)}/customizations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: staff.revision,
            requestId: r.id,
            status,
            response: responses[r.id] ?? "",
          }),
        },
      );
      setResponses((old) => ({ ...old, [r.id]: "" }));
      staff.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update request.");
      staff.refresh();
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-3">
      {((staff && permits("requests.manage")) || guest) && <ExtrasOffers actor={(staff ?? guest)!} staff={Boolean(staff)} requests={requests} currency={currency} timezone={timezone} />}
      {!requests.length && (
        <p className="text-sm text-slate-500">No customizations requested.</p>
      )}
      {requests.map((r) => {
        const Row = compactStaff ? "article" : "details";
        const Summary = compactStaff ? "div" : "summary";
        const ResponseContainer = compactStaff ? "details" : "div";
        const Icon =
          r.kind === "preference"
            ? Sparkles
            : r.kind === "service"
              ? ConciergeBell
              : Package;
        const summary = (
          <>
            {compactStaff ? (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fbf5e8] text-[#c89b3c] shadow-2xs">
                <Icon size={18} strokeWidth={1.5} />
              </span>
            ) : (
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-[#e5e1d8]">
                <img
                  src={getOfferingImageUrl(r)}
                  alt={r.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="min-w-0 flex-1 basis-32">
              <h4 className="break-words text-sm font-bold text-[#061224]">
                {r.name}
                {!compactStaff && r.variantName ? ` · ${r.variantName}` : ""}
                {(compactStaff ? r.quantity > 1 : staff || r.quantity > 1)
                  ? ` × ${r.quantity}`
                  : ""}
              </h4>
              {compactStaff && r.variantName && (
                <p className="mt-0.5 break-words text-xs font-semibold text-[#8b96aa]">{r.variantName}</p>
              )}
            </div>
            <span
              className={`max-w-full sm:max-w-[50%] whitespace-normal break-words rounded-full px-2.5 py-0.5 text-xs font-bold capitalize border ${
                ["ready", "fulfilled", "confirmed"].includes(r.status)
                  ? "border-slate-200 bg-slate-100 text-[#141b2b]"
                  : r.status === "preparing"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : ["declined", "cancelled"].includes(r.status)
                      ? "border-slate-200 bg-slate-100 text-slate-600"
                      : "border-[#e8d9b5] bg-[#fbf7ee] text-[#785d1c]"
              }`}
            >
              {requestLabel(r) ?? statusLabels[r.status]}
            </span>
          </>
        );
        const details = (
          <>
            <p className="mt-2 text-sm text-slate-600">{r.description}</p>
            {r.variantInclusions && (
              <p className="mt-2 text-sm text-slate-600">
                Package includes: {r.variantInclusions}
              </p>
            )}
            {!compactStaff && (
              <p className="mt-2 text-xs text-slate-500">
                {requestAmountLabel(r, currency)}
                {r.settlement === "pending_hotel" && r.totalPaise > 0
                  ? " estimated · not charged"
                  : ["awaiting_customer", "awaiting_payment"].includes(
                        r.settlement ?? "",
                      )
                    ? " · Not charged"
                    : ""}{" "}
                {staff || r.maxQuantity > 1
                  ? `· Maximum ${r.maxQuantity} per booking `
                  : ""}
                · Changes before{" "}
                {new Date(r.deadlineAt).toLocaleString("en-IN", {
                  timeZone: timezone,
                })}{" "}
                ({timezone})
              </p>
            )}
            {compactStaff && (
              <p className="text-xs leading-5 text-slate-500">
                Changes before{" "}
                {new Date(r.deadlineAt).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: timezone,
                })}{" "}
                (hotel time)
              </p>
            )}
            {staff && !r.quote && r.billableQuantity && r.unitPricePaise > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                {requestPriceBreakdown(r, currency)} · per{" "}
                {r.pricingUnit ?? "item"}
              </p>
            ) : null}
            {compactStaff && r.response && (
              <p className="whitespace-pre-wrap break-words text-sm text-slate-600">
                Hotel response: {r.response}
              </p>
            )}
            {r.inputs && (
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                {r.inputs.serviceAt && (
                  <p>
                    Needed:{" "}
                    {new Date(r.inputs.serviceAt).toLocaleString("en-IN", {
                      timeZone: timezone,
                    })}{" "}
                    ({timezone})
                  </p>
                )}
                {r.inputs.people && (
                  <p>People: {r.inputs.people} (adults and children)</p>
                )}
                {r.inputs.hours && (
                  <p>Service duration: {r.inputs.hours} hours</p>
                )}
                {Object.entries(r.inputs.choices ?? {}).map(([key, value]) => (
                  <p key={key}>
                    {r.choiceLabels?.[key] ? `${r.choiceLabels[key]}: ` : ""}
                    {value}
                  </p>
                ))}
                {r.inputs.note && (
                  <p className="whitespace-pre-wrap">
                    Guest note: {r.inputs.note}
                  </p>
                )}
              </div>
            )}
          </>
        );
        return (
          <Row
            open={compactStaff || guest ? undefined : true}
            key={r.id}
            className={
              compactStaff
                ? "rounded-2xl border border-[#ede7dc] bg-white p-4.5 shadow-2xs space-y-3.5 hover:border-[#c89b3c]/40 transition-colors"
                : "rounded-xl border border-slate-200 bg-white p-4"
            }
          >
            <Summary
              className={`flex ${compactStaff ? "flex-wrap items-start gap-3" : "cursor-pointer flex-wrap items-center justify-between gap-2"}`}
            >
              {summary}
            </Summary>
            {compactStaff && r.inputs?.note && (
              <div className="rounded-xl border border-amber-200/60 bg-[#fffdfa] px-3 py-2 text-xs leading-relaxed text-[#5a482b]">
                <span className="font-bold text-[#c89b3c]">Guest note: </span>
                <span className="text-[#384252]">{r.inputs.note}</span>
              </div>
            )}
            <div
              className={
                compactStaff
                  ? "flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#f3efe8]"
                  : "mt-2"
              }
            >
              <span
                className={`text-xs ${
                  r.totalPaise === 0 && !r.quote && r.source !== "unlisted" && !r.priceOnRequest
                    ? "inline-flex items-center gap-1 font-bold text-[#785d1c] bg-[#fbf7ee] px-2.5 py-1 rounded-lg border border-[#e8d9b5]"
                    : "inline-flex items-center gap-1 font-bold text-[#061224] bg-[#f4f2ee] px-2.5 py-1 rounded-lg"
                }`}
              >
                {requestAmountLabel(r, currency)}
                {r.settlement === "pending_hotel" && r.totalPaise > 0
                  ? " · Estimate, not charged"
                  : r.settlement === "awaiting_payment"
                    ? " · Not charged"
                    : ""}
              </span>
              {compactStaff && (
                <details className="group ml-auto open:ml-0 open:w-full">
                  <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-semibold text-[#8b96aa] hover:text-[#061224] transition-colors">
                    <span>Request details</span>
                    <ChevronDown
                      size={13}
                      className="transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <div className="mt-2.5 space-y-2.5 rounded-xl border border-[#f0ece4] bg-[#fbfbf9] p-3 text-xs text-[#4d5870]">
                    {details}
                  </div>
                </details>
              )}
            </div>
            {!compactStaff && details}
            {r.agreementVersion === 2 &&
              r.settlement !== "included" &&
              !(guest && (r.offerId || r.offerDraft)) &&
              !(staff && r.offerId) &&
              ((staff && permits("requests.manage")) || guest) && (
                <RequestAgreementControls
                  request={r}
                  actor={(staff ?? guest)!}
                  staff={Boolean(staff)}
                  currency={currency}
                  timezone={timezone}
                  onDraftChange={onDraftChange}
                  compact={compactStaff}
                />
              )}
            {guest && (
              <RequestSelectionEditor
                request={r}
                requests={requests}
                actor={guest}
                timezone={timezone}
              />
            )}
            {r.preparationStarted && !compactStaff && (
              <p className="mt-1 text-xs text-slate-500">
                Preparation has started. Contact the hotel for changes.
              </p>
            )}
            {r.response && !compactStaff && (
              <p className="mt-2 text-sm">Hotel response: {r.response}</p>
            )}
            {r.totalPaise > 0 &&
              (r.agreementVersion !== 2 || r.settlement === "included") &&
              r.status === "declined" && (
                <p className="mt-2 text-xs text-slate-500">
                  This charge has been removed. Any amount paid online is
                  refunded through your original payment method.
                </p>
              )}
            {staff?.enabled && permits("requests.prepare") &&
              (r.agreementVersion !== 2 ||
                ["included", "paid"].includes(r.settlement ?? "")) &&
              ["requested", "confirmed", "preparing", "ready"].includes(
                r.status,
              ) && (
                <div
                  className={
                    compactStaff
                      ? "mt-4 flex flex-wrap items-center justify-between gap-3"
                      : "mt-3 space-y-2"
                  }
                >
                  <ResponseContainer className="group open:w-full">
                    {compactStaff && (
                      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-slate-500">
                        <MessageSquare size={13} />
                        Message guest <ChevronDown size={13} />
                      </summary>
                    )}
                    <label className="block text-xs">
                      Message to guest (optional)
                      <input
                        value={responses[r.id] ?? ""}
                        onChange={(e) =>
                          setResponses({ ...responses, [r.id]: e.target.value })
                        }
                        maxLength={1000}
                        className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    {compactStaff && (
                      <p className="mt-2 text-xs text-slate-500">
                        Sent with your next preparation update.
                      </p>
                    )}
                  </ResponseContainer>
                  <div className="flex flex-wrap gap-2">
                    {(r.status === "requested"
                      ? (permits("requests.manage") ? ["confirmed", "declined"] : ["confirmed"])
                      : r.status === "confirmed"
                        ? ["preparing"]
                        : r.status === "preparing"
                          ? ["ready"]
                          : ["fulfilled"]
                    ).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void update(r, status)}
                        className="min-h-10 rounded-xl bg-[#061224] px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                      >
                        {busy === r.id
                          ? "Saving…"
                          : status === "declined"
                            ? "Decline"
                            : status === "confirmed"
                              ? "Confirm"
                              : `Mark ${status}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </Row>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
