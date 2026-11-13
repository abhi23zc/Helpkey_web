import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { invalidateUserSessions } from "@/lib/auth/session";
import { propertyAccess } from "./access";
import { rolePermissions, staffRoles } from "./domain";
import { audit } from "./setup";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const iso = (value: unknown) =>
  value instanceof Timestamp ? value.toDate().toISOString() : null;
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("invite"),
      email: z
        .string()
        .trim()
        .email()
        .max(180)
        .transform((v) => v.toLowerCase()),
      role: z.enum(staffRoles),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel"),
      invitationId: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("role"),
      userId: z
        .string()
        .min(1)
        .max(180)
        .refine((v) => !v.includes("/")),
      role: z.enum(staffRoles),
    })
    .strict(),
  z
    .object({
      action: z.literal("revoke"),
      userId: z
        .string()
        .min(1)
        .max(180)
        .refine((v) => !v.includes("/")),
    })
    .strict(),
]);
export async function listTeam(
  uid: string,
  propertyId: string,
  before?: string,
) {
  await propertyAccess(uid, propertyId, "team.manage");
  const eventsRef = adminDb
    .collection("properties")
    .doc(propertyId)
    .collection("pmsEvents");
  let eventsQuery = eventsRef.orderBy("createdAt", "desc").limit(51);
  if (before) {
    if (!/^[\w-]{1,180}$/.test(before))
      throw new ApiException("INVALID_CURSOR", 422);
    const cursor = await eventsRef.doc(before).get();
    if (!cursor.exists) throw new ApiException("INVALID_CURSOR", 422);
    eventsQuery = eventsQuery.startAfter(cursor);
  }
  const [members, invitations, events] = await Promise.all([
    adminDb
      .collection("propertyMemberships")
      .where("propertyId", "==", propertyId)
      .limit(201)
      .get(),
    adminDb
      .collection("propertyInvitations")
      .where("propertyId", "==", propertyId)
      .limit(201)
      .get(),
    eventsQuery.get(),
  ]);
  if (members.size > 200 || invitations.size > 200)
    throw new ApiException(
      "TEAM_LIMIT",
      409,
      "This hotel exceeds the supported team size. Contact support.",
    );
  const userIds = [
    ...new Set(
      [
        ...members.docs.map((m) => m.get("userId")),
        ...events.docs.map((e) => e.get("actorId")),
      ].filter(Boolean),
    ),
  ] as string[];
  const users = userIds.length
    ? await adminDb.getAll(
        ...userIds.map((id) => adminDb.collection("users").doc(id)),
      )
    : [];
  const names = new Map(users.map((u) => [u.id, u.data()]));
  return {
    members: members.docs.map((d) => {
      const m = d.data(),
        u = names.get(m.userId);
      return {
        userId: m.userId,
        name: u?.fullName || m.userId,
        email: u?.email || null,
        role: m.role,
        status: m.status,
        revision: m.accessRevision || 0,
      };
    }),
    invitations: invitations.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        email: v.email,
        role: v.role,
        status:
          v.status === "pending" && v.expiresAt.toMillis() <= Date.now()
            ? "expired"
            : v.status,
        expiresAt: iso(v.expiresAt),
      };
    }),
    events: events.docs.slice(0, 50).map((d) => {
      const e = d.data();
      return {
        id: d.id,
        type: e.type,
        actorId: e.actorId,
        actorName: names.get(e.actorId)?.fullName || e.actorId,
        targetId: e.targetId,
        before: e.before,
        after: e.after,
        createdAt: iso(e.createdAt),
      };
    }),
    nextCursor: events.size > 50 ? events.docs[49].id : null,
  };
}
export async function manageTeam(
  uid: string,
  propertyId: string,
  raw: unknown,
) {
  const command = input.parse(raw);
  const token =
    command.action === "invite" ? randomBytes(32).toString("base64url") : null;
  let result: { invitationId?: string; token?: string } = {};
  let affected: string | undefined;
  await adminDb.runTransaction(async (tx) => {
    const { property } = await propertyAccess(
      uid,
      propertyId,
      "team.manage",
      tx,
    );
    if (command.action === "invite") {
      const id = hash(`${propertyId}\0${command.email}`),
        ref = adminDb.collection("propertyInvitations").doc(id);
      const previous = await tx.get(ref);
      if (previous.get("status") === "accepted") {
        const membership = await tx.get(
          adminDb
            .collection("propertyMemberships")
            .doc(`${propertyId}_${previous.get("acceptedBy")}`),
        );
        if (membership.get("status") === "active")
          throw new ApiException(
            "ALREADY_MEMBER",
            409,
            "This person is already a team member. Change their role in the team list.",
          );
      }
      const invitationCount = await tx.get(
        adminDb
          .collection("propertyInvitations")
          .where("propertyId", "==", propertyId)
          .limit(201),
      );
      if (!previous.exists && invitationCount.size >= 200)
        throw new ApiException(
          "TEAM_LIMIT",
          409,
          "This hotel has reached its invitation limit. Contact support.",
        );
      const all = await tx.get(
        adminDb
          .collection("propertyMemberships")
          .where("propertyId", "==", propertyId)
          .limit(201),
      );
      if (all.size >= 200)
        throw new ApiException(
          "TEAM_LIMIT",
          409,
          "The hotel team limit has been reached.",
        );
      tx.set(ref, {
        propertyId,
        email: command.email,
        role: command.role,
        tokenHash: hash(token!),
        status: "pending",
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
        acceptedBy: null,
        createdBy: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      audit(tx, propertyId, uid, "team_invited", command.email, null, {
        role: command.role,
      });
      result = { invitationId: id, token: token! };
    } else if (command.action === "cancel") {
      const ref = adminDb
          .collection("propertyInvitations")
          .doc(command.invitationId),
        invitation = await tx.get(ref);
      if (invitation.get("propertyId") !== propertyId)
        throw new ApiException("NOT_FOUND", 404);
      if (invitation.get("status") === "cancelled") return;
      if (invitation.get("status") !== "pending")
        throw new ApiException("INVITATION_CLOSED", 409);
      tx.update(ref, {
        status: "cancelled",
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(
        tx,
        propertyId,
        uid,
        "team_invitation_cancelled",
        invitation.get("email"),
        null,
        null,
      );
    } else {
      const ref = adminDb
          .collection("propertyMemberships")
          .doc(`${propertyId}_${command.userId}`),
        member = await tx.get(ref);
      if (!member.exists) throw new ApiException("NOT_FOUND", 404);
      if (
        member.get("role") === "owner" ||
        [property.ownerId, property.partnerId].includes(command.userId)
      )
        throw new ApiException(
          "OWNER_PROTECTED",
          409,
          "Ownership cannot be changed through team management.",
        );
      const before = { role: member.get("role"), status: member.get("status") };
      if (command.action === "role" && before.status !== "active")
        throw new ApiException(
          "MEMBER_REVOKED",
          409,
          "Create a new invitation to restore access.",
        );
      const after =
        command.action === "role"
          ? {
              role: command.role,
              status: "active",
              permissions: [...rolePermissions[command.role]],
            }
          : { role: before.role, status: "revoked", permissions: [] };
      tx.update(ref, {
        ...after,
        accessRevision: FieldValue.increment(1),
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(
        tx,
        propertyId,
        uid,
        `team_${command.action}`,
        command.userId,
        before,
        { role: after.role, status: after.status },
      );
      affected = command.userId;
    }
  });
  if (affected) await invalidateUserSessions(affected);
  return { ok: true, ...result };
}
export async function previewInvitation(
  uid: string,
  invitationId: string,
  token: string,
) {
  if (!/^[a-f0-9]{64}$/.test(invitationId) || !/^[\w-]{43}$/.test(token))
    throw new ApiException(
      "INVALID_INVITATION",
      422,
      "This invitation link is invalid.",
    );
  const auth = await adminAuth.getUser(uid);
  if (auth.disabled || !auth.emailVerified || !auth.email)
    throw new ApiException(
      "EMAIL_VERIFICATION_REQUIRED",
      403,
      "Sign in with the invited verified email. Google sign-in is supported.",
    );
  const v = (
    await adminDb.collection("propertyInvitations").doc(invitationId).get()
  ).data();
  const supplied = Buffer.from(hash(token)),
    expected = Buffer.from(String(v?.tokenHash || ""));
  if (
    !v ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied) ||
    auth.email.toLowerCase() !== v.email ||
    !staffRoles.includes(v.role)
  )
    throw new ApiException(
      "INVALID_INVITATION",
      403,
      "Use the invited account and the latest invitation link.",
    );
  if (
    (v.status !== "pending" || v.expiresAt.toMillis() <= Date.now()) &&
    !(v.status === "accepted" && v.acceptedBy === uid)
  )
    throw new ApiException(
      "INVITATION_CLOSED",
      409,
      "This invitation expired or was cancelled. Ask the owner for a new link.",
    );
  const hotel = await adminDb.collection("properties").doc(v.propertyId).get();
  if (!hotel.exists) throw new ApiException("INVITATION_CLOSED", 409);
  return { propertyName: hotel.get("name"), email: v.email, role: v.role };
}
export async function acceptInvitation(
  uid: string,
  invitationId: string,
  token: string,
) {
  if (!/^[a-f0-9]{64}$/.test(invitationId) || !/^[\w-]{43}$/.test(token))
    throw new ApiException(
      "INVALID_INVITATION",
      422,
      "This invitation link is invalid.",
    );
  const auth = await adminAuth.getUser(uid);
  if (auth.disabled || !auth.emailVerified || !auth.email)
    throw new ApiException(
      "EMAIL_VERIFICATION_REQUIRED",
      403,
      "Sign in with the invited verified email. Google sign-in is supported.",
    );
  const result = await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("propertyInvitations").doc(invitationId),
      invitation = await tx.get(ref),
      v = invitation.data();
    const supplied = Buffer.from(hash(token)),
      expected = Buffer.from(String(v?.tokenHash || ""));
    if (
      !v ||
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied) ||
      auth.email!.toLowerCase() !== v.email ||
      !staffRoles.includes(v.role)
    )
      throw new ApiException(
        "INVALID_INVITATION",
        403,
        "Use the invited account and the latest invitation link.",
      );
    const [user, hotel, member] = await Promise.all([
      tx.get(adminDb.collection("users").doc(uid)),
      tx.get(adminDb.collection("properties").doc(v.propertyId)),
      tx.get(
        adminDb.collection("propertyMemberships").doc(`${v.propertyId}_${uid}`),
      ),
    ]);
    const u = user.data();
    if (
      !u ||
      !hotel.exists ||
      u.isActive === false ||
      ["suspended", "disabled", "deleted"].includes(u.accountStatus)
    )
      throw new ApiException("FORBIDDEN", 403);
    if (
      v.status === "accepted" &&
      v.acceptedBy === uid &&
      member.get("status") === "active"
    )
      return { propertyId: v.propertyId };
    if (v.status !== "pending" || v.expiresAt.toMillis() <= Date.now())
      throw new ApiException(
        "INVITATION_CLOSED",
        409,
        "This invitation expired or was cancelled. Ask the owner for a new link.",
      );
    if (member.get("role") === "owner")
      throw new ApiException("OWNER_PROTECTED", 409);
    const ownerMembership = await tx.get(
      adminDb
        .collection("propertyMemberships")
        .doc(`${v.propertyId}_${v.createdBy}`),
    );
    if (
      ownerMembership.get("status") !== "active" ||
      ownerMembership.get("role") !== "owner"
    )
      throw new ApiException("INVITATION_CLOSED", 409);
    tx.set(member.ref, {
      propertyId: v.propertyId,
      userId: uid,
      role: v.role,
      status: "active",
      permissions: [...rolePermissions[v.role as (typeof staffRoles)[number]]],
      accessRevision: (member.get("accessRevision") || 0) + 1,
      createdBy: v.createdBy,
      createdAt: member.get("createdAt") || FieldValue.serverTimestamp(),
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(user.ref, {
      roles: FieldValue.arrayUnion("partner"),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(ref, {
      status: "accepted",
      acceptedBy: uid,
      acceptedAt: FieldValue.serverTimestamp(),
    });
    audit(tx, v.propertyId, uid, "team_invitation_accepted", uid, null, {
      role: v.role,
    });
    return { propertyId: v.propertyId };
  });
  await invalidateUserSessions(uid);
  return result;
}
