"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "./api";
import type { Overview, Property, User } from "./types";

const adminKeys = {
  overview: ["admin", "overview"] as const,
  properties: ["admin", "properties"] as const,
  users: ["admin", "users"] as const,
};

const message = (error: unknown) => error instanceof Error ? error.message : "";

export function useAdminOverview() {
  const overview = useQuery({ queryKey: adminKeys.overview, queryFn: ({ signal }) => adminApi<Overview>("/api/admin/overview", { signal }), staleTime: 30_000 });
  const properties = useQuery({ queryKey: adminKeys.properties, queryFn: ({ signal }) => adminApi<{ properties: Property[] }>("/api/admin/properties", { signal }), staleTime: 30_000 });
  const reload = () => Promise.all([overview.refetch(), properties.refetch()]);
  return { overview: overview.data ?? null, properties: properties.data?.properties ?? [], error: message(overview.error ?? properties.error), reload };
}

export function useAdminProperties() {
  const query = useQuery({ queryKey: adminKeys.properties, queryFn: ({ signal }) => adminApi<{ properties: Property[] }>("/api/admin/properties", { signal }), staleTime: 30_000 });
  return { properties: query.data?.properties ?? [], error: message(query.error), reload: query.refetch };
}

export function useAdminUsers() {
  const query = useQuery({ queryKey: adminKeys.users, queryFn: ({ signal }) => adminApi<{ users: User[] }>("/api/admin/users", { signal }), staleTime: 30_000 });
  return { users: query.data?.users ?? [], error: message(query.error), reload: query.refetch };
}
