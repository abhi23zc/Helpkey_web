import { processPublicationJobs } from "@/lib/media-publication";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("x-cron-secret") !== expected) return Response.json({ error: "CRON_UNAUTHORIZED" }, { status: 401 });
  return Response.json(await processPublicationJobs(10));
}
