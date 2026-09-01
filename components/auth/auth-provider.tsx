"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth, hasFirebaseClientConfig, signOut } from "@/lib/firebase/client";
import type { AppUser } from "@/types/auth";

type AuthContextValue = {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const canUseFirebase = hasFirebaseClientConfig();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(canUseFirebase);

  const refreshUser = async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });

    if (!response.ok) {
      setAppUser(null);
      return;
    }

    const data = (await response.json()) as { user: AppUser };
    setAppUser(data.user);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await signOut(getFirebaseAuth());
    setAppUser(null);
  };

  useEffect(() => {
    if (!canUseFirebase) {
      return undefined;
    }

    return onAuthStateChanged(getFirebaseAuth(), async (user) => {
      setFirebaseUser(user);

      if (user) {
        await refreshUser();
      } else {
        setAppUser(null);
      }

      setLoading(false);
    });
  }, [canUseFirebase]);

  const value = useMemo(
    () => ({ firebaseUser, appUser, loading, refreshUser, logout }),
    [firebaseUser, appUser, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return value;
}
