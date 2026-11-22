import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { apiContext } from "@/lib/api/context";
import { propertyAccess } from "@/lib/partner/pms/access";
import {
  commandSchema,
  DEFAULT_POLICY,
  EMPTY_PROFILE,
  maskTaxIdentifiers,
  profileReadiness,
  resolvePolicy,
  supportingDocumentsValid,
  type FinanceProfile,
  type FinanceOverrides,
  type FinancePolicy,
} from "./domain";
const root = () => adminDb.collection("financeConfiguration");
const globalRef = () => root().doc("global");
const agreementRef = () => root().doc("agreements");
const hotelRef = (id: string) => adminDb.collection("propertyFinance").doc(id);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function requireSupportingDocuments(
  tx: FirebaseFirestore.Transaction,
  propertyId: string,
  profile: FinanceProfile,
) {
  const documents = await Promise.all(
    profile.documentIds.map((id) =>
      tx.get(adminDb.collection("verificationDocuments").doc(id)),
    ),
  );
  if (
    !supportingDocumentsValid(
      profile,
      propertyId,
      documents
        .filter((d) => d.exists)
        .map((d) => ({
          id: d.id,
          propertyId: d.get("propertyId"),
          deletedAt: d.get("deletedAt"),
          status: d.get("status"),
        })),
    )
  )
    throw new ApiException(
      "INVALID_DOCUMENT",
      422,
      "Select current, non-rejected supporting documents belonging to this hotel and resubmit the profile.",
    );
}
function stable(v: unknown): string {
  return JSON.stringify(
    v && typeof v === "object"
      ? Array.isArray(v)
        ? v.map((x) => JSON.parse(stable(x)))
        : Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, JSON.parse(stable(x))]),
          )
      : v,
  );
}
function conflict() {
  throw new ApiException(
    "FINANCE_CONFLICT",
    409,
    "Finance information changed. Your draft is retained. Load current values and review your draft before retrying.",
  );
}
export function serializeFinance(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(serializeFinance);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, serializeFinance(x)]),
    );
  return v;
}
async function adminAccess(uid: string, tx: FirebaseFirestore.Transaction) {
  const user = await tx.get(adminDb.collection("users").doc(uid));
  if (
    !user.get("roles")?.includes("admin") ||
    user.get("isActive") !== true ||
    user.get("accountStatus") !== "active"
  )
    throw new ApiException("FORBIDDEN", 403, "Active Admin access required.");
}
export async function financeAccess(
  uid: string,
  propertyId: string | undefined,
  admin: boolean,
  tx: FirebaseFirestore.Transaction,
  write = false,
) {
  if (admin) {
    await adminAccess(uid, tx);
    if (
      propertyId &&
      !(await tx.get(adminDb.collection("properties").doc(propertyId))).exists
    )
      throw new ApiException("NOT_FOUND", 404, "Hotel not found.");
  } else {
    if (!propertyId) throw new ApiException("FORBIDDEN", 403);
    const a = await propertyAccess(
      uid,
      propertyId,
      write ? "finance.profile.manage" : "finance.read",
      tx,
    );
    const ownerId = a.property.ownerId || a.property.partnerId;
    if (ownerId && ownerId !== uid) {
      const owner = await tx.get(adminDb.collection("users").doc(ownerId));
      if (
        owner.get("isActive") !== true ||
        owner.get("accountStatus") !== "active"
      )
        throw new ApiException(
          "FORBIDDEN",
          403,
          "The hotel owner account is restricted.",
        );
    }
    if (
      a.membership.deletedAt ||
      a.property.deletedAt ||
      a.user.isActive !== true ||
      a.user.accountStatus !== "active"
    )
      throw new ApiException("FORBIDDEN", 403);
  }
}
export async function readFinance(
  uid: string,
  propertyId?: string,
  admin = false,
) {
  if (propertyId?.includes("/")) throw new ApiException("NOT_FOUND", 404);
  return adminDb.runTransaction(async (tx) => {
    await financeAccess(uid, propertyId, admin, tx);
    const [g, a] = await Promise.all([
      tx.get(globalRef()),
      tx.get(agreementRef()),
    ]);
    const policy = (g.get("policy") ?? DEFAULT_POLICY) as FinancePolicy;
    const common = {
      global: { policy, revision: g.get("revision") ?? 0 },
      agreement: a.exists ? a.data() : null,
    };
    if (!propertyId) return serializeFinance(common);
    const [h, p, docs, invoice] = await Promise.all([
      tx.get(hotelRef(propertyId)),
      tx.get(hotelRef(propertyId).collection("profiles").doc("current")),
      tx.get(
        adminDb
          .collection("verificationDocuments")
          .where("propertyId", "==", propertyId),
      ),
      tx.get(
        adminDb
          .collection("properties")
          .doc(propertyId)
          .collection("invoiceConfiguration")
          .doc("current"),
      ),
    ]);
    const profile = (p.get("profile") ?? EMPTY_PROFILE) as FinanceProfile;
    const revision = p.get("revision") ?? 0;
    const availableDocuments = docs.docs.filter(
      (d) => !d.get("deletedAt") && d.get("status") !== "rejected",
    );
    const documentsValid = supportingDocumentsValid(
      profile,
      propertyId,
      availableDocuments.map((d) => ({ id: d.id, propertyId: d.get("propertyId") })),
    );
    const accepted =
      !!a.exists &&
      p.get("acceptance.agreementVersion") === a.get("revision") &&
      p.get("acceptance.profileRevision") ===
        (p.get("contentRevision") ?? revision);
    return serializeFinance({
      ...common,
      propertyId,
      overrides: h.get("overrides") ?? {},
      overrideRevision: h.get("revision") ?? 0,
      ...resolvePolicy(policy, (h.get("overrides") ?? {}) as FinanceOverrides),
      profile,
      profileRevision: revision,
      contentRevision: p.get("contentRevision") ?? revision,
      profileState: p.get("state") ?? "draft",
      review: p.get("review") ?? null,
      acceptance: p.get("acceptance") ?? null,
      readiness: profileReadiness(
        profile,
        accepted,
        p.get("state") === "manually_reviewed",
        documentsValid,
      ),
      documents: availableDocuments
        .map((d) => ({
          id: d.id,
          label: d.get("originalFileName") || d.get("documentType") || d.id,
        })),
      invoicePrefill: invoice.get("settings") ?? null,
    });
  });
}
/** Every command, including retries, rechecks live access inside the committing transaction. */
export async function mutateFinance(
  uid: string,
  raw: unknown,
  propertyId?: string,
  admin = false,
  requestIdentity?: string,
) {
  const command = commandSchema.parse(raw);
  const adminAction = ["global", "overrides", "review", "publish"].includes(
    command.action,
  );
  if (
    adminAction !== admin ||
    (!propertyId && !["global", "publish"].includes(command.action)) ||
    (propertyId && ["global", "publish"].includes(command.action)) ||
    propertyId?.includes("/")
  )
    throw new ApiException("FORBIDDEN", 403);
  const identity = hash(`${uid}:${command.action}:${command.mutationId}`);
  const fingerprint = hash(stable({ command, propertyId: propertyId ?? null }));
  const mutation = adminDb.collection("financeMutations").doc(identity);
  return adminDb.runTransaction(async (tx) => {
    await financeAccess(uid, propertyId, admin, tx, true);
    const retry = await tx.get(mutation);
    if (retry.exists) {
      if (retry.get("fingerprint") !== fingerprint)
        throw new ApiException(
          "MUTATION_REUSED",
          409,
          "This mutation identity was already used for different values.",
        );
      return retry.get("result");
    }
    const ref =
      command.action === "global"
        ? globalRef()
        : command.action === "publish"
          ? agreementRef()
          : command.action === "overrides"
            ? hotelRef(propertyId!)
            : hotelRef(propertyId!).collection("profiles").doc("current");
    const before = await tx.get(ref);
    const old = before.data() ?? null;
    const revision = before.get("revision") ?? 0;
    if (revision !== command.expectedRevision) conflict();
    const now = Timestamp.now();
    const nextRevision = revision + 1;
    let next: FirebaseFirestore.DocumentData;
    let acceptance: FirebaseFirestore.DocumentData | undefined;
    if (command.action === "global") next = { policy: command.policy };
    else if (command.action === "overrides") {
      const g = await tx.get(globalRef());
      if ((g.get("revision") ?? 0) !== command.globalRevision) conflict();
      if (command.overrides.paymentOptions?.some(option => !(g.get("policy") ?? DEFAULT_POLICY).paymentOptions.includes(option))) throw new ApiException("ADMIN_DISALLOWED_PAYMENT_OPTION", 422);
      next = {
        overrides: command.overrides,
        displayedGlobalRevision: command.globalRevision,
      };
    } else if (command.action === "publish") {
      next = { title: command.title, documentUrl: command.documentUrl };
    } else if (command.action === "profile") {
      if (command.submit && !profileReadiness(command.profile, false).canSubmit)
        throw new ApiException(
          "PROFILE_INCOMPLETE",
          422,
          "Complete business details, tax identity and supporting documents before submitting.",
        );
      if (command.profile.documentIds.length)
        await requireSupportingDocuments(tx, propertyId!, command.profile);
      next = {
        contentRevision: nextRevision,
        profile: command.profile,
        state: command.submit ? "submitted" : "draft",
        review: null,
        previousReview:
          before.get("review") ?? before.get("previousReview") ?? null,
        acceptance: before.get("acceptance") ?? null,
        providerVerification: "not_started",
        payoutsEnabled: false,
      };
    } else if (command.action === "review") {
      if (before.get("state") !== "submitted")
        throw new ApiException(
          "PROFILE_NOT_SUBMITTED",
          409,
          "Only a submitted profile can be reviewed.",
        );
      if (command.decision === "manually_reviewed") {
        const profile = before.get("profile") as FinanceProfile;
        if (!profileReadiness(profile, false).canSubmit)
          throw new ApiException(
            "PROFILE_INCOMPLETE",
            422,
            "Complete the finance profile before review.",
          );
        await requireSupportingDocuments(tx, propertyId!, profile);
      }
      next = {
        ...old,
        state: command.decision,
        review: {
          reviewedProfileRevision: before.get("contentRevision") ?? revision,
          reviewer: uid,
          reviewedAt: now,
          notes: command.notes,
        },
        providerVerification: "not_started",
        payoutsEnabled: false,
      };
    } else {
      const agreement = await tx.get(agreementRef());
      if (
        !agreement.exists ||
        agreement.get("revision") !== command.agreementVersion
      )
        conflict();
      if (
        !before.exists ||
        !profileReadiness(before.get("profile"), false).canSubmit
      )
        throw new ApiException(
          "PROFILE_INCOMPLETE",
          422,
          "Complete the finance profile before accepting terms.",
        );
      await requireSupportingDocuments(
        tx,
        propertyId!,
        before.get("profile") as FinanceProfile,
      );
      // Acceptance changes no profile content or review revision.
      acceptance = {
        actorId: uid,
        propertyId,
        profileRevision: before.get("contentRevision") ?? revision,
        agreementVersion: command.agreementVersion,
        acceptedAt: now,
      };
      next = { ...old, acceptance };
    }
    const resultingRevision = nextRevision;
    next = {
      ...next,
      revision: resultingRevision,
      recordRevision: (before.get("recordRevision") ?? 0) + 1,
      updatedAt: now,
      updatedBy: uid,
    };
    const result = {
      revision: resultingRevision,
      recordRevision: next.recordRevision,
      action: command.action,
    };
    tx.set(ref, next);
    if (
      ["global", "overrides", "profile", "publish", "review"].includes(
        command.action,
      )
    )
      tx.create(ref.collection("versions").doc(String(nextRevision)), next);
    if (acceptance)
      tx.create(ref.collection("acceptances").doc(identity), acceptance);
    tx.create(adminDb.collection("financeAudit").doc(identity), {
      actorId: uid,
      requestId: requestIdentity ?? apiContext.current()?.requestId ?? identity,
      propertyId: propertyId ?? null,
      action: command.action,
      reason: command.reason,
      previous: old,
      next,
      revision: resultingRevision,
      createdAt: now,
    });
    tx.create(mutation, {
      actorId: uid,
      action: command.action,
      fingerprint,
      result,
      createdAt: now,
    });
    return result;
  });
}
export async function financeHistory(uid: string, cursor?: string) {
  return adminDb.runTransaction(async (tx) => {
    await adminAccess(uid, tx);
    let q = adminDb
      .collection("financeAudit")
      .orderBy("createdAt", "desc")
      .orderBy("__name__", "desc")
      .limit(26);
    if (cursor) {
      if (!/^[a-f0-9]{64}$/.test(cursor))
        throw new ApiException("INVALID_CURSOR", 400);
      const row = await tx.get(adminDb.collection("financeAudit").doc(cursor));
      if (!row.exists) throw new ApiException("INVALID_CURSOR", 400);
      q = q.startAfter(row);
    }
    const rows = await tx.get(q);
    return {
      events: rows.docs
        .slice(0, 25)
        .map((d) =>
          maskTaxIdentifiers(serializeFinance({ id: d.id, ...d.data() })),
        ),
      nextCursor: rows.size > 25 ? rows.docs[24].id : null,
    };
  });
}
