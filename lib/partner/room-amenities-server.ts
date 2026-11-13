import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { buildRoomAmenityOptions } from "./room-amenities";

export async function loadRoomAmenityOptions() {
  const snapshot = await adminDb.collection("amenities").limit(500).get();
  return buildRoomAmenityOptions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
}
