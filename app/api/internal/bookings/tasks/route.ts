import { timingSafeEqual } from "node:crypto";
import { bookingTaskSchema } from "@/lib/background/booking-jobs";
import { executeBookingTask } from "@/lib/booking/tasks";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const supplied = Buffer.from(request.headers.get("x-cron-secret") ?? ""), expected = Buffer.from(process.env.CRON_SECRET ?? "");
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return Response.json({ error: "BODY_TOO_LARGE" }, { status: 413 });
  const parsed = bookingTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_TASK" }, { status: 400 });
  return Response.json(await executeBookingTask(parsed.data), { headers: { "Cache-Control": "no-store" } });
}
