"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BedDouble,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit3,
  Eye,
  IndianRupee,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { type CurrencyCode, formatPaise } from "@/lib/currency";
import { requestJson } from "@/lib/partner/upload-client";
import {
  type ListingMedia,
  type ListingRatePlan,
  type ListingRoomType,
  usePropertyListing,
} from "./use-property-listing";

/* ---------- derived, real-data view model ---------- */

type RoomRow = {
  room: ListingRoomType;
  /** Cheapest active rate plan for the room, if any. */
  rate: ListingRatePlan | null;
  image: string | null;
};

/** Picks a stable image for each room from the property photo pool. */
function pickImages(media: ListingMedia[]): string[] {
  return media
    .filter((asset) => asset.kind === "property_image" && asset.imageUrl)
    .map((asset) => asset.imageUrl as string);
}

function cheapestRate(rates: ListingRatePlan[], roomTypeId: string): ListingRatePlan | null {
  return rates
    .filter((rate) => rate.roomTypeId === roomTypeId && rate.basePricePaise > 0)
    .reduce<ListingRatePlan | null>((min, rate) => (!min || rate.basePricePaise < min.basePricePaise ? rate : min), null);
}

const MIN_VISIBLE_MS = 450;
async function withMinVisible<T>(task: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await task();
  } finally {
    const remaining = MIN_VISIBLE_MS - (Date.now() - start);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

function MetricCard({
  icon,
  iconClass,
  label,
  value,
  valueClass = "text-[#061224]",
  hint,
  hintClass = "text-slate-500",
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  hintClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>{icon}</div>
      <div className="min-w-0">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">{label}</span>
        <span className={`text-xl font-extrabold mt-0.5 block ${valueClass}`}>{value}</span>
        {hint && <p className={`text-[11px] font-medium ${hintClass}`}>{hint}</p>}
      </div>
    </div>
  );
}

export function PartnerRoomsRatesView({
  propertyId,
  propertyName = "The Balmoral Hotel",
}: {
  propertyId?: string;
  propertyName?: string;
}) {
  const listing = usePropertyListing(propertyId);
  const { data, property } = listing;
  // The platform is INR-only; narrow the string to the currency literal.
  const currency = listing.currency as CurrencyCode;

  const images = useMemo(() => (data ? pickImages(data.media) : []), [data]);

  const rows = useMemo<RoomRow[]>(() => {
    if (!data) return [];
    return data.roomTypes.map((room, index) => ({
      room,
      rate: cheapestRate(data.ratePlans, room.id),
      image: images.length ? images[index % images.length] : null,
    }));
  }, [data, images]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Effective selection: honor an explicit pick, otherwise fall back to the
  // first row. Derived (not stored) so no setState runs during render/effects.
  const selected =
    rows.find((row) => row.room.id === selectedId) ?? rows[0] ?? null;

  // Editable draft state for the quick editor.
  const [priceInput, setPriceInput] = useState("");
  const [inventoryInput, setInventoryInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const lastLoadedId = useRef<string | null>(null);

  useEffect(() => {
    // Reset the editor inputs whenever the selected room changes.
    if (selected && selected.room.id !== lastLoadedId.current) {
      lastLoadedId.current = selected.room.id;
      setPriceInput(selected.rate ? String(Math.round(selected.rate.basePricePaise / 100)) : "");
      setInventoryInput(String(selected.room.inventory ?? 0));
      setSaveMsg(null);
    }
  }, [selected]);

  /* ---------- derived metrics (real data only) ---------- */
  const totalRooms = rows.reduce((sum, row) => sum + (row.room.inventory || 0), 0);
  const activeCategories = rows.length;
  const startingPaise = listing.startingPricePaise;

  /* ---------- save handler ---------- */
  const handleSave = async () => {
    if (!propertyId || !selected) return;
    const price = Number(priceInput);
    const inventory = Number(inventoryInput);
    if (!Number.isFinite(inventory) || inventory < 1) {
      setSaveMsg({ text: "Rooms to sell must be at least 1.", ok: false });
      return;
    }
    if (priceInput && (!Number.isFinite(price) || price < 1)) {
      setSaveMsg({ text: "Enter a valid nightly price.", ok: false });
      return;
    }

    setSaving(true);
    setSaveMsg(null);
    try {
      await withMinVisible(async () => {
        // Update inventory when changed.
        if (inventory !== selected.room.inventory) {
          const res = await requestJson<{ roomType: ListingRoomType }>(
            `/api/partner/properties/${propertyId}/room-types/${selected.room.id}`,
            { totalInventory: inventory },
            "PATCH",
          );
          if (res.roomType) listing.updateRoomType(selected.room.id, { inventory: res.roomType.inventory });
        }
        // Update price when a rate plan exists and the value changed.
        if (selected.rate && priceInput) {
          const nextPaise = Math.round(price * 100);
          if (nextPaise !== selected.rate.basePricePaise) {
            const res = await requestJson<{ ratePlan: ListingRatePlan }>(
              `/api/partner/properties/${propertyId}/rate-plans/${selected.rate.id}`,
              { basePricePaise: nextPaise },
              "PATCH",
            );
            if (res.ratePlan) listing.updateRatePlan(selected.rate.id, { basePricePaise: res.ratePlan.basePricePaise });
          }
        }
      });
      setSaveMsg({
        text: selected.rate ? "Room updated." : "Rooms updated. Add a rate plan on the Listing page to set a price.",
        ok: true,
      });
    } catch (cause) {
      setSaveMsg({ text: cause instanceof Error ? cause.message : "Could not save.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!selected) return;
    setPriceInput(selected.rate ? String(Math.round(selected.rate.basePricePaise / 100)) : "");
    setInventoryInput(String(selected.room.inventory ?? 0));
    setSaveMsg(null);
  };

  /* ---------- loading / empty states ---------- */
  if (!propertyId) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-slate-400">
        <p className="text-sm font-semibold">Select a property from the top bar to manage its rooms.</p>
      </div>
    );
  }

  if (listing.loading && !data) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-[#c89b3c]" />
          <p className="text-sm font-semibold">Loading rooms…</p>
        </div>
      </div>
    );
  }

  const backgroundRefreshing = listing.loading && Boolean(data);

  return (
    <div className="space-y-6 text-[#061224] pb-16">
      {backgroundRefreshing && (
        <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-[#c89b3c]/15" role="status" aria-label="Refreshing">
          <div className="hk-loading-bar h-full w-1/4 rounded-full bg-[#c89b3c]" />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#061224]">Rooms</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Manage room availability, prices and guest-ready status for {property?.name ?? propertyName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/partner/listing"
            className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Room Type
          </Link>
          <Link
            href="/partner/listing"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
          >
            <Eye className="h-4 w-4 text-slate-500" />
            Preview Guest View
          </Link>
        </div>
      </div>

      {/* Metrics (real data) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<BedDouble className="h-6 w-6" />}
          iconClass="bg-amber-50 text-[#c89b3c]"
          label="Active Categories"
          value={`${activeCategories} ${activeCategories === 1 ? "Type" : "Types"}`}
          hint={`Total ${totalRooms} sellable room${totalRooms === 1 ? "" : "s"}`}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-6 w-6" />}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Sellable Rooms"
          value={`${totalRooms} ${totalRooms === 1 ? "Room" : "Rooms"}`}
          valueClass="text-emerald-700"
          hint={`${rows.filter((r) => r.rate).length} of ${activeCategories} priced`}
          hintClass="text-[#c89b3c]"
        />
        <MetricCard
          icon={<IndianRupee className="h-6 w-6" />}
          iconClass="bg-blue-50 text-blue-600"
          label="Starting Rate"
          value={startingPaise !== null ? formatPaise(startingPaise, { currency }) : "Not set"}
          hint={startingPaise !== null ? "Lowest active rate plan" : "Add a rate plan"}
        />
        <MetricCard
          icon={<KeyRound className="h-6 w-6" />}
          iconClass="rounded-full bg-amber-50 text-amber-600"
          label="Rate Plans"
          value={String(data?.ratePlans.length ?? 0)}
          hint="Across all room types"
        />
      </div>

      {/* Room Types */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-[#061224]">Room Types</h2>

        {rows.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                <BedDouble className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-base font-bold">No room types yet</h3>
              <p className="mt-1 max-w-sm text-sm font-medium text-slate-500">
                Add rooms and rate plans from the Listing editor to manage them here.
              </p>
              <Link
                href="/partner/listing"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0c1f3b]"
              >
                <Plus className="h-4 w-4" /> Add Room Type
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left: room cards */}
            <div className="lg:col-span-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {rows.map(({ room, rate, image }) => {
                  const isSelected = room.id === selected?.room.id;
                  return (
                    <div
                      key={room.id}
                      onClick={() => setSelectedId(room.id)}
                      className={`group relative rounded-2xl p-4 transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? "border-2 border-[#c89b3c] bg-[#fffdf7] shadow-sm"
                          : "border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs"
                      }`}
                    >
                      <div className="flex gap-4">
                        <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-slate-200">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image} alt={room.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="grid h-full place-items-center text-slate-300">
                              <BedDouble className="h-6 w-6" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="text-sm font-bold text-[#061224] truncate">{room.name}</h3>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                                rate
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {rate ? "Sellable" : "No rate"}
                            </span>
                          </div>

                          <div className="mt-1">
                            {rate ? (
                              <>
                                <span className="text-base font-bold text-[#c89b3c]">{formatPaise(rate.basePricePaise, { currency })}</span>
                                <span className="text-xs text-slate-500 font-medium"> / night</span>
                              </>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">No rate plan set</span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-1 text-center mt-2.5 pt-2 border-t border-slate-100 text-[10px]">
                            <div>
                              <span className="font-bold text-[#061224] text-xs block">{room.inventory}</span>
                              <span className="text-slate-400 font-medium">Sellable rooms</span>
                            </div>
                            <div>
                              <span className="font-bold text-[#061224] text-xs block">{room.maxAdults}</span>
                              <span className="text-slate-400 font-medium">Max guests</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(room.id);
                          }}
                          className="flex-1 rounded-xl bg-[#061224] py-2 text-center text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all flex items-center justify-center gap-1"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit Price
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(room.id);
                          }}
                          className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-semibold text-[#061224] hover:bg-slate-50 transition-all"
                        >
                          Update Rooms
                        </button>
                        <Link
                          href="/partner/listing"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-all"
                        >
                          <span>Details</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: quick editor */}
            <div className="space-y-6 lg:col-span-4">
              {selected && (
                <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-5 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#061224] mb-3">{selected.room.name}</h3>
                    <div className="relative h-40 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      {selected.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selected.image} alt={selected.room.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-slate-300">
                          <BedDouble className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-50/80 p-3 rounded-xl border border-slate-100 text-xs">
                    <div>
                      <span className="text-sm font-bold text-[#c89b3c] block">
                        {selected.rate ? formatPaise(selected.rate.basePricePaise, { currency }) : "—"}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium">Base Rate</span>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-[#061224] block">{selected.room.inventory}</span>
                      <span className="text-[9px] text-slate-400 font-medium">Sellable Rooms</span>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-blue-600 block">{selected.room.maxAdults}</span>
                      <span className="text-[9px] text-slate-400 font-medium">Max Guests</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Nightly Price</label>
                      <div
                        className={`flex items-center rounded-xl border bg-white px-3.5 py-2 text-xs focus-within:border-[#c89b3c] focus-within:ring-1 focus-within:ring-[#c89b3c] ${
                          selected.rate ? "border-slate-200" : "border-slate-200 opacity-60"
                        }`}
                      >
                        <span className="text-slate-400 font-bold mr-2">₹</span>
                        <input
                          type="number"
                          min={1}
                          value={priceInput}
                          disabled={!selected.rate || saving}
                          onChange={(e) => setPriceInput(e.target.value)}
                          placeholder={selected.rate ? "" : "No rate plan"}
                          className="w-full font-bold text-[#061224] outline-none disabled:cursor-not-allowed"
                        />
                        <span className="text-slate-400 font-medium text-[11px] shrink-0">/ night</span>
                      </div>
                      {!selected.rate && (
                        <p className="mt-1 text-[10px] font-medium text-amber-600">
                          Add a rate plan on the Listing page to set a price.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Rooms to Sell</label>
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs focus-within:border-[#c89b3c] focus-within:ring-1 focus-within:ring-[#c89b3c]">
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={inventoryInput}
                          disabled={saving}
                          onChange={(e) => setInventoryInput(e.target.value)}
                          className="w-20 font-bold text-[#061224] outline-none disabled:cursor-not-allowed"
                        />
                        <span className="text-slate-400 font-medium text-[11px]">total inventory</span>
                      </div>
                    </div>

                    {saveMsg && (
                      <p
                        className={`rounded-lg px-3 py-2 text-[11px] font-semibold ${
                          saveMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {saveMsg.text}
                      </p>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#061224] py-2.5 text-center text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all disabled:opacity-60 disabled:cursor-progress"
                      >
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {saving ? "Saving…" : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={handleReset}
                        disabled={saving}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sync footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs font-medium text-slate-500">
        <button
          type="button"
          onClick={() => listing.reload()}
          className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${backgroundRefreshing ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>

        <div className="flex items-center gap-1.5 text-slate-600">
          {property?.approvalStatus === "approved" ? (
            <>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Your rates and availability are live on Helpkey.</span>
            </>
          ) : (
            <>
              <Clock3 className="h-4 w-4 text-[#c89b3c]" />
              <span>Changes apply once your listing is approved.</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
