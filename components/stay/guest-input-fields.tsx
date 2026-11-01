"use client";
import { needsResponseText, resolveResponse } from "@/lib/stay/response";
import type { Offering, Selection } from "@/lib/stay/contracts";
const field =
  "mt-1 w-full min-h-11 rounded-lg border border-slate-200 bg-white p-2 text-sm";
export function GuestInputFields({
  offering: o,
  value = {},
  onChange,
  disabled,
  timezone,
}: {
  offering: Offering;
  value?: Selection["inputs"];
  onChange: (v: NonNullable<Selection["inputs"]>) => void;
  disabled: boolean;
  timezone: string;
}) {
  const patch = (v: Partial<NonNullable<Selection["inputs"]>>) =>
    onChange({ ...value, ...v });
  return (
    <fieldset disabled={disabled} className="space-y-3 text-xs text-slate-600">
      {(o.formType === "scheduled" || o.timeRequired) && (
        <label className="block">
          When needed · hotel time ({timezone}) *
          <input
            type="datetime-local"
            aria-label={`${o.name} service time`}
            className={field}
            value={
              value.serviceAt ? localHotelTime(value.serviceAt, timezone) : ""
            }
            onChange={(e) =>
              patch({
                serviceAt: e.target.value
                  ? hotelTimeIso(e.target.value, timezone)
                  : undefined,
              })
            }
          />
        </label>
      )}
      {(o.formType === "scheduled" ||
        o.pricingUnit === "person" ||
        o.peopleRequired) && (
        <label className="block">
          People{" "}
          {o.peopleRequired
            ? "*"
            : "(optional; defaults to all booked adults and children)"}
          <input
            type="number"
            min={1}
            max={22}
            className={field}
            value={value.people ?? ""}
            onChange={(e) =>
              patch({
                people: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
          <span>Adults and children only. Infants are not charged.</span>
        </label>
      )}
      {o.pricingUnit === "hour" && (
        <label className="block">
          Service hours (optional; defaults to the remaining booked stay
          duration)
          <input
            type="number"
            min={1}
            max={744}
            value={value.hours ?? ""}
            onChange={(e) =>
              patch({
                hours: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className={field}
          />
          <span>Whole hours within your stay.</span>
        </label>
      )}
      {(o.choiceGroups ?? []).map((g) => (
        <label className="block" key={g.id}>
          {g.name} {g.required ? "*" : "(optional)"}
          <select
            className={field}
            value={value.choices?.[g.id] ?? ""}
            onChange={(e) =>
              patch({ choices: { ...value.choices, [g.id]: e.target.value } })
            }
          >
            <option value="">Choose {g.name.toLowerCase()}</option>
            {g.options.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      ))}
      {(o.noteLabel || resolveResponse(o).responseType === "text" || o.formType === "custom") && (
        <label className="block">
          {o.noteLabel || "Request details"}{" "}
          {needsResponseText(o) ? "*" : "(optional)"}
          <textarea
            maxLength={500}
            aria-required={!!needsResponseText(o)}
            value={value.note ?? ""}
            onChange={(e) => patch({ note: e.target.value })}
            className={field}
          />
        </label>
      )}
    </fieldset>
  );
}
export function localHotelTime(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function hotelTimeIso(local: string, timezone: string) {
  const guess = Date.parse(`${local}:00Z`);
  // Resolve IANA zone offset, including non-hour offsets. Server validates stay bounds.
  let instant = guess;
  for (let i = 0; i < 3; i++) {
    const rendered = Date.parse(
      `${localHotelTime(new Date(instant).toISOString(), timezone)}:00Z`,
    );
    instant += guess - rendered;
  }
  return new Date(instant).toISOString();
}
