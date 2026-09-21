import { withApiHandler } from "@/lib/api/handler";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertyOwner } from "@/lib/partner/service";

const schema = z.object({ text: z.string().trim().min(1).max(2_000) }).strict();

const rawPUT = async function PUT(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const { reviewId } = await params;
    const input = schema.parse(await request.json());
    const ref = adminDb.collection("propertyReviews").doc(reviewId);
    const review = await ref.get();
    const data = review.data();
    if (!review.exists || !data?.propertyId || data.status !== "approved") throw new Error("REVIEW_NOT_FOUND");
    await propertyOwner(user.uid, data.propertyId);
    const previous = data.partnerReply && typeof data.partnerReply === "object" ? data.partnerReply : {};
    await ref.update({ partnerReply: { ...previous, text: input.text, repliedBy: user.uid, repliedAt: FieldValue.serverTimestamp() }, replyState: "replied", updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    return Response.json({ partnerReply: { text: input.text, repliedAt: new Date().toISOString() } });
  } catch (error) {
    const message = error instanceof z.ZodError ? "A reply must be between 1 and 2,000 characters." : error instanceof Error ? error.message : "Unable to save reply.";
    return Response.json({ error: message === "FORBIDDEN" ? "Property access required." : message === "REVIEW_NOT_FOUND" ? "Review not found." : "Unable to save reply." }, { status: message === "FORBIDDEN" ? 403 : 422 });
  }
}

export const PUT = withApiHandler(rawPUT, { route: "/api/partner/reviews/[reviewId]/reply", auth: "strict", requireAuth: true, cache: "private" });
