"use client";
import { createContext, useContext } from "react";
const HotelCapabilities = createContext<readonly string[] | null>(null);
export const HotelCapabilitiesProvider = HotelCapabilities.Provider;
export function useHotelCapabilities() {
  const permissions = useContext(HotelCapabilities);
  // Null supports legacy embedded callers; authenticated shells always supply explicit grants.
  return (permission: string) =>
    permissions === null || permissions.includes(permission);
}
