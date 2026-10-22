export const propertyPhotoCategories = [
  { value: "exterior", label: "Exterior / entrance" },
  { value: "room", label: "Room / bedroom" },
  { value: "bathroom", label: "Bathroom" },
  { value: "reception", label: "Reception / lobby" },
  { value: "facilities", label: "Facilities" },
  { value: "accessibility", label: "Accessibility" },
  { value: "additional", label: "Other spaces" },
] as const;
export type PropertyPhotoCategory = typeof propertyPhotoCategories[number]["value"];
export const photoCategoryValues = propertyPhotoCategories.map((item) => item.value) as [PropertyPhotoCategory, ...PropertyPhotoCategory[]];
export const isRoomPhoto = (category: string | null | undefined) => category === "room" || category === "bathroom";
export type PhotoRequirementAsset = { id: string; kind?: string; category?: string | null; roomTypeId?: string | null; moderationStatus?: string; status?: string };
export type PhotoRequirementRoom = { id: string; name: string; status?: string; mediaIds?: string[] };

/** Pending uploads can be submitted for review; rejected/deleted images never count. */
export function photoRequirements(assets: PhotoRequirementAsset[], rooms: PhotoRequirementRoom[], coverMediaId?: string | null) {
  const photos = assets.filter((asset) => asset.kind === "property_image" && ["pending", "approved"].includes(asset.moderationStatus ?? asset.status ?? ""));
  const activeRooms = rooms.filter((room) => !["paused", "archived"].includes(room.status ?? "active"));
  const minimum = Math.max(6, 1 + activeRooms.length * 2);
  const checks = [
    { key: "total", label: `At least ${minimum} photos`, complete: photos.length >= minimum },
    { key: "exterior", label: "Exterior / entrance photo", complete: photos.some((photo) => photo.category === "exterior") },
    ...activeRooms.flatMap((room) => (["room", "bathroom"] as const).map((category) => ({
      key: `${room.id}_${category}`, label: `${room.name} · ${category === "room" ? "Bedroom photo" : "Bathroom photo"}`,
      complete: photos.some((photo) => photo.category === category && (photo.roomTypeId ? photo.roomTypeId === room.id : room.mediaIds?.includes(photo.id))),
    }))),
    { key: "cover", label: "Choose a cover photo", complete: photos.some((photo) => photo.id === coverMediaId) },
  ];
  return { photos, minimum, checks, missing: checks.filter((check) => !check.complete).map((check) => check.label), complete: checks.every((check) => check.complete) };
}
