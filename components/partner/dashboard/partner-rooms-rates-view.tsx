"use client";

import { BUILTIN_ROOM_AMENITIES, normalizeRoomAmenities, roomAmenitySelections, type RoomAmenityOption } from "@/lib/partner/room-amenities";
import { RoomAmenitiesEditor } from "./room-amenities-editor";
import { PriceOptionEditor } from "./price-option-editor";
import {
  eligiblePricing,
  type DurationPrice,
} from "@/lib/booking/duration-pricing";
import { useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  Eye,
  Image as ImageIcon,
  IndianRupee,
  KeyRound,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ListChecks,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { type CurrencyCode, formatPaise } from "@/lib/currency";
import { requestJson } from "@/lib/partner/upload-client";
import {
  type ListingMedia,
  type ListingRatePlan,
  type ListingRoomType,
  type ListingResponse,
  usePropertyListing,
} from "./use-property-listing";
import { PhotosEditor } from "./listing-editors";
import { CapacityControls } from "./capacity-controls";
import { Drawer } from "./drawer";

/* ---------- derived, real-data view model ---------- */

type RoomRow = {
  room: ListingRoomType;
  /** Cheapest active rate plan for the room, if any. */
  rate: ListingRatePlan | null;
  image: string | null;
};

/** A room's assigned cover wins; legacy rooms gracefully fall back to a property image. */
function roomImage(
  room: ListingRoomType,
  media: ListingMedia[],
): string | null {
  const photos = media.filter(
    (asset) => asset.kind === "property_image" && asset.imageUrl,
  );
  const preferredId = room.coverMediaId ?? room.mediaIds[0];
  return photos.find((asset) => asset.id === preferredId)?.imageUrl ?? null;
}

function cheapestRate(
  rates: ListingRatePlan[],
  roomTypeId: string,
  mode?: string,
): ListingRatePlan | null {
  const price = (r: ListingRatePlan) =>
    r.bookingMode === "hourly"
      ? Math.min(...(r.durationPrices || []).map((p) => p.pricePaise))
      : r.basePricePaise;
  return rates
    .filter(
      (rate) =>
        rate.roomTypeId === roomTypeId &&
        rate.status === "active" &&
        eligiblePricing(rate) &&
        (!mode || (rate.bookingMode || "overnight") === mode),
    )
    .reduce<ListingRatePlan | null>(
      (min, rate) => (!min || price(rate) < price(min) ? rate : min),
      null,
    );
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
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          {label}
        </span>
        <span className={`text-xl font-extrabold mt-0.5 block ${valueClass}`}>
          {value}
        </span>
        {hint && (
          <p className={`text-[11px] font-medium ${hintClass}`}>{hint}</p>
        )}
      </div>
    </div>
  );
}

