import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { eligiblePricing } from "@/lib/booking/duration-pricing";
import { allocateIntervals, validDate } from "@/lib/booking/domain";
import { propertyAccess } from "./access";
import { pmsState, publicBookable, type SetupItem } from "./domain";

const collections = [
  "roomTypes",
  "ratePlans",
  "physicalUnits",
  "cancellationPolicies",
  "inventoryHolds",
  "inventoryCalendars",
  "inventoryBlocks",
  "bookings",
] as const;
export async function setupStatus(
  uid: string,
  propertyId: string,
  tx?: FirebaseFirestore.Transaction,
) {
  const access = await propertyAccess(uid, propertyId, "setup.read", tx);
  const snapshots = await Promise.all(
    collections.map((name) => {
      const q = adminDb
        .collection(name)
        .where("propertyId", "==", propertyId)
        .limit(2001);
      return tx ? tx.get(q) : q.get();
    }),
  );
  const [rooms, rates, units, policies, holds, calendars, blocks, bookings] =
    snapshots.map((s) =>
      s.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as FirebaseFirestore.DocumentData,
      ),
    );
  const p = access.property;
  const active = rooms.filter((r) => r.status === "active");
  let timezone = false;
  try {
    if (p.timezone) {
      new Intl.DateTimeFormat("en", { timeZone: p.timezone });
      timezone = true;
    }
  } catch {
    /* Invalid timezone remains incomplete. */
  }
  const register =
    active.length > 0 &&
    active.every(
      (r) =>
        units.filter((u) => u.status === "active" && u.roomTypeId === r.id)
          .length === r.totalInventory,
    ) &&
    new Set(
      units
        .filter((u) => u.status === "active")
        .map((u) => String(u.label).trim().toLowerCase()),
    ).size === units.filter((u) => u.status === "active").length &&
    units
      .filter((u) => u.status === "active")
      .every(
        (u) =>
          active.some((r) => r.id === u.roomTypeId) &&
          String(u.label || "").trim(),
      );
  const time = (v: unknown) =>
    typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const ratesReady =
    active.length > 0 &&
    active.every((r) =>
      (r.bookingModes || p.bookingModes || ["overnight"]).every(
        (mode: string) =>
          rates.some(
            (rate) =>
              rate.roomTypeId === r.id &&
              (rate.bookingMode || "overnight") === mode &&
              rate.status === "active" &&
              eligiblePricing(rate) &&
              policies.some(
                (policy) =>
                  policy.id === rate.cancellationPolicyId &&
                  policy.status === "active",
              ),
          ),
      ),
    ) &&
    time(p.checkInTime) &&
    time(p.checkOutTime) &&
    (p.cleaningBufferMinutes === undefined ||
      (Number.isInteger(p.cleaningBufferMinutes) &&
        p.cleaningBufferMinutes >= 0 &&
        p.cleaningBufferMinutes <= 1440 &&
        p.cleaningBufferMinutes % 15 === 0));
  const expected = new Map<string, number>();
  let integrity =
    p.inventoryEngine === "interval_v1" &&
    !snapshots.some((s) => s.size > 2000);
  const add = (row: FirebaseFirestore.DocumentData, field: string) => {
    if (
      !Array.isArray(row.allocations) ||
      !row.allocations.length ||
      !Number.isSafeInteger(row.quantity) ||
      row.quantity < 1
    ) {
      integrity = false;
      return;
    }
    for (const a of row.allocations) {
      if (
        !validDate(a.date) ||
        !Array.isArray(a.intervals) ||
        !a.intervals.length ||
        new Set(a.intervals).size !== a.intervals.length
      ) {
        integrity = false;
        continue;
      }
      for (const slot of a.intervals) {
        const key = `${propertyId}_${row.roomTypeId}_${a.date}/${field}/${slot}`;
        expected.set(key, (expected.get(key) || 0) + row.quantity);
      }
    }
  };
  holds
    .filter((h) => ["held", "committed"].includes(h.status))
    .forEach((h) => add(h, "reserved"));
  blocks.filter((b) => b.status === "active").forEach((b) => add(b, "blocked"));
  for (const calendar of calendars)
    for (const field of ["reserved", "blocked"])
      for (const [slot, value] of Object.entries(calendar[field] || {})) {
        const key = `${calendar.id}/${field}/${slot}`;
        if (
          !Number.isSafeInteger(value) ||
          Number(value) < 0 ||
          value !== (expected.get(key) || 0)
        )
          integrity = false;
        expected.delete(key);
      }
  if ([...expected.values()].some((n) => n !== 0)) integrity = false;
  for (const calendar of calendars) {
    const room = rooms.find((r) => r.id === calendar.roomTypeId);
    const keys = new Set([
      ...Object.keys(calendar.reserved || {}),
      ...Object.keys(calendar.blocked || {}),
    ]);
    if (keys.size && !room) integrity = false;
    for (const key of keys)
      if (
        (calendar.reserved?.[key] || 0) + (calendar.blocked?.[key] || 0) >
        (room?.totalInventory || 0)
      )
        integrity = false;
  }
  for (const hold of holds.filter((h) =>
    ["held", "committed"].includes(h.status),
  )) {
    const b = bookings.find((b) => b.id === hold.id);
    if (
      !b ||
      b.inventoryReleased ||
      ["cancelled", "no_show", "expired", "payment_failed"].includes(
        b.bookingStatus,
      )
    )
      integrity = false;
  }
  for (const b of bookings.filter(
    (b) =>
      ["pending_payment", "confirmed", "checked_in"].includes(
        b.bookingStatus,
      ) && !b.inventoryReleased,
  )) {
    const hold = holds.find((h) => h.id === b.id);
    if (
      b.inventoryEngine !== "interval_v1" ||
      !holds.some(
        (h) =>
          h.id === b.id &&
          ["held", "committed"].includes(h.status) &&
          h.roomTypeId === b.roomType?.id,
      )
    )
      integrity = false;
    if (hold) {
      try {
        const canonical = (
          allocations: { date: string; intervals: string[] }[],
        ) =>
          JSON.stringify(
            allocations
              .map((a) => [a.date, [...a.intervals].sort()])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          );
        if (
          canonical(hold.allocations) !==
            canonical(
              allocateIntervals(
                b.startAt,
                b.inventoryEndAt || b.endAt,
                b.timezone || p.timezone,
              ),
            ) ||
          hold.quantity !== (b.quantity || 1)
        )
          integrity = false;
      } catch {
        integrity = false;
      }
    }
    if (
      b.physicalUnitId &&
      !units.some(
        (u) =>
          u.id === b.physicalUnitId &&
          u.status === "active" &&
          u.roomTypeId === b.roomType?.id,
      )
    )
      integrity = false;
  }
  const feature = (key: string) =>
    process.env[key] === "true" ||
    (process.env.NODE_ENV !== "production" && process.env[key] !== "false");
  const deployment = [
    "PARTNER_RESERVATIONS_ALLOCATION",
    "PARTNER_RESERVATIONS_PAYMENTS",
    "PARTNER_ROOMS_CALENDAR",
    "PARTNER_ROOMS_HOUSEKEEPING",
  ].every(feature);
  const items: SetupItem[] = [
    {
      id: "details",
      label: "Hotel details and timezone",
      complete: Boolean(
        p.name &&
        p.address?.city &&
        p.address?.line1 &&
        (p.publicPhone || p.publicEmail) &&
        timezone,
      ),
      detail:
        "Save the hotel name, address, contact details and local timezone.",
      href: "/partner/listing",
    },
    {
      id: "capacity",
      label: "Room types and sellable capacity",
      complete:
        active.length > 0 &&
        active.every(
          (r) => Number.isSafeInteger(r.totalInventory) && r.totalInventory > 0,
        ),
      detail: "At least one active room type with positive sellable capacity.",
      href: "/partner/rooms",
    },
    {
      id: "register",
      label: "Physical room numbers",
      complete: register,
      detail:
        "Register exactly the configured number of active rooms for each active room type. Room numbers do not increase capacity.",
      href: "/partner/settings?section=rooms",
    },
    {
      id: "rates",
      label: "Rates and operational policies",
      complete: ratesReady,
      detail:
        "Save an eligible rate and cancellation policy for each booking mode, check-in/out times and a valid cleaning buffer.",
      href: "/partner/rooms",
    },
    {
      id: "team",
      label: "Team access reviewed",
      complete: p.pms?.teamReviewed === true,
      detail: "Review the team, or confirm that you operate the hotel alone.",
      href: "/partner/settings?section=team",
    },
    {
      id: "opening",
      label: "Existing reservations and opening balances",
      complete: p.pms?.openingData === "none",
      detail:
        p.pms?.openingData === "external"
          ? "External reservations or balances need reconciliation. Import is not available in this phase; the hotel cannot be marked ready."
          : "Confirm there are no reservations or balances outside Helpkey to bring across. Existing Helpkey reservations remain in shared inventory.",
    },
    {
      id: "inventory",
      label: "Shared inventory verified",
      complete: integrity,
      detail: snapshots.some((s) => s.size > 2000)
        ? "This hotel exceeds the bounded readiness check. Contact support for reconciliation."
        : "Existing holds, maintenance blocks and calendars must reconcile. Legacy inventory requires the existing controlled cutover process.",
    },
    {
      id: "deployment",
      label: "Operational features available",
      complete: deployment,
      detail:
        "Allocation, payments, room calendar and housekeeping must be enabled by the deployment administrator.",
    },
  ];
  return {
    propertyId,
    propertyName: p.name,
    role: access.role,
    permissions: access.permissions,
    revision: access.revision,
    state: pmsState(p, items, access.block),
    reason:
      access.block ||
      (p.pms?.ownerDisabled ? "The owner has temporarily disabled PMS." : null),
    items,
    openingData: p.pms?.openingData || "unknown",
    teamReviewed: p.pms?.teamReviewed === true,
    activated: Boolean(p.pms?.activatedAt),
    adminDisabled: p.pms?.adminDisabled === true,
    marketplace: {
      bookable: publicBookable(p),
      ownerPaused: p.marketplaceOwnerPaused === true,
      reason: publicBookable(p)
        ? "Guests can book publicly."
        : p.marketplaceOwnerPaused
          ? "Public bookings are paused by the owner."
          : "The listing is not publicly bookable. Check its approval and platform status.",
    },
  };
}

