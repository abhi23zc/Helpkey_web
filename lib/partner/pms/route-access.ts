import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { operationalAccess, propertyAccess } from "./access";
import type { Permission } from "./domain";

/** Defense in depth for every existing partner endpoint, including legacy routes. */
export async function authorizePartnerRequest(uid: string, request: Request) {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith("/api/partner/")) return;
  if (
    ["/api/partner/dashboard", "/api/partner/onboarding"].includes(path) ||
    path.startsWith("/api/partner/invitations/")
  )
    return;
  const write = !["GET", "HEAD"].includes(request.method);
  const body = write
    ? await request
        .clone()
        .json()
        .catch(() => ({}))
    : {};
  let propertyId = url.searchParams.get("propertyId") || body.propertyId;
  let permission: Permission = "listing.manage";
  let operational = false;
  const propertyMatch = path.match(/^\/api\/partner\/properties\/([^/]+)/);
  const bookingMatch = path.match(/^\/api\/partner\/bookings\/([^/]+)/);
  if (propertyMatch) propertyId = decodeURIComponent(propertyMatch[1]);
  if (bookingMatch && !["search", "export"].includes(bookingMatch[1])) {
    const b = await adminDb
      .collection("bookings")
      .doc(decodeURIComponent(bookingMatch[1]))
      .get();
    if (!b.exists) throw new ApiException("NOT_FOUND", 404);
    propertyId = b.get("propertyId");
  }
  const reviewMatch = path.match(/^\/api\/partner\/reviews\/([^/]+)\/reply$/);
  if (reviewMatch) {
    const review = await adminDb
      .collection("propertyReviews")
      .doc(decodeURIComponent(reviewMatch[1]))
      .get();
    if (!review.exists) throw new ApiException("NOT_FOUND", 404);
    propertyId = review.get("propertyId");
  }
  if (path.startsWith("/api/partner/reviews")) {
    permission = "reviews.manage";
    operational = write;
  } else if (path === "/api/partner/dashboard/overview") {
    permission = "reports.read";
    operational = true;
  } else if (path.startsWith("/api/partner/bookings")) {
    operational = true;
    permission = path.endsWith("/export") ? "guest.export" : "reservation.read";
    if (write) {
      if (path === "/api/partner/bookings") permission = "reservation.create";
      else if (path.endsWith("/status"))
        permission = ["cancelled", "no_show"].includes(body.status)
          ? "reservation.cancel"
          : "reservation.operate";
      else if (path.endsWith("/operations"))
        permission =
          (
            {
              note: "reservation.note",
              assign: "reservation.assign",
              collect: "payment.collect",
              reverse: "payment.reverse",
              refund: "payment.refund",
            } as Record<string, Permission>
          )[body.action] || "listing.manage";
      else if (path.endsWith("/amendment")) permission = "reservation.amend";
      else if (
        ["confirmed", "preparing", "ready", "fulfilled"].includes(body.status)
      )
        permission = "requests.prepare";
      else permission = "requests.manage";
    }
  } else if (path === "/api/partner/physical-units")
    permission = write ? "rooms.manage" : "rooms.read";
  else if (path.includes("/pms")) {
    permission = path.endsWith("/team") ? "team.manage" : "setup.read";
    if (path.endsWith("/department")) {
      const a = await propertyAccess(uid, propertyId);
      permission =
        a.role === "cashier"
          ? "payment.read"
          : a.role === "housekeeper"
            ? "housekeeping"
            : "maintenance";
      operational = true;
    }
  } else if (/\/room-types|\/rate-plans|\/cancellation-policies/.test(path))
    permission = path.includes("/room-types") ? "rooms.manage" : "rates.manage";
  else if (path.endsWith("/rooms-workspace")) {
    permission =
      !write || ["availability", "price-quote"].includes(body.action)
        ? "rooms.read"
        : body.action === "housekeeping"
          ? "housekeeping"
          : ["maintenance", "release"].includes(body.action)
            ? "maintenance"
            : "rates.manage";
    operational =
      write && ["housekeeping", "maintenance", "release"].includes(body.action);
  } else if (path.includes("/inventory-blocks")) {
    permission = "maintenance";
    operational = write;
  } else if (
    propertyMatch &&
    path === propertyMatch[0] &&
    !write &&
    url.searchParams.get("view") === "rooms"
  )
    permission = "rooms.read";
  if (!propertyId) {
    // Legacy property-independent listing/review endpoints remain owner-only.
    const memberships = await adminDb
      .collection("propertyMemberships")
      .where("userId", "==", uid)
      .where("status", "==", "active")
      .get();
    if (!memberships.docs.some((m) => m.get("role") === "owner"))
      throw new ApiException("FORBIDDEN", 403);
    return;
  }
  const access = operational
    ? await operationalAccess(uid, propertyId, permission)
    : await propertyAccess(uid, propertyId, permission);
  if (write && access.block && !path.includes("/pms"))
    throw new ApiException("PMS_RESTRICTED", 403, access.block);
  if (path === "/api/partner/bookings" && write) {
    if (body.paymentMethod === "paid")
      await operationalAccess(uid, propertyId, "payment.collect");
    if (body.negotiatedSubtotalPaise !== undefined)
      await operationalAccess(uid, propertyId, "rates.manage");
  }
}
