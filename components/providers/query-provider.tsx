"use client";

import { useState, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  const makeClient = () => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: (attempt, error) => attempt < 1 && !(error && typeof error === "object" && "status" in error && Number((error as { status: number }).status) < 500), refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
  const [client, setClient] = useState(makeClient);
  useEffect(() => {
    const reset = () => setClient(previous => { void previous.cancelQueries(); previous.clear(); return makeClient(); });
    window.addEventListener("helpkey-private-reset", reset);
    return () => window.removeEventListener("helpkey-private-reset", reset);
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
