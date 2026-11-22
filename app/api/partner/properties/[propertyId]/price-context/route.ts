import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { propertyAccess } from "@/lib/partner/pms/access";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_POLICY, resolvePolicy } from "@/lib/finance/domain";
export const GET = withApiHandler(async (_request, context: { params: Promise<{ propertyId: string }> }) => {
  const { propertyId } = await context.params;
  return Response.json(await adminDb.runTransaction(async tx => {
    await propertyAccess(actorFromRequest().uid, propertyId, "rates.manage", tx);
    const [g, h] = await Promise.all([tx.get(adminDb.collection("financeConfiguration").doc("global")), tx.get(adminDb.collection("propertyFinance").doc(propertyId))]);
    const effective = resolvePolicy(g.get("policy") ?? DEFAULT_POLICY, h.get("overrides") ?? {}).effective;
    return { basis: effective.priceEntry, paymentOptions: effective.paymentOptions, globalRevision: g.get("revision") ?? 0, hotelRevision: h.get("revision") ?? 0 };
  }));
}, { route: "/api/partner/properties/[propertyId]/price-context", auth: "strict", requireAuth: true, cache: "private", legacyShape: false });
