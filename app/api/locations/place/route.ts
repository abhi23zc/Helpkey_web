import { withApiHandler } from "@/lib/api/handler";
import { resolvePlace } from "@/lib/locations/places";

export const GET = withApiHandler(resolvePlace, { route: "/api/locations/place", cache: "none", legacyShape: false });
