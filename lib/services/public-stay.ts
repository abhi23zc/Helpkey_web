import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { resolvePublicImage } from "@/lib/media-resolver";
import { amenityCodeMap } from "@/lib/customer/catalog";
import { resolveAmenityCodes } from "@/lib/customer/amenities";
import type { z } from "zod";
import type { staySearchSchema } from "@/lib/customer/stay-search";

type Stay = z.infer<typeof staySearchSchema>;

function datesBetween(checkIn: string, checkOut: string) {
  const dates: string[] = [];
  for (let date = new Date(`${checkIn}T00:00:00Z`), end = new Date(`${checkOut}T00:00:00Z`); date < end; date = new Date(date.getTime() + 86_400_000)) dates.push(date.toISOString().slice(0, 10));
  return dates;
}

async function getAllBounded(refs: FirebaseFirestore.DocumentReference[], batchSize = 300) {
  const documents: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let offset = 0; offset < refs.length; offset += batchSize) documents.push(...await adminDb.getAll(...refs.slice(offset, offset + batchSize)));
  return documents;
}

export async function loadBookableProperty(slug: string, stay: Stay) {
  const property = (await adminDb.collection("properties").where("slug", "==", slug).limit(1).get()).docs[0];
  if (!property || property.data()?.status !== "active" || property.data()?.approvalStatus !== "approved" || property.data()?.isBookable !== true) return null;

  const [roomsSnapshot, ratesSnapshot, policiesSnapshot, amenityCodesById] = await Promise.all([
    adminDb.collection("roomTypes").where("propertyId", "==", property.id).where("status", "==", "active").limit(50).get(),
    adminDb.collection("ratePlans").where("propertyId", "==", property.id).where("status", "==", "active").limit(100).get(),
    adminDb.collection("cancellationPolicies").where("propertyId", "==", property.id).where("status", "==", "active").limit(50).get(),
    amenityCodeMap(),
  ]);
  const rooms = roomsSnapshot.docs.filter((room) => {
    const data = room.data();
    return stay.adults <= Number(data.maxAdults ?? 1)
      && stay.children <= Number(data.maxChildren ?? 0)
      && stay.infants <= Number(data.maxInfants ?? 10)
      && stay.adults + stay.children <= Number(data.maxOccupancy ?? Number(data.maxAdults ?? 1) + Number(data.maxChildren ?? 0));
  });
  const coverIds = [...new Set(rooms.map((room) => room.data().coverMediaId).filter((id): id is string => typeof id === "string" && Boolean(id)))];
  const coverDocuments = await getAllBounded(coverIds.map((id) => adminDb.collection("mediaAssets").doc(id)));
  const coverById = new Map(coverDocuments.filter((doc) => doc.exists).map((doc) => [doc.id, doc]));
  const policies = new Map(policiesSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  const nights = stay.checkIn && stay.checkOut ? datesBetween(stay.checkIn, stay.checkOut) : [];

  const inventoryRefs = nights.flatMap((date) => rooms.map((room) => adminDb.collection("roomNightInventory").doc(`${property.id}_${room.id}_${date}`)));
  const inventory = new Map((await getAllBounded(inventoryRefs)).map((doc) => [doc.id, Number(doc.data()?.reserved ?? 0)]));

  const output = await Promise.all(rooms.map(async (room) => {
    const data = room.data();
    const available = Number(data.totalInventory ?? 0) > 0 && nights.every((date) => (inventory.get(`${property.id}_${room.id}_${date}`) ?? 0) < Number(data.totalInventory ?? 0));
    if (nights.length && !available) return null;
    const cover = typeof data.coverMediaId === "string" ? coverById.get(data.coverMediaId) : null;
    const coverData = cover?.data();
    const image = cover && coverData ? await resolvePublicImage(cover.id, coverData, typeof coverData.altText === "string" ? coverData.altText : "") : null;
    const rates = ratesSnapshot.docs.flatMap((rate) => {
      const item = rate.data();
      if (item.roomTypeId !== room.id) return [];
      const rules = item.stayRules ?? {};
      if (nights.length && (nights.length < Number(rules.minimumNights ?? 1) || (Number(rules.maximumNights ?? 0) > 0 && nights.length > Number(rules.maximumNights)))) return [];
      const cancellation = policies.get(item.cancellationPolicyId);
      return [{ id: rate.id, name: item.name ?? "Standard rate", code: item.code ?? null, basePricePaise: item.basePricePaise ?? 0, paymentMode: item.paymentMode ?? "full", taxBasisPoints: item.taxBasisPoints ?? 0, customerFeePaise: item.customerFeePaise ?? 0, cancellation: cancellation ? { name: cancellation.name ?? "Cancellation policy", description: cancellation.description ?? "" } : null }];
    });
    if (!rates.length) return null;
    return { id: room.id, name: data.name ?? "Room", description: data.description ?? "", totalInventory: data.totalInventory ?? 0, maxAdults: data.maxAdults ?? 1, maxChildren: data.maxChildren ?? 0, maxInfants: data.maxInfants ?? 0, roomSizeSqFt: data.roomSizeSqFt ?? null, bedConfigurations: data.bedConfigurations ?? [], amenityCodes: resolveAmenityCodes(data.amenityIds, amenityCodesById), imageUrl: image?.imageUrl ?? null, imageSrcSet: image?.imageSrcSet ?? "", imageWidth: image?.width ?? 1, imageHeight: image?.height ?? 1, rates };
  }));
  return { rooms: output.filter((room): room is NonNullable<typeof room> => Boolean(room)) };
}
