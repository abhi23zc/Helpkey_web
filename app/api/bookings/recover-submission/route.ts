import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { recoverSubmission } from "@/lib/booking/recovery";
const rawPOST = async (request: Request) => {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await enforceRateLimit({ bucket: "submission-recovery", identifier: user.uid, limit: 30, windowSeconds: 300, failClosed: true });
  const body = await request.json();
  if (typeof body.submissionKey !== "string" || !body.submissionKey || body.submissionKey.length > 200) return Response.json({ error: "INVALID_SUBMISSION_KEY" }, { status: 422 });
  return Response.json(await recoverSubmission(user.uid, body.submissionKey));
};
export const POST = withApiHandler(rawPOST, { route: "/api/bookings/recover-submission", auth: "strict", requireAuth: true, cache: "private" });
