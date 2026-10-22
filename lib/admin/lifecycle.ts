export function lifecycleActions(property: { status?: unknown; approvalStatus?: unknown }) {
  const approved = property.approvalStatus === "approved";
  if (property.status === "active" && approved) return ["pause", "archive"];
  if (property.status === "paused" && approved) return ["resume", "archive"];
  if (property.status === "archived") return ["restore"];
  if (property.status === "draft" && property.approvalStatus !== "pending") return ["archive"];
  return [];
}
