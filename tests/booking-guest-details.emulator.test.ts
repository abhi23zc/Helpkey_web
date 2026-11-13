import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/providers/http", () => ({
  providerFetch: vi.fn(() => {
    throw new Error("No provider calls allowed");
  }),
}));
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "saved reservation ownership and history (local Firestore)",
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let lookup: typeof import("@/lib/bookings").bookingForGuest;
    const prefix = `category7-${crypto.randomUUID()}`;
    const guest = `${prefix}-guest`;
    const created: { collection: string; id: string }[] = [];
    async function put(
      collection: string,
      id: string,
      data: Record<string, unknown>,
    ) {
      created.push({ collection, id });
      await db.collection(collection).doc(id).set(data);
    }
    beforeAll(async () => {
      if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8293")
        throw new Error("Category 7 tests require isolated localhost:8293");
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-bookings";
      db = (await import("@/lib/firebase/admin")).adminDb;
      lookup = (await import("@/lib/bookings")).bookingForGuest;
    }, 30000);
    afterAll(async () => {
      for (const row of created)
        await db.collection(row.collection).doc(row.id).delete();
      await db?.terminate();
    }, 30000);
    it("serves website and app snapshots when the listing changes or disappears", async () => {
      const propertyId = `${prefix}-property`;
      await put("properties", propertyId, {
        name: "Changed current name",
        publicPhone: "current-phone",
        address: { line1: "Changed address" },
      });
      for (const source of ["web", "app"]) {
        const id = `${prefix}-${source}`;
        await put("bookings", id, {
          guestId: guest,
          source,
          propertyId,
          propertyName: "Booked hotel",
          propertyAddress: "Booked street",
          propertyPublicPhone: "+919876543210",
          roomType: { name: "Booked suite" },
          ratePlan: { name: "Deposit" },
          checkIn: "2027-01-15",
          checkOut: "2027-01-17",
          timezone: "Asia/Kolkata",
          checkInTime: "14:00",
          checkOutTime: "11:00",
          totalPaise: 100000,
          paidPaise: 25000,
          customizationCreditPaise: 0,
          refundDuePaise: 0,
          refundedPaise: 0,
          bookingStatus: "confirmed",
          paymentStatus: "partially_paid",
          amenitySnapshot: {
            version: 1,
            roomAmenities: [{ code: "wifi", label: "Booked WiFi" }],
            propertyAmenities: [],
            rateInclusions: [],
          },
          leadGuest: {
            name: "Guest",
            adultAadhaarLastFour: ["PRIVATE-IDENTITY"],
          },
        });
        await put("paymentAttempts", `${id}-payment`, {
          bookingId: id,
          paymentId: `${id}-online`,
          status: "captured",
          amountPaise: 25000,
        });
        await put("paymentAttempts", `${id}-service`, {
          bookingId: id,
          paymentId: `${id}-extra`,
          status: "captured",
          amountPaise: 5000,
          stayQuote: true,
        });
        let booking = await lookup(guest, id);
        expect(booking.savedDetails).toMatchObject({
          propertyName: "Booked hotel",
          propertyAddress: "Booked street",
          roomName: "Booked suite",
        });
        expect(booking.receiptFinancials.balanceDuePaise).toBe(75000);
        expect(booking.paymentReferences).toEqual([
          { reference: `${id}-online`, method: "online" },
        ]);
        expect(JSON.stringify(booking)).not.toContain("PRIVATE-IDENTITY");
        await db.collection("properties").doc(propertyId).delete();
        booking = await lookup(guest, id);
        expect(booking.savedDetails.propertyAddress).toBe("Booked street");
        await expect(lookup("another-account", id)).rejects.toThrow(
          "BOOKING_NOT_FOUND",
        );
      }
    }, 30000);
    it("keeps an incomplete historical booking readable with unknown amounts", async () => {
      const id = `${prefix}-historical`;
      await put("bookings", id, {
        guestId: guest,
        propertyName: "Historical hotel",
        checkIn: "2020-01-01",
        checkOut: "2020-01-01",
        bookingMode: "hourly",
        durationMinutes: 120,
        bookingStatus: "completed",
      });
      const booking = await lookup(guest, id);
      expect(booking.savedDetails.bookingMode).toBe("hourly");
      expect(booking.savedDetails.propertyAddress).toBeNull();
      expect(booking.receiptFinancials.totalPaise).toBeNull();
      expect(booking.receiptFinancials.paidPaise).toBeNull();
      await expect(lookup(guest, `${prefix}-missing`)).rejects.toThrow(
        "BOOKING_NOT_FOUND",
      );
    }, 30000);
  },
);
