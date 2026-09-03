export const USER_ROLES = ["customer", "partner", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export type AccountStatus = "active" | "suspended" | "disabled" | "deleted";

export type AppUser = {
  uid: string;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  roles: UserRole[];
  accountStatus: AccountStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  preferredLanguage: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

export type SessionUserInput = {
  idToken: string;
  fullName?: string;
};
