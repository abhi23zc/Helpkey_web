import { getAuthenticatedUser } from "@/lib/auth/session";
import { beginOnboarding, startPropertyDraft } from "@/lib/partner/service";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(); if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try { const body = await request.json(); const result = body.startDraft ? await startPropertyDraft(user.uid, String(body.name ?? "").trim()) : await beginOnboarding(user.uid, body); return Response.json(result, { status: 201 }); }
  catch (error) { const message = error instanceof Error ? error.message : "Unable to start onboarding."; return Response.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 422 }); }
}
