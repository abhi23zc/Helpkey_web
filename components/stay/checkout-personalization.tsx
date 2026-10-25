"use client";
import type {
  Offering,
  Selection,
  StayRequest,
  TravelerCategory,
} from "@/lib/stay/contracts";
import { CheckoutExtrasCatalog } from "./checkout-extras-catalog";
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
        <div className="rounded-2xl border border-[var(--hk-border)] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-[var(--hk-navy)]">Your additions</h3>
            <button
              type="button"
              disabled={locked}
              onClick={() => setSelections([])}
              className="min-h-11 text-xs font-semibold text-[var(--hk-muted)] underline"
            >
              Remove all extras
            </button>
          </div>
          <div className="divide-y divide-[var(--hk-border)]">
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
                    <p className="font-medium text-[var(--hk-navy)]">
                      {name}
                      {variantName ? ` · ${variantName}` : ""} × {s.quantity}
                    </p>
                    {!available && (
                      <p className="mt-1 text-xs text-amber-800">
                        This option changed. Remove it to continue.
                      </p>
                    )}
                    {available && (
                      <p className="mt-1 text-xs text-[var(--hk-muted)]">
                        {offering.confirmation === "approval"
                          ? "Hotel approval required"
                          : "Confirmed with booking"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-xs font-semibold text-[var(--hk-navy)]">
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
                      className="min-h-11 shrink-0 text-xs font-semibold underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p
            role="status"
            className="mt-3 border-t border-[var(--hk-border)] pt-3 text-sm font-semibold text-[var(--hk-navy)]"
          >
            {priceError
              ? "Price needs refreshing. Remove the changed option or retry above."
              : updating
                ? "Updating your stay total…"
                : quote
                  ? `Extra charges: ${formatMoney(quote.extrasTotalPaise, quote.currency)} · Booking total: ${formatMoney(quote.totalPaise, quote.currency)}`
                  : "Waiting for a current price"}
          </p>
        </div>
      )}
      {!selections.length && (
        <p className="text-center text-sm text-[var(--hk-muted)]">
          No extras added · ₹0 additional charges
        </p>
      )}
    </section>
  );
}
