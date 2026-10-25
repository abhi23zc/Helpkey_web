import { describe, expect, it, vi } from "vitest";
const { catalog } = vi.hoisted(() => ({
  catalog: [
    { id: "mouse", status: "active", advanceNoticeMinutes: 120 },
    { id: "overnight-only", status: "active", bookingModes: ["overnight"] },
    { id: "suite-only", status: "active", roomTypeIds: ["suite"] },
    { id: "paused", status: "paused" },
  ],
}));
vi.mock("@/lib/api/handler", () => ({
  withApiHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/api/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/api/request", () => ({
  clientIp: () => "127.0.0.1",
  privateFingerprint: () => "fixture",
}));
vi.mock("@/lib/booking/domain", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/booking/domain")>(),
  evaluateStay: () => ({
    startAt: "2026-10-25T11:00:00+05:30",
    timezone: "Asia/Kolkata",
    bookingMode: "hourly",
  }),
}));
vi.mock("@/lib/stay/catalog", () => ({ offeringsFor: async () => catalog }));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: (name: string) =>
      name === "properties"
        ? {
            where: () => ({
              limit: () => ({
                get: async () => ({
                  docs: [
                    {
                      id: "hotel",
                      data: () => ({
                        status: "active",
                        approvalStatus: "approved",
                        isBookable: true,
                      }),
                    },
                  ],
                }),
              }),
            }),
          }
        : {
            doc: (id: string) => ({
              id,
              get: async () => ({
                id,
                data: () => ({
                  propertyId: "hotel",
                  roomTypeId: "room",
                  status: "active",
                }),
              }),
            }),
          },
  },
}));
import { POST } from "@/app/api/bookings/personalization/route";
describe("checkout catalog discovery", () => {
  it("returns all active options, including restrictions, without exposing paused listings", async () => {
    const response = await POST(
      new Request("http://localhost/api/bookings/personalization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertySlug: "hotel",
          roomTypeId: "room",
          ratePlanId: "rate",
          checkIn: "2026-10-25",
          bookingMode: "hourly",
          arrivalTime: "11:00",
          durationMinutes: 60,
          adults: 1,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.offerings.map((o: { id: string }) => o.id)).toEqual([
      "mouse",
      "overnight-only",
      "suite-only",
    ]);
    expect(data.offerings[0].advanceNoticeMinutes).toBe(120);
  });
});
