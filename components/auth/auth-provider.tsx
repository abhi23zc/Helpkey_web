"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth, hasFirebaseClientConfig, signOut } from "@/lib/firebase/client";
import { useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const previousAccount = useRef<string | undefined>(undefined);
  const canUseFirebase = hasFirebaseClientConfig();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const previous = previousAccount.current;
    if (previous && previous !== appUser?.uid) {
      void queryClient.cancelQueries({ queryKey: ["wishlist", previous] });
      queryClient.removeQueries({ queryKey: ["wishlist", previous] });
    }
    previousAccount.current = appUser?.uid;
  }, [appUser?.uid, queryClient]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) { setAppUser(null); return; }
      const data = (await response.json()) as { user: AppUser };
      setAppUser(data.user);
    } catch { setAppUser(null); }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    if (canUseFirebase) await signOut(getFirebaseAuth());
    setAppUser(null);
  }, [canUseFirebase]);

  useEffect(() => {
    if (!canUseFirebase) {
      void Promise.resolve().then(refreshUser).finally(() => setLoading(false));
      return undefined;
    }

    return onAuthStateChanged(getFirebaseAuth(), async (user) => {
      setFirebaseUser(user);

      // The server session is authoritative, including a valid session restored
      // without a browser Firebase user (for example after reopening a tab).
      await refreshUser();

      setLoading(false);
    });
  }, [canUseFirebase, refreshUser]);

  const value = useMemo(
    () => ({ firebaseUser, appUser, loading, refreshUser, logout }),
    [firebaseUser, appUser, loading, refreshUser, logout],
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

/**
 * Returns true only after client-side hydration once the signed-in user has the
 * "partner" role. Guarded by `mounted` to avoid SSR/CSR hydration mismatches
 * when used to conditionally render navigation items.
 */
export function useIsPartner() {
  const { appUser } = useAuth();
  return Boolean(appUser?.roles?.includes("partner"));
}
