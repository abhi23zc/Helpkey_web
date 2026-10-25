import { afterEach, describe, expect, it, vi } from "vitest";
import { nextHotelMode, hotelStayDraft } from "@/lib/customer/hotel-stay";
import { availabilityRemaining, rememberAvailability, type Availability } from "@/lib/customer/hotel-availability";
import { staySearchSchema } from "@/lib/customer/stay-search";

afterEach(() => vi.restoreAllMocks());
const current = { bookingMode: "overnight" as const, checkIn: "2027-01-15", checkOut: "2027-01-18", adults: 3, children: 1, infants: 2 };

describe("hotel stay changes", () => {
  it("retains incomplete and invalid inputs without treating them as bookable", () => {
    const draft = hotelStayDraft(new URLSearchParams("checkIn=2027-01-15&adults=0"));
    expect(draft.checkIn).toBe("2027-01-15");
    expect(draft.adults).toBe(0);
    expect(staySearchSchema.safeParse(draft).success).toBe(false);
  });
  it("preserves guests and date, removes incompatible fields, and restores remembered settings", () => {
    const hourly = nextHotelMode(current, "hourly", { arrivalTime: "11:15", durationMinutes: 120 }, "Asia/Kolkata");
    expect(hourly).toEqual({ bookingMode: "hourly", checkIn: current.checkIn, adults: 3, children: 1, infants: 2, arrivalTime: "11:15", durationMinutes: 120 });
    expect(nextHotelMode(hourly, "overnight", current, "Asia/Kolkata")).toEqual(current);
  });
  it("defaults to tomorrow and generates a valid checkout", () => {
    const mode = nextHotelMode({ adults: 2, children: 0, infants: 0 }, "overnight", {}, "Asia/Kolkata", Date.parse("2027-01-01T22:00Z"));
    expect(mode).toMatchObject({ checkIn: "2027-01-03", checkOut: "2027-01-04" });
  });
  it("uses the next local quarter-hour and leaves the mode invalid when no times remain", () => {
    const stay = { ...current, checkIn: "2027-01-15" };
    expect(nextHotelMode(stay, "hourly", {}, "Asia/Kolkata", Date.parse("2027-01-15T05:38Z")).arrivalTime).toBe("11:15");
    const late = nextHotelMode(stay, "hourly", {}, "Asia/Kolkata", Date.parse("2027-01-15T18:20Z"));
    expect(late.arrivalTime).toBe("");
    expect(staySearchSchema.safeParse(late).success).toBe(false);
  });
});

describe("hotel availability deadlines", () => {
  const response = (serverNow: number, expiresAt = serverNow + 30_000): Availability => ({ serverNow, expiresAt, rooms: [], hourlyDurations: [] });
  it("deducts transport time and does not renew cached results", () => {
    let monotonic = 100;
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.spyOn(performance, "now").mockImplementation(() => monotonic);
    const result = rememberAvailability(response(1_000), 250);
    expect(availabilityRemaining(result)).toBe(29_750);
    monotonic += 20_000;
    rememberAvailability(result, 0);
    expect(availabilityRemaining(result)).toBe(9_750);
    monotonic += 10_000;
    expect(availabilityRemaining(result)).toBe(0);
  });
  it("ignores client wall-clock skew, honors shorter cutoffs, and expires late responses", () => {
    vi.spyOn(performance, "now").mockReturnValue(100);
    vi.spyOn(Date, "now").mockReturnValue(999_999_999);
    expect(availabilityRemaining(rememberAvailability(response(1_000, 6_000), 100))).toBe(4_900);
    expect(availabilityRemaining(rememberAvailability(response(1_000, 1_100), 200))).toBe(0);
  });
  it("expires across device sleep even if the monotonic clock was suspended", () => {
    vi.spyOn(performance, "now").mockReturnValue(100);
    const wall = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const result = rememberAvailability(response(1_000), 0);
    wall.mockReturnValue(32_000);
    expect(availabilityRemaining(result)).toBe(0);
  });

});
