"use client";
import Link from "next/link";
import { useOptionalAuth } from "./auth-provider";
export function PrivateIdentityBoundary({
  uid,
  children,
}: {
  uid: string;
  children: React.ReactNode;
}) {
  const auth = useOptionalAuth();
  const appUser = auth?.appUser,
    loading = !auth || auth.loading;
  if (loading)
    return (
      <p role="status" className="p-6">
        Checking your account…
      </p>
    );
  if (!appUser || appUser.uid !== uid)
    return (
      <div className="p-6" role="alert">
        Your account changed.{" "}
        <Link className="underline" href="/">
          Return to Helpkey
        </Link>{" "}
        to continue.
      </div>
    );
  return children;
}
