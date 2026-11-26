import "server-only";
import { z } from "zod";
import { adminDb as db } from "../firebase/admin";
import { authorizeFinanceAdmin } from "../finance-settings/service";
import { policySchema, canonical } from "../finance-settings/domain";
import { propertyAccess } from "../partner/pms/access";
import { onboardingSchema } from "../partner/service";
import {
  settingsSchema,
  assertInvoiceIdentityUnlocked,
} from "../partner/invoices/domain";
import { ApiException } from "../api/errors";
import { hash } from "../accounting/domain";
import {
  bankSchema,
  businessComplete,
  commercialTerms,
  readinessStatus,
  type Business,
  type MaskedBank,
} from "./domain";
import {
  bankStorageAvailable,
  protectedFingerprint,
  encryptAccount,
  decryptAccount,
} from "./crypto";
export const bankCollection = "hotelPrivateBanksV1";
export const reviewCollection = "hotelPayoutReadinessV1";
const ref = (p: string) => db.collection(reviewCollection).doc(p);
const validId = z
  .string()
  .min(1)
  .max(200)
  .refine((v) => !v.includes("/"));
const sections = z.enum(["business", "bank", "commercial"]);
const common = {
  requestId: z.string().uuid(),
  expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
};
const profileSchema = z
  .object({
    businessName: onboardingSchema.shape.businessName,
    businessAddress: onboardingSchema.shape.businessAddress,
    businessEmail: z.union([
      onboardingSchema.shape.businessEmail,
      z.literal(""),
    ]),
    businessPhone: z.union([
      onboardingSchema.shape.businessPhone,
      z.literal(""),
    ]),
  })
  .strict()
  .refine(
    (v) => v.businessEmail || v.businessPhone,
    "At least one business contact is required.",
  );
const invoiceIdentity = z
  .object({
    legalName: settingsSchema.shape.legalName,
    address: settingsSchema.shape.address,
    contact: settingsSchema.shape.contact,
    state: settingsSchema.shape.state,
    stateCode: settingsSchema.shape.stateCode,
    registration: settingsSchema.shape.registration,
    gstin: settingsSchema.shape.gstin,
  })
  .strict();
