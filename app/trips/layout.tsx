import { PrivateIdentityBoundary } from "@/components/auth/private-identity-boundary";
import { requireAuthenticatedUser } from "@/lib/auth/session";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser("strict");
  return <PrivateIdentityBoundary uid={user.uid}>{children}</PrivateIdentityBoundary>;
}
