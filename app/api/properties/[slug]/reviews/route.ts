import { withApiHandler } from "@/lib/api/handler";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { publicReviews } from "@/lib/reviews";
import { cachedPublic } from "@/lib/api/cache";
const query = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(20).default(5), cursor: z.string().max(2048).optional() });
const rawGET = async function GET(request: Request, { params }: RouteContext<"/api/properties/[slug]/reviews">) {
  try { const { slug } = await params; const input = query.parse(Object.fromEntries(new URL(request.url).searchParams)); const property = (await adminDb.collection("properties").where("slug", "==", slug).limit(1).get()).docs[0]; if (!property || property.data().status !== "active" || property.data().approvalStatus !== "approved" || property.data().isBookable !== true) return Response.json({ error: "PROPERTY_NOT_FOUND" }, { status: 404 }); return Response.json(await cachedPublic(["reviews", property.id, input.cursor ?? `page-${input.page}`, input.pageSize], () => publicReviews(property.id, input.page, input.pageSize, input.cursor))); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load reviews." }, { status: 422 }); }
}

export const GET = withApiHandler(rawGET, { route: "/api/properties/[slug]/reviews", auth: "public", requireAuth: false, cache: "public" });
