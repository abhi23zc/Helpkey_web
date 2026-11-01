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
    <div className="space-y-4 rounded-xl bg-slate-50 p-4">
      <div>
        <h3 className="font-semibold">Start with a template</h3>
        <p className="mt-1 text-sm text-slate-500">
          Choose a starting point, then review and edit your draft.
        </p>
      </div>
      <input
        aria-label="Search offering templates"
        placeholder="Try cake, charger or pillow…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={field}
      />
      <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
        {searchTemplates(search).map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => choose(t)}
            className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-[#b58a32]"
          >
            <span className="text-sm font-semibold">{t.draft.name}</span>
            <span className="mt-1 block text-xs text-slate-500">
              {formTypeLabels[t.draft.formType!]}
            </span>
          </button>
        ))}
        {!searchTemplates(search).length && (
          <p className="text-sm text-slate-500">
            No template found. Create your own below.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={scratch}
        className="min-h-11 text-sm font-semibold underline"
      >
        Create from scratch
      </button>
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
      <label className="text-sm sm:col-span-2">How should guests respond?
        <select aria-label="How should guests respond?" className={field} value={resolveResponse(value).responseType} onChange={e => {
          const responseType = e.target.value as NonNullable<OfferingInput["responseConfig"]>["responseType"];
          const quantityEnabled = resolveResponse(value).quantityEnabled;
          patch({ ...(["single", "multiple"].includes(responseType) && !value.variants.length ? { variants: [{ id: crypto.randomUUID(), name: "" }] } : {}), responseConfig: { responseType, quantityEnabled }, maxQuantity: quantityEnabled ? value.maxQuantity : responseType === "multiple" ? Math.max(1, value.variants.length) : 1 });
        }}><option value="yes_no">Yes / no</option><option value="single">Choose one option</option><option value="multiple">Choose multiple options</option><option value="text">Write a response</option></select>
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={resolveResponse(value).quantityEnabled} onChange={e => {
        const response = resolveResponse(value);
        if (!e.target.checked) quantityLimit.current = value.maxQuantity;
        patch({ responseConfig: { ...response, quantityEnabled: e.target.checked }, maxQuantity: e.target.checked ? Math.max(quantityLimit.current, 1) : response.responseType === "multiple" ? Math.max(1, value.variants.length) : 1 });
      }} />Allow guests to choose quantities</label>
      <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{resolveResponse(value).responseType === "single" ? "Guests choose one option, such as Rose, Vanilla or Lavender." : resolveResponse(value).responseType === "multiple" ? "Guests can select several options or skip this offering." : resolveResponse(value).responseType === "text" ? "Guests write their response only if they request this offering." : "Guests can request this offering or leave it unselected."} {resolveResponse(value).quantityEnabled ? "The quantity limit is shared across all options." : "No quantity is asked."}</p>
      {value.formType === "custom" ? <p className="text-sm sm:col-span-2">Price after hotel review. The guest must accept the hotel’s quote before paying.</p> : <label className="text-sm sm:col-span-2">Price<select aria-label="Price" className={field} value={paid ? "paid" : "free"} onChange={e => onPaidChange(e.target.value === "paid")}><option value="free">Free</option><option value="paid">Paid</option></select></label>}

      {paid && value.formType !== "custom" && <label className="text-sm">
        Pricing unit
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
      </label>}
      {paid && value.formType !== "custom" && <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
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
      </p>}
      {children}
      <details className="sm:col-span-2 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium">Additional service settings</summary><p className="my-2 text-xs text-slate-500">Keep packages, service scheduling or requests that need a hotel quote. Guest response and quantities are configured above.</p>
      <label className="text-sm">
        Service behavior
        <select
          aria-label="Service form"
          className={field}
          value={["scheduled", "package", "custom"].includes(value.formType ?? "") ? value.formType : "standard"}
          onChange={e => {
            const response = resolveResponse(value);
            const standard = response.responseType === "single" ? "choice" : response.responseType === "multiple" ? "variants" : response.responseType === "text" ? "text" : response.quantityEnabled ? "quantity" : "simple";
            const formType = e.target.value === "standard" ? standard : e.target.value as OfferingInput["formType"];
            patch({ formType, responseConfig: resolveResponse(value), ...(formType === "custom" ? { confirmation: "approval" } : {}) });
          }}
        >
          <option value="standard">Standard request</option>
          <option value="scheduled">Scheduled service (date and time)</option>
          <option value="package">Package (with inclusions)</option>
          <option value="custom">Hotel quote required</option>
        </select>
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!value.timeRequired || value.formType === "scheduled"} disabled={value.formType === "scheduled"} onChange={e => patch({ timeRequired: e.target.checked })} />Ask for a service date and time</label>
      </details>
      {(value.formType === "scheduled" || value.pricingUnit === "person") && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.peopleRequired ?? false}
            onChange={(e) => patch({ peopleRequired: e.target.checked })}
          />
          Number of people required
        </label>
      )}
      {value.formType === "scheduled" && (
        <p className="text-sm text-slate-500">
          Guests must choose a service time within their booked stay.
        </p>
      )}
      <>
          <label className="text-sm">
            Guest note label
            <input
              maxLength={100}
              value={value.noteLabel ?? ""}
              placeholder="e.g. Message on cake"
              onChange={(e) => patch({ noteLabel: e.target.value })}
              className={field}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={resolveResponse(value).responseType === "text" || (value.noteRequired ?? false)}
              disabled={resolveResponse(value).responseType === "text"}
              onChange={(e) => patch({ noteRequired: e.target.checked })}
            />
            {resolveResponse(value).responseType === "text" ? "Response required when requested" : "Guest note required"}
          </label>
      </>
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
