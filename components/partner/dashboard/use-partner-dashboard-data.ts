"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { apiFetch } from "@/lib/api/client";
import type { DashboardUser, Property } from "./types";
import { setupTasks } from "./types";
import { DEFAULT_CURRENCY } from "@/lib/currency";

type DashboardResponse = {
  businessName: string | null;
  currency: string;
  user: DashboardUser | null;
  properties: Property[];
};
const EMPTY_PROPERTIES: Property[] = [];

export function usePartnerDashboardData() {
  const shell = useQuery({ queryKey: queryKeys.partnerShell, queryFn: ({ signal }) => apiFetch<DashboardResponse>("/api/partner/dashboard", { signal, cache: "no-store" }), staleTime: 30_000 });
  const properties = shell.data?.properties ?? EMPTY_PROPERTIES;
  const businessName = shell.data?.businessName ?? null;
  const currency = shell.data?.currency ?? DEFAULT_CURRENCY;
  const user = shell.data?.user ?? null;
  const [selectedPropertyId, setSelectedPropertyId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("propertyId") ?? "";
  });
  const [reportingDate, setReportingDateState] = useState(() => {
    const fallback = new Date().toISOString().slice(0, 10);
    if (typeof window === "undefined") return fallback;
    const date = new URLSearchParams(window.location.search).get("date");
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback;
  });

  const setReportingDate = (nextDate: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
    setReportingDateState(nextDate);
    const url = new URL(window.location.href);
    url.searchParams.set("date", nextDate);
    window.history.replaceState(null, "", url);
  };

  const effectivePropertyId = properties.some((property) => property.id === selectedPropertyId) ? selectedPropertyId : properties[0]?.id ?? "";

  const selectProperty = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    const url = new URL(window.location.href);
    url.searchParams.set("propertyId", propertyId);
    window.history.replaceState(null, "", url);
  };

  const selectedProperty = useMemo(
    () =>
      properties.find((property) => property.id === effectivePropertyId) ??
      properties[0],
    [properties, effectivePropertyId]
  );

  const completedSteps =
    selectedProperty?.onboarding?.completedSteps?.length ?? 0;
  const isLive = selectedProperty?.status === "active";
  const health = isLive
    ? 92
    : Math.max(12, Math.round((completedSteps / setupTasks.length) * 100));

  return {
    properties,
    selectedProperty,
    selectedPropertyId: effectivePropertyId,
    setSelectedPropertyId: selectProperty,
    reportingDate,
    setReportingDate,
    businessName,
    currency: selectedProperty?.currency ?? currency,
    user,
    error: shell.error instanceof Error ? shell.error.message : "",
    loading: shell.isLoading,
    counts: {
      completedSteps,
      currentStep: selectedProperty?.onboarding?.currentStep ?? 1,
      health,
      isLive,
      setupTaskCount: setupTasks.length,
    },
  };
}

export type PartnerDashboardData = ReturnType<typeof usePartnerDashboardData>;