const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-xl bg-[#061224] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0c1f3b] disabled:cursor-not-allowed disabled:opacity-50";
type EditorTab = "details" | "amenities" | "photos" | "inventory" | "rates";

function RoomEditor({
  propertyId,
  timezone,
  room,
  initialTab,
  media,
  policies,
  rates,
  onRoomUpdated,
  onRateAdded,
  onRateUpdated,
  onDirty,
  onBusy,
  amenityOptions,
  rooms,
}: {
  propertyId: string;
  timezone: string;
  room: ListingRoomType;
  initialTab: EditorTab;
  media: ListingMedia[];
  policies: ListingResponse["policies"];
  rates: ListingRatePlan[];
  onRoomUpdated: (room: ListingRoomType) => void;
  onRateAdded: (rate: ListingRatePlan) => void;
  onRateUpdated: (rate: ListingRatePlan) => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  amenityOptions: RoomAmenityOption[];
  rooms: ListingRoomType[];
}) {
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [rateDirty, setRateDirty] = useState(false);
  const [dirtyTabs, setDirtyTabs] = useState<string[]>([]);
  const markDirty = () =>
    { if (tab !== "rates") setDirtyTabs((t) => (t.includes(tab) ? t : [...t, tab])); }
  const markSaved = () => setDirtyTabs((t) => t.filter((x) => x !== tab));
  useEffect(() => {
    onDirty(dirtyTabs.length > 0 || rateDirty);
  }, [dirtyTabs, rateDirty, onDirty]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { onBusy(saving); return () => onBusy(false); }, [saving, onBusy]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description);
  const [adults, setAdults] = useState(String(room.maxAdults));
  const [children, setChildren] = useState(String(room.maxChildren));
  const [infants, setInfants] = useState(String(room.maxInfants));
  const [beds, setBeds] = useState(
    room.bedConfigurations.length
      ? room.bedConfigurations
      : [{ bedType: "double", count: 1 }],
  );
  const [size, setSize] = useState(
    room.roomSizeSqFt ? String(room.roomSizeSqFt) : "",
  );
  const [bathroom, setBathroom] = useState(room.bathroomType);
  const [inventory, setInventory] = useState(String(room.inventory));
  const [hourlyEnabled, setHourlyEnabled] = useState(
    room.bookingModes?.includes("hourly") ?? false,
  );
  const [cleaning, setCleaning] = useState(
    String(room.cleaningBufferMinutes ?? 30),
  );
  const [status, setStatus] = useState<"active" | "paused">(room.status);
  const [amenities, setAmenities] = useState(() => normalizeRoomAmenities(room.amenityIds, amenityOptions));
  const [mediaIds, setMediaIds] = useState(room.mediaIds);
  const [coverMediaId, setCoverMediaId] = useState<string | null>(
    room.coverMediaId,
  );
  const [selectedRateId, setSelectedRateId] = useState(
    rates.find((rate) => eligiblePricing(rate))?.id ?? "new",
  );

  const availablePhotos = media.filter(
    (asset) => asset.kind === "property_image",
  );
  const setNotice = (ok: boolean, text: string) => setMessage({ ok, text });
  const saveRoom = async (body: Record<string, unknown>, success: string) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await requestJson<{ roomType: ListingRoomType }>(
        `/api/partner/properties/${propertyId}/room-types/${room.id}`,
        body,
        "PATCH",
      );
      if (!response.roomType)
        throw new Error("The room update was not returned.");
      if (body.amenityIds !== undefined) setAmenities(normalizeRoomAmenities(response.roomType.amenityIds, amenityOptions));
      onRoomUpdated(response.roomType);
      markSaved();
      setNotice(true, success);
    } catch (cause) {
      setNotice(
        false,
        cause instanceof Error ? cause.message : "Could not save room changes.",
      );
    } finally {
      setSaving(false);
    }
  };
  const integer = (value: string, label: string, min = 0) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min)
      throw new Error(`${label} must be a whole number of at least ${min}.`);
    return number;
  };
  const toggleMedia = (id: string) =>
    setMediaIds((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      if (!next.includes(coverMediaId ?? "")) setCoverMediaId(next[0] ?? null);
      return next;
    });

  const selectedRate =
    rates.find((rate) => rate.id === selectedRateId && eligiblePricing(rate)) ??
    null;
  const editorTabs: { id: EditorTab; label: string; icon: React.ReactNode }[] =
    [
      {
        id: "details",
        label: "Details",
        icon: <BedDouble className="h-3.5 w-3.5" />,
      },
      {
        id: "amenities",
        label: "Amenities",
        icon: <ListChecks className="h-3.5 w-3.5" />,
      },
      {
        id: "photos",
        label: "Photos",
        icon: <ImageIcon className="h-3.5 w-3.5" />,
      },
      {
        id: "inventory",
        label: "Availability",
        icon: <Layers className="h-3.5 w-3.5" />,
      },
      {
        id: "rates",
        label: "Prices",
        icon: <IndianRupee className="h-3.5 w-3.5" />,
      },
    ];

  return (
    <div onChangeCapture={() => { if (tab !== "amenities") markDirty(); }} className="space-y-4">
      {/* Segmented Tab Navigation */}
      <div aria-label="Room settings" className="sticky -top-5 z-10 grid grid-cols-5 gap-1 border-b border-slate-100 bg-white pb-3 pt-1">
        {editorTabs.map((item) => {
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (saving || (rateDirty && !window.confirm("Discard unsaved changes to this price option?"))) return;
                setRateDirty(false);
                setTab(item.id);
                setMessage(null);
              }}
              aria-pressed={isActive}
              aria-label={item.label}
              className={`inline-flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl py-2.5 px-1 text-[10px] sm:flex-row sm:text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c] ${
                isActive
                  ? "bg-[#edf3f8] text-[#092442]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <fieldset disabled={saving} className="min-w-0 space-y-4 pt-1">
        {tab === "details" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                Room name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  aria-label="Room name"
                  placeholder="e.g. Deluxe Room"
                  className="mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-semibold outline-none transition-colors focus:border-[#c89b3c]"
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                Guest description
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  minLength={10}
                  rows={3}
                  aria-label="Guest description"
                  placeholder="Describe comfort, views, and room experience..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-medium outline-none transition-colors focus:border-[#c89b3c]"
                />
              </label>
            </div>

            {/* Occupancy Grid */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Max Guest Occupancy
              </span>
              <div className="grid grid-cols-3 gap-2.5">
                <NumberField
                  label="Adults"
                  value={adults}
                  setValue={setAdults}
                  min={1}
                />
                <NumberField
                  label="Children"
                  value={children}
                  setValue={setChildren}
                  min={0}
                />
                <NumberField
                  label="Infants"
                  value={infants}
                  setValue={setInfants}
                  min={0}
                />
              </div>
            </div>

            {/* Bed Configurations */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Bed configurations
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  {beds.length} {beds.length === 1 ? "type" : "types"}
                </span>
              </div>
              <div className="space-y-2">
                {beds.map((bed, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs"
                  >
                    <label className="flex-1 min-w-0 text-[10px] font-semibold text-slate-400">
                      Bed type
                      <select
                        aria-label={`Bed type ${i + 1}`}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#061224] outline-none focus:border-[#c89b3c]"
                        value={bed.bedType}
                        onChange={(e) =>
                          setBeds(
                            beds.map((b, j) =>
                              j === i ? { ...b, bedType: e.target.value } : b,
                            ),
                          )
                        }
                      >
                        {[
                          "single",
                          "double",
                          "queen",
                          "king",
                          "sofa_bed",
                          ...(beds.some(
                            (b) =>
                              ![
                                "single",
                                "double",
                                "queen",
                                "king",
                                "sofa_bed",
                              ].includes(b.bedType),
                          )
                            ? beds
                                .map((b) => b.bedType)
                                .filter(
                                  (t) =>
                                    ![
                                      "single",
                                      "double",
                                      "queen",
                                      "king",
                                      "sofa_bed",
                                    ].includes(t),
                                )
                            : []),
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label className="w-20 text-[10px] font-semibold text-slate-400">
                      Count
                      <input
                        aria-label={`Bed count ${i + 1}`}
                        type="number"
                        min={1}
                        max={20}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-center text-[#061224] outline-none focus:border-[#c89b3c]"
                        value={bed.count}
                        onChange={(e) =>
                          setBeds(
                            beds.map((b, j) =>
                              j === i
                                ? { ...b, count: Number(e.target.value) }
                                : b,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={beds.length === 1}
                      onClick={() => {
                        setBeds(beds.filter((_, j) => j !== i));
                        markDirty();
                      }}
                      className="self-end mb-1 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition-colors"
                      title="Remove bed type"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove</span>
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={beds.length >= 10}
                onClick={() => {
                  setBeds([...beds, { bedType: "single", count: 1 }]);
                  markDirty();
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:border-[#c89b3c] hover:text-[#061224] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add bed type
              </button>
            </div>

            {/* Room size & Bathroom */}
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField
                label="Room size (sq ft)"
                value={size}
                setValue={setSize}
                min={1}
                optional
              />
              <label className="block text-xs font-bold text-slate-700">
                Bathroom
                <select
                  value={bathroom}
                  onChange={(event) =>
                    setBathroom(event.target.value as "private" | "shared")
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm font-semibold outline-none focus:border-[#c89b3c]"
                >
                  <option value="private">Private</option>
                  <option value="shared">Shared</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => {
                try {
                  void saveRoom(
                    {
                      name: name.trim(),
                      description: description.trim(),
                      maxAdults: integer(adults, "Adults", 1),
                      maxChildren: integer(children, "Children"),
                      maxInfants: integer(infants, "Infants"),
                      bedConfigurations: beds,
                      roomSizeSqFt: size ? integer(size, "Room size", 1) : null,
                      bathroomType: bathroom,
                    },
                    "Room details saved.",
                  );
                } catch (error) {
                  setNotice(
                    false,
                    error instanceof Error
                      ? error.message
                      : "Check room details.",
                  );
                }
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save details
            </button>
          </div>
        )}

        {tab === "amenities" && (
          <div className="space-y-4">
            <RoomAmenitiesEditor room={room} rooms={rooms} options={amenityOptions} value={amenities}
              onChange={(next) => { setAmenities(next); markDirty(); setMessage(null); }} />
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void saveRoom(
                  { amenityIds: amenities },
                  "Room amenities saved.",
                )
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save amenities
            </button>
          </div>
        )}

        {tab === "photos" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 font-medium">
              Assign property photos to this room. The selected cover appears on
              the guest-facing room card.
            </p>
            {availablePhotos.length ? (
              <div className="grid grid-cols-3 gap-2.5">
                {availablePhotos.map((photo) => {
                  const isAssigned = mediaIds.includes(photo.id);
                  const isCover = coverMediaId === photo.id;
                  return (
                    <label
                      key={photo.id}
                      className={`group relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all ${
                        isAssigned
                          ? "border-[#c89b3c] shadow-xs"
                          : "border-slate-200 opacity-60 hover:opacity-100"
                      }`}
                    >
                      {photo.imageUrl ? (
                        <img
                          src={photo.imageUrl}
                          alt={photo.altText || "Room photo"}
                          className="h-24 w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="grid h-24 place-items-center bg-slate-100 text-slate-400">
                          Photo
                        </div>
                      )}
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={() => toggleMedia(photo.id)}
                        className="absolute left-1.5 top-1.5 h-4 w-4 rounded border-slate-300 text-[#061224] focus:ring-[#c89b3c]"
                      />
                      {isAssigned && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            setCoverMediaId(photo.id);
                            markDirty();
                          }}
                          className={`absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold shadow-xs transition-all ${
                            isCover
                              ? "bg-[#061224] text-white"
                              : "bg-white/95 text-slate-700 hover:bg-white"
                          }`}
                        >
                          {isCover ? "★ Cover" : "Set cover"}
                        </button>
                      )}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs font-semibold text-amber-700">
                Upload property photos in the Listing page first, then assign
                them here.
              </p>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void saveRoom({ mediaIds, coverMediaId }, "Room photos saved.")
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save photos
            </button>
          </div>
        )}

        {tab === "inventory" && (
          <div className="space-y-4">
            <CapacityControls
              propertyId={propertyId}
              roomTypeId={room.id}
              timezone={timezone}
            />

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                <div>
                  <span className="text-xs font-bold text-[#061224] block">
                    Hourly Stays
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Enable daytime hourly bookings for this room
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={hourlyEnabled}
                  onChange={(e) => setHourlyEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#061224] focus:ring-[#c89b3c]"
                />
              </label>
              <NumberField
                label="Cleaning buffer (minutes, in 15-minute steps)"
                value={cleaning}
                setValue={setCleaning}
                min={0}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveRoom(
                    {
                      bookingModes: hourlyEnabled
                        ? ["overnight", "hourly"]
                        : ["overnight"],
                      cleaningBufferMinutes: Number(cleaning),
                    },
                    "Booking settings saved.",
                  )
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all disabled:opacity-50"
              >
                Save booking settings
              </button>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-3">
              <NumberField
                label="Rooms available to sell"
                value={inventory}
                setValue={setInventory}
                min={1}
              />
              <label className="block text-xs font-bold text-slate-700">
                Selling status
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as "active" | "paused")
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm font-semibold outline-none focus:border-[#c89b3c]"
                >
                  <option value="active">Active and sellable</option>
                  <option value="paused">Paused / closed to sale</option>
                </select>
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  try {
                    void saveRoom(
                      {
                        totalInventory: integer(
                          inventory,
                          "Rooms available",
                          1,
                        ),
                        status,
                      },
                      "Inventory saved.",
                    );
                  } catch (error) {
                    setNotice(
                      false,
                      error instanceof Error
                        ? error.message
                        : "Check inventory.",
                    );
                  }
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all disabled:opacity-50"
              >
                Save availability
              </button>
            </div>
          </div>
        )}
        {tab === "rates" && (
          <PriceOptionEditor
            key={selectedRate?.id ?? "new"}
            propertyId={propertyId}
            roomTypeId={room.id}
            policies={policies}
            rates={rates}
            selectedRate={selectedRate}
            selectRate={setSelectedRateId}
            onDirty={setRateDirty}
            saving={saving}
            setSaving={setSaving}
            onMessage={setNotice}
            onRateAdded={(r) => {
              onRateAdded(r);
              markSaved();
            }}
            onRateUpdated={(r) => {
              onRateUpdated(r);
              markSaved();
            }}
          />
        )}
        {message && tab !== "rates" && (
          <p
            role={message.ok ? "status" : "alert"}
            className={`rounded-lg px-3 py-2 font-semibold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
          >
            {message.text}
          </p>
        )}
      </fieldset>
    </div>
  );
}

