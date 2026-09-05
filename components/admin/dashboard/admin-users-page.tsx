"use client";

import { AlertTriangle, RefreshCw, Search, Users } from "lucide-react";
import { useState } from "react";
import { adminApi } from "./api";
import { useAdminShell } from "./admin-shell";
import { useAdminUsers } from "./use-admin-data";
import { label, type User } from "./types";

export function AdminUsersPage() {
  const { searchQuery, setSearchQuery } = useAdminShell();
  const { users, error, reload } = useAdminUsers();

  return (
    <>
      {error && <AdminPageError message={error} />}
      <UsersPanel
        kind="customer"
        users={users}
        reload={reload}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
    </>
  );
}

function AdminPageError({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
      <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
      <p>{message}</p>
    </div>
  );
}

function UsersPanel({
  kind,
  users,
  reload,
  searchQuery,
  setSearchQuery,
}: {
  kind: "partner" | "customer";
  users: User[];
  reload: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visible = users
    .filter((item) =>
      kind === "partner"
        ? item.roles.includes("partner")
        : item.roles.includes("customer") && !item.roles.includes("partner")
    )
    .filter((item) =>
      `${item.fullName} ${item.email ?? ""} ${item.phoneNumber ?? ""}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    );

  const mutate = async (user: User, patch: Record<string, unknown>) => {
    setBusy(user.uid);
    setError("");
    try {
      await adminApi<unknown>(`/api/admin/users/${user.uid}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update account."
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#755a1a]">
              <span>Account Management</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#755a1a]" />
              <span className="normal-case tracking-normal text-slate-500 font-normal">
                Access Guard
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {kind === "partner" ? "Partners" : "Users & Customers"} ({visible.length})
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-500">
              Manage account access, administrative roles, and system privileges.
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4 text-[#755a1a]" /> Refresh
          </button>
        </div>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, email, or phone..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#755a1a]"
          />
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-4">
        {visible.map((user) => (
          <article
            key={user.uid}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs transition-all hover:shadow-md flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-base font-bold border border-slate-200 shrink-0">
                {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 text-base truncate">
                  {user.fullName || "Unnamed user"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 font-mono truncate">
                  {user.email ?? user.phoneNumber ?? user.uid}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 border border-slate-200"
                    >
                      {role}
                    </span>
                  ))}
                  <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                      user.accountStatus === "active"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-red-50 text-red-800 border-red-200"
                    }`}
                  >
                    {label(user.accountStatus)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100 lg:pt-0 lg:border-t-0">
              <button
                type="button"
                disabled={busy === user.uid}
                onClick={() =>
                  void mutate(user, {
                    accountStatus:
                      user.accountStatus === "active" ? "suspended" : "active",
                  })
                }
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                  user.accountStatus === "active"
                    ? "bg-red-50 text-red-800 border border-red-200 hover:bg-red-100"
                    : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                {user.accountStatus === "active"
                  ? "Suspend Account"
                  : "Reactivate Account"}
              </button>

              <button
                type="button"
                disabled={busy === user.uid}
                onClick={() =>
                  void mutate(user, {
                    roles: user.roles.includes("admin")
                      ? user.roles.filter((role) => role !== "admin")
                      : [...user.roles, "admin"],
                  })
                }
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {user.roles.includes("admin") ? "Remove admin" : "Make admin"}
              </button>

              <button
                type="button"
                disabled={busy === user.uid}
                onClick={() =>
                  void mutate(user, {
                    roles: user.roles.includes("partner")
                      ? user.roles.filter((role) => role !== "partner")
                      : [...user.roles, "partner"],
                  })
                }
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {user.roles.includes("partner")
                  ? "Remove partner"
                  : "Make partner"}
              </button>
            </div>
          </article>
        ))}

        {!visible.length && (
          <div className="py-16 rounded-2xl border border-slate-200 bg-white flex flex-col items-center justify-center text-center">
            <div className="h-14 w-14 bg-slate-100 rounded-full flex items-center justify-center mb-3 text-slate-400">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-base font-bold text-slate-900">
              No matching {kind}s
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Try adjusting your search criteria.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
