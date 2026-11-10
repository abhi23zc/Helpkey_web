import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), limit: vi.fn(), recover: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/api/handler", () => ({ withApiHandler: (handler: unknown) => handler }));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUser: mocks.user }));
vi.mock("@/lib/api/rate-limit", () => ({ enforceRateLimit: mocks.limit }));
vi.mock("@/lib/booking/recovery", () => ({ recoverSubmission: mocks.recover, reconcilePaymentForGuest: mocks.reconcile }));
import { POST as recover } from "@/app/api/bookings/recover-submission/route";
import { POST as reconcile } from "@/app/api/bookings/[bookingId]/reconcile-payment/route";
const request = (body: unknown) => new Request("http://localhost/api/bookings/recover-submission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const context = { params: Promise.resolve({ bookingId: "booking" }) };
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ uid: "account" }); mocks.limit.mockResolvedValue(undefined); });
describe("checkout recovery endpoint contracts", () => {
  it("requires authentication before recovery or provider inspection", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await recover(request({ submissionKey: "original" }), undefined)).status).toBe(401);
    expect((await reconcile(request({}), context)).status).toBe(401);
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("uses the exact original key under the authenticated account and enforces a fail-closed limit", async () => {
    mocks.recover.mockResolvedValue({ state: "closed_without_booking" });
    expect(await (await recover(request({ submissionKey: "original-key" }), undefined)).json()).toEqual({ state: "closed_without_booking" });
    expect(mocks.recover).toHaveBeenCalledWith("account", "original-key");
    expect(mocks.limit).toHaveBeenCalledWith(expect.objectContaining({ identifier: "account", failClosed: true }));
  });
  it.each([{}, { submissionKey: "" }, { submissionKey: "x".repeat(201) }])("rejects malformed recovery references %j", async body => {
    expect((await recover(request(body), undefined)).status).toBe(422);
    expect(mocks.recover).not.toHaveBeenCalled();
  });
  it("never treats failed rate limiting as a closed submission", async () => {
    mocks.limit.mockRejectedValue(new Error("limiter unavailable"));
    await expect(recover(request({ submissionKey: "original" }), undefined)).rejects.toThrow("limiter unavailable");
    expect(mocks.recover).not.toHaveBeenCalled();
  });
  it("returns saved outcome and explicit eligibility while binding a native report to its attempt", async () => {
    mocks.reconcile.mockResolvedValue({ bookingId: "booking", bookingStatus: "expired", paymentStatus: "refund_pending", reconciliationState: "settled", paymentEligible: false, attemptId: "attempt", paymentIds: ["internal"], orderId: "internal-order" });
    const response = await reconcile(request({ attemptId: "attempt", nativeResult: "cancelled" }), context);
    const data = await response.json();
    expect(data).toMatchObject({ paymentStatus: "refund_pending", paymentEligible: false, reconciliationState: "settled" });
    expect(data).not.toHaveProperty("paymentIds");
    expect(data).not.toHaveProperty("orderId");
    expect(mocks.reconcile).toHaveBeenCalledWith("account", "booking", { attemptId: "attempt", nativeResult: "cancelled" });
    expect(mocks.limit).toHaveBeenCalledWith(expect.objectContaining({ identifier: "account", failClosed: true }));
  });
});
