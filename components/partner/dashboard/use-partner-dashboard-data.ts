"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { queryKeys } from "@/lib/query/keys";
import { apiFetch } from "@/lib/api/client";
import { localParts, validDate } from "@/lib/booking/domain";
import type { DashboardUser, Property } from "./types";
import { setupTasks } from "./types";
import { useAuth } from "@/components/auth/auth-provider";
import { DEFAULT_CURRENCY } from "@/lib/currency";
type DashboardResponse = {
  businessName: string | null;
  currency: string;
  user: DashboardUser | null;
  properties: Property[];
};
const EMPTY_PROPERTIES: Property[] = [];
export function usePartnerDashboardData() {
  const { appUser, loading: authLoading, refreshUser } = useAuth();
  const client = useQueryClient();
  const lastAccess = useRef<string | null>(null);
  const shell = useQuery({
    queryKey: [...queryKeys.partnerShell, appUser?.uid],
    enabled: !!appUser,
    queryFn: async ({ signal }) => {
      const data = await apiFetch<DashboardResponse>("/api/partner/dashboard", {
        signal,
        cache: "no-store",
        timeoutMs: 15_000,
      });
      const fingerprint = JSON.stringify([
        data.user?.uid,
        data.properties.map((p) => [
          p.id,
          p.role,
          p.accessRevision,
          p.permissions,
        ]),
      ]);
      if (lastAccess.current !== null && lastAccess.current !== fingerprint) {
        const predicate = (q: { queryKey: readonly unknown[] }) =>
          (q.queryKey[0] === "partner" && q.queryKey[1] !== "shell") ||
          q.queryKey[0] === "notifications" ||
          q.queryKey[0] === "private";
        await client.cancelQueries({ predicate });
        client.removeQueries({ predicate });
      }
      lastAccess.current = fingerprint;
      return data;
    },
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
  });
  const params = useSearchParams();
  const matchesAccount = !!appUser && shell.data?.user?.uid === appUser.uid;
  const properties =
    matchesAccount && !shell.isError
      ? (shell.data?.properties ?? EMPTY_PROPERTIES)
      : EMPTY_PROPERTIES;
  const selectedProperty = params.get("propertyId")
    ? properties.find((p) => p.id === params.get("propertyId"))
    : properties[0];
  const accessFingerprint = JSON.stringify(
    properties.map((p) => [
      p.id,
      p.role,
      p.accessRevision,
      p.pmsState,
      p.operationsReason,
    ]),
  );
  useEffect(() => {
    void client.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === "partner" && q.queryKey[1] !== "shell",
    });
  }, [accessFingerprint, client]);
  useEffect(() => {
    if (shell.data?.user?.uid && appUser && !matchesAccount) void refreshUser();
  }, [shell.data?.user?.uid, appUser, matchesAccount, refreshUser]);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const date = params.get("date");
  const reportingDate =
    date && validDate(date)
      ? date
      : localParts(clock, selectedProperty?.timezone || "Asia/Kolkata").date;
  const update = useCallback((key: string, value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    if (key === "propertyId") {
      url.searchParams.delete("bookingId");
      url.searchParams.delete("q");
    }
    window.history.pushState(null, "", url);
  }, []);
  const completedSteps =
    selectedProperty?.onboarding?.completedSteps?.length ?? 0;
  return {
    properties,
    selectedProperty,
    selectedPropertyId: selectedProperty?.id ?? "",
    setSelectedPropertyId: (id: string) => update("propertyId", id),
    reportingDate,
    setReportingDate: (next: string) => {
      if (validDate(next)) update("date", next);
    },
    businessName: shell.data?.businessName ?? null,
    currency:
      selectedProperty?.currency ?? shell.data?.currency ?? DEFAULT_CURRENCY,
    user: shell.data?.user ?? null,
    error:
      shell.error instanceof Error
        ? shell.error.message
        : !authLoading && !appUser
          ? "Your session ended. Sign in again to access your hotels."
          : params.get("propertyId") && !selectedProperty && !shell.isPending
            ? "You no longer have access to this hotel. Choose an assigned hotel."
            : "",
    loading: authLoading || (!!appUser && shell.isPending),
    reload: shell.refetch,
    counts: {
      completedSteps,
      currentStep: selectedProperty?.onboarding?.currentStep ?? 1,
      health: Math.round((completedSteps / setupTasks.length) * 100),
      isLive:
        selectedProperty?.status === "active" &&
        selectedProperty.approvalStatus === "approved" &&
        selectedProperty.isBookable === true,
      setupTaskCount: setupTasks.length,
    },
  };
}
export type PartnerDashboardData = ReturnType<typeof usePartnerDashboardData>;
