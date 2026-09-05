import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/**
 * In-app notifications (notifications/{id}) per HELPKEY_DATABASE_SPEC.
 * Delivery channels (email/sms/whatsapp) are a documented follow-up; this
 * module writes only in-app notification documents.
 *
 * All creation paths are best-effort side effects: callers invoke them AFTER
 * their core transaction commits and must not let a notification failure roll
 * back or block the primary action.
 */

interface NotificationInput {
  userId: string;
  eventType: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  actorId?: string;
}

const iso = (value: unknown) =>
  typeof (value as { toDate?: unknown })?.toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : null;

function notificationDoc(input: NotificationInput) {
  const now = FieldValue.serverTimestamp();
  const actor = input.actorId ?? "system";
  return {
    userId: input.userId,
    eventType: input.eventType,
    title: input.title,
    body: input.body,
    data: input.data ?? {},
    readAt: null,
    status: "created" as const,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    deletedAt: null,
  };
}

/** Creates a single in-app notification. */
export async function createNotification(input: NotificationInput): Promise<void> {
  await adminDb.collection("notifications").add(notificationDoc(input));
}

/** Fan-out cap: beyond this, prefer an admin-scoped feed over per-admin docs. */
const ADMIN_FANOUT_CAP = 50;

/** Creates one notification per active admin (batched). */
export async function notifyAdmins(input: Omit<NotificationInput, "userId">): Promise<void> {
  const admins = await adminDb
    .collection("users")
    .where("roles", "array-contains", "admin")
    .limit(ADMIN_FANOUT_CAP)
    .get();

  const active = admins.docs.filter(
    (doc) => doc.data().accountStatus !== "suspended" && doc.data().isActive !== false,
  );
  if (!active.length) return;

  const batch = adminDb.batch();
  for (const admin of active) {
    const ref = adminDb.collection("notifications").doc();
    batch.set(ref, notificationDoc({ ...input, userId: admin.id }));
  }
  await batch.commit();
}

/** Partner-facing notification for a submitted property (fans out to admins). */
export async function notifyPropertySubmitted(params: {
  propertyId: string;
  propertyName: string;
  actorId: string;
}): Promise<void> {
  await notifyAdmins({
    eventType: "property.submitted",
    title: "New property submitted for review",
    body: `${params.propertyName} was submitted and is awaiting review.`,
    data: { propertyId: params.propertyId },
    actorId: params.actorId,
  });
}

/** Partner-facing notification for an admin review decision. */
export async function notifyPropertyDecision(params: {
  ownerId: string;
  propertyId: string;
  propertyName: string;
  approvalStatus: string;
  reason?: string | null;
  actorId: string;
}): Promise<void> {
  const map: Record<string, { eventType: string; title: string; body: string }> = {
    approved: {
      eventType: "property.approved",
      title: "Listing approved",
      body: `${params.propertyName} is approved and now live for guests.`,
    },
    changes_requested: {
      eventType: "property.changes_requested",
      title: "Changes requested",
      body: `${params.propertyName} needs changes: ${params.reason ?? "see review notes"}.`,
    },
    rejected: {
      eventType: "property.rejected",
      title: "Listing rejected",
      body: `${params.propertyName} was rejected: ${params.reason ?? "see review notes"}.`,
    },
  };
  const template = map[params.approvalStatus];
  if (!template) return;

  await createNotification({
    userId: params.ownerId,
    eventType: template.eventType,
    title: template.title,
    body: template.body,
    data: { propertyId: params.propertyId, approvalStatus: params.approvalStatus },
    actorId: params.actorId,
  });
}

export interface NotificationDto {
  id: string;
  eventType: string;
  title: string;
  body: string;
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string | null;
}

/** Lists a user's notifications, newest-first, with an unread count. */
export async function listNotifications(
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number },
): Promise<{ notifications: NotificationDto[]; unreadCount: number }> {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);

  // Fetch by userId only (single-field index, always available) and sort/cap in
  // memory. A per-user notification set is small, so this avoids a composite
  // (userId + createdAt) index requirement and never hard-fails on a missing
  // index. We over-fetch a bounded window before capping to `limit`.
  const [ownedSnap, unreadSnap] = await Promise.all([
    adminDb.collection("notifications").where("userId", "==", userId).limit(200).get(),
    adminDb
      .collection("notifications")
      .where("userId", "==", userId)
      .where("readAt", "==", null)
      .count()
      .get()
      .catch(() => null),
  ]);

  const sorted = ownedSnap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        eventType: String(d.eventType ?? ""),
        title: String(d.title ?? ""),
        body: String(d.body ?? ""),
        data: (d.data ?? {}) as Record<string, string>,
        readAt: iso(d.readAt),
        readAtRaw: d.readAt ?? null,
        createdAtMs: (d.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0,
        createdAt: iso(d.createdAt),
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const filtered = (options?.unreadOnly ? sorted.filter((n) => n.readAtRaw == null) : sorted).slice(0, limit);
  const notifications: NotificationDto[] = filtered.map(({ id, eventType, title, body, data, readAt, createdAt }) => ({
    id,
    eventType,
    title,
    body,
    data,
    readAt,
    createdAt,
  }));

  // Prefer the aggregation count; fall back to counting the fetched window if
  // the aggregation is unavailable.
  const unreadCount = unreadSnap ? unreadSnap.data().count : sorted.filter((n) => n.readAtRaw == null).length;

  return { notifications, unreadCount };
}

/** Marks the given notifications read; only affects docs owned by `userId`. */
export async function markNotificationsRead(userId: string, ids: string[]): Promise<number> {
  const unique = [...new Set(ids)].slice(0, 100);
  if (!unique.length) return 0;

  const refs = unique.map((id) => adminDb.collection("notifications").doc(id));
  const snaps = await adminDb.getAll(...refs);
  const now = FieldValue.serverTimestamp();
  const batch = adminDb.batch();
  let updated = 0;
  for (const snap of snaps) {
    const data = snap.data();
    if (!data || data.userId !== userId || data.readAt != null) continue;
    batch.update(snap.ref, { readAt: now, status: "completed", updatedAt: now, updatedBy: userId });
    updated += 1;
  }
  if (updated) await batch.commit();
  return updated;
}
