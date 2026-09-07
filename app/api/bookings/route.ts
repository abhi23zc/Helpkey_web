import { createBooking, bookingError } from "@/lib/bookings";
import { getAuthenticatedUser } from "@/lib/auth/session";
export async function POST(request: Request) { const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }); try { return Response.json(await createBooking(user.uid, await request.json()), { status: 201 }); } catch (error) { return Response.json({ error: bookingError(error) }, { status: 422 }); } }
