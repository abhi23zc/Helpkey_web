import "server-only";
import { cache } from "react";
import { adminDb } from "@/lib/firebase/admin";

// React's cache is scoped to a server render, never shared across requests.
// Detail prefetch and offer prefetch reuse these source reads during hydration.
export const publicPropertySource = cache(async (slug: string) =>
  (await adminDb.collection("properties").where("slug", "==", slug).limit(1).get()).docs[0] ?? null
);
export const publicRoomSources = cache(async (propertyId: string) =>
  adminDb.collection("roomTypes").where("propertyId", "==", propertyId).where("status", "==", "active").limit(50).get()
);
export const publicRateSources = cache(async (propertyId: string) =>
  adminDb.collection("ratePlans").where("propertyId", "==", propertyId).where("status", "==", "active").limit(100).get()
);
