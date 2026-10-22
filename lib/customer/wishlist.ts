export type SavedHotel = { propertyId: string; property: import("@/lib/customer/catalog").CatalogProperty | null };
export type WishlistPage = { items: SavedHotel[]; nextCursor: string | null; hasMore: boolean };
export type WishlistIds = { propertyIds: string[] };
