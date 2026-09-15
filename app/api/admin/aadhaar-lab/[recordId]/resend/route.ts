import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { resendAadhaarLab } from "@/lib/aadhaar-lab";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(_request: Request, { params }: RouteContext<"/api/admin/aadhaar-lab/[recordId]/resend">) { const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401, headers }); try { await requireAdmin(user.uid); const { recordId } = await params; return Response.json(await resendAadhaarLab(user.uid, recordId), { headers }); } catch (error) { const message = error instanceof Error ? error.message : "AADHAAR_LAB_ERROR"; return Response.json({ error: message }, { status: ["RECORD_NOT_FOUND"].includes(message) ? 404 : 409, headers }); } }
