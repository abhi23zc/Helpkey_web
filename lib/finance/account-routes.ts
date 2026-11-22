import "server-only";
import { actorFromRequest, withApiHandler } from "@/lib/api/handler";
import { accountTransactions, mutateAccount, readAccount, readAccountConfiguration } from "./account-service";
type Context = { params: Promise<{ propertyId?: string }> };
export function accountRoute(admin: boolean, kind: "account" | "transactions" | "commands" | "configuration") {
  return withApiHandler<Context>(async (request, context) => {
    const uid = actorFromRequest().uid, url = new URL(request.url), params = await context.params;
    const propertyId = params.propertyId ?? url.searchParams.get("propertyId") ?? undefined;
    if (kind === "configuration") return Response.json(await readAccountConfiguration(uid));
    if (kind === "commands") return Response.json(await mutateAccount(uid, propertyId, await request.json()));
    if (!propertyId) return Response.json({ error: "A hotel is required" }, { status: 422 });
    return Response.json(kind === "transactions" ? await accountTransactions(uid, propertyId, admin, url.searchParams.get("cursor") ?? undefined) : await readAccount(uid, propertyId, admin));
  }, { route: admin ? `/api/admin/finance/${kind}` : `/api/partner/properties/[propertyId]/finance/${kind}`, auth: "strict", requireAuth: true, cache: "private", legacyShape: false });
}
