import { withApiHandler } from "@/lib/api/handler";
import { bookingInput } from "@/lib/booking/contracts";
import { evaluateStay } from "@/lib/booking/domain";
import { adminDb } from "@/lib/firebase/admin";
import { offeringsFor } from "@/lib/stay/catalog";
import { stayError } from "@/lib/stay/api";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { clientIp, privateFingerprint } from "@/lib/api/request";
async function post(request: Request) {
  try {
    await enforceRateLimit({
      bucket: "stay-options-ip",
      identifier: privateFingerprint(clientIp(request)),
      limit: 60,
      windowSeconds: 60,
    });
    const input = bookingInput.parse(await request.json());
    const [properties, room, rate] = await Promise.all([
      adminDb
        .collection("properties")
        .where("slug", "==", input.propertySlug)
        .limit(1)
        .get(),
      adminDb.collection("roomTypes").doc(input.roomTypeId).get(),
      adminDb.collection("ratePlans").doc(input.ratePlanId).get(),
    ]);
    const property = properties.docs[0],
      p = property?.data(),
      r = room.data(),
      t = rate.data();
    if (
      !p ||
      !property ||
      p.status !== "active" ||
      p.approvalStatus !== "approved" ||
      !p.isBookable ||
      r?.propertyId !== property.id ||
      r?.status !== "active" ||
      t?.propertyId !== property.id ||
      t?.roomTypeId !== room.id ||
      t?.status !== "active"
    )
      throw new Error("Options are unavailable for this stay.");
    const stay = evaluateStay(input, p, r, t);
    return Response.json({
      // Discovery includes unavailable active options; quote/creation still enforce eligibility.
      offerings: (await offeringsFor(property.id)).filter(
        (o) => o.status === "active",
      ),
      startAt: stay.startAt,
      timezone: stay.timezone,
    });
  } catch (e) {
    return stayError(e);
  }
}
export const POST = withApiHandler(post, {
  route: "/api/bookings/personalization",
  auth: "read",
  requireAuth: false,
  cache: "private",
});
