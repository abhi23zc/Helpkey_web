"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

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
  taxBasisPoints?: number;
  customerFeePaise?: number;
  depositBasisPoints?: number;
  minimumNights?: number;
  maximumNights?: number | null;
  status: "active" | "paused";
};

export type ListingRoomType = {
  id: string;
  name: string;
  description: string;
  inventory: number;
  maxAdults: number;
  maxChildren: number;
  maxInfants: number;
  bedConfigurations: Array<{ bedType: string; count: number }>;
  roomSizeSqFt: number | null;
  bathroomType: "private" | "shared";
  amenityIds: string[];
  mediaIds: string[];
  coverMediaId: string | null;
  status: "active" | "paused";
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
  id: "photos" | "amenities" | "basicInfo" | "location" | "policies" | "safetyDocs";
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
  const locationComplete = Boolean(property.address?.city && property.googlePlaceId);
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
      id: "location",
      label: "Location",
      complete: locationComplete,
      hint: locationComplete ? "Property location confirmed." : "Add city and confirmed map location.",
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

export function usePropertyListing(propertyId: string | undefined, view: "listing" | "rooms" = "listing") {
  const queryClient = useQueryClient();
  const key = useMemo(() => propertyId
    ? (view === "rooms" ? queryKeys.partnerRooms(propertyId) : queryKeys.partnerListing(propertyId, view))
    : (["partner", "no-property", view] as const), [propertyId, view]);
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(propertyId),
    queryFn: ({ signal }) => apiFetch<ListingResponse>(`/api/partner/properties/${propertyId}?view=${view}`, { signal, cache: "no-store" }),
    staleTime: 30_000,
  });
  const data = query.data ?? null;
  const reload = useCallback(() => void queryClient.invalidateQueries({ queryKey: key, exact: true }), [key, queryClient]);

  /**
   * Applies a locally-known change to the in-memory snapshot without a network
   * refetch. Each write endpoint returns the affected entity, so the UI stays
   * consistent while avoiding the expensive full-listing GET on every action.
   */
  const applyPatch = useCallback((mutate: (current: ListingResponse) => ListingResponse) => {
    queryClient.setQueryData<ListingResponse>(key, (current) => current ? mutate(current) : current);
  }, [key, queryClient]);

  const patchProperty = useCallback(
    (fields: Partial<ListingProperty>) =>
      applyPatch((current) => ({ ...current, property: { ...current.property, ...fields } })),
    [applyPatch],
  );

  const addRoomType = useCallback(
    (room: ListingRoomType) =>
      applyPatch((current) => ({ ...current, roomTypes: [...current.roomTypes, room] })),
    [applyPatch],
  );

  const updateRoomType = useCallback(
    (roomTypeId: string, fields: Partial<ListingRoomType>) =>
      applyPatch((current) => ({
        ...current,
        roomTypes: current.roomTypes.map((room) => (room.id === roomTypeId ? { ...room, ...fields } : room)),
      })),
    [applyPatch],
  );

  const removeRoomType = useCallback(
    (roomTypeId: string) =>
      applyPatch((current) => ({
        ...current,
        roomTypes: current.roomTypes.filter((room) => room.id !== roomTypeId),
        // Rate plans are cascade-deleted server-side; drop them locally too so
        // metrics and the starting-rate derive correctly without a refetch.
        ratePlans: current.ratePlans.filter((rate) => rate.roomTypeId !== roomTypeId),
      })),
    [applyPatch],
  );

  const addRatePlan = useCallback(
    (rate: ListingRatePlan) =>
      applyPatch((current) => ({ ...current, ratePlans: [...current.ratePlans, rate] })),
    [applyPatch],
  );

  const updateRatePlan = useCallback(
    (ratePlanId: string, fields: Partial<ListingRatePlan>) =>
      applyPatch((current) => ({
        ...current,
        ratePlans: current.ratePlans.map((rate) => (rate.id === ratePlanId ? { ...rate, ...fields } : rate)),
      })),
    [applyPatch],
  );

  const addPolicy = useCallback(
    (policy: { id: string; name?: string }) =>
      applyPatch((current) => ({
        ...current,
        policies: [...current.policies, policy],
        property: {
          ...current.property,
          cancellationPolicyIds: current.property.cancellationPolicyIds.includes(policy.id)
            ? current.property.cancellationPolicyIds
            : [...current.property.cancellationPolicyIds, policy.id],
        },
      })),
    [applyPatch],
  );

  const addMedia = useCallback(
    (media: ListingMedia, coverMediaId?: string | null) =>
      applyPatch((current) => ({
        ...current,
        media: [...current.media, media],
        property: {
          ...current.property,
          coverMediaId: coverMediaId ?? current.property.coverMediaId,
        },
      })),
    [applyPatch],
  );

  const setCoverMedia = useCallback(
    (mediaId: string) =>
      applyPatch((current) => ({
        ...current,
        property: { ...current.property, coverMediaId: mediaId },
        media: current.media.map((asset) => ({ ...asset, isCover: asset.id === mediaId })),
      })),
    [applyPatch],
  );

  const removeMedia = useCallback(
    (mediaId: string, coverMediaId: string | null) =>
      applyPatch((current) => ({
        ...current,
        media: current.media.filter((asset) => asset.id !== mediaId).map((asset) => ({ ...asset, isCover: asset.id === coverMediaId })),
        property: { ...current.property, coverMediaId },
      })),
    [applyPatch],
  );

  const addDocument = useCallback(
    (document: { id: string; documentType?: string; status?: string }) =>
      applyPatch((current) => ({
        ...current,
        documents: [
          ...current.documents.filter((existing) => existing.documentType !== document.documentType),
          document,
        ],
      })),
    [applyPatch],
  );

  const checklist = useMemo(() => (data ? buildChecklist(data) : []), [data]);

  const photos = useMemo(
    () => (data ? sellablePhotos(data.media) : []),
    [data],
  );

  const startingPricePaise = useMemo(() => {
    if (!data?.ratePlans.length) return null;
    const prices = data.ratePlans
      .filter((rate) => rate.status === "active")
      .map((rate) => rate.basePricePaise)
      .filter((value): value is number => typeof value === "number" && value > 0);
    return prices.length ? Math.min(...prices) : null;
  }, [data]);

  // Join room types with their cheapest rate plan for the Rooms Summary card.
  const roomsWithPricing = useMemo<RoomWithPrice[]>(() => {
    if (!data) return [];
    return data.roomTypes.map((room) => {
      const rates = data.ratePlans.filter((rate) => rate.roomTypeId === room.id && rate.status === "active" && rate.basePricePaise > 0);
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
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : "",
    reload,
    patchProperty,
    addRoomType,
    updateRoomType,
    removeRoomType,
    addRatePlan,
    updateRatePlan,
    addPolicy,
    addMedia,
    setCoverMedia,
    removeMedia,
    addDocument,
  };
}

export type PropertyListingData = ReturnType<typeof usePropertyListing>;

/** Local-mutation callbacks editors use to update the snapshot without a refetch. */
export type ListingMutations = Pick<
  PropertyListingData,
  "patchProperty" | "addRoomType" | "updateRoomType" | "removeRoomType" | "addRatePlan" | "updateRatePlan" | "addPolicy" | "addMedia" | "setCoverMedia" | "removeMedia" | "addDocument" | "reload"
>;
