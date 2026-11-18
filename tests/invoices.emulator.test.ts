import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import * as invoiceDomain from "@/lib/partner/invoices/domain";
import { seller, customer, particulars } from "./fixtures/invoices";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)(
  "hotel invoice transactions on disposable emulator data",
  { timeout: 30000 },
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let service: typeof import("@/lib/partner/invoices/service");
    let billing: typeof import("@/lib/partner/billing/service");
    const prefix = `invoice-${crypto.randomUUID()}`,
      hotel = `${prefix}-hotel`,
      owner = `${prefix}-owner`,
      cashier = `${prefix}-cashier`,
      other = `${prefix}-other`,
      receptionist = `${prefix}-receptionist`;
    let count = 0;
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-pms";
      process.env.BACKGROUND_MODE = "legacy";
      delete process.env.REDIS_URL;
      db = (await import("@/lib/firebase/admin")).adminDb;
      service = await import("@/lib/partner/invoices/service");
      billing = await import("@/lib/partner/billing/service");
      for (const [uid, role] of [
        [owner, "owner"],
        [cashier, "cashier"],
        [other, "owner"],
        [receptionist, "receptionist"],
      ]) {
        await db
          .collection("users")
          .doc(uid)
          .set({ roles: ["partner"], isActive: true, accountStatus: "active" });
        await db
          .collection("propertyMemberships")
          .doc(`${uid === other ? `${hotel}-other` : hotel}_${uid}`)
          .set({ propertyId: hotel, role, status: "active" });
      }
      await db
        .collection("properties")
        .doc(hotel)
        .set({
          ownerId: owner,
          name: "Invoice Hotel",
          status: "active",
          approvalStatus: "approved",
          isBookable: true,
          inventoryEngine: "interval_v1",
          timezone: "Asia/Kolkata",
          address: { line1: "Road", city: "City" },
          publicPhone: "123",
          checkInTime: "14:00",
          checkOutTime: "11:00",
          pms: {
            activatedAt: new Date(),
            teamReviewed: true,
            openingData: "none",
            inventoryVerification: { passed: true },
          },
        });
      await db
        .collection("roomTypes")
        .doc(`${prefix}-room`)
        .set({ propertyId: hotel, status: "active", totalInventory: 1 });
      await db
        .collection("physicalUnits")
        .doc(`${prefix}-unit`)
        .set({
          propertyId: hotel,
          status: "active",
          label: "101",
          roomTypeId: `${prefix}-room`,
        });
      await db
        .collection("cancellationPolicies")
        .doc(`${prefix}-policy`)
        .set({ propertyId: hotel, status: "active" });
      await db
        .collection("ratePlans")
        .doc(`${prefix}-rate`)
        .set({
          propertyId: hotel,
          status: "active",
          roomTypeId: `${prefix}-room`,
          cancellationPolicyId: `${prefix}-policy`,
        });
      await service.saveSettings(owner, hotel, {
        expectedRevision: 0,
        settings: seller,
      });
    });
    afterAll(async () => {
      for (const collection of [
        "bookings",
        "invoices",
        "propertyPayments",
        "propertyMemberships",
        "roomTypes",
        "physicalUnits",
        "cancellationPolicies",
        "ratePlans",
      ]) {
        const docs = await db
          .collection(collection)
          .where("propertyId", "==", hotel)
          .get();
        for (const doc of docs.docs) await db.recursiveDelete(doc.ref);
      }
      for (const uid of [owner, cashier, other, receptionist])
        await db.collection("users").doc(uid).delete();
      await db.recursiveDelete(db.collection("properties").doc(hotel));
    });
    async function booking() {
      const id = `${prefix}-${count++}`;
      await db.collection("bookings").doc(id).set({
        propertyId: hotel,
        bookingStatus: "confirmed",
        totalPaise: 10000,
        subtotalPaise: 10000,
        taxPaise: 0,
        customerFeePaise: 0,
        paidPaise: 0,
      });
      return id;
    }
    async function ready(id: string) {
      const w = await service.reviewInvoice(owner, id);
      await service.saveDocumentDetails(owner, id, {
        expectedVersion: w.version,
        details: {
          customer,
          accountantConfirmed: true,
          irpRequired: false,
          lines: w.remaining.map((l) =>
            particulars(l.id, Math.abs(l.amountPaise)),
          ),
        },
      });
      return service.reviewInvoice(owner, id);
    }
    async function issue(id: string, key = crypto.randomUUID()) {
      const w = await ready(id);
      return service.issueDocument(
        owner,
        id,
        { action: "invoice", expectedVersion: w.version },
        key,
      );
    }
    it("issues concurrently across bookings on first use without treating the internal series lock as a seller edit", async () => {
      const a = await booking(),
        b = await booking();
      const wa = await ready(a),
        wb = await ready(b);
      const results = await Promise.all([
        service.issueDocument(
          owner,
          a,
          { action: "invoice", expectedVersion: wa.version },
          "first-a",
        ),
        service.issueDocument(
          owner,
          b,
          { action: "invoice", expectedVersion: wb.version },
          "first-b",
        ),
      ]);
      const numbers = results
        .map((r) => Number(r.number.split("/").at(-1)))
        .sort((x, y) => x - y);
      expect(numbers).toEqual([1, 2]);
    });
    it("claims sources atomically, recovers exact retries and conflicts on changed payload", async () => {
      const id = await booking(),
        w = await ready(id),
        input = { action: "invoice", expectedVersion: w.version };
      const results = await Promise.allSettled([
        service.issueDocument(owner, id, input, "one"),
        service.issueDocument(owner, id, input, "two"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const index = results.findIndex((r) => r.status === "fulfilled"),
        result = (
          results[index] as PromiseFulfilledResult<{
            id: string;
            number: string;
          }>
        ).value;
      expect(
        await service.issueDocument(
          owner,
          id,
          input,
          index === 0 ? "one" : "two",
        ),
      ).toEqual(result);
      await expect(
        service.issueDocument(
          owner,
          id,
          { ...input, reason: "changed" },
          index === 0 ? "one" : "two",
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      expect(
        (await db.collection("bookings").doc(id).get()).get("paidPaise"),
      ).toBe(0);
    });
    it("serializes numbering across bookings; failed and stale reviews do not consume numbers", async () => {
      const a = await booking(),
        b = await booking();
      const [ra, rb] = await Promise.all([issue(a), issue(b)]);
      const numbers = [ra.number, rb.number]
        .map((n) => Number(n.split("/").at(-1)))
        .sort((x, y) => x - y);
      expect(numbers[1] - numbers[0]).toBe(1);
      const c = await booking(),
        w = await ready(c);
      await db.collection("bookings").doc(c).update({ paidPaise: 1 });
      await expect(
        service.issueDocument(
          owner,
          c,
          { action: "invoice", expectedVersion: w.version },
          "stale",
        ),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_STALE" });
      await db.collection("bookings").doc(c).update({ paidPaise: 0 });
      const rc = await issue(c);
      expect(Number(rc.number.split("/").at(-1))).toBe(numbers[1] + 1);
    });
    it("restricts settings, reads, print data and issuance by hotel and role", async () => {
      const id = await booking(),
        doc = await issue(id);
      expect((await service.readDocument(cashier, id, doc.id)).id).toBe(doc.id);
      for (const uid of [other, receptionist])
        await expect(
          service.readDocument(uid, id, doc.id),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.readSettings(cashier, hotel)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      const w = await service.reviewInvoice(owner, id);
      await expect(
        service.issueDocument(
          cashier,
          id,
          { action: "invoice", expectedVersion: w.version },
          "cashier",
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const second = await booking();
      await expect(
        service.readDocument(owner, second, doc.id),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it("retains immutable seller, recipient and settlement after current settings change", async () => {
      const id = await booking(),
        doc = await issue(id),
        before = await service.readDocument(owner, id, doc.id);
      const settings = await service.readSettings(owner, hotel);
      await service.saveSettings(owner, hotel, {
        expectedRevision: settings.revision,
        settings: { ...seller, legalName: "New hotel name" },
      });
      await db.collection("bookings").doc(id).update({ paidPaise: 10000 });
      expect(await service.readDocument(owner, id, doc.id)).toEqual(before);
      await expect(
        service.saveSettings(owner, hotel, {
          expectedRevision: settings.revision + 1,
          settings: { ...seller, invoiceStart: 1, invoiceSeries: "NEW" },
        }),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_REQUIRED" });
    });
    it("issues a later-charge invoice without reusing original sources", async () => {
      const id = await booking();
      await issue(id);
      await billing.commandFolio(
        owner,
        id,
        {
          action: "post",
          expectedRevision: 0,
          amountPaise: 2000,
          description: "Laundry",
          category: "laundry",
          details: { explanation: "Cleaned garments" },
        },
        "laundry",
      );
      const second = await issue(id);
      const snapshot = (await service.readDocument(
        owner,
        id,
        second.id,
      )) as import("@/lib/partner/dashboard/domain").RecordData;
      expect(snapshot.totalPaise).toBe(2000);
      expect(snapshot.lines).toHaveLength(1);
      expect(snapshot.lines[0].sourceId).not.toBe("booking");
    });
    it("retains original seller and immutable line allocations across settings edits and partial notes", async () => {
      const id = await booking();
      await billing.commandFolio(
        owner,
        id,
        {
          action: "post",
          expectedRevision: 0,
          amountPaise: 2000,
          description: "Laundry charge",
          category: "laundry",
          details: { explanation: "Agreed laundry" },
        },
        "post",
      );
      const invoice = await issue(id);
      const original = (await service.readDocument(
        owner,
        id,
        invoice.id,
      )) as import("@/lib/partner/dashboard/domain").RecordData;
      const previous = await service.readSettings(owner, hotel);
      try {
        await service.saveSettings(owner, hotel, {
          expectedRevision: previous.revision,
          settings: {
            ...previous.settings!,
            legalName: "Updated business name",
            address: "Updated business address",
            contact: "Updated contact",
            footer: "Updated footer",
          },
        });
        await billing.commandFolio(
          owner,
          id,
          {
            action: "credit",
            expectedRevision: 1,
            amountPaise: 1500,
            description: "Goodwill reduction",
            category: "other",
            reason: "Approved reduction",
            details: { explanation: "Approved adjustment" },
          },
          "credit",
        );
        let w = await service.reviewInvoice(owner, id);
        const reductionId = w.reductions.find(
          (l) => l.remainingPaise === 1500,
        )!.id;
        const input = {
          action: "credit_note",
          expectedVersion: w.version,
          invoiceId: invoice.id,
          reductionId,
          reason: "Partial line reductions",
          allocations: [
            { lineId: "2", particulars: particulars(reductionId, 500) },
            { lineId: "1", particulars: particulars(reductionId, 500) },
          ],
        };
        const first = await service.issueDocument(
          owner,
          id,
          input,
          "first-note",
        );
        expect(
          await service.issueDocument(owner, id, input, "first-note"),
        ).toEqual(first);
        const note = (await service.readDocument(
          owner,
          id,
          first.id,
        )) as import("@/lib/partner/dashboard/domain").RecordData;
        expect(note.seller).toEqual(original.seller);
        expect(note.customer).toEqual(original.customer);
        expect(note.original).toMatchObject({
          id: invoice.id,
          settingsRevision: original.settingsRevision,
        });
        expect(note.lines).toMatchObject([
          {
            id: "1",
            sourceId: reductionId,
            originalLineId: "2",
            originalSourceId: original.lines[1].sourceId,
            amountPaise: 500,
          },
          {
            id: "2",
            sourceId: reductionId,
            originalLineId: "1",
            originalSourceId: "booking",
            amountPaise: 500,
          },
        ]);
        const { printDocument } = await import("@/lib/partner/invoices/print");
        const printed = printDocument(note);
        expect(printed).toContain("Original invoice line: 2");
        expect(printed).not.toContain("Updated business name");
        w = await service.reviewInvoice(owner, id);
        const second = await service.issueDocument(
          owner,
          id,
          {
            ...input,
            expectedVersion: w.version,
            allocations: [
              { lineId: "2", particulars: particulars(reductionId, 500) },
            ],
          },
          "second-note",
        );
        const repeated = (await service.readDocument(
          owner,
          id,
          second.id,
        )) as import("@/lib/partner/dashboard/domain").RecordData;
        expect(repeated.lines[0]).toMatchObject({
          originalLineId: "2",
          originalSourceId: original.lines[1].sourceId,
          amountPaise: 500,
        });
        expect(await service.readDocument(owner, id, invoice.id)).toEqual(
          original,
        );
        expect(
          printDocument(await service.readDocument(owner, id, first.id)),
        ).toEqual(printed);
        const state = (
          await db
            .collection("bookings")
            .doc(id)
            .collection("invoiceWorkspace")
            .doc("state")
            .get()
        ).data()!;
        expect(state.credited[`${invoice.id}:2`].amountPaise).toBe(1000);
        expect(state.credited[`${invoice.id}:1`].amountPaise).toBe(500);
      } finally {
        const current = await service.readSettings(owner, hotel);
        await service.saveSettings(owner, hotel, {
          expectedRevision: current.revision,
          settings: previous.settings!,
        });
      }
    });
    it("documents partial and repeated reductions once without changing balances or refunds", async () => {
      const id = await booking(),
        original = await issue(id);
      await billing.commandFolio(
        owner,
        id,
        {
          action: "credit",
          expectedRevision: 0,
          amountPaise: 1000,
          description: "Goodwill reduction",
          category: "other",
          reason: "Agreed goodwill",
          details: { explanation: "Accountant approved adjustment" },
        },
        "credit",
      );
      let w = await service.reviewInvoice(owner, id);
      const reductionId = w.reductions.find(
        (l) => l.remainingPaise === 1000,
      )!.id;
      const before = (await db.collection("bookings").doc(id).get()).data();
      const input = () => ({
        action: "credit_note",
        expectedVersion: w.version,
        invoiceId: original.id,
        reductionId,
        reason: "Goodwill allocation",
        allocations: [
          { lineId: "1", particulars: particulars(reductionId, 500) },
        ],
      });
      const a = await service.issueDocument(owner, id, input(), "partial-a");
      w = await service.reviewInvoice(owner, id);
      const b = await service.issueDocument(owner, id, input(), "partial-b");
      expect(a.id).not.toBe(b.id);
      w = await service.reviewInvoice(owner, id);
      await expect(
        service.issueDocument(owner, id, input(), "too-much"),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_REQUIRED" });
      expect((await db.collection("bookings").doc(id).get()).data()).toEqual(
        before,
      );
      const entryId = reductionId.replace("entry:", "");
      await expect(
        billing.commandFolio(
          owner,
          id,
          {
            action: "void",
            expectedRevision: 1,
            originalEntryId: entryId,
            reason: "Try reversal",
          },
          "void",
        ),
      ).rejects.toMatchObject({ code: "DEBIT_NOTE_REQUIRED" });
    });
    it("uses only actual net correction reduction and protects documented families", async () => {
      const id = await booking();
      const charge = await billing.commandFolio(
        owner,
        id,
        {
          action: "post",
          expectedRevision: 0,
          amountPaise: 2000,
          description: "Laundry",
          category: "laundry",
          details: { explanation: "Cleaned garments" },
        },
        "post",
      );
      const original = await issue(id);
      await billing.commandFolio(
        owner,
        id,
        {
          action: "correct",
          expectedRevision: 1,
          originalEntryId: charge.id,
          amountPaise: 1500,
          description: "Correct laundry",
          category: "laundry",
          reason: "Reduced price",
          details: { explanation: "One garment less" },
        },
        "correct",
      );
      const w = await service.reviewInvoice(owner, id),
        reductionId = `entry:${charge.id}`;
      expect(
        w.reductions.find((l) => l.id === reductionId)?.remainingPaise,
      ).toBe(500);
      await expect(
        service.issueDocument(
          owner,
          id,
          {
            action: "credit_note",
            expectedVersion: w.version,
            invoiceId: original.id,
            reductionId,
            reason: "Reduced laundry",
            allocations: [
              { lineId: "2", particulars: particulars(reductionId, 1000) },
            ],
          },
          "gross",
        ),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_REQUIRED" });
      await service.issueDocument(
        owner,
        id,
        {
          action: "credit_note",
          expectedVersion: w.version,
          invoiceId: original.id,
          reductionId,
          reason: "Reduced laundry",
          allocations: [
            { lineId: "2", particulars: particulars(reductionId, 500) },
          ],
        },
        "net",
      );
      const entries = await db
        .collection("bookings")
        .doc(id)
        .collection("billingEntries")
        .get();
      const replacement = entries.docs.find(
        (d) => d.get("replacesEntryId") === charge.id,
      )!;
      await expect(
        billing.commandFolio(
          owner,
          id,
          {
            action: "correct",
            expectedRevision: 2,
            originalEntryId: replacement.id,
            amountPaise: 1800,
            description: "Increase laundry",
            category: "laundry",
            reason: "Try increase",
            details: { explanation: "Increase after note" },
          },
          "increase",
        ),
      ).rejects.toMatchObject({ code: "DEBIT_NOTE_REQUIRED" });
    });
    it("retains booked-extra ownership and documents only its actual saved decline", async () => {
      const id = await booking();
      const extra = {
        id: "breakfast",
        name: "Breakfast",
        settlement: "included",
        agreementVersion: 2,
        totalPaise: 2000,
        status: "confirmed",
      };
      await db
        .collection("bookings")
        .doc(id)
        .update({
          totalPaise: 12000,
          extrasTotalPaise: 2000,
          customizations: [extra],
        });
      const original = await issue(id),
        snapshot = (await service.readDocument(
          owner,
          id,
          original.id,
        )) as import("@/lib/partner/dashboard/domain").RecordData;
      expect(
        snapshot.lines.map((l: { sourceId: string }) => l.sourceId),
      ).toEqual(["booking", "extra:breakfast"]);
      await db
        .collection("bookings")
        .doc(id)
        .update({
          customizationCreditPaise: 2000,
          customizations: [{ ...extra, status: "declined" }],
        });
      const w = await service.reviewInvoice(owner, id);
      expect(
        w.reductions.find((l) => l.id === "extra:breakfast")?.remainingPaise,
      ).toBe(2000);
      const before = (await db.collection("bookings").doc(id).get()).data();
      await service.issueDocument(
        owner,
        id,
        {
          action: "credit_note",
          expectedVersion: w.version,
          invoiceId: original.id,
          reductionId: "extra:breakfast",
          reason: "Booked extra declined",
          allocations: [
            { lineId: "2", particulars: particulars("extra:breakfast", 2000) },
          ],
        },
        "extra-note",
      );
      expect((await db.collection("bookings").doc(id).get()).data()).toEqual(
        before,
      );
    });
    it("separates financial-year sequences without consuming failed numbers", async () => {
      const clock = vi.spyOn(invoiceDomain, "hotelDate");
      try {
        clock.mockReturnValue({ date: "2035-03-31", financialYear: "2034-35" });
        const a = await booking(),
          ra = await issue(a);
        clock.mockReturnValue({ date: "2035-04-01", financialYear: "2035-36" });
        const b = await booking(),
          rb = await issue(b);
        expect(ra.number).toBe("INV/3435/1");
        expect(rb.number).toBe("INV/3536/1");
        clock.mockReturnValue({ date: "2035-03-31", financialYear: "2034-35" });
        const c = await booking(),
          rc = await issue(c);
        expect(rc.number).toBe("INV/3435/2");
      } finally {
        clock.mockRestore();
      }
    });
    it("rejects stale seller and recipient details while retaining revision history", async () => {
      const id = await booking(),
        initial = await ready(id),
        settings = await service.readSettings(owner, hotel);
      await service.saveSettings(owner, hotel, {
        expectedRevision: settings.revision,
        settings: { ...settings.settings!, address: "New registered address" },
      });
      await expect(
        service.issueDocument(
          owner,
          id,
          { action: "invoice", expectedVersion: initial.version },
          "old-seller",
        ),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_STALE" });
      const current = await service.reviewInvoice(owner, id);
      await service.saveDocumentDetails(owner, id, {
        expectedVersion: current.version,
        details: {
          ...current.details!,
          customer: { ...customer, name: "Re-reviewed recipient" },
        },
      });
      await expect(
        service.issueDocument(
          owner,
          id,
          { action: "invoice", expectedVersion: current.version },
          "old-recipient",
        ),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_STALE" });
      const history = await service.readSettings(owner, hotel);
      expect(history.history[0].actorId).toBe(owner);
      expect(history.history[0].after.address).toBe("New registered address");
      expect(history.history[0].before.address).not.toBe(
        "New registered address",
      );
      const doc = await issue(id);
      expect(
        (
          (await service.readDocument(
            owner,
            id,
            doc.id,
          )) as import("@/lib/partner/dashboard/domain").RecordData
        ).customer.name,
      ).toBe(customer.name);
    });
    it("requires current activation and access even for committed request recovery", async () => {
      const id = await booking(),
        w = await ready(id),
        input = { action: "invoice", expectedVersion: w.version };
      const result = await service.issueDocument(
        owner,
        id,
        input,
        "access-retry",
      );
      const membership = db
        .collection("propertyMemberships")
        .doc(`${hotel}_${owner}`);
      await membership.update({ status: "revoked" });
      await expect(
        service.issueDocument(owner, id, input, "access-retry"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await membership.update({ status: "active" });
      expect(
        await service.issueDocument(owner, id, input, "access-retry"),
      ).toEqual(result);
      const p = db.collection("properties").doc(hotel),
        current = (await p.get()).get("pms");
      await p.update({ pms: {} });
      try {
        const next = await booking(),
          review = await service.reviewInvoice(owner, next);
        expect(review.blockers.join(" ")).toContain("Activate PMS");
        await expect(
          service.issueDocument(
            owner,
            next,
            { action: "invoice", expectedVersion: review.version },
            "inactive",
          ),
        ).rejects.toMatchObject({ code: "INVOICE_REVIEW_REQUIRED" });
      } finally {
        await p.update({ pms: current });
      }
    });
    it("issues registered tax snapshots and caps credited tax components transactionally", async () => {
      const registeredHotel = `${hotel}-registered`,
        id = await booking();
      const p = (await db.collection("properties").doc(hotel).get()).data()!;
      const s = {
        ...seller,
        registration: "registered",
        gstin: "27ABCDE1234F1Z5",
      };
      await db.collection("properties").doc(registeredHotel).set(p);
      await db
        .collection("propertyMemberships")
        .doc(`${registeredHotel}_${owner}`)
        .set({ propertyId: registeredHotel, role: "owner", status: "active" });
      for (const collection of [
        "roomTypes",
        "physicalUnits",
        "ratePlans",
        "cancellationPolicies",
      ]) {
        const records = await db
          .collection(collection)
          .where("propertyId", "==", hotel)
          .get();
        for (const record of records.docs)
          await db
            .collection(collection)
            .doc(`${record.id}-registered`)
            .set({
              ...record.data(),
              propertyId: registeredHotel,
              ...(record.get("roomTypeId")
                ? { roomTypeId: `${record.get("roomTypeId")}-registered` }
                : {}),
              ...(record.get("cancellationPolicyId")
                ? {
                    cancellationPolicyId: `${record.get("cancellationPolicyId")}-registered`,
                  }
                : {}),
            });
      }
      try {
        await service.saveSettings(owner, registeredHotel, {
          expectedRevision: 0,
          settings: s,
        });
        await db.collection("bookings").doc(id).update({
          propertyId: registeredHotel,
          totalPaise: 14,
          subtotalPaise: 12,
          taxPaise: 2,
        });
        let w = await service.reviewInvoice(owner, id);
        const p = {
          ...particulars("booking", 12),
          cgstRate: 9,
          sgstRate: 9,
          cgstPaise: 1,
          sgstPaise: 1,
        };
        await service.saveDocumentDetails(owner, id, {
          expectedVersion: w.version,
          details: {
            customer,
            accountantConfirmed: true,
            irpRequired: false,
            lines: [p],
          },
        });
        w = await service.reviewInvoice(owner, id);
        const original = await service.issueDocument(
          owner,
          id,
          { action: "invoice", expectedVersion: w.version },
          "tax",
        );
        const snap = (await service.readDocument(
          owner,
          id,
          original.id,
        )) as import("@/lib/partner/dashboard/domain").RecordData;
        expect(snap.documentType).toBe("tax_invoice");
        expect(snap.taxBreakdown.cgstPaise).toBe(1);
        await billing.commandFolio(
          owner,
          id,
          {
            action: "credit",
            expectedRevision: 0,
            amountPaise: 14,
            category: "other",
            description: "Approved reduction",
            reason: "Accountant approved",
            details: { explanation: "Existing folio reduction" },
          },
          "tax-reduce",
        );
        w = await service.reviewInvoice(owner, id);
        const reductionId = w.reductions.find(
          (l) => l.remainingPaise === 14,
        )!.id;
        const makeInput = () => ({
          action: "credit_note",
          expectedVersion: w.version,
          invoiceId: original.id,
          reductionId,
          reason: "Partial tax allocation",
          allocations: [
            {
              lineId: "1",
              particulars: { ...p, sourceId: reductionId, taxablePaise: 6 },
            },
          ],
        });
        await service.issueDocument(owner, id, makeInput(), "tax-partial");
        w = await service.reviewInvoice(owner, id);
        await expect(
          service.issueDocument(owner, id, makeInput(), "tax-overcap"),
        ).rejects.toMatchObject({
          code: "INVOICE_REVIEW_REQUIRED",
          message: expect.stringContaining("tax components"),
        });
      } finally {
        await db.recursiveDelete(db.collection("bookings").doc(id));
        for (const collection of [
          "invoices",
          "propertyMemberships",
          "roomTypes",
          "physicalUnits",
          "ratePlans",
          "cancellationPolicies",
        ]) {
          const docs = await db
            .collection(collection)
            .where("propertyId", "==", registeredHotel)
            .get();
          for (const d of docs.docs) await db.recursiveDelete(d.ref);
        }
        await db.recursiveDelete(
          db.collection("properties").doc(registeredHotel),
        );
      }
    });
    it("blocks missing provenance, legacy reconciliation, IRP, unsupported fees and stale customer details", async () => {
      const id = await booking();
      const w = await service.reviewInvoice(owner, id);
      expect(w.blockers.length).toBeGreaterThan(0);
      await expect(
        service.issueDocument(
          owner,
          id,
          { action: "invoice", expectedVersion: w.version },
          "missing",
        ),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_REQUIRED" });
      const r = await ready(id);
      await service.saveDocumentDetails(owner, id, {
        expectedVersion: r.version,
        details: { ...r.details, irpRequired: true },
      });
      const irp = await service.reviewInvoice(owner, id);
      await expect(
        service.issueDocument(
          owner,
          id,
          { action: "invoice", expectedVersion: irp.version },
          "irp",
        ),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_REQUIRED" });
      await expect(
        service.issueDocument(
          owner,
          id,
          { action: "invoice", expectedVersion: r.version },
          "old",
        ),
      ).rejects.toMatchObject({ code: "INVOICE_REVIEW_STALE" });
      await db.collection("bookings").doc(id).update({ customerFeePaise: 100 });
      expect(
        (await service.reviewInvoice(owner, id)).blockers.join(" "),
      ).toContain("ownership");
    });
  },
);