function NumberField({
  label,
  value,
  setValue,
  min,
  optional = false,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  min: number;
  optional?: boolean;
}) {
  return (
    <label className="block min-w-0 text-[10px] sm:text-xs font-semibold text-slate-500">
      <span className="block mb-1">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        required={!optional}
        onChange={(event) => setValue(event.target.value)}
        className="block w-full min-w-0 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-[#061224] outline-none transition-colors focus:border-[#c89b3c]"
      />
    </label>
  );
}

function NewRoomEditor({
  propertyId,
  onCreated,
}: {
  propertyId: string;
  onCreated: (room: ListingRoomType) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inventory, setInventory] = useState("1");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [infants, setInfants] = useState("0");
  const [bedType, setBedType] = useState("double");
  const [bedCount, setBedCount] = useState("1");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const integer = (value: string, label: string, min = 0) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min)
      throw new Error(`${label} must be a whole number of at least ${min}.`);
    return number;
  };
  const createRoom = async () => {
    setMessage(null);
    try {
      const roomName = name.trim();
      const roomDescription = description.trim();
      if (roomName.length < 2)
        throw new Error("Enter a room name with at least 2 characters.");
      if (roomDescription.length < 10)
        throw new Error("Add a guest description with at least 10 characters.");
      setSaving(true);
      const result = await requestJson<{ roomType: ListingRoomType }>(
        `/api/partner/properties/${propertyId}/room-types`,
        {
          name: roomName,
          description: roomDescription,
          totalInventory: integer(inventory, "Rooms available", 1),
          maxAdults: integer(adults, "Adults", 1),
          maxChildren: integer(children, "Children"),
          maxInfants: integer(infants, "Infants"),
          bedConfigurations: [{ bedType, count: integer(bedCount, "Beds", 1) }],
        },
        "POST",
      );
      if (!result.roomType) throw new Error("The new room was not returned.");
      onCreated(result.roomType);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not add the room type.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <p className="rounded-xl bg-amber-50 px-3 py-2.5 font-medium text-amber-800">
        Start with the essentials. You can add room photos, amenities,
        availability, and rates immediately after creating it.
      </p>
      <label className="block font-bold text-slate-700">
        Room name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Deluxe Double"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c89b3c]"
          autoFocus
        />
      </label>
      <label className="block font-bold text-slate-700">
        Guest description
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe this room for guests…"
          rows={4}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c89b3c]"
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="Adults"
          value={adults}
          setValue={setAdults}
          min={1}
        />
        <NumberField
          label="Children"
          value={children}
          setValue={setChildren}
          min={0}
        />
        <NumberField
          label="Infants"
          value={infants}
          setValue={setInfants}
          min={0}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="font-bold text-slate-700">
          Bed type
          <select
            value={bedType}
            onChange={(event) => setBedType(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          >
            <option value="single">Single</option>
            <option value="double">Double</option>
            <option value="queen">Queen</option>
            <option value="king">King</option>
            <option value="sofa_bed">Sofa bed</option>
          </select>
        </label>
        <NumberField
          label="Beds"
          value={bedCount}
          setValue={setBedCount}
          min={1}
        />
      </div>
      <NumberField
        label="Rooms available to sell"
        value={inventory}
        setValue={setInventory}
        min={1}
      />
      {message && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 font-semibold text-rose-700">
          {message}
        </p>
      )}
      <button
        type="button"
        disabled={saving}
        onClick={() => void createRoom()}
        className={primaryButtonClass}
      >
        {saving ? "Adding room…" : "Create room type"}
      </button>
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
  const [editorDirty, setEditorDirty] = useState(false);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (editorDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editorDirty]);
  const [editorBusy, setEditorBusy] = useState(false);
  const [photoEditor, setPhotoEditor] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [settingsError, setSettingsError] = useState("");
  const listing = usePropertyListing(propertyId, "rooms");
  const { data, property } = listing;
  const amenityOptions = data?.amenityOptions ?? BUILTIN_ROOM_AMENITIES;
  // The platform is INR-only; narrow the string to the currency literal.
  const currency = listing.currency as CurrencyCode;

  const rows = useMemo<RoomRow[]>(() => {
    if (!data) return [];
    return data.roomTypes.map((room) => ({
      room,
      rate: cheapestRate(data.ratePlans, room.id),
      image: roomImage(room, data.media),
    }));
  }, [data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("tab") === "inventory"
      ? "inventory"
      : "details",
  );
  const [editorOpen, setEditorOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("tab") === "inventory",
  );
  const [createOpen, setCreateOpen] = useState(false);
  const selected =
    rows.find((row) => row.room.id === selectedId) ??
    (editorOpen && editorTab === "inventory" ? rows[0] : null);
  const openEditor = (roomId: string, tab: EditorTab) => {
    setSelectedId(roomId);
    setEditorTab(tab);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    if (editorBusy) return;
    if (editorDirty && !window.confirm("Discard unsaved room changes?")) return;
    setEditorDirty(false);
    setEditorOpen(false);
    setSelectedId(null);
  };
  const openNewRoom = () => {
    setEditorOpen(false);
    setSelectedId(null);
    setCreateOpen(true);
  };
  const onRoomCreated = (room: ListingRoomType) => {
    listing.addRoomType(room);
    setCreateOpen(false);
    setSelectedId(room.id);
    setEditorTab("details");
    setEditorOpen(true);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteRoom = async (roomId: string, roomName: string) => {
    if (deletingId) return;
    const relatedRates =
      data?.ratePlans.filter((rate) => rate.roomTypeId === roomId).length ?? 0;
    const rateNote =
      relatedRates > 0
        ? ` Its ${relatedRates} rate plan(s) will also be archived.`
        : "";
    if (
      !window.confirm(
        `Archive "${roomName}"?${rateNote} Booking history is preserved. Pause this type instead if it has active reservations.`,
      )
    )
      return;
    setDeletingId(roomId);
    setDeleteError(null);
    try {
      await requestJson(
        `/api/partner/properties/${propertyId}/room-types/${roomId}`,
        undefined,
        "DELETE",
      );
      // Close the drawer if the deleted room was open, then drop it locally.
      if (selectedId === roomId) closeEditor();
      listing.removeRoomType(roomId);
    } catch (cause) {
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : "Could not archive this room type.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------- derived metrics (real data only) ---------- */
  const totalRooms = rows.reduce(
    (sum, row) => sum + (row.room.inventory || 0),
    0,
  );
  const activeCategories = rows.filter(
    (r) => r.room.status === "active",
  ).length;
  const startingPaise = listing.startingPricePaise;

  /* ---------- loading / empty states ---------- */
  if (!propertyId) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-slate-400">
        <p className="text-sm font-semibold">
          Select a property from the top bar to manage its rooms.
        </p>
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
        <div
          className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-[#c89b3c]/15"
          role="status"
          aria-label="Refreshing"
        >
          <div className="hk-loading-bar h-full w-1/4 rounded-full bg-[#c89b3c]" />
        </div>
      )}

      {/* Sub-header / Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#061224]">
            Room types
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1">
            Manage room configurations, pricing plans, and guest-facing details
            for {property?.name ?? propertyName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Integrated Hourly Stays Switch Chip */}
          <label
            title="Toggle flexible hourly stays (3h, 6h, 12h) for this property"
            className={`inline-flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-xs transition-all cursor-pointer select-none ${
              property?.bookingModes?.includes("hourly")
                ? "border-amber-200/90 bg-amber-50/70 text-[#061224] hover:bg-amber-100/60"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Clock3
              className={`h-4 w-4 ${
                property?.bookingModes?.includes("hourly")
                  ? "text-[#b78929]"
                  : "text-slate-400"
              }`}
            />
            <span>Hourly stays</span>
            <input
              type="checkbox"
              checked={property?.bookingModes?.includes("hourly") ?? false}
              onChange={async (e) => {
                const bookingModes: ("overnight" | "hourly")[] = e.target
                  .checked
                  ? ["overnight", "hourly"]
                  : ["overnight"];
                setSettingsError("");
                try {
                  await requestJson(
                    `/api/partner/properties/${propertyId}`,
                    { bookingModes },
                    "PATCH",
                  );
                  listing.patchProperty({ bookingModes });
                } catch (error) {
                  setSettingsError(
                    error instanceof Error
                      ? error.message
                      : "Unable to save booking modes",
                  );
                }
              }}
              className="sr-only peer"
              aria-label="Offer hourly stays at this property"
            />
            <div className="relative h-4 w-7 rounded-full bg-slate-300 transition-colors peer-checked:bg-[#061224] peer-focus:outline-none after:absolute after:start-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-3" />
          </label>

          <Link
            href={`/hotels/${property?.slug || property?.id || ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-all"
          >
            <Eye className="h-4 w-4 text-slate-500" />
            Preview Guest View
          </Link>

          <button
            type="button"
            onClick={openNewRoom}
            className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Room Type
          </button>
        </div>
      </div>

      {settingsError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700">
          {settingsError}
        </div>
      )}
      {property?.inventoryEngine !== "interval_v1" &&
        property?.bookingModes?.includes("hourly") && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700">
            Hourly settings are saved, but hourly stays require Helpkey
            availability verification.
          </div>
        )}

      {/* Metrics (real data) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<BedDouble className="h-6 w-6" />}
          iconClass="bg-amber-50 text-[#c89b3c]"
          label="Active room types"
          value={`${activeCategories} ${activeCategories === 1 ? "Type" : "Types"}`}
          hint="Room types currently enabled"
        />
        <MetricCard
          icon={<CheckCircle2 className="h-6 w-6" />}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Configured capacity"
          value={`${totalRooms} ${totalRooms === 1 ? "Room" : "Rooms"}`}
          valueClass="text-emerald-700"
          hint="Total capacity, not current availability"
          hintClass="text-[#c89b3c]"
        />
        <MetricCard
          icon={<IndianRupee className="h-6 w-6" />}
          iconClass="bg-blue-50 text-blue-600"
          label="Base price from"
          value={
            startingPaise !== null
              ? formatPaise(startingPaise, { currency })
              : "Not set"
          }
          hint={
            startingPaise !== null
              ? "Before date overrides, taxes and fees"
              : "Add a rate plan"
          }
        />
        <MetricCard
          icon={<KeyRound className="h-6 w-6" />}
          iconClass="rounded-full bg-amber-50 text-amber-600"
          label="Rate Plans"
          value={String(data?.ratePlans.length ?? 0)}
          hint="Across all room types"
        />
      </div>

      {/* Room Types Toolbar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                aria-label="Search room types"
                placeholder="Search room types..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs sm:text-sm font-medium outline-none transition-colors focus:border-[#c89b3c]"
              />
            </div>
            <select
              aria-label="Room type status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 outline-none focus:border-[#c89b3c]"
            >
              <option value="all">All room types</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            onClick={() => setPhotoEditor(true)}
          >
            <ImageIcon className="h-4 w-4 text-slate-500" />
            Upload & manage photos
          </button>
        </div>

        {deleteError && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700"
            role="alert"
          >
            <span>{deleteError}</span>
            <button
              type="button"
              onClick={() => setDeleteError(null)}
              className="shrink-0 rounded-md px-2 py-1 text-rose-600 hover:bg-rose-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                <BedDouble className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-base font-bold text-[#061224]">
                No room types yet
              </h3>
              <p className="mt-1 max-w-sm text-xs sm:text-sm font-medium text-slate-500">
                Add rooms and rate plans from the Listing editor to manage them
                here.
              </p>
              <button
                type="button"
                onClick={openNewRoom}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0c1f3b] transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Room Type
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows
              .filter(
                ({ room }) =>
                  room.name.toLowerCase().includes(search.toLowerCase()) &&
                  (statusFilter === "all" || room.status === statusFilter),
              )
              .map(({ room, rate, image }) => {
                const selectedAmenities = roomAmenitySelections(room.amenityIds, amenityOptions);
                return (
                  <div
                    key={room.id}
                    onClick={() => openEditor(room.id, "details")}
                    className="group relative cursor-pointer rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 transition-all duration-200 hover:border-[#c89b3c]/80 hover:shadow-md flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex gap-4">
                        <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-slate-200/80">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={image}
                              alt={room.name}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-slate-300">
                              <BedDouble className="h-6 w-6" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="text-sm font-bold text-[#061224] truncate">
                              {room.name}
                            </h3>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold border shrink-0 ${
                                room.status === "paused"
                                  ? "bg-slate-100 text-slate-600 border-slate-200"
                                  : rate
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {room.status === "paused"
                                ? "Paused"
                                : rate
                                  ? "Rate configured"
                                  : "No rate"}
                            </span>
                          </div>

                          <div className="mt-1 space-y-0.5">
                            {["overnight", "hourly"].map((mode) => {
                              const r = cheapestRate(
                                data?.ratePlans || [],
                                room.id,
                                mode,
                              );
                              if (!r) return null;
                              const duration =
                                mode === "hourly"
                                  ? (
                                      r.durationPrices ?? []
                                    ).reduce<DurationPrice | null>(
                                      (min, p) =>
                                        !min || p.pricePaise < min.pricePaise
                                          ? p
                                          : min,
                                      null,
                                    )
                                  : null;
                              return (
                                <p key={mode} className="text-xs">
                                  <strong className="text-[#b78929]">
                                    {formatPaise(
                                      mode === "hourly"
                                        ? duration?.pricePaise || 0
                                        : r.basePricePaise,
                                      { currency },
                                    )}
                                  </strong>{" "}
                                  <span className="text-slate-500 font-medium">
                                    {mode === "hourly"
                                      ? `/ ${duration?.hours}h (from)`
                                      : "/ night (from)"}
                                  </span>
                                </p>
                              );
                            })}
                            {!rate && (
                              <span className="text-xs text-amber-600 font-medium block">
                                No active rate
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-1 text-center mt-2.5 pt-2 border-t border-slate-100 text-[10px]">
                            <div>
                              <span className="font-bold text-[#061224] text-xs block">
                                {room.inventory}
                              </span>
                              <span className="text-slate-400 font-medium">
                                Configured rooms
                              </span>
                            </div>
                            <div>
                              <span className="font-bold text-[#061224] text-xs block">
                                {room.maxAdults}
                              </span>
                              <span className="text-slate-400 font-medium">
                                Max guests
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
                      <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] text-slate-600">
                        {selectedAmenities.length === 0 ? <span>No amenities configured</span> : selectedAmenities.slice(0, 3).map(amenity =>
                          <span key={amenity.id} className="rounded-md bg-slate-50 px-2 py-1">{amenity.label}</span>)}
                        {selectedAmenities.length > 3 && <span className="py-1">+{selectedAmenities.length - 3} more</span>}
                      </div>
                      <button type="button" aria-label={`Amenities for ${room.name}`} onClick={event => { event.stopPropagation(); openEditor(room.id, "amenities"); }}
                        className="shrink-0 text-xs font-semibold text-[#061224] underline">Amenities</button>
                    </div>
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditor(room.id, "details");
                        }}
                        className="flex-1 rounded-xl bg-[#061224] py-2 text-center text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all flex items-center justify-center gap-1.5"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit room
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditor(room.id, "inventory");
                        }}
                        className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-semibold text-[#061224] hover:bg-slate-50 transition-all"
                      >
                        Availability
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditor(room.id, "rates");
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                      >
                        Manage prices
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteRoom(room.id, room.name);
                        }}
                        disabled={deletingId === room.id}
                        aria-label={`Archive ${room.name}`}
                        title="Archive room type"
                        className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                      >
                        {deletingId === room.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {selected && (
        <Drawer
          open={editorOpen}
          onClose={closeEditor}
          title={`Edit ${selected.room.name}`}
          description="Room details, availability and guest prices"
          badge={<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selected.room.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{selected.room.status === "active" ? "Live" : "Paused"}</span>}
        >
          <RoomEditor
            key={`${selected.room.id}-${editorTab}`}
            propertyId={propertyId}
            timezone={property?.timezone ?? "Asia/Kolkata"}
            room={selected.room}
            initialTab={editorTab}
            media={data?.media ?? []}
            policies={data?.policies ?? []}
            rates={(data?.ratePlans ?? []).filter(
              (rate) => rate.roomTypeId === selected.room.id,
            )}
            amenityOptions={amenityOptions}
            rooms={data?.roomTypes ?? []}
            onBusy={setEditorBusy}
            onDirty={setEditorDirty}
            onRoomUpdated={(room) => listing.updateRoomType(room.id, room)}
            onRateAdded={listing.addRatePlan}
            onRateUpdated={(rate) => listing.updateRatePlan(rate.id, rate)}
          />
        </Drawer>
      )}

      <Drawer
        open={createOpen}
        onClose={() => {
          if (
            window.confirm(
              "Close this room setup? Unsaved details will be discarded.",
            )
          )
            setCreateOpen(false);
        }}
        title="Add room type"
        description="Create a new room without leaving this page."
      >
        <NewRoomEditor propertyId={propertyId} onCreated={onRoomCreated} />
      </Drawer>

      <Drawer
        open={photoEditor}
        onClose={() => {
          if (!photoBusy) setPhotoEditor(false);
        }}
        title="Room photos"
        description="Upload photos and assign them to room types."
      >
        {data && propertyId && (
          <PhotosEditor
            propertyId={propertyId}
            listing={data}
            mutations={listing}
            onSaved={listing.reload}
            onBusyChange={setPhotoBusy}
          />
        )}
      </Drawer>
      {/* Sync footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs font-medium text-slate-500">
        <button
          type="button"
          onClick={() => listing.reload()}
          className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-slate-400 ${backgroundRefreshing ? "animate-spin" : ""}`}
          />
          <span>Refresh</span>
        </button>

        <div className="flex items-center gap-1.5 text-slate-600">
          {property?.approvalStatus === "approved" ? (
            <>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>
                Approved listing. Guest availability depends on active rates and
                remaining capacity.
              </span>
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
