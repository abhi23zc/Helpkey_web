"use client";

import { CreditCard, ShieldCheck, Wallet, ArrowDownRight, UsersRound } from "lucide-react";
import { MetricCard } from "../dashboard/shared";
import { formatMoney, formatPlural, type DailyKpis } from "./closing-formatters";

type Props = {
  kpis: DailyKpis;
  loading?: boolean;
};

export function DailyClosingKpis({ kpis, loading }: Props) {
  const isNetPositive = kpis.dayNetPaise >= 0;
  const isDrawerBalanced = kpis.shiftDifferencePaise === 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Day Net Activity */}
      <MetricCard
        loading={loading}
        icon={CreditCard}
        title="Day Net Activity"
        value={formatMoney(kpis.dayNetPaise)}
        trend={`${formatMoney(kpis.dayCollectionsPaise)} in · ${formatMoney(kpis.dayRefundsPaise)} out`}
        trendType={isNetPositive ? "up" : "down"}
        tooltip="Net money collected through property desk (cash/UPI/terminal) and online payment attempts for this hotel date."
        accent="blue"
      />

      {/* 2. Cashier Shifts (Separate Float Reconciliations) */}
      <MetricCard
        loading={loading}
        icon={Wallet}
        title="Cashier Shifts"
        value={kpis.openShiftsCount > 0 ? `${kpis.openShiftsCount} open` : `${kpis.closedShiftsCount} closed`}
        trend={
          kpis.openShiftsCount > 0
            ? `${formatPlural(kpis.openShiftsCount, "open shift")} must be closed`
            : isDrawerBalanced
              ? "All drawers balanced exactly (₹0 difference)"
              : `Drawer discrepancy: ${formatMoney(kpis.shiftDifferencePaise)}`
        }
        trendType={
          kpis.openShiftsCount > 0
            ? "attention"
            : isDrawerBalanced
              ? "up"
              : "down"
        }
        tooltip="Drawer opening floats, counted cash, and drawer surplus/shortage. Drawer amounts are not added to hotel revenue."
        accent={kpis.openShiftsCount > 0 ? "amber" : "gold"}
      />

      {/* 3. Outstanding Balances at Review */}
      <MetricCard
        loading={loading}
        icon={UsersRound}
        title="Unresolved Folios"
        value={formatMoney(kpis.outstandingBalancePaise)}
        trend={`${formatPlural(kpis.unresolvedCount, "reservation")} with balance or work`}
        trendType={kpis.outstandingBalancePaise > 0 ? "attention" : "neutral"}
        tooltip="Point-in-time snapshot of outstanding guest balances and operational tasks. Balances are not added across daily reports."
        accent={kpis.outstandingBalancePaise > 0 ? "amber" : "emerald"}
      />

      {/* 4. Pending Refunds */}
      <MetricCard
        loading={loading}
        icon={ArrowDownRight}
        title="Pending Refunds"
        value={formatMoney(kpis.pendingRefundPaise)}
        trend={
          kpis.pendingRefundsCount > 0
            ? `${formatPlural(kpis.pendingRefundsCount, "pending refund")} awaiting processing`
            : "No pending refunds"
        }
        trendType={kpis.pendingRefundsCount > 0 ? "attention" : "neutral"}
        tooltip="Refunds reserved or pending gateway execution. Completed refunds appear separately in Day Activity."
        accent={kpis.pendingRefundsCount > 0 ? "rose" : "teal"}
      />
    </div>
  );
}
