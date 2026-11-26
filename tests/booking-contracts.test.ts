import { describe, expect, it } from "vitest";
import { bookingInput, createBookingInput } from "@/lib/booking/contracts";
import { staySearchFromParams, withStaySearch } from "@/lib/customer/stay-search";
import { checkoutInputFromSearchParams } from "@/lib/booking/checkout";
const base = { propertySlug: "hotel", roomTypeId: "room", ratePlanId: "rate", checkIn: "2026-10-21", adults: 2 };
describe("booking compatibility and hourly links", () => {
  it("defaults old request shapes to overnight", () => {
    expect(bookingInput.parse({ ...base, checkOut: "2026-10-22" }).bookingMode).toBe("overnight");
  });
  it("accepts an hourly checkout without an overnight date and normalizes stale empty fields", () => {
    const input = bookingInput.parse({ ...base, bookingMode: "hourly", arrivalTime: "10:00", durationMinutes: 120, checkOut: "" });
    expect(input.checkOut).toBeUndefined();
    expect(input.durationMinutes).toBe(120);
  });
  it("parses checkout URLs on the server with the same hourly requirements", () => {
    expect(checkoutInputFromSearchParams({ property: "hotel", room: "room", rate: "rate", checkIn: "2026-10-21", bookingMode: "hourly", arrivalTime: "10:00", durationMinutes: "120", adults: "2" })?.bookingMode).toBe("hourly");
    expect(checkoutInputFromSearchParams({ property: "hotel", room: "room", rate: "rate", checkIn: "2026-10-21", bookingMode: "hourly", adults: "2" })).toBeNull();
  });
  it("rejects impossible calendar dates and unsupported modes", () => {
    expect(bookingInput.safeParse({ ...base, checkIn: "2026-02-30" }).success).toBe(false);
    expect(bookingInput.safeParse({ ...base, bookingMode: "daily" }).success).toBe(false);
  });
  it("rejects fractional-hour durations at search and checkout boundaries", () => {
    expect(bookingInput.safeParse({ ...base, bookingMode: "hourly", durationMinutes: 135 }).success).toBe(false);
    expect(staySearchFromParams(new URLSearchParams("bookingMode=hourly&checkIn=2026-10-21&arrivalTime=10:15&durationMinutes=135"))).toBeNull();
  });
  it("accepts a separate authenticated booking contact for an on-behalf booking", () => {
    const result = createBookingInput.parse({
      ...base,
      checkOut: "2026-10-22",
      paymentMethod: "pay_at_property",
      leadEmail: "guest@example.com",
      leadPhone: "+919876543210",
      adultGuestNames: ["Staying Guest", "Second Guest"],
      bookingContact: { name: "Booking Contact", email: "booker@example.com", phone: "+919812345678" },
      termsAccepted: true,
    });
    expect(result.bookingContact?.name).toBe("Booking Contact");
  });
  it("rejects an invalid on-behalf booking contact", () => {
    expect(createBookingInput.safeParse({
      ...base,
      checkOut: "2026-10-22",
      paymentMethod: "pay_at_property",
      leadEmail: "guest@example.com",
      leadPhone: "+919876543210",
      adultGuestNames: ["Staying Guest", "Second Guest"],
      bookingContact: { name: "A", email: "not-an-email", phone: "123" },
    }).success).toBe(false);
  });
  it("round-trips shareable hourly arrival, duration and occupancy", () => {
    const stay = staySearchFromParams(new URLSearchParams("bookingMode=hourly&checkIn=2026-10-21&arrivalTime=10:15&durationMinutes=120&adults=2"));
    expect(stay?.bookingMode).toBe("hourly");
    expect(staySearchFromParams(withStaySearch(new URLSearchParams(), stay!))).toEqual(stay);
  });
  it("discards the old offer when dates, guests or hourly settings change", () => {
    const params = new URLSearchParams("destination=Kanpur&checkIn=2027-01-15&checkOut=2027-01-17&adults=2&children=0&infants=0&roomTypeId=room&ratePlanId=rate&searchTotalPaise=10000&room=room&rate=rate");
    const original = staySearchFromParams(params)!;
    const edits = [{ ...original, adults: 3 }, { ...original, children: 1 }, { ...original, infants: 1 }, { ...original, checkIn: "2027-01-16" }, { ...original, checkOut: "2027-01-18" }, { ...original, bookingMode: "hourly" as const, checkOut: undefined, arrivalTime: "10:00", durationMinutes: 120 }];
    for (const stay of edits) {
      const updated = withStaySearch(params, stay);
      for (const key of ["roomTypeId", "ratePlanId", "searchTotalPaise", "room", "rate"]) expect(updated.has(key)).toBe(false);
      expect(updated.get("destination")).toBe("Kanpur");
    }
    expect(withStaySearch(params, { ...original, bookingMode: "overnight" }).get("ratePlanId")).toBe("rate");
    expect(params.get("ratePlanId")).toBe("rate");
    const hourly = edits.at(-1)!;
    const hourlyParams = withStaySearch(params, hourly);
    hourlyParams.set("ratePlanId", "hourly-rate");
    expect(withStaySearch(hourlyParams, { ...hourly, arrivalTime: "11:00" }).has("ratePlanId")).toBe(false);
    expect(withStaySearch(hourlyParams, { ...hourly, durationMinutes: 180 }).has("ratePlanId")).toBe(false);
  });

});
