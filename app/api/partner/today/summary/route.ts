import { reservationHandler } from "@/lib/partner/reservations/handler";
import { loadToday } from "@/lib/partner/today/service";
export const GET = reservationHandler("/api/partner/today/summary", false, async (request, _context, uid) => Response.json(await loadToday(uid, Object.fromEntries(new URL(request.url).searchParams), false)));
