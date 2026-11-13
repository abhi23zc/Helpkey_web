import { withApiHandler, actorFromRequest } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/admin/data";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiException } from "@/lib/api/errors";
import { setupStatus, audit } from "@/lib/partner/pms/setup";
type Context = { params: Promise<{ propertyId: string }> };
const route = "/api/admin/properties/[propertyId]/pms";
export const GET = withApiHandler(
  async (_request, c: Context) => {
    await requireAdmin(actorFromRequest().uid);
    const id = (await c.params).propertyId,
      p = (await adminDb.collection("properties").doc(id).get()).data();
    if (!p) throw new ApiException("NOT_FOUND", 404);
    try {
      return Response.json(await setupStatus(p.ownerId || p.partnerId, id));
    } catch (error) {
      if (!(error instanceof ApiException) || error.status !== 403) throw error;
      return Response.json({
        propertyId: id,
        propertyName: p.name,
        state: "disabled",
        adminDisabled: p.pms?.adminDisabled === true,
        reason:
          "Owner membership or account is restricted. Restore eligible access before readiness can be evaluated.",
        items: [],
      });
    }
  },
  { route, auth: "strict", requireAuth: true, cache: "private" },
);
export const POST = withApiHandler(
  async (request, c: Context) => {
    const uid = actorFromRequest().uid;
    await requireAdmin(uid);
    const id = (await c.params).propertyId;
    const input = z
      .object({
        disabled: z.boolean(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(await request.json());
    await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection("properties").doc(id),
        p = (await tx.get(ref)).data();
      const user = (await tx.get(adminDb.collection("users").doc(uid))).data();
      if (
        !user?.roles?.includes("admin") ||
        user.isActive === false ||
        user.accountStatus !== "active"
      )
        throw new ApiException("FORBIDDEN", 403);
      if (!p) throw new ApiException("NOT_FOUND", 404);
      tx.update(ref, {
        pms: {
          ...p.pms,
          version: 1,
          adminDisabled: input.disabled,
          adminReason: input.disabled ? input.reason : null,
          updatedBy: uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      audit(
        tx,
        id,
        uid,
        "pms_admin_control",
        id,
        { disabled: p.pms?.adminDisabled === true },
        input,
      );
    });
    return Response.json({ ok: true });
  },
  { route, auth: "strict", requireAuth: true, cache: "private" },
);
