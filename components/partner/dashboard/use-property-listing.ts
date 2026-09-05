"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_CURRENCY } from "@/lib/currency";

export type ListingMedia = {
  id: string;
  kind: string;
  category: string | null;
  fileName: string | null;
  altText: string;
  moderationStatus: string;
  isCover: boolean;
  imageUrl: string | null;
};

export type ListingRatePlan = {
  id: string;
  name: string;
  code: string;
  basePricePaise: number;
  roomTypeId: string;
  cancellationPolicyId: string;
  paymentMode?: string;
};

export type ListingRoomType = {
  id: string;
  name: string;
  description: string;
  inventory: number;
  maxAdults: number;
  amenityIds: string[];
};

export type ListingProperty = {
  id: string;
  name: string;
  propertyType: string;
  description: string;
  address?: { line1?: string; city?: string; state?: string; postalCode?: string; countryCode?: string };
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  timezone?: string;
  coverMediaId: string | null;
  amenityIds: string[];
  cancellationPolicyIds: string[];
  checkInTime?: string;
  checkOutTime?: string;
  publicPhone?: string;
  publicEmail?: string;
  childrenPolicy?: Record<string, unknown>;
  petPolicy?: Record<string, unknown>;
  smokingPolicy?: Record<string, unknown>;
  status: string;
  approvalStatus: string;
  rejectionReason: string | null;
  ratingAverage: number;
  ratingCount: number;
  currency: string;
  submittedAt: string | null;
  updatedAt: string | null;
};

export type RoomWithPrice = {
  id: string;
  name: string;
  inventory: number;
  fromPaise: number | null;
  paymentMode: string | null;
};

export type ListingResponse = {
  property: ListingProperty;
  roomTypes: ListingRoomType[];
  ratePlans: ListingRatePlan[];
  policies: Array<{ id: string; name?: string }>;
  media: ListingMedia[];
  documents: Array<{ id: string; documentType?: string; status?: string }>;
};

export type ChecklistItem = {
  id: "photos" | "amenities" | "basicInfo" | "policies" | "safetyDocs";
  label: string;
  complete: boolean;
  hint: string;
};

/** Maps a wizard editor step to each listing concern. Steps: 2 Location, 3 Details, 4 Rooms&Rates, 5 Facilities, 6 Photos, 7 Verification. */
export const EDIT_STEP = {
  basicInfo: 3,
  location: 2,
  photos: 6,
  rooms: 4,
  amenities: 5,
  policies: 4,
  safetyDocs: 7,
} as const;

const REQUIRED_PHOTOS = 6;
const REQUIRED_DOCUMENTS = ["pan", "government_id_front", "government_id_back"];

/** Property-image assets that count toward the listing (pending or approved). */
function sellablePhotos(media: ListingMedia[]): ListingMedia[] {
  return media.filter(
    (asset) =>
      asset.kind === "property_image" &&
      ["pending", "approved"].includes(asset.moderationStatus),
  );
}

/**
 * Builds the submission checklist. Mirrors the server-side `submit()` validator
 * so the UI never promises readiness the backend would reject.
 */
function buildChecklist(data: ListingResponse): ChecklistItem[] {
  const { property, roomTypes, ratePlans, media, documents } = data;
  const photos = sellablePhotos(media);

  const sellableRooms = new Set(roomTypes.map((room) => room.id));
  const roomsWithRate = new Set(
    ratePlans
      .filter((rate) => sellableRooms.has(rate.roomTypeId) && rate.cancellationPolicyId)
      .map((rate) => rate.roomTypeId),
  );
  const documentKinds = new Set(
    documents
      .filter((doc) => ["pending", "approved"].includes(doc.status ?? ""))
      .map((doc) => doc.documentType),
  );

  const basicInfoComplete = Boolean(
    property.name &&
      property.description &&
      property.checkInTime &&
      property.checkOutTime &&
      property.publicPhone,
  );
  const policiesComplete =
    sellableRooms.size > 0 &&
    roomsWithRate.size === sellableRooms.size &&
    property.cancellationPolicyIds.length > 0;

  return [
    {
      id: "photos",
      label: "Photos",
      complete: photos.length >= REQUIRED_PHOTOS && Boolean(property.coverMediaId),
      hint:
        photos.length >= REQUIRED_PHOTOS
          ? "Cover photo and gallery ready."
          : `Add ${REQUIRED_PHOTOS - photos.length} more photo${REQUIRED_PHOTOS - photos.length === 1 ? "" : "s"}.`,
    },
    {
      id: "amenities",
      label: "Amenities",
      complete: property.amenityIds.length > 0,
      hint: property.amenityIds.length > 0 ? "Facilities listed." : "Add your facilities.",
    },
    {
      id: "basicInfo",
      label: "Basic Info",
      complete: basicInfoComplete,
      hint: basicInfoComplete ? "Details complete." : "Complete name, hours and contact.",
    },
    {
      id: "policies",
      label: "Policies",
      complete: policiesComplete,
      hint: policiesComplete
        ? "Every room has a rate and policy."
        : "Add a rate and cancellation policy for each room.",
    },
    {
      id: "safetyDocs",
      label: "Safety Docs",
      complete: REQUIRED_DOCUMENTS.every((kind) => documentKinds.has(kind)),
      hint: REQUIRED_DOCUMENTS.every((kind) => documentKinds.has(kind))
        ? "Identity documents uploaded."
        : "Upload required identity documents.",
    },
  ];
}

export function usePropertyListing(propertyId: string | undefined) {
  const [data, setData] = useState<ListingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!propertyId) {
        setData(null);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/partner/properties/${propertyId}`, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? "Unable to load listing.");
        if (!cancelled) setData(json as ListingResponse);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load listing.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [propertyId, reloadToken]);

  const checklist = useMemo(() => (data ? buildChecklist(data) : []), [data]);

  const photos = useMemo(
    () => (data ? sellablePhotos(data.media) : []),
    [data],
  );

  const startingPricePaise = useMemo(() => {
    if (!data?.ratePlans.length) return null;
    const prices = data.ratePlans
      .map((rate) => rate.basePricePaise)
      .filter((value): value is number => typeof value === "number" && value > 0);
    return prices.length ? Math.min(...prices) : null;
  }, [data]);

  // Join room types with their cheapest rate plan for the Rooms Summary card.
  const roomsWithPricing = useMemo<RoomWithPrice[]>(() => {
    if (!data) return [];
    return data.roomTypes.map((room) => {
      const rates = data.ratePlans.filter((rate) => rate.roomTypeId === room.id && rate.basePricePaise > 0);
      const cheapest = rates.reduce<ListingRatePlan | null>(
        (min, rate) => (!min || rate.basePricePaise < min.basePricePaise ? rate : min),
        null,
      );
      return {
        id: room.id,
        name: room.name,
        inventory: room.inventory,
        fromPaise: cheapest ? cheapest.basePricePaise : null,
        paymentMode: cheapest?.paymentMode ?? null,
      };
    });
  }, [data]);

  const currency = data?.property.currency ?? DEFAULT_CURRENCY;

  return {
    data,
    property: data?.property,
    photos,
    checklist,
    roomsWithPricing,
    startingPricePaise,
    currency,
    loading,
    error,
    reload,
  };
}

export type PropertyListingData = ReturnType<typeof usePropertyListing>;
