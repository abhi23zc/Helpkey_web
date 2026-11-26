import { afterAll, describe, expect, it } from "vitest";
import { chromium } from "@playwright/test";
/** Explicit opt-in, TEST keys only, isolated local emulator. Never use live keys. */
describe.skipIf(process.env.RUN_BOOKING_EDIT_SANDBOX !== "1")(
  "customer amendment Razorpay sandbox",
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    afterAll(async () => {
      await db?.terminate();
    });
    it("captures a separate deposit difference and refunds both identifiable receipts", async () => {
      if (
        !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "") ||
        !process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ||
        !process.env.RAZORPAY_KEY_SECRET
      )
        throw new Error("LOCAL_EMULATOR_AND_RAZORPAY_TEST_KEYS_REQUIRED");
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-edit-sandbox";
      process.env.FIREBASE_ADMIN_PRIVATE_KEY = "";
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "";
      process.env.REDIS_DISABLED = "1";
      process.env.BACKGROUND_MODE = "legacy";
      const id = `edit_sandbox_${crypto.randomUUID()}`;
      db = (await import("@/lib/firebase/admin")).adminDb;
      const bookings = await import("@/lib/bookings");
      const service = await import("@/lib/booking/amendments/service");
      const payments = await import("@/lib/booking/amendments/payments");
      const { processRefund } = await import("@/lib/booking/processing");
      const browser = await chromium.launch({ headless: true });
      try {
        await db
          .collection("properties")
          .doc(id)
          .set({
            slug: id,
            name: "Editing sandbox",
            status: "active",
            approvalStatus: "approved",
            isBookable: true,
            inventoryEngine: "interval_v1",
            bookingModes: ["hourly"],
            currency: "INR",
            timezone: "Asia/Kolkata",
          });
        await db.collection("roomTypes").doc(id).set({
          propertyId: id,
          status: "active",
          name: "Test room",
          totalInventory: 1,
          maxAdults: 2,
        });
        await db.collection("cancellationPolicies").doc(id).set({
          propertyId: id,
          status: "active",
          name: "Full refund",
          refundableUntilHours: 0,
          cancellationFeePercent: 0,
        });
        await db
          .collection("ratePlans")
          .doc(id)
          .set({
            propertyId: id,
            roomTypeId: id,
            status: "active",
            name: "Deposit",
            bookingMode: "hourly",
            pricingModel: "duration",
            durationPrices: [
              { hours: 3, pricePaise: 40000 },
              { hours: 4, pricePaise: 80000 },
            ],
            paymentMode: "deposit",
            depositBasisPoints: 2500,
            cancellationPolicyId: id,
          });
        const date = new Date(Date.now() + 3 * 86400000)
          .toISOString()
          .slice(0, 10);
        const input = {
          propertySlug: id,
          roomTypeId: id,
          ratePlanId: id,
          bookingMode: "hourly",
          checkIn: date,
          arrivalTime: "10:00",
          durationMinutes: 180,
          adults: 1,
          children: 0,
          infants: 0,
          paymentMethod: "online",
          leadEmail: "sandbox@example.com",
          leadPhone: "+919000090000",
          adultGuestNames: ["Sandbox Guest"],
        };
        const created = await bookings.createBooking(id, input, id);
        const page = await browser.newPage();
        page.setDefaultTimeout(20000);
        await page.goto(
          process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3019",
        );
        await page.addScriptTag({
          url: "https://checkout.razorpay.com/v1/checkout.js",
        });
        async function checkout(payment: {
          keyId: string | undefined;
          orderId: string;
          amount: number;
          currency: string;
        }) {
          await page.evaluate((p) => {
            const w = window as unknown as {
              testCapture: unknown;
              Razorpay: new (options: object) => { open(): void };
            };
            w.testCapture = null;
            new w.Razorpay({
              key: p.keyId,
              order_id: p.orderId,
              amount: p.amount,
              currency: p.currency,
              name: "HelpKey amendment TEST",
              prefill: {
                name: "Sandbox Guest",
                email: "sandbox@example.com",
                contact: "9000090000",
              },
              handler: (r: unknown) => {
                w.testCapture = r;
              },
            }).open();
          }, payment);
          const frame = page.frameLocator("iframe.razorpay-checkout-frame");
          await frame
            .getByText("Payment Options", { exact: true })
            .first()
            .waitFor();
          const contact = frame.locator('input[type="tel"]').first();
          if (await contact.isVisible()) {
            await contact.fill("9000090000");
            await frame
              .getByRole("button", { name: "Continue", exact: true })
              .click();
          }
          await frame
            .getByText(/Netbanking|Net Banking/i)
            .first()
            .click();
          const popupPromise = page.waitForEvent("popup");
          await frame
            .getByText("Bank of Baroda - Retail Banking", { exact: true })
            .first()
            .click();
          const popup = await popupPromise;
          await popup
            .getByRole("button", { name: "Success", exact: true })
            .click();
          await page.waitForFunction(() =>
            Boolean(
              (window as unknown as { testCapture: unknown }).testCapture,
            ),
          );
          return page.evaluate(
            () =>
              (
                window as unknown as {
                  testCapture: {
                    razorpay_order_id: string;
                    razorpay_payment_id: string;
                    razorpay_signature: string;
                  };
                }
              ).testCapture,
          );
        }
        const initial = await checkout(created.razorpay!);
        await bookings.verifyBookingPayment(id, created.bookingId, initial);
        const q = await service.quoteAmendment(id, created.bookingId, {
          roomTypeId: id,
          ratePlanId: id,
          checkIn: date,
          arrivalTime: "10:00",
          durationMinutes: 240,
          adults: 1,
          children: 0,
          infants: 0,
          occupants: [{ name: "Sandbox Guest", ageGroup: "adult" }],
          bookingContact: {
            name: "Sandbox Guest",
            email: input.leadEmail,
            phone: input.leadPhone,
          },
        });
        expect(q.amountToCollectPaise).toBe(10000);
        const a = await service.createAmendment(
          id,
          created.bookingId,
          { quoteId: q.quoteId },
          "sandbox-edit",
        );
        const session = await payments.paymentSession(
          id,
          created.bookingId,
          a.id,
        );
        expect(session.razorpay.orderId).not.toBe(created.razorpay!.orderId);
        const additional = await checkout(session.razorpay);
        await bookings.verifyBookingPayment(id, created.bookingId, additional);
        const saved = (
          await db.collection("bookings").doc(created.bookingId).get()
        ).data()!;
        expect(saved.paidPaise).toBe(20000);
        expect(saved.totalPaise).toBe(80000);
        expect(saved.durationMinutes).toBe(240);
        await bookings.cancelBookingForUser(id, created.bookingId);
        const refunds = await db
          .collection("refunds")
          .where("bookingId", "==", created.bookingId)
          .get();
        expect(refunds.size).toBe(2);
        for (const r of refunds.docs) {
          await processRefund(r.id);
          await processRefund(r.id);
        }
        expect(
          (await db.collection("bookings").doc(created.bookingId).get()).get(
            "refundedPaise",
          ),
        ).toBe(20000);
      } finally {
        await browser.close();
        for (const name of [
          "bookings",
          "bookingFinanceAgreementsV1",
          "roomTypes",
          "ratePlans",
          "cancellationPolicies",
          "inventoryHolds",
          "inventoryCalendars",
          "bookingNotificationOutbox",
          "bookingPaymentOrdersV1",
          "paymentAttempts",
          "refunds",
          "bookingReferences",
        ]) {
          const docs = await db
            .collection(name)
            .where("propertyId", "==", id)
            .get();
          for (const d of docs.docs) await db.recursiveDelete(d.ref);
        }
        await db.recursiveDelete(db.collection("properties").doc(id));
      }
    }, 180000);
  },
);
