import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { verifyAadhaarLab, verifyAadhaarLabSchema } from "@/lib/aadhaar-lab";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request, { params }: RouteContext<"/api/admin/aadhaar-lab/[recordId]/verify">) { const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401, headers }); try { await requireAdmin(user.uid); const { recordId } = await params; return Response.json(await verifyAadhaarLab(user.uid, recordId, verifyAadhaarLabSchema.parse(await request.json()).otp), { headers }); } catch (error) { const message = error instanceof Error ? error.message : "AADHAAR_LAB_ERROR"; return Response.json({ error: message }, { status: ["RECORD_NOT_FOUND"].includes(message) ? 404 : ["REFERENCE_EXPIRED", "REFERENCE_ALREADY_USED"].includes(message) ? 409 : 400, headers }); } }
