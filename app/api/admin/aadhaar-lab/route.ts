import { withApiHandler } from "@/lib/api/handler";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/data";
import { labReadiness, listAadhaarLab, startAadhaarLab, startAadhaarLabSchema } from "@/lib/aadhaar-lab";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) { const message = error instanceof Error ? error.message : "AADHAAR_LAB_ERROR"; const status = ["INVALID_AADHAAR"].includes(message) ? 400 : ["RATE_LIMITED"].includes(message) ? 429 : ["PRODUCTION_CONFIRMATION_REQUIRED"].includes(message) ? 403 : 500; return Response.json({ error: message }, { status, headers }); }
const rawGET = async function GET() { const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401, headers }); try { await requireAdmin(user.uid); return Response.json({ readiness: labReadiness(), records: await listAadhaarLab(user.uid) }, { headers }); } catch (error) { return failure(error); } }
const rawPOST = async function POST(request: Request) { const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401, headers }); try { await requireAdmin(user.uid); return Response.json(await startAadhaarLab(user.uid, startAadhaarLabSchema.parse(await request.json())), { headers }); } catch (error) { return failure(error); } }

export const GET = withApiHandler(rawGET, { route: "/api/admin/aadhaar-lab", auth: "read", requireAuth: true, cache: "private" });
export const POST = withApiHandler(rawPOST, { route: "/api/admin/aadhaar-lab", auth: "strict", requireAuth: true, cache: "private" });
