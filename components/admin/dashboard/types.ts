export type Property = {
  id: string;
  name: string;
  propertyType: string;
  status: string;
  approvalStatus: string;
  address?: { city?: string; state?: string };
  partnerId?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  rejectionReason?: string | null;
};

export type User = {
  uid: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  roles: string[];
  accountStatus: string;
  lastLoginAt: string | null;
  createdAt?: string | null;
};

export type AdminAssetRecord = {
  id: string;
  name?: string;
  description?: string;
  publicPhone?: string;
  publicEmail?: string;
  checkInTime?: string;
  checkOutTime?: string;
  floors?: number;
  totalPhysicalRooms?: number;
  totalInventory?: number;
  inventory?: number;
  basePricePaise?: number;
  fileName?: string;
  documentType?: string;
  category?: string;
  mimeType?: string;
  moderationStatus?: string;
  status?: string;
};

export type AdminRecord = AdminAssetRecord & Record<string, unknown>;

export type PropertyDetail = {
  property: AdminRecord;
  partner: AdminRecord | null;
  roomTypes: AdminRecord[];
  ratePlans: AdminRecord[];
  policies: AdminRecord[];
  media: AdminRecord[];
  documents: AdminRecord[];
};

export type Overview = {
  metrics: Record<string, number>;
  urgentProperties: Property[];
};

export type PartnerListItem = {
  user: User;
  partnerProperties: Property[];
  pendingCount: number;
  changesCount: number;
  activeCount: number;
  primaryProperty: Property | null;
  city: string;
  progress: number;
  state: "pending" | "approved" | "changes_requested" | "suspended" | "all";
  risk: "Low" | "Medium" | "High";
};

export const label = (value: string | null | undefined) =>
  (value ?? "-")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const textValue = (value: unknown) =>
  typeof value === "string" ? value : undefined;
