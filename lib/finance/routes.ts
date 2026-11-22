import "server-only";
import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { financeHistory, mutateFinance, readFinance } from "./service";
type Context = { params: Promise<{ propertyId?: string }> };
export function financeRoute(admin: boolean, write: boolean, property = false) {
  const route = admin
    ? "/api/admin/finance"
    : "/api/partner/properties/[propertyId]/finance";
  return withApiHandler<Context>(
    async (request, context) => {
      const uid = actorFromRequest().uid;
      const url = new URL(request.url);
      const propertyId = property
        ? (await context.params).propertyId
        : url.searchParams.get("propertyId") || undefined;
      if (!write && admin && url.searchParams.get("history") === "1")
        return Response.json(
          await financeHistory(
            uid,
            url.searchParams.get("cursor") || undefined,
          ),
        );
      if (!write)
        return Response.json(await readFinance(uid, propertyId, admin));
      const body = await request.json();
      return Response.json(await mutateFinance(uid, body, propertyId, admin));
    },
    {
      route,
      auth: "strict",
      requireAuth: true,
      cache: "private",
      legacyShape: false,
    },
  );
}
