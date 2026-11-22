import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { DEFAULT_POLICY, EMPTY_PROFILE } from "@/lib/finance/domain";
import { staffRoles } from "@/lib/partner/pms/domain";
const safe = /^(127\.0\.0\.1|localhost):\d+$/.test(
  process.env.FIRESTORE_EMULATOR_HOST || "",
);
describe.skipIf(!safe)(
  "finance transactions on disposable emulator records",
  () => {
    let db: typeof import("@/lib/firebase/admin").adminDb;
    let service: typeof import("@/lib/finance/service");
    let middleware: typeof import("@/lib/partner/pms/route-access").authorizePartnerRequest;
    const prefix = `finance-${crypto.randomUUID()}`,
      owner = `${prefix}-owner`,
      admin = `${prefix}-admin`,
      hotel = `${prefix}-hotel`,
      other = `${prefix}-other`,
      doc = `${prefix}-doc`;
    const profile = {
      ...EMPTY_PROFILE,
      legalPayeeName: "Finance Test",
      businessAddress: "Mumbai",
      businessEmail: "test@example.com",
      businessPhone: "9876543210",
      pan: "ABCDE1234F",
      documentIds: [doc],
    };
    let originalGlobal: FirebaseFirestore.DocumentData | undefined,
      originalAgreement: FirebaseFirestore.DocumentData | undefined;
    const command = (v: object) => ({
      mutationId: crypto.randomUUID(),
      reason: "Finance test",
      ...v,
    });
    const read = async () =>
      (await service.readFinance(owner, hotel)) as {
        global: { revision: number };
        overrideRevision: number;
        profileRevision: number;
        profileState: string;
        readiness: { agreementAcceptance: boolean; payoutsEnabled: boolean };
        review: unknown;
      };
    beforeAll(async () => {
      process.env.FIREBASE_ADMIN_PROJECT_ID = "demo-helpkey-finance";
      process.env.BACKGROUND_MODE = "legacy";
      db = (await import("@/lib/firebase/admin")).adminDb;
      service = await import("@/lib/finance/service");
      middleware = (await import("@/lib/partner/pms/route-access"))
        .authorizePartnerRequest;
      originalGlobal = (
        await db.doc("financeConfiguration/global").get()
      ).data();
      originalAgreement = (
        await db.doc("financeConfiguration/agreements").get()
      ).data();
      for (const [id, roles] of [
        [owner, ["partner"]],
        [admin, ["admin"]],
        ...staffRoles.map((r) => [`${prefix}-${r}`, ["partner"]]),
      ] as [string, string[]][])
        await db
          .doc(`users/${id}`)
          .set({ roles, isActive: true, accountStatus: "active" });
      for (const id of [hotel, other])
        await db
          .doc(`properties/${id}`)
          .set({ ownerId: owner, status: "draft" });
      for (const role of ["owner", ...staffRoles]) {
        const uid = role === "owner" ? owner : `${prefix}-${role}`;
        await db.doc(`propertyMemberships/${hotel}_${uid}`).set({
          propertyId: hotel,
          userId: uid,
          status: "active",
          role,
          permissions: ["*"],
        });
      }
      await db
        .doc(`verificationDocuments/${doc}`)
        .set({ propertyId: hotel, documentType: "pan" });
    });
    afterAll(async () => {
      for (const collection of ["financeAudit", "financeMutations"]) {
        const rows = await db
          .collection(collection)
          .where("actorId", "in", [owner, admin])
          .get();
        for (const row of rows.docs) await db.recursiveDelete(row.ref);
      }
      for (const id of [hotel, other]) {
        await db.recursiveDelete(db.doc(`propertyFinance/${id}`));
        await db.doc(`properties/${id}`).delete();
      }
      for (const role of ["owner", ...staffRoles]) {
        const uid = role === "owner" ? owner : `${prefix}-${role}`;
        await db.doc(`propertyMemberships/${hotel}_${uid}`).delete();
        await db.doc(`users/${uid}`).delete();
      }
      await db.doc(`users/${admin}`).delete();
      await db.doc(`verificationDocuments/${doc}`).delete();
      // Restore only emulator test configuration; never clear an emulator/database.
      for (const [name, original] of [
        ["global", originalGlobal],
        ["agreements", originalAgreement],
      ] as const) {
        const ref = db.doc(`financeConfiguration/${name}`);
        const versions = await ref
          .collection("versions")
          .where("updatedBy", "==", admin)
          .get();
        for (const d of versions.docs) await d.ref.delete();
        if (original) await ref.set(original);
        else await ref.delete();
      }
    });
    it("authorizes Admin and owner without PMS; denies every staff role and cross-property requests", async () => {
      await expect(
        service.readFinance(admin, hotel, true),
      ).resolves.toBeTruthy();
      await expect(read()).resolves.toBeTruthy();
      for (const role of staffRoles) {
        const uid = `${prefix}-${role}`;
        await expect(service.readFinance(uid, hotel)).rejects.toMatchObject({
          status: 403,
        });
        await expect(
          middleware(
            uid,
            new Request(`http://local/api/partner/properties/${hotel}/finance`),
          ),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          middleware(
            uid,
            new Request(
              `http://local/api/partner/properties/${hotel}/finance`,
              {
                method: "POST",
                body: JSON.stringify(
                  command({
                    action: "profile",
                    expectedRevision: 0,
                    profile,
                    submit: false,
                  }),
                ),
              },
            ),
          ),
        ).rejects.toMatchObject({ status: 403 });
      }
      await expect(service.readFinance(owner, other)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        middleware(
          owner,
          new Request(`http://local/api/partner/properties/${hotel}/finance`),
        ),
      ).resolves.toBeUndefined();
      await expect(
        service.mutateFinance(
          owner,
          command({
            action: "global",
            expectedRevision: 0,
            policy: DEFAULT_POLICY,
          }),
          undefined,
          false,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("allows only one simultaneous founder save and atomically records audit", async () => {
      const revision = (await read()).global.revision;
      const a = command({
        action: "global",
        expectedRevision: revision,
        policy: DEFAULT_POLICY,
      });
      const b = command({
        action: "global",
        expectedRevision: revision,
        policy: { ...DEFAULT_POLICY, roomCommissionBps: 1100 },
      });
      const results = await Promise.allSettled([
        service.mutateFinance(admin, a, undefined, true),
        service.mutateFinance(admin, b, undefined, true),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
      const events = await db
        .collection("financeAudit")
        .where("actorId", "==", admin)
        .where("action", "==", "global")
        .get();
      expect(events.size).toBe(1);
      expect(events.docs[0].get("revision")).toBe(revision + 1);
      expect(events.docs[0].get("createdAt").toDate()).toBeInstanceOf(Date);
    });
    it("rejects stale global and override forms, clearing restores live inheritance", async () => {
      const state = await read();
      await expect(
        service.mutateFinance(
          admin,
          command({
            action: "overrides",
            expectedRevision: 0,
            globalRevision: state.global.revision - 1,
            overrides: { roomCommissionBps: 500 },
          }),
          hotel,
          true,
        ),
      ).rejects.toMatchObject({ status: 409 });
      const c = command({
        action: "overrides",
        expectedRevision: 0,
        globalRevision: state.global.revision,
        overrides: { roomCommissionBps: 500 },
      });
      await service.mutateFinance(admin, c, hotel, true);
      await expect(
        service.mutateFinance(
          admin,
          { ...c, mutationId: crypto.randomUUID() },
          hotel,
          true,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await service.mutateFinance(
        admin,
        command({
          action: "overrides",
          expectedRevision: 1,
          globalRevision: state.global.revision,
          overrides: {},
        }),
        hotel,
        true,
      );
      expect(await service.readFinance(owner, hotel)).toMatchObject({
        overrides: {},
        sources: { roomCommissionBps: "global" },
      });
    });
    it("returns the original result on exact retries; rejects conflicting reuse", async () => {
      const c = command({
        action: "profile",
        expectedRevision: 0,
        profile,
        submit: true,
      });
      const result = await service.mutateFinance(owner, c, hotel);
      expect(await service.mutateFinance(owner, c, hotel)).toEqual(result);
      await expect(
        service.mutateFinance(owner, { ...c, reason: "Changed reason" }, hotel),
      ).rejects.toMatchObject({ status: 409, code: "MUTATION_REUSED" });
      const events = await db
        .collection("financeAudit")
        .where("actorId", "==", owner)
        .get();
      expect(events.size).toBe(1);
      await expect(
        service.mutateFinance(
          owner,
          command({
            action: "profile",
            expectedRevision: 0,
            profile,
            submit: false,
          }),
          hotel,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("records changes requested and invalidates manual review after edits", async () => {
      let state = await read();
      await service.mutateFinance(
        admin,
        command({
          action: "review",
          expectedRevision: state.profileRevision,
          decision: "changes_requested",
          notes: "Please review business address",
        }),
        hotel,
        true,
      );
      state = await read();
      expect(state.profileState).toBe("changes_requested");
      await service.mutateFinance(
        owner,
        command({
          action: "profile",
          expectedRevision: state.profileRevision,
          profile,
          submit: true,
        }),
        hotel,
      );
      state = await read();
      await service.mutateFinance(
        admin,
        command({
          action: "review",
          expectedRevision: state.profileRevision,
          decision: "manually_reviewed",
          notes: "Documents reviewed",
        }),
        hotel,
        true,
      );
      expect(await read()).toMatchObject({
        profileState: "manually_reviewed",
        readiness: { payoutsEnabled: false },
      });
      state = await read();
      await service.mutateFinance(
        owner,
        command({
          action: "profile",
          expectedRevision: state.profileRevision,
          profile: { ...profile, businessAddress: "Pune" },
          submit: true,
        }),
        hotel,
      );
      expect(await read()).toMatchObject({
        profileState: "submitted",
        review: null,
      });
    });
    it("preserves version acceptances, requires renewed acceptance and invalidates on edits", async () => {
      const current =
        (await db.doc("financeConfiguration/agreements").get()).get(
          "revision",
        ) ?? 0;
      await service.mutateFinance(
        admin,
        command({
          action: "publish",
          expectedRevision: current,
          title: "Terms 1",
          documentUrl: "https://example.com/1",
        }),
        undefined,
        true,
      );
      let state = await read();
      await service.mutateFinance(
        owner,
        command({
          action: "accept",
          expectedRevision: state.profileRevision,
          agreementVersion: current + 1,
        }),
        hotel,
      );
      expect((await read()).readiness.agreementAcceptance).toBe(true);
      state = await read();
      await service.mutateFinance(
        admin,
        command({
          action: "review",
          expectedRevision: state.profileRevision,
          decision: "manually_reviewed",
          notes: "Review complete",
        }),
        hotel,
        true,
      );
      expect((await read()).readiness.agreementAcceptance).toBe(true);
      await service.mutateFinance(
        admin,
        command({
          action: "publish",
          expectedRevision: current + 1,
          title: "Terms 2",
          documentUrl: "https://example.com/2",
        }),
        undefined,
        true,
      );
      expect((await read()).readiness.agreementAcceptance).toBe(false);
      state = await read();
      await expect(
        service.mutateFinance(
          owner,
          command({
            action: "accept",
            expectedRevision: state.profileRevision,
            agreementVersion: current + 1,
          }),
          hotel,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await service.mutateFinance(
        owner,
        command({
          action: "accept",
          expectedRevision: state.profileRevision,
          agreementVersion: current + 2,
        }),
        hotel,
      );
      expect(
        (
          await db
            .doc(`propertyFinance/${hotel}/profiles/current`)
            .collection("acceptances")
            .get()
        ).size,
      ).toBe(2);
      state = await read();
      await service.mutateFinance(
        owner,
        command({
          action: "profile",
          expectedRevision: state.profileRevision,
          profile,
          submit: false,
        }),
        hotel,
      );
      expect((await read()).readiness.agreementAcceptance).toBe(false);
      const history = await service.financeHistory(admin);
      expect(JSON.stringify(history)).not.toContain(profile.pan);
      expect(history.events.length).toBeGreaterThan(0);
    });
    it("keeps profiles property-specific and rejects foreign documents atomically", async () => {
      await db
        .doc(`propertyMemberships/${other}_${owner}`)
        .set({
          propertyId: other,
          userId: owner,
          status: "active",
          role: "owner",
        });
      expect(await service.readFinance(owner, other)).toMatchObject({
        profile: EMPTY_PROFILE,
        profileRevision: 0,
      });
      const state = await read();
      const before = (
        await db.collection("financeAudit").where("actorId", "==", owner).get()
      ).size;
      await db
        .doc(`verificationDocuments/${doc}-foreign`)
        .set({ propertyId: other });
      try {
        await expect(
          service.mutateFinance(
            owner,
            command({
              action: "profile",
              expectedRevision: state.profileRevision,
              profile: { ...profile, documentIds: [`${doc}-foreign`] },
              submit: true,
            }),
            hotel,
          ),
        ).rejects.toMatchObject({ status: 422 });
        expect(
          (
            await db
              .collection("financeAudit")
              .where("actorId", "==", owner)
              .get()
          ).size,
        ).toBe(before);
      } finally {
        await db.doc(`verificationDocuments/${doc}-foreign`).delete();
        await db.doc(`propertyMemberships/${other}_${owner}`).delete();
      }
    });
    it("revalidates supporting documents for review, acceptance and readiness", async () => {
      const document = db.doc(`verificationDocuments/${doc}`);
      const currentProfile = db.doc(`propertyFinance/${hotel}/profiles/current`);
      const validDocument = { propertyId: hotel, documentType: "pan" };
      const agreementVersion = (await db.doc("financeConfiguration/agreements").get()).get("revision");
      try {
        for (const change of [null, { deletedAt: new Date() }, { propertyId: other }, { status: "rejected" }]) {
          await document.set(validDocument);
          let state = await read();
          await service.mutateFinance(owner, command({
            action: "profile", expectedRevision: state.profileRevision, profile, submit: true,
          }), hotel);
          state = await read();
          if (change) await document.update(change);
          else await document.delete();
          const auditBefore = (await db.collection("financeAudit").where("propertyId", "==", hotel).get()).size;
          for (const [uid, action, isAdmin] of [
            [admin, { action: "review", decision: "manually_reviewed", notes: "Check current evidence" }, true],
            [owner, { action: "accept", agreementVersion }, false],
          ] as const) {
            await expect(service.mutateFinance(uid, command({
              ...action, expectedRevision: state.profileRevision,
            }), hotel, isAdmin)).rejects.toMatchObject({ code: "INVALID_DOCUMENT", status: 422 });
          }
          expect((await currentProfile.get()).get("revision")).toBe(state.profileRevision);
          expect((await db.collection("financeAudit").where("propertyId", "==", hotel).get()).size).toBe(auditBefore);
          expect(await read()).toMatchObject({
            readiness: { documents: false, manualReview: false, canSubmit: false },
          });
        }
        // Requesting corrections must still work when evidence is missing.
        await document.delete();
        let state = await read();
        await service.mutateFinance(admin, command({
          action: "review", expectedRevision: state.profileRevision,
          decision: "changes_requested", notes: "Replace missing supporting documents",
        }), hotel, true);
        await document.set(validDocument);
        state = await read();
        await service.mutateFinance(owner, command({
          action: "profile", expectedRevision: state.profileRevision, profile, submit: true,
        }), hotel);
        state = await read();
        await service.mutateFinance(admin, command({
          action: "review", expectedRevision: state.profileRevision,
          decision: "manually_reviewed", notes: "Current documents reviewed",
        }), hotel, true);
        expect(await read()).toMatchObject({ readiness: { documents: true, manualReview: true } });
        await document.delete();
        expect(await read()).toMatchObject({ readiness: { documents: false, manualReview: false } });
      } finally {
        await document.set(validDocument);
      }
    });
    it("rechecks revoked membership and Admin account in writes and retries", async () => {
      const state = await read();
      const c = command({
        action: "profile",
        expectedRevision: state.profileRevision,
        profile,
        submit: false,
      });
      await service.mutateFinance(owner, c, hotel);
      await db
        .doc(`propertyMemberships/${hotel}_${owner}`)
        .update({ status: "revoked" });
      await expect(
        service.mutateFinance(owner, c, hotel),
      ).rejects.toMatchObject({ status: 403 });
      await expect(service.readFinance(owner, hotel)).rejects.toMatchObject({
        status: 403,
      });
      await db.doc(`users/${admin}`).update({ isActive: false });
      await expect(
        service.mutateFinance(
          admin,
          command({
            action: "global",
            expectedRevision: state.global.revision,
            policy: DEFAULT_POLICY,
          }),
          undefined,
          true,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });
  },
);
