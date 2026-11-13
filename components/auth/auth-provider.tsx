"use client";

import React, { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth, hasFirebaseClientConfig, signOut } from "@/lib/firebase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { AppUser } from "@/types/auth";
import { bindPrivateStorage, clearPrivateStorage } from "@/lib/query/private-session";

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

  const [generation, setGeneration] = useState(0);
  const requestGeneration = useRef(0);
  const authTransition = useRef(false);
  const resetPrivate = useCallback(() => {
    requestGeneration.current += 1;
    try { clearPrivateStorage(sessionStorage); } catch { /* Browser storage may be disabled. */ }
    void queryClient.cancelQueries();
    queryClient.clear();
    window.dispatchEvent(new Event("helpkey-private-reset"));
    setGeneration(v => v + 1);
  }, [queryClient]);
  const refreshUser = useCallback(async () => {
    if (authTransition.current) return;
    const request = ++requestGeneration.current;
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const next = response.ok ? ((await response.json()) as { user: AppUser }).user : null;
      if (request !== requestGeneration.current) return;
      if (previousAccount.current !== undefined && previousAccount.current !== next?.uid) resetPrivate();
      previousAccount.current = next?.uid;
      try { bindPrivateStorage(sessionStorage, next?.uid); } catch { /* Browser storage may be disabled. */ }
      setAppUser(next);
    } catch { if (request === requestGeneration.current) setAppUser(null); }
  }, [resetPrivate]);

  const logout = useCallback(async () => {
    authTransition.current = true;
    resetPrivate();
    setAppUser(null);
    setLoading(true);
    localStorage.setItem("helpkey-auth-event", `logout-start:${crypto.randomUUID()}`);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out could not be confirmed. Please retry.");
      if (canUseFirebase) await signOut(getFirebaseAuth());
      window.location.replace("/");
    } finally { authTransition.current = false; localStorage.setItem("helpkey-auth-event", `logout-complete:${crypto.randomUUID()}`); setLoading(false); }
  }, [canUseFirebase, resetPrivate]);

  useEffect(() => {
    const sync = () => { resetPrivate(); setAppUser(null); setLoading(true); void refreshUser().finally(() => setLoading(false)); };
    const storage = (event: StorageEvent) => {
      if (event.key !== "helpkey-auth-event") return;
      authTransition.current = event.newValue?.startsWith("logout-start:") === true;
      if (authTransition.current) { resetPrivate(); setAppUser(null); setLoading(true); }
      else sync();
    };
    const visible = () => { if (document.visibilityState === "visible" && !authTransition.current) sync(); };
    window.addEventListener("storage", storage);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("storage", storage); window.removeEventListener("pageshow", sync); document.removeEventListener("visibilitychange", visible); };
  }, [resetPrivate, refreshUser]);

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

  return <AuthContext.Provider value={value}><Fragment key={`${appUser?.uid || "anonymous"}:${generation}`}>{children}</Fragment></AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return value;
}

/** Protected server-rendered boundaries may be prerendered before the root client provider. */
export function useOptionalAuth() { return useContext(AuthContext); }

/**
 * Returns true only after client-side hydration once the signed-in user has the
 * "partner" role. Guarded by `mounted` to avoid SSR/CSR hydration mismatches
 * when used to conditionally render navigation items.
 */
export function useIsPartner() {
  const { appUser } = useAuth();
  return Boolean(appUser?.roles?.includes("partner"));
}
