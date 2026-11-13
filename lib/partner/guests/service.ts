import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { operationalAccess } from "@/lib/partner/pms/access";
import { ApiException } from "@/lib/api/errors";
import { searchableTokens } from "@/lib/partner/guests/tokens";
const name = z.string().trim().min(2).max(120);
const people = z
  .array(
    z.object({ name, ageGroup: z.enum(["adult", "child", "infant"]) }).strict(),
  )
  .min(1)
  .max(32);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function guestRegistration(
  uid: string,
  id: string,
  raw?: unknown,
) {
  const ref = adminDb.collection("bookings").doc(id);
  if (raw === undefined) {
    const b = (await ref.get()).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    await operationalAccess(uid, b.propertyId, "reservation.read");
    const invitation = (
      await ref.collection("customerLinks").doc("current").get()
    ).data();
    const expiresAt =
      invitation?.expiresAt instanceof Timestamp ? invitation.expiresAt : null;
    return {
      customerInvitation: invitation
        ? {
            status:
              invitation.status === "pending" &&
              (!expiresAt || expiresAt.toMillis() <= Date.now())
                ? "expired"
                : invitation.status,
            email:
              typeof invitation.email === "string" ? invitation.email : null,
            expiresAt: expiresAt?.toDate().toISOString() || null,
          }
        : null,
      identityVersion: b.identityVersion || 1,
      occupants: b.occupants || [],
      registrationIncomplete: b.registrationIncomplete ?? true,
      revision: b.reservationRevision || 0,
      createdByStaffId: b.createdByStaffId || b.createdBy,
      bookingContact: b.bookingContact || null,
      linked: !!b.linkedCustomerId,
      leadEmail: b.leadGuest?.email || "",
      recordedArrivalAt: b.recordedArrivalAt || null,
      actualCheckInAt: b.actualCheckInAt?.toDate?.().toISOString() || null,
      actualCheckOutAt: b.actualCheckOutAt?.toDate?.().toISOString() || null,
      timezone: b.timezone || "Asia/Kolkata",
      adults: b.adults || 1,
      children: b.children || 0,
      infants: b.infants || 0,
    };
  }
  const input = z
    .object({ revision: z.number().int().nonnegative(), occupants: people })
    .strict()
    .parse(raw);
  await adminDb.runTransaction(async (tx) => {
    const b = (await tx.get(ref)).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    await operationalAccess(uid, b.propertyId, "reservation.note", tx);
    if (b.identityVersion !== 2)
      throw new ApiException(
        "HISTORICAL_REVIEW_REQUIRED",
        409,
        "Historical guest identities require review; original records are preserved.",
      );
    if ((b.reservationRevision || 0) !== input.revision)
      throw new ApiException(
        "REVISION_CONFLICT",
        409,
        "Guest details changed in another session. Your input is retained; reload saved details to review before retrying.",
      );
    if (input.occupants[0].ageGroup !== "adult")
      throw new ApiException("LEAD_ADULT_REQUIRED", 422);
    for (const group of ["adult", "child", "infant"] as const)
      if (
        input.occupants.filter((g) => g.ageGroup === group).length >
        Number(
          b[
            group === "adult"
              ? "adults"
              : group === "child"
                ? "children"
                : "infants"
          ] || 0,
        )
      )
        throw new ApiException("GUEST_COUNT_MISMATCH", 422);
    tx.update(ref, {
      occupants: input.occupants,
      registrationIncomplete:
        input.occupants.length < b.adults + b.children + b.infants,
      leadGuest: {
        ...b.leadGuest,
        name: input.occupants[0].name,
        adultGuestNames: input.occupants
          .filter((g) => g.ageGroup === "adult")
          .map((g) => g.name),
      },
      searchTokens: [
        ...new Set([
          ...(b.searchTokens || []),
          ...searchableTokens(input.occupants.map((g) => g.name)),
        ]),
      ],
      reservationRevision: input.revision + 1,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      adminDb
        .collection("properties")
        .doc(b.propertyId)
        .collection("guestProfiles")
        .doc(b.guestProfileId),
      {
        name: input.occupants[0].name,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.create(ref.collection("events").doc(), {
      type: "guest_registration",
      before: b.occupants || [],
      after: input.occupants,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
}
export async function issueCustomerLink(uid: string, id: string, raw: unknown) {
  const input = z
    .discriminatedUnion("action", [
      z
        .object({
          action: z.literal("invite"),
          email: z
            .string()
            .trim()
            .email()
            .transform((v) => v.toLowerCase()),
        })
        .strict(),
      z.object({ action: z.literal("cancel") }).strict(),
    ])
    .parse(raw);
  const token = randomBytes(32).toString("base64url");
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(id),
      b = (await tx.get(ref)).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    await operationalAccess(uid, b.propertyId, "reservation.note", tx);
    if (b.identityVersion !== 2 || b.linkedCustomerId)
      throw new ApiException(
        "LINK_UNAVAILABLE",
        409,
        "Only an unlinked new manual reservation can be invited.",
      );
    tx.set(ref.collection("customerLinks").doc("current"), {
      status: input.action === "invite" ? "pending" : "cancelled",
      ...(input.action === "invite"
        ? {
            email: input.email,
            tokenHash: hash(token),
            expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
          }
        : {}),
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(ref.collection("events").doc(), {
      type: `customer_link_${input.action}`,
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return input.action === "invite" ? { token, bookingId: id } : { ok: true };
}
export async function acceptCustomerLink(
  uid: string,
  id: string,
  raw: unknown,
) {
  const input = z
    .object({
      token: z.string().regex(/^[\w-]{43}$/),
      accept: z.boolean().default(false),
    })
    .strict()
    .parse(raw);
  const user = await adminAuth.getUser(uid);
  if (!user.emailVerified || !user.email || user.disabled)
    throw new ApiException(
      "VERIFIED_EMAIL_REQUIRED",
      403,
      "Sign in with the invited verified email.",
    );
  return adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("bookings").doc(id),
      linkRef = ref.collection("customerLinks").doc("current");
    const [booking, invitation, account] = await Promise.all([
      tx.get(ref),
      tx.get(linkRef),
      tx.get(adminDb.collection("users").doc(uid)),
    ]);
    const b = booking.data(),
      v = invitation.data(),
      u = account.data();
    const expected = Buffer.from(String(v?.tokenHash || "")),
      supplied = Buffer.from(hash(input.token));
    if (
      !b ||
      b.identityVersion !== 2 ||
      !v ||
      !u ||
      u.isActive === false ||
      u.accountStatus !== "active" ||
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied) ||
      v.email !== user.email!.toLowerCase()
    )
      throw new ApiException(
        "INVALID_INVITATION",
        403,
        "Use the invited verified account and latest link.",
      );
    if (b.linkedCustomerId && b.linkedCustomerId !== uid)
      throw new ApiException(
        "ALREADY_LINKED",
        409,
        "This reservation is already linked to another account. Ask reception for help.",
      );
    if (
      !(v.status === "accepted" && v.acceptedBy === uid) &&
      (v.status !== "pending" || v.expiresAt.toMillis() <= Date.now())
    )
      throw new ApiException(
        "INVITATION_CLOSED",
        409,
        "This invitation expired or was cancelled. Ask reception for a new link.",
      );
    const result = {
      propertyName: b.propertyName,
      reference: b.confirmationCode,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      guestName: b.leadGuest?.name,
      bookingId: id,
    };
    if (!input.accept || b.linkedCustomerId === uid) return result;
    // The issuing operator must still have authority; a revoked invite cannot grant customer access.
    await operationalAccess(v.createdBy, b.propertyId, "reservation.note", tx);
    tx.update(ref, {
      guestId: uid,
      linkedCustomerId: uid,
      customerLinkedAt: FieldValue.serverTimestamp(),
      customerLinkedBy: uid,
    });
    tx.update(linkRef, {
      status: "accepted",
      acceptedBy: uid,
      acceptedAt: FieldValue.serverTimestamp(),
    });
    tx.create(ref.collection("events").doc(), {
      type: "customer_link_accepted",
      actorId: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  });
}
