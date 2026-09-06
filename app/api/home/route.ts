import { homeCatalog } from "@/lib/customer/catalog";

export async function GET() {
  try { return Response.json(await homeCatalog()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load homepage." }, { status: 500 }); }
}
