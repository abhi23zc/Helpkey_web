"use client";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthCard } from "@/components/auth/auth-card";
import { apiFetch } from "@/lib/api/client";
export function PmsInvitationPage({ invitationId }: { invitationId: string }) {
  const { appUser, loading, refreshUser } = useAuth();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const token = useSyncExternalStore(
    (callback) => {
      window.addEventListener("hashchange", callback);
      return () => window.removeEventListener("hashchange", callback);
    },
    () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
    () => "",
  );
  const preview = useQuery({
    queryKey: ["private", appUser?.uid, "invitation", invitationId, token],
    enabled: !!appUser && !!token,
    retry: false,
    queryFn: ({ signal }) =>
      apiFetch<{ propertyName: string; role: string; email: string }>(
        `/api/partner/invitations/${invitationId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({ token, preview: true }),
        },
      ),
  });
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ propertyId: string }>(
        `/api/partner/invitations/${invitationId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );
      await refreshUser();
      location.replace(
        `/partner/settings?propertyId=${encodeURIComponent(result.propertyId)}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to accept invitation.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#f7f5f0] px-4 py-12">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#061224]">
          Hotel team invitation
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Sign in with the verified email invited by the hotel owner. Google
          sign-in is supported. Only accept links you received from your hotel
          owner.
        </p>
        {loading ? (
          <p role="status" className="mt-4">
            Checking your account…
          </p>
        ) : !appUser ? (
          <div className="mt-5">
            <AuthCard onSuccess={() => void refreshUser()} />
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm">
              Signed in as{" "}
              <strong>
                {appUser.email || "an account without a verified email"}
              </strong>
            </p>
            <p className="mt-3 text-sm" role="status">
              {preview.data
                ? `${preview.data.propertyName} · Invited role: ${preview.data.role}`
                : preview.isFetching
                  ? "Checking invitation…"
                  : ""}
            </p>
            {preview.error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {preview.error.message}
              </p>
            )}
            <button
              disabled={busy || !token || !preview.data}
              className="mt-5 min-h-11 rounded-xl bg-[#061224] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              onClick={() => void accept()}
            >
              {busy ? "Accepting…" : "Accept hotel invitation"}
            </button>
            <p className="mt-3 text-sm">
              <a href="/profile" className="underline">
                Use account settings to switch accounts
              </a>{" "}
              if this is not the invited email.
            </p>
          </>
        )}
        {!token && (
          <p role="alert" className="mt-4 text-sm text-amber-800">
            Open the complete invitation link, including its private token.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
