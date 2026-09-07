import { bookingError, bookingInput, quote } from "@/lib/bookings";
export async function POST(request: Request) { try { return Response.json({ quote: await quote(bookingInput.parse(await request.json())) }); } catch (error) { return Response.json({ error: bookingError(error) }, { status: 422 }); } }
