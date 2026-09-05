"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "./api";
import type { Overview, Property, User } from "./types";

export function useAdminOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [error, setError] = useState("");

  const loadOverview = useCallback(
    () =>
      adminApi<Overview>("/api/admin/overview")
        .then(setOverview)
        .catch((cause: Error) => setError(cause.message)),
    []
  );

  const loadProperties = useCallback(
    () =>
      adminApi<{ properties: Property[] }>("/api/admin/properties")
        .then((data) => setProperties(data.properties))
        .catch((cause: Error) => setError(cause.message)),
    []
  );

  const reload = useCallback(() => {
    void Promise.all([loadOverview(), loadProperties()]);
  }, [loadOverview, loadProperties]);

  useEffect(reload, [reload]);

  return { overview, properties, error, reload };
}

export function useAdminProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(
    () =>
      adminApi<{ properties: Property[] }>("/api/admin/properties")
        .then((data) => setProperties(data.properties))
        .catch((cause: Error) => setError(cause.message)),
    []
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { properties, error, reload };
}

export function useAdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(
    () =>
      adminApi<{ users: User[] }>("/api/admin/users")
        .then((data) => setUsers(data.users))
        .catch((cause: Error) => setError(cause.message)),
    []
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { users, error, reload };
}
