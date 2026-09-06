import { searchSuggestions } from "@/lib/customer/catalog";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return Response.json({ suggestions: [] });
  try { return Response.json({ suggestions: await searchSuggestions(q) }); }
  catch { return Response.json({ suggestions: [] }, { status: 200 }); }
}
