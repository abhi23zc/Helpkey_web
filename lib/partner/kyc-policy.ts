export function canEditKyc(property: { status?: unknown; approvalStatus?: unknown } | undefined) {
  return property?.status === "draft" && ["not_submitted", "changes_requested", "rejected"].includes(String(property.approvalStatus));
}
export function assertCanEditKyc(property: { status?: unknown; approvalStatus?: unknown } | undefined) {
  if (!canEditKyc(property)) throw new Error("Verification documents can only be changed on a draft before submission or after changes are requested or rejected.");
}