const commands = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("bank"), bank: bankSchema }).strict(),
  z
    .object({
      ...common,
      action: z.literal("review"),
      section: sections,
      note: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({ ...common, action: z.literal("profile"), profile: profileSchema })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("invoice"),
      identity: invoiceIdentity,
    })
    .strict(),
]);
async function authorize(
  uid: string,
  p: string,
  tx: FirebaseFirestore.Transaction,
  owner: boolean,
) {
  validId.parse(p);
  if (!owner) return authorizeFinanceAdmin(uid, tx);
  const a = await propertyAccess(uid, p, "property.manage", tx);
  if (
    a.role !== "owner" ||
    (a.property.ownerId || a.property.partnerId) !== uid
  )
    throw new ApiException(
      "FORBIDDEN",
      403,
      "Current hotel owner access required.",
    );
}
/** Server transaction input only. Never return this object from an API. */
export async function readinessInTransaction(
  tx: FirebaseFirestore.Transaction,
  p: string,
) {
  const property = await tx.get(db.collection("properties").doc(p));
  if (!property.exists) throw new ApiException("NOT_FOUND", 404);
  const ownerId = String(
    property.get("ownerId") || property.get("partnerId") || "",
  );
  const [profile, invoice, bank, reviews, global, local] = await Promise.all([
    ownerId
      ? tx.get(db.collection("partnerProfiles").doc(ownerId))
      : Promise.resolve(null),
    tx.get(property.ref.collection("invoiceConfiguration").doc("current")),
    tx.get(db.collection(bankCollection).doc(p)),
    tx.get(ref(p)),
    tx.get(db.collection("hotelFinanceSettingsV1").doc("global")),
    tx.get(db.collection("hotelFinanceSettingsV1").doc(`hotel_${p}`)),
  ]);
  const i = invoice.get("settings"),
    b = profile?.data() ?? {};
  const business: Business = i
    ? {
        source: "invoice",
        country: i.country ?? null,
        businessName: i.legalName ?? "",
        address: i.address ?? "",
        contact: i.contact ?? "",
        registration: i.registration ?? null,
        gstin: i.gstin ?? null,
        pan: null,
        state: i.state ?? null,
        stateCode: i.stateCode ?? null,
      }
    : {
        source: "profile",
        country: b.businessAddress?.countryCode ?? null,
        businessName: b.businessName ?? "",
        address: b.businessAddress ?? null,
        contact: [b.businessEmail, b.businessPhone].filter(Boolean).join(" · "),
        gstin: b.gstin ?? null,
        pan: b.pan ?? null,
        registration: null,
        state: null,
        stateCode: null,
      };
  const bankVersion = hash([p, ownerId, bank.get("version") ?? 0]);
  const masked: MaskedBank | null =
    bank.get("ownerId") === ownerId && bank.exists
      ? {
          holderName: bank.get("holderName"),
          maskedAccount: bank.get("maskedAccount"),
          ifsc: bank.get("ifsc"),
          bankName: bank.get("bankName"),
          version: bankVersion,
        }
      : null;
  const commercial = commercialTerms(
    policySchema.parse(global.get("settings") ?? {}),
    policySchema.parse(local.get("settings") ?? {}),
  );
  const fingerprints = {
    business: hash([ownerId, business]),
    bank: bankVersion,
    commercial: hash([ownerId, commercial.fingerprintInput]),
  };
  const complete = {
    business:
      businessComplete(business) &&
      (!i ||
        invoiceIdentity.safeParse(
          Object.fromEntries(
            Object.keys(invoiceIdentity.shape).map((k) => [k, i[k]]),
          ),
        ).success),
    bank: !!masked,
    commercial: commercial.complete,
  };
  const reviewData = reviews.data() ?? {};
  const reviewed = {
    business: reviewData.business?.fingerprint === fingerprints.business,
    bank: !!masked && reviewData.bank?.fingerprint === fingerprints.bank,
    commercial: reviewData.commercial?.fingerprint === fingerprints.commercial,
  };
  const version = hash([fingerprints, reviewData]);
  return {
    ownerId,
    property,
    profile,
    invoice,
    bank,
    reviews,
    business,
    masked,
    commercial,
    fingerprints,
    complete,
    reviewed,
    version,
    bankVersion,
  };
}
function view(
  s: Awaited<ReturnType<typeof readinessInTransaction>>,
  owner: boolean,
) {
  const reviews = s.reviews.data() ?? {};
  return {
    propertyId: s.property.id,
    hotelName: String(s.property.get("name") ?? s.property.id),
    version: s.version,
    bankVersion: s.bankVersion,
    bank: s.masked,
    storageAvailable: bankStorageAvailable(),
    ...(owner
      ? {}
      : {
          business: s.business,
          profile:
            s.business.source === "profile"
              ? {
                  businessName: s.profile?.get("businessName") ?? "",
                  businessAddress: {
                    countryCode: "IN",
                    ...(s.profile?.get("businessAddress") ?? {}),
                  },
                  businessEmail: s.profile?.get("businessEmail") ?? "",
                  businessPhone: s.profile?.get("businessPhone") ?? "",
                }
              : null,
          invoiceUsed: s.invoice.get("used") === true,
          invoiceIdentity:
            s.business.source === "invoice"
              ? Object.fromEntries(
                  Object.keys(invoiceIdentity.shape).map((k) => [
                    k,
                    s.invoice.get(`settings.${k}`),
                  ]),
                )
              : null,
          commercial: s.commercial.values,
          complete: s.complete,
          reviewed: s.reviewed,
          reviews: Object.fromEntries(
            ["business", "bank", "commercial"].map((k) => [
              k,
              reviews[k]
                ? {
                    note: reviews[k].note,
                    actorId: reviews[k].actorId,
                    at: reviews[k].at,
                    current: s.reviewed[k as keyof typeof s.reviewed],
                  }
                : null,
            ]),
          ),
          ...readinessStatus(s.complete, s.reviewed),
        }),
  };
}
export async function readReadiness(uid: string, p: string, owner = false) {
  return db.runTransaction(async (tx) => {
    await authorize(uid, p, tx, owner);
    return view(await readinessInTransaction(tx, p), owner);
  });
}
export async function revealBank(
  uid: string,
  p: string,
  raw: unknown,
  owner = false,
) {
  const input = z
    .object({ expectedBankVersion: z.string() })
    .strict()
    .parse(raw);
  return db.runTransaction(async (tx) => {
    await authorize(uid, p, tx, owner);
    const s = await readinessInTransaction(tx, p);
    if (!s.masked || input.expectedBankVersion !== s.bankVersion)
      throw new ApiException(
        "BANK_CHANGED",
        409,
        "Bank details changed. Refresh before revealing.",
      );
    const accountNumber = decryptAccount(
      s.bank.get("encryptedAccount"),
      canonical([p, s.ownerId]),
    );
    tx.create(ref(p).collection("revealHistory").doc(), {
      actorId: uid,
      at: new Date().toISOString(),
      bankVersion: s.bankVersion,
    });
    return { accountNumber };
  });
}
export async function readinessCommand(
  uid: string,
  p: string,
  raw: unknown,
  owner = false,
) {
  const input = commands.parse(raw);
  if (owner && input.action !== "bank")
    throw new ApiException("FORBIDDEN", 403);
  return db.runTransaction(async (tx) => {
    await authorize(uid, p, tx, owner);
    const fingerprint =
      input.action === "bank"
        ? protectedFingerprint(canonical(input))
        : hash(input);
    const s = await readinessInTransaction(tx, p);
    const receiptRef = ref(p)
      .collection("requests")
      .doc(hash([uid, s.ownerId, input.requestId]));
    const receipt = await tx.get(receiptRef);
    if (receipt.exists) {
      if (receipt.get("fingerprint") !== fingerprint)
        throw new ApiException(
          "IDEMPOTENCY_CONFLICT",
          409,
          "Request ID was used with different content.",
        );
      return receipt.get("result") as { changed: boolean };
    }
    if (s.version !== input.expectedVersion)
      throw new ApiException(
        "READINESS_CONFLICT",
        409,
        "Information changed. Your draft is retained. Refresh and review before saving again.",
      );
    const at = new Date().toISOString();
    let changed = true;
    if (input.action === "bank") {
      const { accountNumber, holderName, ifsc, bankName } = input.bank;
      const fields = { holderName, ifsc, bankName };
      const dataFingerprint = protectedFingerprint(
        canonical([s.ownerId, fields, accountNumber]),
      );
      changed = s.bank.get("dataFingerprint") !== dataFingerprint;
      if (changed) {
        const maskedAccount = `•••• ${accountNumber.slice(-4)}`,
          version = (s.bank.get("version") ?? 0) + 1;
        const after = {
          ...fields,
          maskedAccount,
          version: hash([p, s.ownerId, version]),
        };
        tx.set(s.bank.ref, {
          ...fields,
          maskedAccount,
          version,
          ownerId: s.ownerId,
          dataFingerprint,
          encryptedAccount: encryptAccount(
            accountNumber,
            canonical([p, s.ownerId]),
          ),
          actorId: uid,
          at,
        });
        tx.set(ref(p), { bank: null }, { merge: true });
        tx.create(ref(p).collection("bankHistory").doc(String(version)), {
          before: s.masked,
          after,
          actorId: uid,
          at,
        });
      }
    } else if (input.action === "review") {
      if (!s.complete[input.section])
        throw new ApiException(
          "SETUP_INCOMPLETE",
          409,
          "Complete this section before marking it Reviewed.",
        );
      tx.create(ref(p).collection("reviewHistory").doc(input.requestId), {
        section: input.section,
        fingerprint: s.fingerprints[input.section],
        actorId: uid,
        at,
        note: input.note,
      });
      tx.set(
        ref(p),
        {
          [input.section]: {
            fingerprint: s.fingerprints[input.section],
            actorId: uid,
            at,
            note: input.note,
          },
        },
        { merge: true },
      );
    } else if (input.action === "profile") {
      if (s.business.source !== "profile" || !s.profile)
        throw new ApiException(
          "IDENTITY_SOURCE_CHANGED",
          409,
          "Refresh and use the configured invoice identity editor.",
        );
      const before = Object.fromEntries(
        Object.keys(input.profile).map((k) => [k, s.profile!.get(k) ?? null]),
      );
      changed = canonical(before) !== canonical(input.profile);
      if (changed) {
        tx.set(
          s.profile.ref,
          { ...input.profile, updatedBy: uid, updatedAt: at },
          { merge: true },
        );
        tx.create(ref(p).collection("businessHistory").doc(input.requestId), {
          actorId: uid,
          at,
          before,
          after: input.profile,
          sharedProfile: true,
        });
      }
    } else {
      if (s.business.source !== "invoice")
        throw new ApiException("IDENTITY_SOURCE_CHANGED", 409);
      const settings = settingsSchema.parse({
        ...s.invoice.get("settings"),
        ...input.identity,
      });
      assertInvoiceIdentityUnlocked(
        s.invoice.get("settings"),
        settings,
        !!s.invoice.get("used"),
      );
      changed = canonical(settings) !== canonical(s.invoice.get("settings"));
      if (changed) {
        const revision = (s.invoice.get("revision") ?? 0) + 1;
        tx.update(s.invoice.ref, { settings, revision });
        tx.create(s.invoice.ref.collection("history").doc(String(revision)), {
          revision,
          actorId: uid,
          createdAt: at,
          before: s.invoice.get("settings"),
          after: settings,
        });
      }
    }
    const result = { changed };
    tx.create(receiptRef, { fingerprint, result, actorId: uid, at });
    return result;
  });
}
