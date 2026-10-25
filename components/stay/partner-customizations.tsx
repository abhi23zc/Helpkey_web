"use client";
import { offeringPriceLabel } from "@/lib/stay/pricing";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { formatMoney } from "@/lib/customer/offer";
import {
  type Offering,
  type OfferingInput,
  offeringSchema,
  offeringCategories,
  offeringCategoryLabels,
  offeringCategory,
} from "@/lib/stay/contracts";
import { TravelerChips } from "./personalization-picker";
import { PartnerShell } from "@/components/partner/dashboard/partner-shell";
const initial: OfferingInput = {
  name: "",
  description: "",
  kind: "item",
  travelerCategories: [],
  roomTypeIds: [],
  bookingModes: ["overnight", "hourly"],
  unitPricePaise: 0,
  maxQuantity: 1,
  advanceNoticeMinutes: 0,
  confirmation: "immediate",
  variants: [],
  status: "active",
};
export function PartnerCustomizationsPage() {
  return (
    <PartnerShell>
      {({ selectedProperty, currency }) =>
        selectedProperty ? (
          <Customizations
            key={selectedProperty.id}
            propertyId={selectedProperty.id}
            propertyName={selectedProperty.name}
            currency={currency}
          />
        ) : (
          <p>Select or create a property first.</p>
        )
      }
    </PartnerShell>
  );
}
function Customizations({
  propertyId,
  propertyName,
  currency,
}: {
  propertyId: string;
  propertyName: string;
  currency: string;
}) {
  const client = useQueryClient();
  const key = ["partner", propertyId, "stay-customizations"];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiFetch<{
        offerings: Offering[];
        rooms: { id: string; name: string }[];
      }>(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/stay-customizations`,
        { signal },
      ),
  });
  const [editing, setEditing] = useState<Offering | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(offering: OfferingInput, existing?: Offering) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(
        `/api/partner/properties/${encodeURIComponent(propertyId)}/stay-customizations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existing?.id,
            version: existing?.version,
            offering,
          }),
        },
      );
      await client.invalidateQueries({ queryKey: key });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save offering.");
      await client.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stay Customizations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {propertyName} · Optional items, services and room preferences.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError("");
            setEditing("new");
          }}
          className="rounded-xl bg-[#061224] px-4 py-3 text-sm font-semibold text-white"
        >
          Create offering
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Included room features are managed under Rooms and Property Listing.
        Editing or pausing an offering does not change existing booking
        commitments.
      </p>
      {query.isPending && <p role="status">Loading offerings…</p>}
      {query.isError && (
        <p role="alert">
          Offerings could not load.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {editing && (
        <OfferingEditor
          key={editing === "new" ? "new" : `${editing.id}-${editing.version}`}
          offering={editing === "new" ? undefined : editing}
          rooms={query.data?.rooms ?? []}
          currency={currency}
          busy={busy}
          onSave={(value) =>
            void save(value, editing === "new" ? undefined : editing)
          }
          close={() => setEditing(null)}
        />
      )}
      {query.data?.offerings.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">No offerings yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Create the options your hotel can provide. Customers can always skip
            personalization.
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {query.data?.offerings.map((o) => (
          <article
            key={o.id}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex justify-between gap-3">
              <h2 className="font-bold">{o.name}</h2>
              <span className="text-xs">
                {o.status === "active" ? "Active" : "Paused"}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{o.description}</p>
            <p className="mt-3 text-sm">
              {offeringPriceLabel(o, currency)} · Maximum {o.maxQuantity}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {o.confirmation === "approval"
                ? "Hotel approval"
                : "Immediate confirmation"}{" "}
              · {o.advanceNoticeMinutes} minutes advance notice ·{" "}
              {o.roomTypeIds.length
                ? `${o.roomTypeIds.length} room types`
                : "All rooms"}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setEditing(o);
                }}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save(
                    {
                      ...offeringSchema.parse(oInput(o)),
                      status: o.status === "active" ? "paused" : "active",
                    },
                    o,
                  )
                }
                className="rounded-lg border px-3 py-2 text-sm"
              >
                {o.status === "active" ? "Pause" : "Activate"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
function oInput(o: Offering): OfferingInput {
  return offeringSchema.parse(
    Object.fromEntries(
      Object.entries(o).filter(
        ([key]) => !["id", "version", "propertyId"].includes(key),
      ),
    ),
  );
}
function OfferingEditor({
  currency,
  offering,
  rooms,
  busy,
  onSave,
  close,
}: {
  currency: string;
  offering?: Offering;
  rooms: { id: string; name: string }[];
  busy: boolean;
  onSave: (v: OfferingInput) => void;
  close: () => void;
}) {
  const [value, setValue] = useState<OfferingInput>(
    offering ? oInput(offering) : initial,
  );
  const [error, setError] = useState("");
  const field =
    "mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm";
  function patch(v: Partial<OfferingInput>) {
    setValue({ ...value, ...v });
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = offeringSchema.safeParse(value);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check your entries.");
          return;
        }
        setError("");
        onSave(parsed.data);
      }}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <h2 className="text-lg font-bold">
        {offering ? "Edit offering" : "Create offering"}
      </h2>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Name
          <input
            required
            minLength={2}
            maxLength={120}
            value={value.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={field}
          />
        </label>
        <label className="text-sm">
          Type
          <select
            value={value.kind}
            onChange={(e) =>
              patch(
                e.target.value === "preference"
                  ? {
                      kind: "preference",
                      unitPricePaise: 0,
                      variants: value.variants.map((v) => ({
                        ...v,
                        unitPricePaise: null,
                      })),
                      confirmation: "approval",
                    }
                  : { kind: e.target.value as OfferingInput["kind"] },
              )
            }
            className={field}
          >
            <option value="item">Hotel-provided item</option>
            <option value="service">Preparation service</option>
            <option value="preference">Room preference</option>
          </select>
        </label>
        <label className="text-sm">
          Guest browsing category
          <select
            aria-label="Guest browsing category"
            value={offeringCategory(value)}
            onChange={(e) =>
              patch({ category: e.target.value as OfferingInput["category"] })
            }
            className={field}
          >
            {offeringCategories.map((category) => (
              <option key={category} value={category}>
                {offeringCategoryLabels[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Description
          <textarea
            required
            minLength={3}
            maxLength={1500}
            value={value.description}
            onChange={(e) => patch({ description: e.target.value })}
            className={field}
          />
        </label>
        <label className="text-sm">
          Default price per item per stay (₹, 0 = Free)
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={value.kind === "preference"}
            value={value.unitPricePaise / 100}
            onChange={(e) =>
              patch({
                unitPricePaise: Math.round(Number(e.target.value) * 100),
              })
            }
            className={field}
          />
        </label>
        <label className="text-sm">
          Maximum quantity per booking
          <input
            required
            type="number"
            min={1}
            max={100}
            value={value.maxQuantity}
            onChange={(e) => patch({ maxQuantity: Number(e.target.value) })}
            className={field}
          />
        </label>
        <label className="text-sm">
          Required advance notice (minutes)
          <input
            required
            type="number"
            min={0}
            max={525600}
            value={value.advanceNoticeMinutes}
            onChange={(e) =>
              patch({ advanceNoticeMinutes: Number(e.target.value) })
            }
            className={field}
          />
        </label>
        <label className="text-sm">
          Confirmation
          <select
            value={value.confirmation}
            disabled={value.kind === "preference"}
            onChange={(e) =>
              patch({
                confirmation: e.target.value as OfferingInput["confirmation"],
              })
            }
            className={field}
          >
            <option value="immediate">Immediate confirmation</option>
            <option value="approval">Hotel approval</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <TravelerChips
            value={value.travelerCategories}
            onChange={(travelerCategories) => patch({ travelerCategories })}
            disabled={busy}
          />
        </div>
        <div className="text-sm">
          <p className="mb-2 font-semibold">Room types</p>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={!value.roomTypeIds.length}
              onChange={() => patch({ roomTypeIds: [] })}
            />
            All rooms
          </label>
          {rooms.map((r) => (
            <label
              key={r.id}
              className="mt-2 flex flex-wrap items-center gap-2"
            >
              <input
                type="checkbox"
                checked={value.roomTypeIds.includes(r.id)}
                onChange={(e) =>
                  patch({
                    roomTypeIds: e.target.checked
                      ? [...value.roomTypeIds, r.id]
                      : value.roomTypeIds.filter((id) => id !== r.id),
                  })
                }
              />
              {r.name}
            </label>
          ))}
        </div>
        <div className="text-sm">
          <p className="mb-2 font-semibold">Stay types</p>
          {(["overnight", "hourly"] as const).map((m) => (
            <label key={m} className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={value.bookingModes.includes(m)}
                onChange={(e) =>
                  patch({
                    bookingModes: e.target.checked
                      ? [...value.bookingModes, m]
                      : value.bookingModes.filter((v) => v !== m),
                  })
                }
              />
              {m === "overnight" ? "Overnight" : "Hourly"}
            </label>
          ))}
        </div>
        <div className="sm:col-span-2">
          <p className="text-sm font-semibold">
            Connector choices or other variants (optional)
          </p>
          {value.variants.map((v, i) => (
            <div key={v.id} className="mt-2 flex flex-wrap items-center gap-2">
              <input
                aria-label={`Variant ${i + 1}`}
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
              <label className="w-full text-sm sm:w-56">
                Custom price (₹, 0 = Free)
                <input
                  aria-label={`Variant ${i + 1} custom price`}
                  type="number"
                  min={0}
                  max={1000000}
                  step="0.01"
                  disabled={value.kind === "preference"}
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
                <span className="text-xs text-slate-500">
                  Blank uses the default price.
                </span>
              </label>
              <button
                type="button"
                onClick={() =>
                  patch({
                    variants: value.variants.filter((n) => n.id !== v.id),
                  })
                }
                className="text-sm underline"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={value.variants.length >= 20}
            onClick={() =>
              patch({
                variants: [
                  ...value.variants,
                  { id: crypto.randomUUID(), name: "" },
                ],
              })
            }
            className="mt-3 text-sm underline"
          >
            Add choice
          </button>
        </div>
        <label className="text-sm">
          Status
          <select
            value={value.status}
            onChange={(e) =>
              patch({ status: e.target.value as OfferingInput["status"] })
            }
            className={field}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </label>
      </fieldset>
      <p className="text-xs text-slate-500">
        Prices include all charges. Paid extras follow the room’s cancellation
        policy. Declined paid requests are fully refunded. The quantity limit is
        shared across variants.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          disabled={busy}
          className="rounded-xl bg-[#061224] px-4 py-3 text-sm text-white"
        >
          {busy ? "Saving…" : "Save offering"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={close}
          className="text-sm underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
