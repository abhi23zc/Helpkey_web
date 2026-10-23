import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "guest-1" } as { uid: string } | null,
  lookup: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({ withApiHandler: (handler: unknown) => handler }));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: async () => mocks.user }));
vi.mock("@/lib/bookings", () => ({
  bookingForGuest: mocks.lookup,
  bookingError: (error: unknown) => error instanceof Error ? error.message : "BOOKING_NOT_FOUND",
}));

const { GET } = await import("@/app/api/bookings/[bookingId]/route");
const context = (bookingId: string) => ({ params: Promise.resolve({ bookingId }) });

describe("private booking itinerary endpoint", () => {
  beforeEach(() => {
    mocks.user = { uid: "guest-1" };
    mocks.lookup.mockReset();
  });

  it("returns the customer-safe booking only for the authenticated guest", async () => {
    mocks.lookup.mockResolvedValue({ id: "booking-1", confirmationCode: "HK-BOOKING-1", paymentStatus: "paid" });
    const response = await GET(new Request("http://localhost/api/bookings/booking-1"), context("booking-1"));
    expect(response.status).toBe(200);
    expect(mocks.lookup).toHaveBeenCalledWith("guest-1", "booking-1");
    await expect(response.json()).resolves.toEqual({ booking: { id: "booking-1", confirmationCode: "HK-BOOKING-1", paymentStatus: "paid" } });
  });

  it("does not reveal another guest's booking", async () => {
    mocks.lookup.mockRejectedValue(new Error("BOOKING_NOT_FOUND"));
    const response = await GET(new Request("http://localhost/api/bookings/other-booking"), context("other-booking"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "BOOKING_NOT_FOUND" });
  });

  it("requires a signed-in guest", async () => {
    mocks.user = null;
    const response = await GET(new Request("http://localhost/api/bookings/booking-1"), context("booking-1"));
    expect(response.status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
