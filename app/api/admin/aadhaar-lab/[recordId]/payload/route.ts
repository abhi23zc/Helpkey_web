import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { getAadhaarLabPayload } from "@/lib/aadhaar-lab";
export const dynamic = "force-dynamic";
const rawGET = async function GET(_request: Request, { params }: RouteContext<"/api/admin/aadhaar-lab/[recordId]/payload">) { const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401, headers: { "Cache-Control": "private, no-store" } }); try { await requireAdmin(user.uid); const { recordId } = await params; return Response.json(await getAadhaarLabPayload(user.uid, recordId), { headers: { "Cache-Control": "private, no-store" } }); } catch { return Response.json({ error: "RECORD_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "private, no-store" } }); } }

export const GET = withApiHandler(rawGET, { route: "/api/admin/aadhaar-lab/[recordId]/payload", auth: "strict", requireAuth: true, cache: "private" });
