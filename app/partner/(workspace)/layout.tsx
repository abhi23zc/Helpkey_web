import type { ReactNode } from "react";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { loadPartnerShell } from "@/lib/services/partner-shell";

/** Authentication is resolved once for the persistent partner navigation tree. */
export default async function PartnerWorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser("read");
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({ queryKey: queryKeys.partnerShell, queryFn: () => loadPartnerShell(user), staleTime: 30_000 });
  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
