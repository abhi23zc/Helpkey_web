import { PrivateIdentityBoundary } from "@/components/auth/private-identity-boundary";
import type { ReactNode } from "react";
import { requireAuthenticatedUser } from "@/lib/auth/session";

/** Authentication is resolved once for the persistent partner navigation tree. */
export default async function PartnerWorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser("read");
  // Shell data is loaded by the account-scoped client query with a deadline
  // and retry UI. Blocking this layout on a duplicate prefetch hides that UI.
  return <PrivateIdentityBoundary uid={user.uid}>{children}</PrivateIdentityBoundary>;
}
