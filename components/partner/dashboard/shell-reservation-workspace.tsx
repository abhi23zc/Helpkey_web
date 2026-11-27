"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ReservationWorkspace } from "./reservation-workspace";
import { invalidateOperationalQueries } from "@/lib/partner/operational-queries";
/** Pages with their own queue keep ownership; other supported entry points use this host. */
export function ShellReservationWorkspace({ propertyId }: { propertyId: string }) {
  const path = usePathname(), params = useSearchParams(), client = useQueryClient();
  const refresh = useCallback(() => { void invalidateOperationalQueries(client, propertyId); }, [client, propertyId]);
  if (["/partner/dashboard", "/partner/reservations", "/partner/finances"].includes(path)) return null;
  return <ReservationWorkspace bookingId={params.get("bookingId")} propertyId={propertyId} onChanged={refresh} onClose={() => {
    const next = new URL(window.location.href); next.searchParams.delete("bookingId"); next.searchParams.delete("section"); window.history.replaceState(null, "", next);
  }} />;
}
