import { withApiHandler } from "@/lib/api/handler";
import { loadPublicHotel } from "@/lib/services/public-hotel";

const rawGET = async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const property = await loadPublicHotel(slug);
    if (!property) return Response.json({ error: "PROPERTY_NOT_FOUND" }, { status: 404 });
    return Response.json({ property });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load property." }, { status: 500 }); }
}

export const GET = withApiHandler(rawGET, { route: "/api/properties/[slug]", auth: "public", requireAuth: false, cache: "none" });
