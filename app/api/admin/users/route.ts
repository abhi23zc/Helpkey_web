import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin, serializeDirectoryUser } from "@/lib/admin/data";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const url = new URL(request.url); const search = (url.searchParams.get("search") ?? "").trim().toLowerCase(); const role = url.searchParams.get("role"); const status = url.searchParams.get("status");
    const users = (await adminDb.collection("users").limit(500).get()).docs.map(serializeDirectoryUser).filter((item) => {
      const matchSearch = !search || [item.fullName, item.email, item.phoneNumber, item.uid].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
      return matchSearch && (!role || item.roles.includes(role as "customer" | "partner" | "admin")) && (!status || item.accountStatus === status);
    });
    return Response.json({ users });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Admin access required." }, { status: 403 }); }
}
