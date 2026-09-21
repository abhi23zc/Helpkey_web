import { withApiHandler } from "@/lib/api/handler";
import { bookingError, bookingInput, quote } from "@/lib/bookings";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { clientIp, privateFingerprint } from "@/lib/api/request";
import { apiContext } from "@/lib/api/context";
import { ApiException } from "@/lib/api/errors";
const rawPOST = async function POST(request: Request) { try { const actor = apiContext.actor(); await Promise.all([enforceRateLimit({ bucket: "quote-ip", identifier: privateFingerprint(clientIp(request)), limit: 60, windowSeconds: 60 }), ...(actor ? [enforceRateLimit({ bucket: "quote-user", identifier: actor.uid, limit: 60, windowSeconds: 60 })] : [])]); return Response.json({ quote: await quote(bookingInput.parse(await request.json())) }); } catch (error) { if (error instanceof ApiException) throw error; return Response.json({ error: bookingError(error) }, { status: 422 }); } }

export const POST = withApiHandler(rawPOST, { route: "/api/bookings/quote", auth: "read", requireAuth: false, cache: "private" });
