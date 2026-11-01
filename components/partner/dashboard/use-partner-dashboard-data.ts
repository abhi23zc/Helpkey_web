"use client";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { queryKeys } from "@/lib/query/keys";
import { apiFetch } from "@/lib/api/client";
import { localParts, validDate } from "@/lib/booking/domain";
import type { DashboardUser, Property } from "./types";
import { setupTasks } from "./types";
import { DEFAULT_CURRENCY } from "@/lib/currency";
type DashboardResponse = { businessName: string | null; currency: string; user: DashboardUser | null; properties: Property[] };
const EMPTY_PROPERTIES: Property[] = [];
export function usePartnerDashboardData() {
  const shell = useQuery({ queryKey: queryKeys.partnerShell, queryFn: ({ signal }) => apiFetch<DashboardResponse>("/api/partner/dashboard", { signal, cache: "no-store" }), staleTime: 30_000 });
  const params = useSearchParams();
  const properties = shell.data?.properties ?? EMPTY_PROPERTIES;
  const selectedProperty = properties.find(p => p.id === params.get("propertyId")) ?? properties[0];
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const date = params.get("date");
  const reportingDate = date && validDate(date) ? date : localParts(clock, selectedProperty?.timezone || "Asia/Kolkata").date;
  const update = useCallback((key: string, value: string) => {
    const url = new URL(window.location.href); url.searchParams.set(key, value);
    if (key === "propertyId") { url.searchParams.delete("bookingId"); url.searchParams.delete("q"); }
    window.history.pushState(null, "", url);
  }, []);
  const completedSteps = selectedProperty?.onboarding?.completedSteps?.length ?? 0;
  return {
    properties, selectedProperty, selectedPropertyId: selectedProperty?.id ?? "", setSelectedPropertyId: (id: string) => update("propertyId", id),
    reportingDate, setReportingDate: (next: string) => { if (validDate(next)) update("date", next); },
    businessName: shell.data?.businessName ?? null, currency: selectedProperty?.currency ?? shell.data?.currency ?? DEFAULT_CURRENCY, user: shell.data?.user ?? null,
    error: shell.error instanceof Error ? shell.error.message : "", loading: shell.isLoading,
    counts: { completedSteps, currentStep: selectedProperty?.onboarding?.currentStep ?? 1, health: Math.round(completedSteps / setupTasks.length * 100), isLive: selectedProperty?.status === "active" && selectedProperty.approvalStatus === "approved" && selectedProperty.isBookable === true, setupTaskCount: setupTasks.length },
  };
}
export type PartnerDashboardData = ReturnType<typeof usePartnerDashboardData>;
