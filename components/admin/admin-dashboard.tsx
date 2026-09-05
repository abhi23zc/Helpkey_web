"use client";

import { AdminOverviewPage } from "./dashboard/admin-overview-page";
import { AdminShell } from "./dashboard/admin-shell";

export function AdminDashboard() {
  return (
    <AdminShell>
      <AdminOverviewPage />
    </AdminShell>
  );
}
