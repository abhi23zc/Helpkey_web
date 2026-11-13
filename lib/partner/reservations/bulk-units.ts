import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { ApiException } from "@/lib/api/errors";
import { propertyAccess } from "@/lib/partner/pms/access";
import { requireFeature } from "./operations";
import {
  bulkUnitSource,
  expandUnitLabels,
  planUnitLabels,
  type RegisterUnit,
} from "./bulk-unit-domain";

const id = z
  .string()
  .min(1)
  .max(180)
  .refine((v) => !v.includes("/"));
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("preview"),
      propertyId: id,
      roomTypeId: id,
      source: bulkUnitSource,
    })
    .strict(),
  z
    .object({
      action: z.literal("create"),
      propertyId: id,
      previewId: z.string().uuid(),
    })
    .strict(),
]);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const stale = () =>
  new ApiException(
    "ROOM_REGISTER_CHANGED",
    409,
    "The room register or capacity changed. Preview again before adding room numbers.",
  );
export async function bulkUnits(uid: string, raw: unknown) {
  requireFeature("allocation");
  const input = inputSchema.parse(raw);
  let labels: string[] = [];
  if (input.action === "preview") {
    try {
      labels = expandUnitLabels(input.source);
    } catch (e) {
      throw new ApiException(
        "INVALID_ROOM_NUMBERS",
        422,
        e instanceof Error ? e.message : "Invalid room numbers.",
      );
    }
  }
  const previewId = input.action === "preview" ? randomUUID() : input.previewId;
  const previewRef = adminDb
    .collection("physicalUnitBulkOperations")
    .doc(previewId);
  return adminDb.runTransaction(async (tx) => {
    const access = await propertyAccess(
      uid,
      input.propertyId,
      "rooms.manage",
      tx,
    );
    if (access.block)
      throw new ApiException("PMS_RESTRICTED", 403, access.block);
    const saved =
      input.action === "create" ? (await tx.get(previewRef)).data() : null;
    if (input.action === "create") {
      if (
        !saved ||
        saved.propertyId !== input.propertyId ||
        saved.actorId !== uid
      )
        throw new ApiException("NOT_FOUND", 404);
      if (saved.result) return saved.result;
      if (saved.expiresAt.toMillis() < Date.now()) throw stale();
      labels = saved.labels;
    }
    const roomTypeId =
      input.action === "preview" ? input.roomTypeId : saved!.roomTypeId;
    const roomSnapshot = await tx.get(
      adminDb.collection("roomTypes").doc(roomTypeId),
    );
    const room = roomSnapshot.data();
    if (
      !room ||
      room.propertyId !== input.propertyId ||
      room.status !== "active" ||
      !Number.isInteger(room.totalInventory) ||
      room.totalInventory < 0
    )
      throw new ApiException("INVALID_ROOM_TYPE", 422);
    const snapshot = await tx.get(
      adminDb
        .collection("physicalUnits")
        .where("propertyId", "==", input.propertyId),
    );
    const units = snapshot.docs.map(
      (d) =>
        ({
          id: d.id,
          label: String(d.get("label")),
          roomTypeId: String(d.get("roomTypeId")),
          status: String(d.get("status")),
        }) satisfies RegisterUnit,
    );
    const version = hash(
      JSON.stringify([
        roomTypeId,
        room.totalInventory,
        units.toSorted((a, b) => a.id.localeCompare(b.id)),
      ]),
    );
    const plan = planUnitLabels(labels, units, roomTypeId, room.totalInventory);
    const claims = await Promise.all(
      plan.newLabels.map((label) =>
        tx.get(
          adminDb
            .collection("physicalUnitLabels")
            .doc(hash(`${input.propertyId}\0${label.toLowerCase()}`)),
        ),
      ),
    );
    if (claims.some((c) => c.exists))
      throw new ApiException(
        "DUPLICATE_ROOM_LABEL",
        409,
        "A room number is already claimed. Refresh the register before retrying.",
      );
    if (input.action === "preview") {
      tx.create(previewRef, {
        propertyId: input.propertyId,
        roomTypeId,
        actorId: uid,
        labels,
        version,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60_000),
      });
      return { previewId, ...plan };
    }
    if (saved!.version !== version) throw stale();
    if (!plan.canSave)
      throw new ApiException(
        "ROOM_REGISTER_EXCEEDS_CAPACITY",
        409,
        "New room numbers exceed the remaining capacity, or there are no new numbers to add.",
      );
    const unitIds = plan.newLabels.map(() => randomUUID());
    plan.newLabels.forEach((label, i) => {
      tx.create(adminDb.collection("physicalUnits").doc(unitIds[i]), {
        propertyId: input.propertyId,
        roomTypeId,
        label,
        status: "active",
        createdBy: uid,
        updatedBy: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(claims[i].ref, {
        propertyId: input.propertyId,
        unitId: unitIds[i],
      });
    });
    const result = { previewId, count: unitIds.length, unitIds };
    tx.update(previewRef, {
      result,
      completedAt: FieldValue.serverTimestamp(),
    });
    tx.create(
      adminDb
        .collection("properties")
        .doc(input.propertyId)
        .collection("pmsEvents")
        .doc(previewId),
      {
        type: "room_numbers_added",
        actorId: uid,
        actorName: access.user.fullName || "Hotel team",
        targetId: roomTypeId,
        count: unitIds.length,
        labels: plan.newLabels,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
    return result;
  });
}
