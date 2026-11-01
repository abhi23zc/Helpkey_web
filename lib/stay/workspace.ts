import type { Offering, StayRequest } from "./contracts";
import { offeringCategory } from "./contracts";
export const requestGroups = [
  "open",
  "approval",
  "waiting",
  "todo",
  "preparing",
  "ready",
  "completed",
  "all",
] as const;
export type RequestGroup = (typeof requestGroups)[number];
export const requestGroupLabels: Record<RequestGroup, string> = {
  open: "Open work",
  approval: "Needs approval",
  waiting: "Awaiting guest / payment",
  todo: "To prepare",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  all: "All requests",
};
export function requestGroup(r: StayRequest): RequestGroup {
  if (["fulfilled", "declined", "cancelled"].includes(r.status))
    return "completed";
  if (["awaiting_customer", "awaiting_payment"].includes(r.settlement ?? ""))
    return "waiting";
  if (r.status === "requested") return "approval";
  if (r.status === "preparing") return "preparing";
  if (r.status === "ready") return "ready";
  return "todo";
}
export const matchesRequestGroup = (r: StayRequest, group: RequestGroup) =>
  group === "all" ||
  (group === "open"
    ? requestGroup(r) !== "completed"
    : requestGroup(r) === group);
export function noticeLabel(minutes: number) {
  if (!minutes) return "No advance notice";
  if (minutes % 1440 === 0)
    return `${minutes / 1440} day${minutes === 1440 ? "" : "s"} advance notice`;
  if (minutes % 60 === 0)
    return `${minutes / 60} hour${minutes === 60 ? "" : "s"} advance notice`;
  return `${minutes} minutes advance notice`;
}
export function catalogRows(
  rows: Offering[],
  search: string,
  status: string,
  category: string,
  sort: string,
) {
  const q = search.trim().toLocaleLowerCase();
  const price = (o: Offering) =>
    o.variants.length
      ? Math.min(...o.variants.map((v) => v.unitPricePaise ?? o.unitPricePaise))
      : o.unitPricePaise;
  return rows
    .filter(
      (o) =>
        (status === "all" || o.status === status) &&
        (category === "all" || offeringCategory(o) === category) &&
        (!q || `${o.name} ${o.description}`.toLocaleLowerCase().includes(q)),
    )
    .sort((a, b) =>
      sort === "price_low"
        ? price(a) - price(b) || a.name.localeCompare(b.name)
        : sort === "price_high"
          ? price(b) - price(a) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    );
}
export type RequestQueueRow = {
  bookingId: string;
  reference: string;
  guestName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  bookingStatus: string;
  revision: number;
  enabled: boolean;
  request: StayRequest;
};
export type RequestQueuePage = {
  rows: RequestQueueRow[];
  timezone: string;
  nextCursor: string | null;
  scanned: number;
};
