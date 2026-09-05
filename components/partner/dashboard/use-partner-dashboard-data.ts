"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardUser, Property } from "./types";
import { setupTasks } from "./types";
import { DEFAULT_CURRENCY } from "@/lib/currency";

type DashboardResponse = {
  businessName: string | null;
  currency: string;
  user: DashboardUser | null;
  properties: Property[];
};

async function loadPartnerDashboard(): Promise<DashboardResponse> {
  const response = await fetch("/api/partner/dashboard", { cache: "no-store" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Unable to load dashboard.");
  return {
    businessName: json.businessName ?? null,
    currency: json.currency ?? DEFAULT_CURRENCY,
    user: json.user ?? null,
    properties: (json.properties as Property[]) ?? [],
  };
}

export function usePartnerDashboardData() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadPartnerDashboard()
      .then((data) => {
        setProperties(data.properties);
        setBusinessName(data.businessName);
        setCurrency(data.currency);
        setUser(data.user);
        setSelectedPropertyId((current) => current || data.properties[0]?.id || "");
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Unable to load dashboard."
        )
      );
  }, []);

  const selectedProperty = useMemo(
    () =>
      properties.find((property) => property.id === selectedPropertyId) ??
      properties[0],
    [properties, selectedPropertyId]
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
    selectedPropertyId,
    setSelectedPropertyId,
    businessName,
    currency: selectedProperty?.currency ?? currency,
    user,
    error,
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
