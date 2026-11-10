"use client";
import type {
  Offering,
  Selection,
  StayRequest,
  TravelerCategory,
} from "@/lib/stay/contracts";
import { CheckoutExtrasCatalog } from "./checkout-extras-catalog";
import { requestPriceBreakdown } from "@/lib/stay/pricing";
import { formatMoney } from "@/lib/customer/offer";
type Amenity = { code: string; label: string };
type Summary = {
  startAt: string;
  timezone: string;
  currency: string;
  customizations: StayRequest[];
  extrasTotalPaise: number;
  totalPaise: number;
  includedAmenities: {
    roomAmenities: Amenity[];
    propertyAmenities: Amenity[];
    rateInclusions: Amenity[];
  };
  cancellationPolicy: {
    name: string;
    description: string;
    refundableUntilHours: number;
    cancellationFeePercent: number;
  } | null;
};
export function CheckoutPersonalization({
  quote,
  offerings,
  selections,
  setSelections,
  preferences,
  setPreferences,
  locked,
  updating,
  optionsLoading,
  optionsError,
  retry,
  priceError,
  roomTypeId,
  bookingMode,
}: {
  quote: Summary | null;
  offerings: Offering[];
  selections: Selection[];
  setSelections: (v: Selection[]) => void;
  preferences: TravelerCategory[];
  setPreferences: (v: TravelerCategory[]) => void;
  locked: boolean;
  updating: boolean;
  optionsLoading: boolean;
  optionsError: boolean;
  retry: () => void;
  priceError: boolean;
  roomTypeId: string;
  bookingMode: string;
}) {
  return (
    <section aria-label="Stay personalization" className="space-y-6">
      {optionsLoading && (
        <p role="status" className="text-sm text-[var(--hk-muted)]">
          Refreshing available options…
        </p>
      )}
      {optionsError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Options could not load.{" "}
          <button
            type="button"
            onClick={retry}
            className="min-h-11 font-semibold underline"
          >
            Retry
          </button>{" "}
          or continue without extras.
        </div>
      )}
      {quote && (
        <CheckoutExtrasCatalog
          includedCodes={[
            ...quote.includedAmenities.roomAmenities,
            ...quote.includedAmenities.propertyAmenities,
            ...quote.includedAmenities.rateInclusions,
          ].map((a) => a.code)}
          roomTypeId={roomTypeId}
          bookingMode={bookingMode}
          offerings={offerings}
          selections={selections}
          onChange={setSelections}
          preferences={preferences}
          onPreferences={setPreferences}
          startAt={quote.startAt}
          timezone={quote.timezone}
          currency={quote.currency}
          disabled={locked || optionsLoading || optionsError}
        />
      )}
      {selections.length > 0 && (
        <div className="lg:hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-[#000615]">Your additions</h3>
            <button
              type="button"
              disabled={locked}
              onClick={() => setSelections([])}
              className="text-xs font-semibold text-slate-500 underline hover:text-[#000615]"
            >
              Remove all extras
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {selections.map((s) => {
              const offering = offerings.find((o) => o.id === s.offeringId);
              const saved = quote?.customizations.find(
                (r) =>
                  r.offeringId === s.offeringId && r.variantId === s.variantId,
              );
              const variant = offering?.variants.find(
                (v) => v.id === s.variantId,
              );
              const name =
                offering?.name ?? saved?.name ?? "Unavailable option";
              const variantName = variant?.name ?? saved?.variantName;
              const available =
                offering &&
                (s.variantId === null
                  ? offering.variants.length === 0
                  : Boolean(variant));
              return (
                <div
                  key={JSON.stringify([s.offeringId, s.variantId])}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-[#000615]">
                      {name}
                      {variantName ? ` · ${variantName}` : ""} × {s.quantity}
                    </p>
                    {saved?.billableQuantity && saved.unitPricePaise > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {requestPriceBreakdown(saved, quote?.currency)} · per{" "}
                        {saved.pricingUnit ?? "item"}
                      </p>
                    ) : null}
                    {!available && (
                      <p className="mt-1 text-xs text-amber-800">
                        This option changed. Remove it to continue.
                      </p>
                    )}
                    {available && (
                      <p className="mt-1 text-xs text-slate-500">
                        {offering.confirmation === "approval"
                          ? "Pending hotel approval · Excluded from checkout payment"
                          : "Confirmed with booking"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-xs font-semibold text-[#000615]">
                      {priceError
                        ? "Price pending"
                        : updating || !saved || saved.quantity !== s.quantity
                          ? "Updating…"
                          : saved.totalPaise
                            ? formatMoney(
                                saved.totalPaise,
                                quote?.currency ?? "INR",
                              )
                            : "Free"}
                    </span>
                    <button
                      type="button"
                      disabled={locked}
                      aria-label={`Remove ${name}${variantName ? ` ${variantName}` : ""}`}
                      onClick={() =>
                        setSelections(selections.filter((n) => n !== s))
                      }
                      className="min-h-8 shrink-0 text-xs font-semibold underline text-slate-500"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
