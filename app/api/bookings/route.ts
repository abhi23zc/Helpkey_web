import { withApiHandler } from "@/lib/api/handler";
import { createBooking, bookingError } from "@/lib/bookings";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { idempotencyKey, runIdempotent } from "@/lib/api/idempotency";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { clientIp, privateFingerprint } from "@/lib/api/request";
import { ApiException } from "@/lib/api/errors";
import { ProviderError } from "@/lib/providers/http";
const rawPOST = async function POST(request: Request) { const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }); try { await Promise.all([enforceRateLimit({ bucket: "booking-user", identifier: user.uid, limit: 10, windowSeconds: 300, failClosed: true }), enforceRateLimit({ bucket: "booking-ip", identifier: privateFingerprint(clientIp(request)), limit: 20, windowSeconds: 300, failClosed: true })]); const body = await request.json(); const key = request.headers.get("idempotency-key") ?? idempotencyKey(user.uid, JSON.stringify(body)); return Response.json(await runIdempotent("booking.create", key, user.uid, () => createBooking(user.uid, body)), { status: 201 }); } catch (error) { if (error instanceof ApiException) throw error; if (error instanceof ProviderError) throw new ApiException(error.code, error.status, "The payment provider is temporarily unavailable."); return Response.json({ error: bookingError(error) }, { status: 422 }); } }

export const POST = withApiHandler(rawPOST, { route: "/api/bookings", auth: "strict", requireAuth: true, cache: "private" });
