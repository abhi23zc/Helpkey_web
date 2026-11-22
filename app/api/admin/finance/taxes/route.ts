import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { mutateTaxConfiguration, readTaxConfiguration, saveTaxProfile, saveSupplierTaxProfile } from "@/lib/finance/tax-configuration";
export const GET = withApiHandler(async () => Response.json(await readTaxConfiguration(actorFromRequest().uid)), { route: "/api/admin/finance/taxes", auth: "strict", requireAuth: true, cache: "private", legacyShape: false });
export const POST = withApiHandler(async request => {
  const propertyId = new URL(request.url).searchParams.get("propertyId");
  const supplierId = new URL(request.url).searchParams.get("supplierId");
  if (supplierId) return Response.json(await saveSupplierTaxProfile(actorFromRequest().uid, supplierId, await request.json()));
  if (propertyId?.includes("/")) return Response.json({ error: "Invalid property" }, { status: 422 });
  return Response.json(propertyId ? await saveTaxProfile(actorFromRequest().uid, propertyId, await request.json()) : await mutateTaxConfiguration(actorFromRequest().uid, await request.json()));
}, { route: "/api/admin/finance/taxes", auth: "strict", requireAuth: true, cache: "private", legacyShape: false });
