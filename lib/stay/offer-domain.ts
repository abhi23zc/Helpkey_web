import type { StayRequest } from "./contracts";

export type OfferItem = {
  requestId: string;
  quoteVersion: number;
  amountPaise: number;
  scope: string;
  conditions: string;
  expiresAt: string;
};
export type ExtrasOffer = {
  id: string;
  version: number;
  requestIds: string[];
  items: OfferItem[];
  selectedRequestIds: string[];
  status: "draft" | "offered" | "accepted" | "paid" | "declined" | "withdrawn";
  expiresAt: string;
};

/** Build an immutable published snapshot only after every batch member is reviewed. */
export function publishOffer(
  id: string,
  version: number,
  requestIds: string[],
  requests: StayRequest[],
  now = Date.now(),
): ExtrasOffer {
  if (!requestIds.length || new Set(requestIds).size !== requestIds.length)
    throw new Error("Choose a non-empty group of unique requests.");
  const items: OfferItem[] = [];
  for (const requestId of requestIds) {
    const r = requests.find(r => r.id === requestId);
    if (!r) throw new Error("A request is no longer available.");
    if (["declined", "cancelled"].includes(r.status)) continue;
    if (r.settlement === "included" && r.totalPaise === 0) continue;
    const q = r.quote;
    if (!q || q.status !== "offered" || (!Number.isFinite(Date.parse(q.expiresAt)) || Date.parse(q.expiresAt) <= now))
      throw new Error("Review every request before sending the offer.");
    if (!Number.isSafeInteger(q.amountPaise) || q.amountPaise <= 0)
      throw new Error("Approve free items separately.");
    items.push({ requestId, quoteVersion: q.version, amountPaise: q.amountPaise,
      scope: q.scope, conditions: q.conditions, expiresAt: q.expiresAt });
  }
  if (!items.length) throw new Error("No paid items require an offer.");
  return { id, version, requestIds: [...requestIds], items,
    selectedRequestIds: [], status: "offered",
    expiresAt: new Date(Math.min(...items.map(i => Date.parse(i.expiresAt)))).toISOString() };
}

/** Never accept prices supplied by a client; total the published allocations. */
export function acceptOffer(offer: ExtrasOffer, version: number, selected: string[], now = Date.now()) {
  if (offer.status !== "offered" || offer.version !== version || (!Number.isFinite(Date.parse(offer.expiresAt)) || Date.parse(offer.expiresAt) <= now))
    throw new Error("This offer changed or expired. Review the latest offer.");
  const ids = new Set(selected);
  if (ids.size !== selected.length || selected.some(id => !offer.items.some(i => i.requestId === id)))
    throw new Error("Choose valid offer items.");
  const allocations = offer.items.filter(i => ids.has(i.requestId));
  const amountPaise = allocations.reduce((sum, i) => sum + i.amountPaise, 0);
  if (!Number.isSafeInteger(amountPaise)) throw new Error("Invalid offer total.");
  return { offer: { ...offer, selectedRequestIds: [...selected],
    status: allocations.length ? "accepted" as const : "declined" as const },
    allocations, amountPaise,
    declinedRequestIds: offer.items.filter(i => !ids.has(i.requestId)).map(i => i.requestId) };
}
