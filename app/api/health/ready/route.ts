import { withRedis } from "@/lib/redis";
export async function GET() {
  const redis = process.env.REDIS_URL && process.env.REDIS_DISABLED !== "1" ? await withRedis(client => client.ping()) : "disabled";
  // Queue/cache health is advisory: successful Firestore saves remain available during Redis outages.
  return Response.json({ ready: true, cache: redis === null ? "degraded" : redis === "disabled" ? "disabled" : "ready" }, { headers: { "Cache-Control": "no-store" } });
}
