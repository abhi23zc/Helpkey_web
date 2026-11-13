"use client";
import { useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthCard } from "@/components/auth/auth-card";
import { apiFetch } from "@/lib/api/client";
export function CustomerBookingLink({ bookingId }: { bookingId: string }) {
  const token = useSyncExternalStore(
    (callback) => {
      window.addEventListener("hashchange", callback);
      return () => window.removeEventListener("hashchange", callback);
    },
    () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
    () => "",
  );
  return (
    <CustomerBookingLinkForm
      key={`${bookingId}:${token}`}
      bookingId={bookingId}
      token={token}
    />
  );
}
function CustomerBookingLinkForm({
  bookingId,
  token,
}: {
  bookingId: string;
  token: string;
}) {
  const { appUser, loading, refreshUser } = useAuth();
  const [preview, setPreview] = useState<{
    propertyName: string;
    reference: string;
    checkIn: string;
    checkOut: string;
    guestName: string;
  }>();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  async function submit(accept: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<typeof preview>(
        `/api/bookings/${bookingId}/customer-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, accept }),
        },
      );
      setPreview(result);
      if (accept) setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to link reservation.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Checking your account…</p>;
  if (!appUser) return <AuthCard onSuccess={() => void refreshUser()} />;
  return (
    <main className="mx-auto my-10 max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-[#061224]">
      <h1 className="text-xl font-bold">Link your hotel reservation</h1>
      <p className="text-sm">
        Signed in as {appUser.email || "an account without a verified email"}.
      </p>
      {!token && (
        <p role="alert">
          The private token is missing. Ask reception to share the complete
          invitation link.
        </p>
      )}
      <p>
        Use the invited verified email. Accepting gives this account access to
        reservation details and guest updates.
      </p>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <p>
          {preview.propertyName} · {preview.reference}
          <br />
          {preview.guestName} · {preview.checkIn} → {preview.checkOut}
        </p>
      )}
      {done ? (
        <a className="underline" href={`/trips/${bookingId}`}>
          View reservation
        </a>
      ) : (
        <button
          disabled={busy || !token}
          className="rounded-xl bg-[#061224] p-3 text-white disabled:opacity-50"
          onClick={() => void submit(!!preview)}
        >
          {preview ? "Accept and link reservation" : "Review invitation"}
        </button>
      )}
    </main>
  );
}
