import { afterAll, describe, expect, it } from "vitest";
import { chromium } from "@playwright/test";

// Opt-in only: real Razorpay TEST requests, with all Helpkey records isolated in the emulator.
const enabled = process.env.RUN_RAZORPAY_SANDBOX === "1";
describe.skipIf(!enabled)("Razorpay sandbox booking lifecycle", () => {
  let db: typeof import("@/lib/firebase/admin").adminDb;
  afterAll(async () => { await db?.terminate(); });
  it("creates an order, captures a test payment, confirms the hold and refunds cancellation", async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:")) throw new Error("LOCAL_FIRESTORE_EMULATOR_REQUIRED");
    if (!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") || !process.env.RAZORPAY_KEY_SECRET) throw new Error("RAZORPAY_TEST_KEYS_REQUIRED");
    process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-bookings";
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = "";
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "";
    process.env.REDIS_DISABLED = "1";
    db = (await import("@/lib/firebase/admin")).adminDb;
    const bookings = await import("@/lib/bookings");
    const { processRefund } = await import("@/lib/booking/processing");
    const id = `sandbox_${crypto.randomUUID()}`;
    const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const browser = await chromium.launch({ headless: true });
    const auth = `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
    const provider = async (path: string, body?: object) => {
      const response = await fetch(`https://api.razorpay.com/v1/${path}`, { method: body ? "POST" : "GET", headers: { Authorization: auth, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(`RAZORPAY_SANDBOX_${response.status}: ${result.error?.description ?? "request failed"}`);
      return result;
    };
    try {
      await db.collection("properties").doc(id).set({ slug: id, name: "Isolated sandbox booking", status: "active", approvalStatus: "approved", isBookable: true, inventoryEngine: "interval_v1", bookingModes: ["hourly", "overnight"], timezone: "Asia/Kolkata", currency: "INR" });
      await db.collection("roomTypes").doc(id).set({ propertyId: id, status: "active", name: "Sandbox room", totalInventory: 1, maxAdults: 2 });
      await db.collection("cancellationPolicies").doc(id).set({ propertyId: id, status: "active", name: "Sandbox full refund", refundableUntilHours: 0, cancellationFeePercent: 0 });
      await db.collection("ratePlans").doc(id).set({ propertyId: id, roomTypeId: id, status: "active", name: "Sandbox deposit", bookingMode: "hourly", pricingModel: "duration", durationPrices: [{ hours: 3, pricePaise: 40000 }], basePricePaise: 40000, paymentMode: "deposit", depositBasisPoints: 2500, cancellationPolicyId: id });
      const created = await bookings.createBooking(id, { propertySlug: id, roomTypeId: id, ratePlanId: id, bookingMode: "hourly", checkIn: date, arrivalTime: "10:00", durationMinutes: 180, adults: 1, children: 0, infants: 0, leadEmail: "sandbox@example.com", leadPhone: "+919000090000", adultGuestNames: ["Sandbox Guest"], paymentMethod: "online", termsAccepted: true }, id);
      expect(created.requiresPayment).toBe(true);
      expect(created.razorpay?.amount).toBe(10000);
      const page = await browser.newPage();
      page.setDefaultTimeout(15000);
      await page.goto(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3101");
      await page.addScriptTag({ url: "https://checkout.razorpay.com/v1/checkout.js" });
      await page.evaluate((payment) => {
        const state = window as unknown as { sandboxPayment?: { razorpay_payment_id: string }; Razorpay: new (options: object) => { open(): void } };
        new state.Razorpay({ key: payment.keyId, order_id: payment.orderId, amount: payment.amount, currency: payment.currency, name: "Helpkey sandbox verification", prefill: { name: "Sandbox Guest", email: "sandbox@example.com", contact: "9000090000" }, handler: (result: { razorpay_payment_id: string }) => { state.sandboxPayment = result; } }).open();
      }, created.razorpay!);
      const frame = page.frameLocator("iframe.razorpay-checkout-frame");
      try {
        await frame.getByText("Payment Options", { exact: true }).first().waitFor();
        const contact = frame.locator('input[type="tel"]').first();
        if (await contact.isVisible()) {
          await contact.fill("9000090000");
          await frame.getByRole("button", { name: "Continue", exact: true }).click();
        }
        await frame.getByText(/Netbanking|Net Banking/i).first().click();
        const popupPromise = page.waitForEvent("popup", { timeout: 20000 });
        await frame.getByText("Bank of Baroda - Retail Banking", { exact: true }).first().click();
        const popup = await popupPromise;
        await popup.getByRole("button", { name: "Success", exact: true }).click();
        await page.waitForFunction(() => Boolean((window as unknown as { sandboxPayment?: unknown }).sandboxPayment), undefined, { timeout: 20000 });
      } catch (error) {
        console.info("Sandbox checkout visible text:", (await frame.locator("body").innerText().catch(() => "No checkout frame")).slice(0, 2500));
        await page.screenshot({ path: "/tmp/helpkey-sandbox-checkout.png" });
        throw error;
      }
      const payment = await page.evaluate(() => (window as unknown as { sandboxPayment: { razorpay_payment_id: string } }).sandboxPayment);
      const captured = await provider(`payments/${payment.razorpay_payment_id}`);
      console.info(JSON.stringify({ sandboxCaptureWasAutomatic: captured.status === "captured" }));
      expect(captured.status).toBe("captured");
      await bookings.verifyBookingPayment(id, created.bookingId, payment);
      const confirmed = (await db.collection("bookings").doc(created.bookingId).get()).data()!;
      expect(confirmed.bookingStatus).toBe("confirmed");
      expect(confirmed.paidPaise).toBe(10000);
      expect(confirmed.balanceDuePaise).toBe(30000);
      await bookings.cancelBookingForUser(id, created.bookingId);
      const refunds = await db.collection("refunds").where("bookingId", "==", created.bookingId).get();
      expect(refunds.size).toBe(1);
      for (let attempt = 0; ; attempt += 1) {
        try { await processRefund(refunds.docs[0].id); break; }
        catch (error) {
          if (attempt >= 2) throw error;
          expect((await refunds.docs[0].ref.get()).get("status")).toBe("retry");
          await new Promise((resolve) => setTimeout(resolve, 15000));
        }
      }
      await processRefund(refunds.docs[0].id);
      const refunded = (await db.collection("bookings").doc(created.bookingId).get()).data()!;
      expect(refunded.bookingStatus).toBe("cancelled");
      expect(refunded.refundedPaise).toBe(10000);
      expect(refunded.inventoryReleased).toBe(true);
    } finally {
      await browser.close();
      for (const collection of ["bookings", "roomTypes", "ratePlans", "cancellationPolicies", "inventoryHolds", "inventoryCalendars", "bookingNotificationOutbox"]) {
        const docs = await db.collection(collection).where("propertyId", "==", id).get();
        for (const doc of docs.docs) {
          if (collection === "bookings") {
            for (const related of ["paymentAttempts", "refunds"]) { const rows = await db.collection(related).where("bookingId", "==", doc.id).get(); for (const row of rows.docs) await row.ref.delete(); }
            const events = await doc.ref.collection("events").get(); for (const event of events.docs) await event.ref.delete();
          }
          await doc.ref.delete();
        }
      }
      await db.collection("properties").doc(id).delete();
    }
  }, 120000);
});
