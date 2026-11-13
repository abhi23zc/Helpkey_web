import { describe, expect, it } from "vitest";
import {
  administrativeBlock,
  can,
  landing,
  permissions,
  pmsState,
  publicBookable,
  rolePermissions,
  staffRoles,
} from "@/lib/partner/pms/domain";
describe("hotel role boundaries", () => {
  it("keeps owner privileges and limits team/activation management to owners", () => {
    for (const p of permissions) expect(can("owner", p)).toBe(true);
    for (const role of staffRoles) {
      expect(can(role, "team.manage")).toBe(false);
      expect(can(role, "setup.manage")).toBe(false);
    }
    expect(can("unknown", "setup.read")).toBe(false);
    expect(can("revenue_manager", "payment.refund")).toBe(false);
  });
  it("prevents reception and department roles from financial escalation", () => {
    expect(can("receptionist", "reservation.operate")).toBe(true);
    for (const p of [
      "payment.collect",
      "payment.refund",
      "rates.manage",
      "reports.read",
      "guest.export",
      "reservation.cancel",
    ] as const)
      expect(can("receptionist", p)).toBe(false);
    expect(can("cashier", "payment.collect")).toBe(true);
    expect(can("cashier", "payment.reverse")).toBe(true);
    expect(can("cashier", "payment.refund")).toBe(false);
    expect(rolePermissions.housekeeper).toEqual(["setup.read", "housekeeping"]);
    expect(rolePermissions.maintenance).toEqual(["setup.read", "maintenance"]);
    expect(landing("cashier")).toBe("/partner/operations");
  });
});
describe("independent PMS and marketplace states", () => {
  const hotel = {
    status: "active",
    approvalStatus: "approved",
    isBookable: true,
    pms: { activatedAt: "saved" },
  };
  it("allows PMS while an owner voluntarily pauses public bookings", () => {
    const paused = {
      ...hotel,
      marketplaceOwnerPaused: true,
      isBookable: false,
    };
    expect(publicBookable(paused)).toBe(false);
    expect(administrativeBlock(paused)).toBeNull();
    expect(
      pmsState(
        paused,
        [{ id: "all", label: "Saved", complete: true, detail: "" }],
        null,
      ),
    ).toBe("ready");
  });
  it("does not make incomplete or never-activated hotels ready", () => {
    expect(pmsState({}, [], null)).toBe("not_activated");
    expect(
      pmsState(
        hotel,
        [{ id: "opening", label: "Opening", complete: false, detail: "" }],
        null,
      ),
    ).toBe("setup");
    expect(
      pmsState(
        { ...hotel, pms: { ...hotel.pms, ownerDisabled: true } },
        [],
        null,
      ),
    ).toBe("disabled");
  });
  it("retains every platform restriction and owner-account suspension", () => {
    for (const status of ["paused", "suspended", "archived"])
      expect(administrativeBlock({ ...hotel, status })).toBeTruthy();
    expect(
      administrativeBlock({ ...hotel, approvalStatus: "revoked" }),
    ).toBeTruthy();
    expect(
      administrativeBlock(hotel, { accountStatus: "suspended" }),
    ).toBeTruthy();
    expect(
      administrativeBlock({
        ...hotel,
        pms: { adminDisabled: true, adminReason: "Contact support" },
      }),
    ).toBe("Contact support");
    expect(pmsState(hotel, [], "Blocked")).toBe("disabled");
  });
});
