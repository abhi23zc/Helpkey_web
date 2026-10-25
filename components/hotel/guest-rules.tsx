import { memo } from "react";
import type { GuestPolicies } from "@/lib/partner/guest-policies";
import {
  Check,
  ShieldCheck,
  Users,
  Ban,
  UserCheck,
  Dog,
} from "lucide-react";

export const GuestRules = memo(function GuestRules({ property }: { property: GuestPolicies }) {
  const getRuleIcon = (rule: string) => {
    if (rule.includes("Children")) return Users;
    if (rule.includes("Pets")) return Dog;
    if (rule.includes("Smoking"))
      return rule.includes("not allowed") ? Ban : Check;
    if (rule.includes("ID")) return ShieldCheck;
    if (rule.includes("age")) return UserCheck;
    return Check;
  };

  const rules = [
    typeof property.childrenPolicy?.allowed === "boolean"
      ? property.childrenPolicy.allowed
        ? "Children welcome"
        : "Children and infants are not allowed"
      : null,
    typeof property.petPolicy?.allowed === "boolean"
      ? property.petPolicy.allowed
        ? "Pets welcome"
        : "Pets are not allowed"
      : null,
    typeof property.smokingPolicy?.allowed === "boolean"
      ? property.smokingPolicy.allowed
        ? "Smoking allowed"
        : "Smoking is not allowed"
      : null,
    typeof property.identityRequirements?.governmentIdRequired === "boolean"
      ? property.identityRequirements.governmentIdRequired
        ? "Present government ID at check-in"
        : "Government ID is not required by the property"
      : null,
    property.minimumCheckInAge
      ? `Minimum check-in age: ${property.minimumCheckInAge}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {rules.length > 0 && (
        <div className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2 border-y border-slate-200/80 py-4">
          {rules.map((rule) => {
            const Icon = getRuleIcon(rule);
            const isNegative = rule.includes("not allowed");
            return (
              <div key={rule} className="flex items-start gap-3">
                <Icon
                  className={`h-4 w-4 shrink-0 mt-0.5 stroke-[2] ${
                    isNegative ? "text-amber-700" : "text-[var(--hk-navy)]"
                  }`}
                />
                <p className="text-xs sm:text-sm font-medium text-slate-700 leading-snug">
                  {rule}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {property.additionalHouseRules && (
        <div className="pt-1">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--hk-navy)] mb-1.5">
            Additional House Rules
          </p>
          <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-slate-600">
            {property.additionalHouseRules}
          </p>
        </div>
      )}

      {!rules.length && !property.additionalHouseRules && (
        <p className="text-sm text-[var(--hk-muted)]">
          Guest policies have not been provided. Contact the property for
          details.
        </p>
      )}
    </div>
  );
});
