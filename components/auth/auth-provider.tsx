"use client";

import React, {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  getFirebaseAuth,
  hasFirebaseClientConfig,
  signOut,
} from "@/lib/firebase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { AppUser } from "@/types/auth";
import {
  bindPrivateStorage,
  clearPrivateStorage,
} from "@/lib/query/private-session";

type AuthContextValue = {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function IdentityCheck({
  pending,
  failed,
  retry,
}: {
  pending: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal();
    if (!pending && dialog.current?.open) dialog.current.close();
  }, [pending]);
  return (
    <dialog
      ref={dialog}
      aria-label="Account verification"
      onCancel={(e) => e.preventDefault()}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-white p-6 backdrop:bg-white"
    >
      <p role={failed ? "alert" : "status"}>
        {failed
          ? "Your account could not be checked. Your unfinished work is retained."
          : "Checking your account…"}
      </p>
      {failed && (
        <button type="button" className="mt-3 underline" onClick={retry}>
          Retry account check
        </button>
      )}
    </dialog>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const previousAccount = useRef<string | null | undefined>(undefined);
  const canUseFirebase = hasFirebaseClientConfig();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [identityPending, setIdentityPending] = useState(false);
  const [identityError, setIdentityError] = useState(false);

  const [generation, setGeneration] = useState(0);
  const requestGeneration = useRef(0);
  const identityRequest = useRef<AbortController | null>(null);
  const authTransition = useRef(false);
  const resetPrivate = useCallback(() => {
    requestGeneration.current += 1;
    identityRequest.current?.abort();
    try {
      clearPrivateStorage(sessionStorage);
    } catch {
      /* Browser storage may be disabled. */
    }
    void queryClient.cancelQueries();
    queryClient.clear();
    window.dispatchEvent(new Event("helpkey-private-reset"));
    setGeneration((v) => v + 1);
  }, [queryClient]);
  const refreshUser = useCallback(async () => {
    if (authTransition.current) return;
    const request = ++requestGeneration.current;
    identityRequest.current?.abort();
    const controller = new AbortController();
    identityRequest.current = controller;
    const deadline = setTimeout(() => controller.abort(), 10_000);
    // Hide retained private screens until identity is checked, but keep them
    // mounted. A same-account foreground refresh must not discard a draft.
    setIdentityPending(true);
    setIdentityError(false);
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok && ![401, 403].includes(response.status))
        throw new Error("Identity check unavailable");
      const next = response.ok
        ? ((await response.json()) as { user: AppUser }).user
        : null;
      if (response.ok && (!next || typeof next.uid !== "string" || !next.uid))
        throw new Error("Invalid identity response");
      if (request !== requestGeneration.current) return;
      const nextUid = next?.uid ?? null;
      if (
        previousAccount.current !== undefined &&
        previousAccount.current !== nextUid
      )
        resetPrivate();
      previousAccount.current = nextUid;
      try {
        bindPrivateStorage(sessionStorage, next?.uid);
      } catch {
        /* Browser storage may be disabled. */
      }
      setAppUser(next);
      setIdentityPending(false);
    } catch {
      if (request === requestGeneration.current) setIdentityError(true);
    } finally {
      clearTimeout(deadline);
      if (identityRequest.current === controller)
        identityRequest.current = null;
    }
  }, [resetPrivate]);

  const logout = useCallback(async () => {
    authTransition.current = true;
    resetPrivate();
    setAppUser(null);
    setLoading(true);
    try {
      localStorage.setItem(
        "helpkey-auth-event",
        `logout-start:${crypto.randomUUID()}`,
      );
    } catch {
      /* Storage is optional. */
    }
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok)
        throw new Error("Sign-out could not be confirmed. Please retry.");
      if (canUseFirebase) await signOut(getFirebaseAuth());
      window.location.replace("/");
    } finally {
      authTransition.current = false;
      try {
        localStorage.setItem(
          "helpkey-auth-event",
          `logout-complete:${crypto.randomUUID()}`,
        );
      } catch {
        /* Storage is optional. */
      }
      setLoading(false);
    }
  }, [canUseFirebase, resetPrivate]);

  useEffect(() => {
    const sync = () => {
      void refreshUser().finally(() => setLoading(false));
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== "helpkey-auth-event") return;
      authTransition.current =
        event.newValue?.startsWith("logout-start:") === true;
      if (authTransition.current) {
        resetPrivate();
        setAppUser(null);
        setLoading(true);
      } else sync();
    };
    const visible = () => {
      if (document.visibilityState === "visible" && !authTransition.current)
        sync();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [resetPrivate, refreshUser]);

  useEffect(() => {
    if (!canUseFirebase) {
      void Promise.resolve()
        .then(refreshUser)
        .finally(() => setLoading(false));
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

  return (
    <AuthContext.Provider value={value}>
      <IdentityCheck
        pending={identityPending}
        failed={identityError}
        retry={() => void refreshUser()}
      />
      <div
        style={{ display: identityPending ? "none" : "contents" }}
        inert={identityPending}
      >
        <Fragment key={`${appUser?.uid || "anonymous"}:${generation}`}>
          {children}
        </Fragment>
      </div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return value;
}

/** Protected server-rendered boundaries may be prerendered before the root client provider. */
export function useOptionalAuth() {
  return useContext(AuthContext);
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
