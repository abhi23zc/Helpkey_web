import { getAuthenticatedUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { propertySummary, requireAdmin } from "@/lib/admin/data";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthenticated." }, { status: 401 });
  try {
    await requireAdmin(user.uid);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const approval = url.searchParams.get("approval");
    const search = (url.searchParams.get("search") ?? "").toLowerCase();

    // Push the approval filter into the indexed query when present; otherwise
    // fall back to a bounded scan. Remaining filters (status/search) refine the
    // reduced result set in memory.
    let query: FirebaseFirestore.Query = adminDb.collection("properties");
    if (approval) query = query.where("approvalStatus", "==", approval);
    query = query.limit(500);

    const properties = (await query.get()).docs
      .map((doc) => propertySummary(doc.id, doc.data()))
      .filter(
        (item) =>
          (!status || item.status === status) &&
          (!search ||
            `${item.name} ${(item.address as { city?: string }).city ?? ""} ${item.propertyType}`
              .toLowerCase()
              .includes(search)),
      );
    return Response.json({ properties });
  } catch {
    return Response.json({ error: "Admin access required." }, { status: 403 });
  }
}