export function audit(
  tx: FirebaseFirestore.Transaction,
  propertyId: string,
  actorId: string,
  type: string,
  targetId: string,
  before: unknown,
  after: unknown,
) {
  tx.create(
    adminDb
      .collection("properties")
      .doc(propertyId)
      .collection("pmsEvents")
      .doc(),
    {
      actorId,
      type,
      targetId,
      before,
      after,
      createdAt: FieldValue.serverTimestamp(),
    },
  );
}
const command = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["activate", "disable", "resume"]) }).strict(),
  z
    .object({
      action: z.literal("declaration"),
      openingData: z.enum(["none", "external"]),
      teamReviewed: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal("marketplace"), paused: z.boolean() }).strict(),
]);
export async function updatePms(uid: string, propertyId: string, raw: unknown) {
  const input = command.parse(raw);
  await adminDb.runTransaction(async (tx) => {
    const access = await propertyAccess(
      uid,
      propertyId,
      input.action === "marketplace" ? "listing.manage" : "setup.manage",
      tx,
    );
    const p = access.property,
      ref = adminDb.collection("properties").doc(propertyId);
    const now = FieldValue.serverTimestamp();
    if (input.action === "marketplace") {
      if (!input.paused && access.block)
        throw new ApiException("PMS_RESTRICTED", 403, access.block);
      tx.update(ref, {
        marketplaceOwnerPaused: input.paused,
        isBookable:
          !input.paused &&
          p.status === "active" &&
          p.approvalStatus === "approved",
        updatedAt: now,
        updatedBy: uid,
      });
      audit(
        tx,
        propertyId,
        uid,
        "marketplace_pause",
        propertyId,
        p.marketplaceOwnerPaused === true,
        input.paused,
      );
    } else {
      if (["activate", "resume"].includes(input.action) && access.block)
        throw new ApiException("PMS_RESTRICTED", 403, access.block);
      const pms = { ...p.pms, version: 1, updatedAt: now, updatedBy: uid };
      if (input.action === "activate") {
        if (!pms.activatedAt) {
          pms.activatedAt = now;
          pms.activatedBy = uid;
        }
        pms.ownerDisabled = false;
      }
      if (input.action === "disable") pms.ownerDisabled = true;
      if (input.action === "resume") pms.ownerDisabled = false;
      if (input.action === "declaration") {
        pms.openingData = input.openingData;
        pms.teamReviewed = input.teamReviewed;
      }
      tx.update(ref, { pms });
      audit(
        tx,
        propertyId,
        uid,
        `pms_${input.action}`,
        propertyId,
        {
          activated: !!p.pms?.activatedAt,
          disabled: !!p.pms?.ownerDisabled,
          openingData: p.pms?.openingData || "unknown",
        },
        input,
      );
    }
  });
  if (input.action === "marketplace") {
    const { invalidatePublic } = await import("@/lib/api/cache");
    await invalidatePublic("home", "search:*", "property:*", "bookable:*");
  }
  return setupStatus(uid, propertyId);
}
