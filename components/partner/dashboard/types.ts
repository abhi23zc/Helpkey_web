export type Property = {
  id: string;
  name: string;
  propertyType: string;
  status: string;
  approvalStatus: string;
  rejectionReason: string | null;
  address?: { city?: string; state?: string };
  onboarding?: { currentStep: number; completedSteps?: number[] };
  totalPhysicalRooms?: number;
  currency?: string;
  coverImageUrl?: string | null;
  updatedAt?: string | null;
};

export type DashboardUser = {
  uid: string;
  fullName: string;
  email: string | null;
  photoURL: string | null;
};

export const setupTasks = [
  "Choose property type",
  "Confirm location",
  "Add basic details",
  "Add rooms and rates",
  "Set facilities",
  "Upload photos",
  "Upload ID documents",
  "Review and submit",
];
