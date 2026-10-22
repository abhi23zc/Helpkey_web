import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { isRoomPhoto } from "./photo-requirements";

export async function validatePhotoRoom(propertyId: string, category: string, roomTypeId?: string | null) {
  if (!isRoomPhoto(category)) {
    if (roomTypeId) throw new Error("Only bedroom and bathroom photos can be assigned to a room type.");
    return null;
  }
  if (!roomTypeId) throw new Error("Choose the room type for this bedroom or bathroom photo.");
  const room = await adminDb.collection("roomTypes").doc(roomTypeId).get();
  if (!room.exists || room.get("propertyId") !== propertyId || room.get("status") === "archived") throw new Error("Choose a room type belonging to this property.");
  return room;
}
