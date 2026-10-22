"use client";
import type { GuestPolicies } from "@/lib/partner/guest-policies";

export function GuestPolicyFields({ value, onChange, disabled = false }: { value: GuestPolicies; onChange: (value: GuestPolicies) => void; disabled?: boolean }) {
  const choices = [
    ["childrenPolicy", "Children welcome", "allowed"],
    ["petPolicy", "Pets welcome", "allowed"],
    ["smokingPolicy", "Smoking allowed", "allowed"],
    ["identityRequirements", "Government ID required at check-in", "governmentIdRequired"],
  ] as const;
  const control = "mt-1 block w-full rounded-lg border border-[var(--hk-border)] bg-white p-2.5 text-sm text-[var(--hk-navy)]";
  return <fieldset disabled={disabled} className="space-y-4 rounded-xl border border-[var(--hk-border)] bg-white p-4">
    <legend className="px-1 font-bold text-[var(--hk-navy)]">Guest policies</legend>
    {choices.map(([key, label, field]) => {
      const current = value[key] as Record<string, boolean | null | undefined> | undefined;
      return <label key={key} className="block text-xs font-semibold">{label}<select className={control} value={typeof current?.[field] === "boolean" ? String(current[field]) : ""} onChange={event => onChange({ ...value, [key]: { [field]: event.target.value === "" ? null : event.target.value === "true" } })}><option value="">Unspecified</option><option value="true">Yes</option><option value="false">No</option></select></label>;
    })}
    <label className="block text-xs font-semibold">Minimum check-in age (optional)<input className={control} type="number" min={18} max={100} step={1} value={value.minimumCheckInAge ?? ""} onChange={event => onChange({ ...value, minimumCheckInAge: event.target.value ? Number(event.target.value) : null })} /></label>
    <label className="block text-xs font-semibold">Additional house rules (optional)<textarea className={control} maxLength={2000} rows={4} value={value.additionalHouseRules ?? ""} onChange={event => onChange({ ...value, additionalHouseRules: event.target.value })} /></label>
  </fieldset>;
}
