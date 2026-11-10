"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type ReactNode } from "react";
import { Camera, ImagePlus, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import {
  formTypeLabels,
  pricingUnits,
  type OfferingInput,
} from "@/lib/stay/contracts";
import { CategoryIcon } from "./category-icon";
import { resolveResponse } from "@/lib/stay/response";
import { pricingUnitLabel } from "@/lib/stay/pricing";
import { searchTemplates, type OfferingTemplate } from "@/lib/stay/templates";
const field =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm";
export function TemplateLibrary({
  choose,
  scratch,
}: {
  choose: (t: OfferingTemplate) => void;
  scratch: () => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <div className="space-y-4 rounded-2xl bg-slate-50/80 p-5 border border-slate-200/80">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Start with a template</h3>
          <p className="text-xs text-slate-500">
            Pick a popular hotel extra to get started quickly, or design your own from scratch.
          </p>
        </div>
        <button
          type="button"
          onClick={scratch}
          className="self-start sm:self-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
        >
          Create from scratch
        </button>
      </div>
      <input
        aria-label="Search offering templates"
        placeholder="Search templates (e.g. cake, charger, pillow, bathrobes)…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#061224] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
      />
      <div className="grid max-h-80 gap-2.5 overflow-y-auto sm:grid-cols-2 pr-1">
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
}) {
  const quantityLimit = useRef(value.maxQuantity);
  const imageInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
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
    <>
      <div className="sm:col-span-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          Guest Response Format
        </label>
        <select
          aria-label="How should guests respond?"
          className={field}
          value={value.formType === "package" ? "package" : resolveResponse(value).responseType}
          onChange={(e) => {
            const selected = e.target.value;
            if (selected === "package") {
              patch({
                formType: "package",
                pricingUnit: "package",
                responseConfig: { responseType: "single", quantityEnabled: false },
                variants: value.variants.length > 0
                  ? value.variants.map((v) => ({ ...v, inclusions: v.inclusions ?? "" }))
                  : [
                      { id: crypto.randomUUID(), name: "Standard Package", inclusions: "" },
                    ],
              });
              return;
            }
            const responseType = selected as NonNullable<
              OfferingInput["responseConfig"]
            >["responseType"];
            const quantityEnabled = resolveResponse(value).quantityEnabled;
            patch({
              ...(["single", "multiple"].includes(responseType) &&
              !value.variants.length
                ? { variants: [{ id: crypto.randomUUID(), name: "" }] }
                : {}),
              formType: value.formType === "package" ? "simple" : value.formType,
              pricingUnit: value.pricingUnit === "package" ? "item" : value.pricingUnit,
              responseConfig: { responseType, quantityEnabled },
              maxQuantity: quantityEnabled
                ? value.maxQuantity
                : responseType === "multiple"
                  ? Math.max(1, value.variants.length)
                  : 1,
            });
          }}
        >
          <option value="yes_no">Simple Request (Yes / No)</option>
          <option value="single">Single Choice (e.g. Flavor, Scent, Size)</option>
          <option value="multiple">Multiple Choices (Select several)</option>
          <option value="package">Curated Package (With Inclusions)</option>
          <option value="text">Written Note / Special Instruction</option>
        </select>
      </div>

      <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-1.5">
        <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 accent-[#061224]"
            checked={resolveResponse(value).quantityEnabled}
            onChange={(e) => {
              const response = resolveResponse(value);
              if (!e.target.checked) quantityLimit.current = value.maxQuantity;
              patch({
                responseConfig: { ...response, quantityEnabled: e.target.checked },
                maxQuantity: e.target.checked
                  ? Math.max(quantityLimit.current, 1)
                  : response.responseType === "multiple"
                    ? Math.max(1, value.variants.length)
                    : 1,
              });
            }}
          />
          <span>Allow guests to choose quantities (e.g. 1, 2, 3...)</span>
        </label>
        <p className="text-[11px] leading-relaxed text-slate-500">
          {resolveResponse(value).responseType === "single"
            ? "Guests choose one option, such as Rose, Vanilla or Lavender."
            : resolveResponse(value).responseType === "multiple"
              ? "Guests can select several options or skip this offering."
              : resolveResponse(value).responseType === "text"
                ? "Guests write their response only if they request this offering."
                : "Guests can request this offering or leave it unselected."}{" "}
          {resolveResponse(value).quantityEnabled
            ? "The quantity limit is shared across all options."
            : "No quantity is asked."}
        </p>
      </div>

      {value.formType === "custom" ? (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3 sm:col-span-2 border border-amber-200">
          Price after hotel review. The guest must accept the hotel’s quote before paying.
        </p>
      ) : (
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Pricing Type
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
      )}

      {paid && value.formType !== "custom" && (
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Pricing Unit
          </label>
          <select
            aria-label="Pricing unit"
            className={field}
            value={value.pricingUnit ?? "item"}
            onChange={(e) =>
              patch({
                pricingUnit: e.target.value as OfferingInput["pricingUnit"],
              })
            }
          >
            {pricingUnits.map((u) => (
              <option key={u} value={u}>
                {pricingUnitLabel(u)}
              </option>
            ))}
          </select>
        </div>
      )}

      {paid && value.formType !== "custom" && (
        <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
          {
            (
              {
                item: "Price × selected quantity, once per stay.",
                stay: "Price × selected quantity, once per stay.",
                package: "Package price × selected quantity, once per stay.",
                night:
                  "Price × selected quantity × booked nights. Available for overnight stays only.",
                person:
                  "Price × selected quantity × participating adults and children. Infants are excluded.",
                hour: "Price × selected quantity × whole service hours within the booked stay; partial hours round up.",
              } as const
            )[value.pricingUnit ?? "item"]
          }{" "}
          All charges included.
        </p>
      )}

      {children}

      <details className="sm:col-span-2 rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-700">
          ▸ Additional service options (Schedules & Packages)
        </summary>
        <p className="my-2 text-xs text-slate-500">
          Keep packages, service scheduling or requests that need a hotel quote. Guest response and quantities are configured above.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Service Behavior
            </label>
            <select
              aria-label="Service form"
              className={field}
              value={["scheduled", "package", "custom"].includes(value.formType ?? "") ? value.formType : "standard"}
              onChange={e => {
                const selected = e.target.value;
                if (selected === "package") {
                  patch({
                    formType: "package",
                    pricingUnit: "package",
                    responseConfig: { responseType: "single", quantityEnabled: false },
                    variants: value.variants.length > 0
                      ? value.variants.map((v) => ({ ...v, inclusions: v.inclusions ?? "" }))
                      : [
                          { id: crypto.randomUUID(), name: "Standard Package", inclusions: "" },
                        ],
                  });
                  return;
                }
                const response = resolveResponse(value);
                const standard = response.responseType === "single" ? "choice" : response.responseType === "multiple" ? "variants" : response.responseType === "text" ? "text" : response.quantityEnabled ? "quantity" : "simple";
                const formType = selected === "standard" ? standard : selected as OfferingInput["formType"];
                patch({
                  formType,
                  pricingUnit: value.pricingUnit === "package" ? "item" : value.pricingUnit,
                  responseConfig: resolveResponse(value),
                  ...(formType === "custom" ? { confirmation: "approval" } : {}),
                });
              }}
            >
              <option value="standard">Standard request</option>
              <option value="scheduled">Scheduled service (date and time)</option>
              <option value="package">Package (with inclusions)</option>
              <option value="custom">Hotel quote required</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 accent-[#061224]"
              checked={!!value.timeRequired || value.formType === "scheduled"}
              disabled={value.formType === "scheduled"}
              onChange={e => patch({ timeRequired: e.target.checked })}
            />
            <span>Ask for a service date and time</span>
          </label>
        </div>
      </details>

      {(value.formType === "scheduled" || value.pricingUnit === "person") && (
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer sm:col-span-2">
          <input
            type="checkbox"
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 accent-[#061224]"
            checked={value.peopleRequired ?? false}
            onChange={(e) => patch({ peopleRequired: e.target.checked })}
          />
          <span>Number of people required</span>
        </label>
      )}

      {value.formType === "scheduled" && (
        <p className="text-xs text-slate-500 sm:col-span-2">
          Guests must choose a service time within their booked stay.
        </p>
      )}

      <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2.5">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Guest Special Note / Instructions Field
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
          <span>{resolveResponse(value).responseType === "text" ? "Guest response is mandatory when requested" : "Require guest to fill this note"}</span>
        </label>
      </div>
      {(["single", "multiple"].includes(resolveResponse(value).responseType) || !!value.choiceGroups?.length) && (
        <div className="space-y-3 sm:col-span-2">
          <p className="text-sm font-semibold">Additional choices</p>
          <p className="text-xs text-slate-500">
            Optional follow-up questions, such as flavour or design. These do not change the price.
          </p>
          {(value.choiceGroups ?? []).map((g, i) => (
            <div
              className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2"
              key={g.id}
            >
              <label className="text-xs">
                Choice name
                <input
                  className={field}
                  value={g.name}
                  onChange={(e) =>
                    patch({
                      choiceGroups: value.choiceGroups!.map((x, j) =>
                        i === j ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label className="text-xs">
                Options (comma separated)
                <input
                  className={field}
                  value={g.options.join(", ")}
                  onChange={(e) =>
                    patch({
                      choiceGroups: value.choiceGroups!.map((x, j) =>
                        i === j
                          ? {
                              ...x,
                              options: e.target.value
                                .split(",")
                                .map((v) => v.trimStart()),
                            }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={g.required}
                  onChange={(e) =>
                    patch({
                      choiceGroups: value.choiceGroups!.map((x, j) =>
                        i === j ? { ...x, required: e.target.checked } : x,
                      ),
                    })
                  }
                />
                Required
              </label>
              <button
                type="button"
                className="text-left text-xs underline"
                onClick={() =>
                  patch({
                    choiceGroups: value.choiceGroups!.filter(
                      (x) => x.id !== g.id,
                    ),
                  })
                }
              >
                Remove choice group
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={(value.choiceGroups?.length ?? 0) >= 5}
            onClick={() =>
              patch({
                choiceGroups: [
                  ...(value.choiceGroups ?? []),
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    required: true,
                    options: [""],
                  },
                ],
              })
            }
            className="min-h-11 text-sm underline"
          >
            Add flavour, design or other choice
          </button>
        </div>
      )}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:col-span-2">
        <p className="text-sm font-semibold">Illustrative image (optional)</p>
        <p className="text-xs text-slate-500">
          Add one photo. Upload from your device or use your camera.
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
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#061224] px-3 text-sm font-medium text-white disabled:opacity-50"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {uploading ? "Uploading image…" : value.imageId ? "Replace image" : "Upload image"}
              </button>
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => cameraInput.current?.click()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium disabled:opacity-50"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                Take photo
              </button>
            </div>
            {value.imageId && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => patch({ imageId: null })}
                className="min-h-11 text-sm text-red-700 underline disabled:opacity-50"
              >
                Remove image
              </button>
            )}
          </div>
        </div>
          <input
            ref={imageInput}
            aria-label={value.imageId ? "Replace image" : "Upload image"}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled || uploading}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="hidden"
          />
          <input
            ref={cameraInput}
            aria-label="Take a photo"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled || uploading}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="hidden"
          />
        <p role="status" className="sr-only">{uploading ? "Uploading image. Please wait." : ""}</p>
        <p className="text-xs text-slate-500">
          JPEG, PNG or WebP, up to 4 MB. Customer cards label photos as
          illustrative.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
