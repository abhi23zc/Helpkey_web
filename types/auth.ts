export type UserRole = "customer";

export type SegmentPreference = "business-traveler";

export type AppUser = {
  uid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  photoURL: string;
  role: UserRole;
  segmentPreference: SegmentPreference;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

export type SessionUserInput = {
  idToken: string;
  fullName?: string;
};
