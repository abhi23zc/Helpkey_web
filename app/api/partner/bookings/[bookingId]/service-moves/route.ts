import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { withApiHandler } from "@/lib/api/handler";
import { ApiException } from "@/lib/api/errors";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { operationalAccess } from "@/lib/partner/pms/access";
import {
  digest,
  serviceVersion,
  prepareProposal,
} from "@/lib/booking/amendments/engine";
import { todayTransaction } from "@/lib/partner/today/cache";
const schema = z
  .object({
    quoteId: z.string().uuid(),
    requestId: z.string().min(1).max(180),
    serviceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type Context = { params: Promise<{ bookingId: string }> };
export const GET = withApiHandler(
  async (_request: Request, context: Context) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new ApiException("UNAUTHENTICATED", 401);
    const { bookingId } = await context.params;
    const ref = adminDb.collection("bookings").doc(bookingId);
    const b = (await ref.get()).data();
    if (!b) throw new ApiException("NOT_FOUND", 404);
    await operationalAccess(user.uid, b.propertyId, "requests.manage");
    const quotes = await ref.collection("editQuotes").get();
    return Response.json({
      proposals: quotes.docs
        .filter(
          (d) =>
            d.get("revision") === (b.reservationRevision ?? 0) &&
            d.get("stayRevision") === (b.stayRevision ?? 0),
        )
        .map((d) => ({
          quoteId: d.id,
          proposalFingerprint: d.get("proposalFingerprint"),
          startAt: d.get("patch.startAt"),
          endAt: d.get("patch.endAt"),
          roomName: d.get("patch.roomType.name"),
          serviceImpacts: d
            .get("serviceImpacts")
            .map((s: { id: string }) => ({
              ...s,
              serviceVersion: serviceVersion(
                (b.customizations ?? []).find(
                  (r: { id: string }) => r.id === s.id,
                ) ?? {},
              ),
            })),
        })),
    });
  },
  {
    route: "/api/partner/bookings/[bookingId]/service-moves",
    auth: "read",
    requireAuth: true,
    cache: "private",
  },
);
export const POST = withApiHandler(
  async (request: Request, context: Context) => {
    const user = await getAuthenticatedUser();
    if (!user) throw new ApiException("UNAUTHENTICATED", 401);
    const { bookingId } = await context.params;
    const input = schema.parse(await request.json());
    await todayTransaction(async (tx, changed) => {
      const ref = adminDb.collection("bookings").doc(bookingId);
      const b = (await tx.get(ref)).data();
      if (!b) throw new ApiException("NOT_FOUND", 404);
      await operationalAccess(user.uid, b.propertyId, "requests.manage", tx);
      changed(b.propertyId);
      const q = (
        await tx.get(ref.collection("editQuotes").doc(input.quoteId))
      ).data();
      const r = b.customizations?.find(
        (s: { id: string }) => s.id === input.requestId,
      );
      if (
        !q ||
        !r ||
        q.revision !== (b.reservationRevision ?? 0) ||
        q.stayRevision !== (b.stayRevision ?? 0) ||
        serviceVersion(r) !== input.serviceVersion
      )
        throw new ApiException("REVISION_CONFLICT", 409);
      const proposal = await prepareProposal(tx, bookingId, b, q.input);
      const impact = proposal.serviceImpacts.find((s) => s.id === r.id);
      if (
        !impact ||
        impact.reasons.some((s) => !s.includes("schedule or duration")) ||
        r.preparationStarted ||
        ["preparing", "ready"].includes(r.status)
      )
        throw new ApiException(
          "SERVICE_REAGREEMENT_REQUIRED",
          409,
          "Resolve this service through its existing agreement workflow.",
        );
      const approval = ref
        .collection("serviceMoveApprovals")
        .doc(digest([r.id, q.proposalFingerprint, input.serviceVersion]));
      tx.set(approval, {
        requestId: r.id,
        proposalFingerprint: q.proposalFingerprint,
        serviceVersion: input.serviceVersion,
        approvedBy: user.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(ref.collection("events").doc(), {
        type: "service_move_approved",
        requestId: r.id,
        proposalFingerprint: q.proposalFingerprint,
        actorId: user.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return Response.json({ ok: true });
  },
  {
    route: "/api/partner/bookings/[bookingId]/service-moves",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
