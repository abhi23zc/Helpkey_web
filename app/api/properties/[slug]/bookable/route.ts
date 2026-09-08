import { adminDb } from "@/lib/firebase/admin";
import { resolvePublicImage } from "@/lib/media-resolver";

export async function GET(_request: Request, { params }: RouteContext<"/api/properties/[slug]/bookable">) {
  const { slug } = await params; const property = (await adminDb.collection("properties").where("slug", "==", slug).limit(1).get()).docs[0];
  if (!property || property.data()?.status !== "active" || property.data()?.approvalStatus !== "approved" || property.data()?.isBookable !== true) return Response.json({ error: "PROPERTY_NOT_FOUND" }, { status: 404 });
  const [rooms, rates, policies] = await Promise.all([adminDb.collection("roomTypes").where("propertyId", "==", property.id).where("status", "==", "active").get(), adminDb.collection("ratePlans").where("propertyId", "==", property.id).where("status", "==", "active").get(), adminDb.collection("cancellationPolicies").where("propertyId", "==", property.id).where("status", "==", "active").get()]);
  const policy = new Map(policies.docs.map(doc => [doc.id, doc.data()]));
  const output = await Promise.all(rooms.docs.map(async room => { const data = room.data(); const cover = typeof data.coverMediaId === "string" ? await adminDb.collection("mediaAssets").doc(data.coverMediaId).get() : null; const coverData = cover?.data(); const image = cover && coverData ? await resolvePublicImage(cover.id, coverData, typeof coverData.altText === "string" ? coverData.altText : "") : null;
    return { id: room.id, name: data.name ?? "Room", description: data.description ?? "", totalInventory: data.totalInventory ?? 0, maxAdults: data.maxAdults ?? 1, maxChildren: data.maxChildren ?? 0, maxInfants: data.maxInfants ?? 0, roomSizeSqFt: data.roomSizeSqFt ?? null, bedConfigurations: data.bedConfigurations ?? [], imageUrl: image?.imageUrl ?? null, imageSrcSet: image?.imageSrcSet ?? "", imageWidth: image?.width ?? 1, imageHeight: image?.height ?? 1, rates: rates.docs.filter(rate => rate.data().roomTypeId === room.id).map(rate => { const item = rate.data(), cancellation = policy.get(item.cancellationPolicyId); return { id: rate.id, name: item.name ?? "Standard rate", code: item.code ?? null, basePricePaise: item.basePricePaise ?? 0, paymentMode: item.paymentMode ?? "full", taxBasisPoints: item.taxBasisPoints ?? 0, customerFeePaise: item.customerFeePaise ?? 0, cancellation: cancellation ? { name: cancellation.name ?? "Cancellation policy", description: cancellation.description ?? "" } : null }; }) };
  }));
  return Response.json({ rooms: output.filter(room => room.rates.length) });
}
