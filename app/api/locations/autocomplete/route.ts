import { withApiHandler } from "@/lib/api/handler";
import { autocomplete } from "@/lib/locations/places";

export const GET = withApiHandler(autocomplete, { route: "/api/locations/autocomplete", cache: "none", legacyShape: false });
