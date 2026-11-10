"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Camera,
  Check,
  Gift,
  ImagePlus,
  Package,
  Plus,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import {
  formTypeLabels,
  type OfferingInput,
} from "@/lib/stay/contracts";
import { CategoryIcon } from "./category-icon";
import { resolveResponse } from "@/lib/stay/response";
import { searchTemplates, type OfferingTemplate } from "@/lib/stay/templates";
import { formatMoney } from "@/lib/customer/offer";

const field =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-[#061224] placeholder-slate-400 focus:border-[#c89b3c] focus:outline-hidden focus:ring-2 focus:ring-[#c89b3c]/20 transition-all";

type ExtraType = "item" | "choice" | "package" | "scheduled";

function detectExtraType(value: OfferingInput): ExtraType {
  if (value.formType === "package") return "package";
  if (value.formType === "scheduled" || value.timeRequired) return "scheduled";
  if (
    value.formType === "choice" ||
    value.formType === "variants" ||
    ["single", "multiple"].includes(resolveResponse(value).responseType) ||
    value.variants.length > 0
  ) {
    return "choice";
  }
  return "item";
}

const EXTRA_TYPES = [
  {
    id: "item" as const,
    title: "Standard Item",
    desc: "Single item or amenity (e.g. Bathrobes, Extra Pillow, Hair Dryer)",
    icon: Package,
  },
  {
    id: "choice" as const,
    title: "Choice / Variations",
    desc: "Guests pick from options (e.g. Cake Flavors, Scents, Sizes)",
    icon: SlidersHorizontal,
  },
  {
    id: "package" as const,
    title: "Curated Package",
    desc: "Bundled deal with items included (e.g. Romance Setup, Birthday Bundle)",
    icon: Gift,
  },
  {
    id: "scheduled" as const,
    title: "Scheduled Service",
    desc: "Activity or service with a date & time slot (e.g. Airport Cab, Spa)",
    icon: CalendarClock,
  },
] as const;

export function TemplateLibrary({
  choose,
  scratch,
}: {
  choose: (t: OfferingTemplate) => void;
  scratch: () => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <div className="flex flex-1 flex-col rounded-2xl bg-slate-50/80 p-5 border border-slate-200/80 min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        <div>
          <h3 className="text-base font-bold text-slate-900">Start with a template</h3>
          <p className="text-xs text-slate-500">
            Pick a popular hotel extra to get started quickly, or design your own from scratch.
          </p>
        </div>
        <button
          type="button"
          onClick={scratch}
          className="self-start sm:self-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors shrink-0"
        >
          Create from scratch
        </button>
      </div>
      <div className="shrink-0 mt-3 mb-3">
        <input
          aria-label="Search offering templates"
          placeholder="Search templates (e.g. cake, charger, pillow, bathrobes)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#061224] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        />
      </div>
      <div className="grid flex-1 min-h-[340px] gap-2.5 overflow-y-auto sm:grid-cols-2 pr-1 content-start auto-rows-max">
        {searchTemplates(search).map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => choose(t)}
            className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-amber-500/60 hover:shadow-xs"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200/50">
              <CategoryIcon category={t.draft.category || "other"} className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900 group-hover:text-amber-700">
                {t.draft.name}
              </span>
              <span className="mt-0.5 inline-block text-[11px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {formTypeLabels[t.draft.formType!]}
              </span>
              {t.draft.description && (
                <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                  {t.draft.description}
                </p>
              )}
            </div>
          </button>
        ))}
        {!searchTemplates(search).length && (
          <div className="col-span-2 rounded-xl bg-white p-6 text-center border border-slate-200">
            <p className="text-sm text-slate-600">No template found matching &quot;{search}&quot;</p>
            <button
              type="button"
              onClick={scratch}
              className="mt-2 text-xs font-semibold text-amber-700 underline"
            >
              Start from scratch instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function OfferingFields({
  value,
  patch,
  propertyId,
  disabled,
  onUploading,
  paid,
  onPaidChange,
  issueFor = () => undefined,
  currency = "INR",
  children,
}: {
  children?: ReactNode;
  paid: boolean;
  onPaidChange: (paid: boolean) => void;
  value: OfferingInput;
  patch: (v: Partial<OfferingInput>) => void;
  propertyId: string;
  disabled: boolean;
  onUploading: (value: boolean) => void;
  issueFor?: (field: string) => string | undefined;
  currency?: string;
}) {
  const quantityLimit = useRef(value.maxQuantity);
  const imageInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const activeType = detectExtraType(value);

  function handleTypeChange(nextType: ExtraType) {
    if (nextType === activeType) return;
    if (nextType === "item") {
      patch({
        formType: value.maxQuantity > 1 ? "quantity" : "simple",
        pricingUnit: value.pricingUnit === "package" ? "item" : (value.pricingUnit || "item"),
        responseConfig: { responseType: "yes_no", quantityEnabled: value.maxQuantity > 1 },
        timeRequired: false,
        variants: [],
      });
    } else if (nextType === "choice") {
      const resp = resolveResponse(value);
      const isMulti = resp.responseType === "multiple";
      patch({
        formType: isMulti ? "variants" : "choice",
        pricingUnit: value.pricingUnit === "package" ? "item" : (value.pricingUnit || "item"),
        responseConfig: { responseType: isMulti ? "multiple" : "single", quantityEnabled: resp.quantityEnabled },
        timeRequired: false,
        variants: value.variants.length > 0 ? value.variants : [{ id: crypto.randomUUID(), name: "" }],
      });
    } else if (nextType === "package") {
      patch({
        formType: "package",
        pricingUnit: "package",
        responseConfig: { responseType: "single", quantityEnabled: false },
        timeRequired: false,
        variants: value.variants.length > 0
          ? value.variants.map((v) => ({ ...v, inclusions: v.inclusions ?? "" }))
          : [{ id: crypto.randomUUID(), name: "Standard Package", inclusions: "" }],
      });
    } else if (nextType === "scheduled") {
      patch({
        formType: "scheduled",
        timeRequired: true,
        pricingUnit: ["hour", "person", "stay", "item"].includes(value.pricingUnit ?? "") ? value.pricingUnit : "stay",
        responseConfig: { responseType: "yes_no", quantityEnabled: false },
        variants: [],
      });
    }
  }

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    onUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("image", file);
      const result = await apiFetch<{ imageId: string }>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/stay-image`,
        { method: "POST", body },
      );
      patch({ imageId: result.imageId });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Image upload failed. Try again.",
      );
    } finally {
      setUploading(false);
      onUploading(false);
    }
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {/* 1. Visual Extra Type Selector */}
      <div className="sm:col-span-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          What type of extra is this?
        </label>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {EXTRA_TYPES.map(({ id, title, desc, icon: Icon }) => {
            const isSelected = activeType === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleTypeChange(id)}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                  isSelected
                    ? "border-[#061224] bg-[#061224] text-white shadow-sm ring-2 ring-[#061224]/10"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    isSelected ? "bg-white/10 text-amber-400" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-900"}`}>
                      {title}
                    </span>
                    {isSelected && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[#061224]">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className={`mt-0.5 text-[11px] leading-tight ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                    {desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Type-Specific Configuration */}
      {/* ── TYPE 1: STANDARD ITEM ── */}
      {activeType === "item" && (
        <>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Pricing
            </label>
            <select
              aria-label="Price"
              className={field}
              value={paid ? "paid" : "free"}
              onChange={(e) => onPaidChange(e.target.value === "paid")}
            >
              <option value="free">Free (Complimentary Amenity)</option>
              <option value="paid">Paid (Bookable Add-on)</option>
            </select>
          </div>

          {paid && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Price (₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                aria-invalid={Boolean(issueFor("unitPricePaise"))}
                value={value.unitPricePaise / 100}
                onChange={(e) =>
                  patch({ unitPricePaise: Math.round(Number(e.target.value) * 100) })
                }
                className={field}
              />
              {issueFor("unitPricePaise") && (
                <span className="mt-1 block text-xs text-red-700">{issueFor("unitPricePaise")}</span>
              )}
            </div>
          )}

          {paid && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Pricing Multiplier
              </label>
              <select
                aria-label="Pricing unit"
                className={field}
                value={value.pricingUnit ?? "item"}
                onChange={(e) => patch({ pricingUnit: e.target.value as OfferingInput["pricingUnit"] })}
              >
                <option value="item">Price × selected quantity (Once per stay)</option>
                <option value="night">Price × quantity × booked nights (Overnight stays)</option>
                <option value="stay">Flat fee for the entire stay</option>
              </select>
            </div>
          )}

          <div className="sm:col-span-2 rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-3">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 accent-[#061224]"
                checked={resolveResponse(value).quantityEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  if (!checked) quantityLimit.current = value.maxQuantity;
                  patch({
                    formType: checked ? "quantity" : "simple",
                    responseConfig: { responseType: "yes_no", quantityEnabled: checked },
                    maxQuantity: checked ? Math.max(quantityLimit.current, 1) : 1,
                  });
                }}
              />
              <span>Allow guests to choose quantities (e.g. 1, 2, 3...)</span>
            </label>
            {resolveResponse(value).quantityEnabled && (
              <div className="pt-2 border-t border-slate-200/60">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Maximum Quantity per Booking
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={value.maxQuantity}
                  onChange={(e) => patch({ maxQuantity: Number(e.target.value) })}
                  className={field}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Guests can order up to this quantity per room/stay.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TYPE 2: CHOICE / VARIATIONS ── */}
      {activeType === "choice" && (
        <>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Pricing
            </label>
            <select
              aria-label="Price"
              className={field}
              value={paid ? "paid" : "free"}
              onChange={(e) => onPaidChange(e.target.value === "paid")}
            >
              <option value="free">Free (Complimentary Choices)</option>
              <option value="paid">Paid (Bookable Choices)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Guest Selection Rule
            </label>
            <select
              className={field}
              value={resolveResponse(value).responseType}
              onChange={(e) => {
                const responseType = e.target.value as "single" | "multiple";
                patch({
                  formType: responseType === "multiple" ? "variants" : "choice",
                  responseConfig: { ...resolveResponse(value), responseType },
                });
              }}
            >
              <option value="single">Single Choice (Guest picks only 1)</option>
              <option value="multiple">Multiple Choices (Guest can pick several)</option>
            </select>
          </div>

          {paid && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Default Price (₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={value.unitPricePaise / 100}
                onChange={(e) =>
                  patch({ unitPricePaise: Math.round(Number(e.target.value) * 100) })
                }
                className={field}
              />
              <p className="mt-1 text-xs text-slate-500">
                Fallback price for any option where you don&apos;t enter a custom price below.
              </p>
            </div>
          )}

          <div className="sm:col-span-2 rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Available Options
              </h4>
              <p className="text-xs text-slate-500">
                Add the flavors, aromas, or sizes guests can pick from.
              </p>
            </div>

            {issueFor("variants") && <p role="alert" className="text-xs text-red-700">{issueFor("variants")}</p>}

            <div className="space-y-2">
              {value.variants.map((v, i) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
                >
                  <div className="flex-1 min-w-[180px]">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Option {i + 1} Name
                    </span>
                    <input
                      placeholder="e.g. Lavender, Rose, Chocolate"
                      value={v.name}
                      onChange={(e) =>
                        patch({
                          variants: value.variants.map((n) =>
                            n.id === v.id ? { ...n, name: e.target.value } : n,
                          ),
                        })
                      }
                      className={field}
                    />
                  </div>
                  {paid && (
                    <div className="w-full sm:w-44">
                      <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Custom Price (₹)
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={`Default: ${formatMoney(value.unitPricePaise, currency)}`}
                        value={v.unitPricePaise == null ? "" : v.unitPricePaise / 100}
                        onChange={(e) =>
                          patch({
                            variants: value.variants.map((n) =>
                              n.id === v.id
                                ? {
                                    ...n,
                                    unitPricePaise:
                                      e.target.value === ""
                                        ? null
                                        : Math.round(Number(e.target.value) * 100),
                                  }
                                : n,
                            ),
                          })
                        }
                        className={field}
                      />
                    </div>
                  )}
                  {value.variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => patch({ variants: value.variants.filter((n) => n.id !== v.id) })}
                      className="self-center pt-4 text-xs font-semibold text-red-600 hover:text-red-700 underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={value.variants.length >= 20}
              onClick={() =>
                patch({
                  variants: [...value.variants, { id: crypto.randomUUID(), name: "" }],
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another option
            </button>
          </div>
        </>
      )}

      {/* ── TYPE 3: CURATED PACKAGE ── */}
      {activeType === "package" && (
        <div className="sm:col-span-2 rounded-2xl bg-amber-50/40 border border-amber-200/80 p-4 space-y-4">
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Package Tiers & Inclusions
            </h4>
            <p className="text-xs text-slate-500">
              Create package tiers (e.g. Basic, Premium, Luxury) and list everything included in each.
            </p>
          </div>

          {issueFor("variants") && <p role="alert" className="text-xs text-red-700">{issueFor("variants")}</p>}

          <div className="space-y-3">
            {value.variants.map((v, i) => (
              <div
                key={v.id}
                className="rounded-xl border border-amber-200 bg-white p-4 shadow-2xs space-y-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <span className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Package Tier {i + 1} Name
                    </span>
                    <input
                      placeholder="e.g. Deluxe Celebration Package"
                      value={v.name}
                      onChange={(e) =>
                        patch({
                          variants: value.variants.map((n) =>
                            n.id === v.id ? { ...n, name: e.target.value } : n,
                          ),
                        })
                      }
                      className={field}
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <span className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Package Price (₹)
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 1500"
                      value={v.unitPricePaise == null ? "" : v.unitPricePaise / 100}
                      onChange={(e) =>
                        patch({
                          variants: value.variants.map((n) =>
                            n.id === v.id
                              ? {
                                  ...n,
                                  unitPricePaise:
                                    e.target.value === ""
                                      ? null
                                      : Math.round(Number(e.target.value) * 100),
                                }
                              : n,
                          ),
                        })
                      }
                      className={field}
                    />
                  </div>
                  {value.variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => patch({ variants: value.variants.filter((n) => n.id !== v.id) })}
                      className="self-center pt-4 text-xs font-semibold text-red-600 hover:text-red-700 underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    What is Included in this Package?
                  </span>
                  <textarea
                    rows={2}
                    required
                    maxLength={500}
                    placeholder="e.g. 1x Sparkling Wine, Bouquet of 10 red roses, Heart chocolate box, Candle decoration"
                    value={v.inclusions ?? ""}
                    onChange={(e) =>
                      patch({
                        variants: value.variants.map((n) =>
                          n.id === v.id ? { ...n, inclusions: e.target.value } : n,
                        ),
                      })
                    }
                    className={field}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={value.variants.length >= 10}
            onClick={() =>
              patch({
                variants: [
                  ...value.variants,
                  { id: crypto.randomUUID(), name: "", inclusions: "" },
                ],
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-50 shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another package tier
          </button>
        </div>
      )}

      {/* ── TYPE 4: SCHEDULED SERVICE ── */}
      {activeType === "scheduled" && (
        <>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Pricing
            </label>
            <select
              aria-label="Price"
              className={field}
              value={paid ? "paid" : "free"}
              onChange={(e) => onPaidChange(e.target.value === "paid")}
            >
              <option value="free">Free (Complimentary Service)</option>
              <option value="paid">Paid (Bookable Service)</option>
            </select>
          </div>

          {paid && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Service Price (₹)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={value.unitPricePaise / 100}
                onChange={(e) =>
                  patch({ unitPricePaise: Math.round(Number(e.target.value) * 100) })
                }
                className={field}
              />
            </div>
          )}

          {paid && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Pricing Multiplier
              </label>
              <select
                aria-label="Pricing unit"
                className={field}
                value={value.pricingUnit ?? "hour"}
                onChange={(e) => patch({ pricingUnit: e.target.value as OfferingInput["pricingUnit"] })}
              >
                <option value="hour">Price per hour</option>
                <option value="person">Price per participating person</option>
                <option value="stay">Flat service fee per stay</option>
                <option value="item">Price per service appointment</option>
              </select>
            </div>
          )}

          <div className="sm:col-span-2 rounded-2xl bg-blue-50/50 border border-blue-200/80 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
              <CalendarClock className="h-4 w-4 text-blue-600" />
              <span>Service Time Booking</span>
            </div>
            <p className="text-xs text-blue-900/80">
              Guests will be prompted to select their preferred service date and time slot within their booked stay dates.
            </p>
            <label className="flex items-center gap-2 pt-2 border-t border-blue-200/60 text-xs font-semibold text-blue-950 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-[#061224]"
                checked={value.peopleRequired ?? false}
                onChange={(e) => patch({ peopleRequired: e.target.checked })}
              />
              <span>Ask for number of participating people (e.g. for spa, tour, cab seating)</span>
            </label>
          </div>
        </>
      )}

      {/* 3. Common Bottom: Special Instructions Note */}
      <div className="sm:col-span-2 rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-2.5">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Guest Special Note / Instructions Field (Optional)
          </label>
          <input
            maxLength={100}
            value={value.noteLabel ?? ""}
            placeholder="e.g. Message on cake, Flight number, Dietary requirements"
            onChange={(e) => patch({ noteLabel: e.target.value })}
            className={field}
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 accent-[#061224]"
            checked={resolveResponse(value).responseType === "text" || (value.noteRequired ?? false)}
            disabled={resolveResponse(value).responseType === "text"}
            onChange={(e) => patch({ noteRequired: e.target.checked })}
          />
          <span>Require guest to fill this note before booking</span>
        </label>
      </div>

      {/* 4. Common Bottom: Illustrative Image */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:col-span-2">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Illustrative Photo (Optional)
        </p>
        <p className="text-xs text-slate-500">
          Add one photo to help guests visualize this offering.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {value.imageId ? (
            <img
              src={`/api/stay-images/${encodeURIComponent(propertyId)}/${value.imageId}`}
              alt="Offering preview"
              className="h-24 w-32 shrink-0 rounded-xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-24 w-32 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white text-slate-400">
              <ImagePlus className="h-6 w-6" aria-hidden="true" />
              <span className="text-xs">No photo added</span>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => imageInput.current?.click()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#061224] px-3.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-slate-800 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {uploading ? "Uploading image…" : value.imageId ? "Replace image" : "Upload image"}
              </button>
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => cameraInput.current?.click()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Take photo
              </button>
            </div>
            {value.imageId && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => patch({ imageId: null })}
                className="text-xs text-red-600 underline disabled:opacity-50 hover:text-red-700"
              >
                Remove photo
              </button>
            )}
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
            />
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}