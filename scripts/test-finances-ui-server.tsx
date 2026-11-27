/** Isolated browser fixture for Unified Owner Finances & Admin Verification UI. */
import { build, type Plugin } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const nextShimPlugin: Plugin = {
  name: "next-browser-shims",
  setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link)$/ }, (args) => ({
      path: args.path,
      namespace: "next-shim",
    }));
    b.onLoad({ filter: /.*/, namespace: "next-shim" }, (args) => {
      if (args.path === "next/link") {
        return {
          contents: `
            import React from "react";
            export default function Link({ href, children, onClick, ...rest }) {
              return React.createElement("a", {
                href: typeof href === "string" ? href : String(href),
                onClick: (e) => {
                  onClick?.(e);
                  if (!e.defaultPrevented && typeof href === "string" && href.startsWith("/")) {
                    e.preventDefault();
                    window.history.pushState({}, "", href);
                    window.dispatchEvent(new Event("popstate"));
                  }
                },
                ...rest,
              }, children);
            }
          `,
          loader: "jsx",
          resolveDir: process.cwd(),
        };
      }
      return {
        contents: `
          import { useSyncExternalStore } from "react";
          function subscribe(cb) {
            window.addEventListener("popstate", cb);
            return () => window.removeEventListener("popstate", cb);
          }
          export function usePathname() {
            return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/partner/finances");
          }
          export function useSearchParams() {
            const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
            return new URLSearchParams(search);
          }
          export function useRouter() {
            return {
              push(url) { window.history.pushState({}, "", url); window.dispatchEvent(new Event("popstate")); },
              replace(url) { window.history.replaceState({}, "", url); window.dispatchEvent(new Event("popstate")); },
              back() { window.history.back(); },
            };
          }
        `,
        loader: "jsx",
        resolveDir: process.cwd(),
      };
    });
  },
};

async function main() {
  const bundle = await build({
    stdin: {
      contents: `
        import React, { useState, useSyncExternalStore } from "react";
        import { createRoot } from "react-dom/client";
        import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
        import { PartnerSidebar } from "@/components/partner/dashboard/partner-sidebar";
        import { OwnerFinancesWorkspace, OwnerFinancesPermissionDenied } from "@/components/finances/owner-finances-workspace";
        import { DuesWorkspace } from "@/components/dues/workspace";

        const client = new QueryClient();
        function subscribe(cb) {
          window.addEventListener("popstate", cb);
          return () => window.removeEventListener("popstate", cb);
        }
        function App() {
          const loc = useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search, () => "/partner/finances?propertyId=hotel-1");
          const url = new URL(loc, "http://127.0.0.1");
          const [role, setRole] = useState("owner");
          const [propertyId, setPropertyId] = useState(url.searchParams.get("propertyId") || "hotel-1");

          if (url.pathname === "/admin/dues") {
            return (
              <QueryClientProvider client={client}>
                <div className="min-h-screen bg-[#f7f5f0] p-4">
                  <div className="mb-4 flex gap-2">
                    <button type="button" className="rounded border bg-white px-3 py-1 text-xs font-semibold" onClick={() => {
                      window.history.pushState({}, "", "/partner/finances?propertyId=hotel-1");
                      window.dispatchEvent(new Event("popstate"));
                    }}>Switch to Owner</button>
                  </div>
                  <DuesWorkspace propertyId={url.searchParams.get("propertyId") || "hotel-1"} />
                </div>
              </QueryClientProvider>
            );
          }

          return (
            <QueryClientProvider client={client}>
              <div className="min-h-screen bg-[#f7f5f0] lg:pl-[264px]">
                <PartnerSidebar
                  owner={role === "owner"}
                  permissions={["property.manage", "reports.read", "reservation.read", "rooms.manage", "listing.manage", "reviews.manage"]}
                  propertyId={propertyId}
                  open={false}
                  collapsed={false}
                  onClose={() => {}}
                  onToggleCollapse={() => {}}
                />
                <main className="mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6">
                  <header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold">
                        Hotel
                        <select
                          aria-label="Switch hotel"
                          value={propertyId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setPropertyId(nextId);
                            window.history.pushState({}, "", "/partner/finances?propertyId=" + encodeURIComponent(nextId));
                            window.dispatchEvent(new Event("popstate"));
                          }}
                          className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        >
                          <option value="hotel-1">Cosmozin Hotel</option>
                          <option value="hotel-2">Sunrise Resort</option>
                        </select>
                      </label>
                      <button type="button" className="rounded-lg border px-2.5 py-1 text-xs font-semibold" onClick={() => setRole(role === "owner" ? "staff" : "owner")}>
                        Role: {role}
                      </button>
                      <button type="button" className="rounded-lg border px-2.5 py-1 text-xs font-semibold" onClick={() => {
                        window.history.pushState({}, "", "/admin/dues?propertyId=" + encodeURIComponent(propertyId));
                        window.dispatchEvent(new Event("popstate"));
                      }}>
                        Open Admin Dues
                      </button>
                    </div>
                  </header>
                  {role === "owner" ? (
                    <OwnerFinancesWorkspace key={propertyId} propertyId={propertyId} />
                  ) : (
                    <OwnerFinancesPermissionDenied />
                  )}
                </main>
              </div>
            </QueryClientProvider>
          );
        }
        createRoot(document.getElementById("root")).render(<App />);
      `,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    plugins: [nextShimPlugin],
    define: { "process.env.NODE_ENV": '"test"' },
  });

  const css = await postcss([tailwind()]).process(
    await readFile("app/globals.css", "utf8"),
    { from: path.resolve("app/globals.css") },
  );
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finances Fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';

  let failOnce = false;
  let outstandingPaise = 20000;
  const reports: Array<Record<string, unknown>> = [];
  const receipts: Array<Record<string, unknown>> = [];

  createServer((req, res) => {
    const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
    if (reqUrl.pathname === "/fixture.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].contents);
      return;
    }
    if (reqUrl.pathname === "/fixture.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(css.css);
      return;
    }
    if (reqUrl.pathname === "/api/partner/properties/hotel-1/finances") {
      if (reqUrl.searchParams.get("fail") === "1" || failOnce) {
        failOnce = false;
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: "TEMPORARY", message: "Temporary outage" } }));
        return;
      }
      const pending = reports.filter((r) => r.status === "awaiting_verification");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        hotel: { id: "hotel-1", name: "Cosmozin Hotel", timezone: "Asia/Kolkata" },
        readyForPayment: {
          amountPaise: 90000,
          bookingsCount: 1,
          minimumPayoutPaise: 150000,
          meetsMinimum: false,
          shortfallPaise: 60000,
          explanation: "Combined ready amount is ₹600.00 below the hotel's ₹1,500.00 minimum payout threshold.",
        },
        awaitingClearance: {
          checkoutPaise: 100000,
          waitingPeriodPaise: 50000,
          deductionReviewPaise: 120000,
          deductionReviewBeforeAssessment: true,
          evidenceReviewPaise: 0,
          evidenceReviewUnknownCount: 0,
          totalKnownPaise: 270000,
        },
        youOweHelpkey: {
          amountPaise: outstandingPaise,
          bookingsCount: outstandingPaise > 0 ? 1 : 0,
          maxSingleReportPaise: outstandingPaise,
          maxSingleReportBookingsCount: outstandingPaise > 0 ? 1 : 0,
          canReportPayment: outstandingPaise > 0,
          pendingReportsCount: pending.length,
          pendingReportsAmountPaise: pending.reduce((n, r) => n + Number(r.amountPaise), 0),
        },
        preparedPayouts: {
          totalPaise: 50000,
          count: 1,
          items: [{ id: "p-prep-1", reference: "HKP-PREP001", finalPaise: 50000, bookingsCount: 1, createdAt: "2026-11-25T00:00:00Z", statementUrl: "/api/partner/properties/hotel-1/payouts/p-prep-1/statement" }],
        },
        bankReadiness: {
          status: "Ready for payouts",
          next: null,
          maskedBank: { holderName: "Cosmozin", maskedAccount: "••••1234", ifsc: "HDFC0001234", bankName: "HDFC Bank" },
          href: "/partner/settings/bank?propertyId=hotel-1",
          advisoryNote: "Bank readiness is advisory and does not hold booking clearance or trigger automatic transfers.",
        },
        policySummary: { payoutCycle: "daily", payoutWeekday: null, minimumPayoutPaise: 150000, nextCycleGuidanceDate: "2026-11-27", duesWarningPaise: null, duesLimitPaise: null, duesLimitType: null },
        actionPanel: {
          priority: outstandingPaise > 0 && pending.length === 0 ? "owner_action" : pending.length > 0 ? "helpkey_review" : "automatic_waiting",
          title: outstandingPaise > 0 && pending.length === 0 ? "Report your dues payment when transferred" : pending.length > 0 ? "Reported dues payment awaiting verification" : "Deduction review pending",
          description: outstandingPaise > 0 && pending.length === 0 ? "Report your dues transfer for verification." : "Helpkey is reviewing your reported payment.",
          primaryAction: outstandingPaise > 0 && pending.length === 0 ? { label: "Report payment", kind: "report_dues" } : { label: "View reported payments", kind: "view_reports" },
        },
        freshness: { status: "updating", lastUpdatedAt: "2026-11-27T10:00:00Z", pendingUpdatesCount: 1, staleCount: 0, message: "1 booking update is still processing and excluded from verified availability." },
        summaryTotals: { paidOutTotalPaise: 300000, duesClearedTotalPaise: receipts.reduce((n, r) => n + Number(r.amountPaise), 0) },
      }));
      return;
    }
    if (reqUrl.pathname === "/api/partner/properties/hotel-2/finances") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        hotel: { id: "hotel-2", name: "Sunrise Resort", timezone: "Asia/Kolkata" },
        readyForPayment: { amountPaise: 0, bookingsCount: 0, minimumPayoutPaise: 100000, meetsMinimum: false, shortfallPaise: null, explanation: "No unreserved bookings are currently ready for a new payout." },
        awaitingClearance: { checkoutPaise: 0, waitingPeriodPaise: 0, deductionReviewPaise: 0, deductionReviewBeforeAssessment: false, evidenceReviewPaise: 0, evidenceReviewUnknownCount: 0, totalKnownPaise: 0 },
        youOweHelpkey: { amountPaise: 0, bookingsCount: 0, maxSingleReportPaise: 0, maxSingleReportBookingsCount: 0, canReportPayment: false, pendingReportsCount: 0, pendingReportsAmountPaise: 0 },
        preparedPayouts: { totalPaise: 0, count: 0, items: [] },
        bankReadiness: { status: "Setup incomplete", next: "bank", maskedBank: null, href: "/partner/settings/bank?propertyId=hotel-2", advisoryNote: "Bank readiness is advisory." },
        policySummary: { payoutCycle: "daily", payoutWeekday: null, minimumPayoutPaise: 100000, nextCycleGuidanceDate: "2026-11-27", duesWarningPaise: null, duesLimitPaise: null, duesLimitType: null },
        actionPanel: { priority: "up_to_date", title: "All settlement balances are up to date", description: "No pending owner actions.", primaryAction: null },
        freshness: { status: "fresh", lastUpdatedAt: "2026-11-27T10:00:00Z", pendingUpdatesCount: 0, staleCount: 0, message: null },
        summaryTotals: { paidOutTotalPaise: 0, duesClearedTotalPaise: 0 },
      }));
      return;
    }
    if (reqUrl.pathname === "/api/partner/properties/hotel-1/finances/bookings") {
      const q = (reqUrl.searchParams.get("q") || "").toLowerCase();
      const status = reqUrl.searchParams.get("status") || "all";
      const all = [
        {
          bookingId: "bk-1",
          reference: "HK-READY-1",
          bookingStatus: "checked_out",
          relevantDate: "2026-11-25",
          checkoutAt: "2026-11-25T08:00:00Z",
          eligibleAt: "2026-11-25T08:00:00Z",
          stage: "ready_for_payment",
          filterGroup: "ready",
          direction: "payable",
          awaitingClearanceCategory: null,
          awaitingClearanceAmountPaise: null,
          beforeUnassessedDeductions: false,
          readyForPaymentPaise: 90000,
          reservedPaise: 0,
          duesPaise: 0,
          payoutId: null,
          payoutReference: null,
          isProcessing: false,
          isStaleOrInvalid: false,
          amounts: { onlineCollectedPaise: 100000, hotelCollectedPaise: 0, commissionPaise: 10000, grossPayablePaise: 90000, deductionsPaise: 0, finalPayablePaise: 90000, duesPaise: 0, guestOutstandingPaise: 0, pendingOnlinePaise: 0, pendingHotelPaise: 0, reviewOnlinePaise: 0, reviewHotelPaise: 0 },
          ownerSummary: "Verified and eligible to be included in a payout batch once the hotel minimum is met.",
          pendingReasons: [],
        },
        {
          bookingId: "bk-2",
          reference: "HK-UNASSESSED-2",
          bookingStatus: "checked_out",
          relevantDate: "2026-11-24",
          checkoutAt: "2026-11-24T08:00:00Z",
          eligibleAt: "2026-11-24T08:00:00Z",
          stage: "awaiting_deduction_review",
          filterGroup: "awaiting",
          direction: "payable",
          awaitingClearanceCategory: "deduction_review",
          awaitingClearanceAmountPaise: 120000,
          beforeUnassessedDeductions: true,
          readyForPaymentPaise: 0,
          reservedPaise: 0,
          duesPaise: 0,
          payoutId: null,
          payoutReference: null,
          isProcessing: false,
          isStaleOrInvalid: false,
          amounts: { onlineCollectedPaise: 130000, hotelCollectedPaise: 0, commissionPaise: 10000, grossPayablePaise: 120000, deductionsPaise: null, finalPayablePaise: null, duesPaise: 0, guestOutstandingPaise: 0, pendingOnlinePaise: 0, pendingHotelPaise: 0, reviewOnlinePaise: 0, reviewHotelPaise: 0 },
          ownerSummary: "Amount shown is before unassessed deductions. Helpkey has not finalized applicable deductions yet.",
          pendingReasons: ["Helpkey is reviewing final settlement deductions."],
        },
      ];
      const items = all.filter((b) => (!reqUrl.searchParams.get("detailId") || b.bookingId === reqUrl.searchParams.get("detailId")) && (!q || b.reference.toLowerCase().includes(q)) && (status === "all" || b.filterGroup === status));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ timezone: "Asia/Kolkata", items, nextCursor: null }));
      return;
    }
    if (reqUrl.pathname === "/api/partner/properties/hotel-2/finances/bookings") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ timezone: "Asia/Kolkata", items: [], nextCursor: null }));
      return;
    }
    if (reqUrl.pathname === "/api/partner/properties/hotel-1/finances/activity") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        timezone: "Asia/Kolkata",
        items: [
          {
            id: "act-payout-1",
            type: "payout",
            typeGroup: "payouts",
            title: "Hotel payout recorded",
            purpose: "Hotel settlement",
            amountPaise: 300000,
            occurredAt: "2026-11-23T00:00:00Z",
            localDate: "2026-11-23",
            direction: "out",
            status: "Paid",
            bookingIds: ["bk-01", "bk-02"],
            bookingReferences: [{ bookingId: "bk-01", reference: "HK-OLD-01" }, { bookingId: "bk-02", reference: "HK-OLD-02" }],
            payoutId: "p-1",
            payoutReference: "HKP-OLD001",
            statementUrl: "/api/partner/properties/hotel-1/payouts/p-1/statement",
            receiptId: null,
            receiptReference: null,
            paymentMethod: "bank_transfer",
            transactionReference: "UTR-PAYOUT-3000",
            correctionReason: null,
            replacesReceiptId: null,
            replacedByReceiptId: null,
          },
          ...receipts.map((r) => ({
            id: `act-${r.id}`,
            type: "dues_payment",
            typeGroup: "dues_receipts",
            title: "Payment received from hotel",
            purpose: "Hotel dues",
            amountPaise: r.amountPaise,
            occurredAt: r.recordedAt,
            localDate: r.paymentDate,
            direction: "in",
            status: "Received",
            bookingIds: ["bk-dues-1"],
            bookingReferences: [{ bookingId: "bk-dues-1", reference: "HK-DUES-1" }],
            payoutId: null,
            payoutReference: null,
            statementUrl: null,
            receiptId: r.id,
            receiptReference: r.reference,
            paymentMethod: r.method,
            transactionReference: r.transactionReference,
            correctionReason: null,
            replacesReceiptId: null,
            replacedByReceiptId: null,
          })),
        ],
        nextCursor: null,
      }));
      return;
    }
    if (reqUrl.pathname === "/api/partner/properties/hotel-1/finances/reports" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ items: reports.filter((r) => !reqUrl.searchParams.get("detailId") || r.id === reqUrl.searchParams.get("detailId")), nextCursor: null }));
      return;
    }
    if (reqUrl.pathname === "/api/partner/properties/hotel-1/finances/reports" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (body.action === "withdraw") {
          const rep = reports.find((r) => r.id === body.reportId);
          if (rep) {
            rep.status = "withdrawn";
            rep.canWithdraw = false;
            rep.canCopyToDraft = true;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ reportId: body.reportId, status: "withdrawn" }));
          return;
        }
        const reportId = `rep-${reports.length + 1}`;
        const reference = `HDR-REP00${reports.length + 1}`;
        reports.unshift({
          id: reportId,
          reference,
          propertyId: "hotel-1",
          amountPaise: body.amountPaise,
          paymentDate: body.paymentDate,
          method: body.method,
          transactionReference: body.transactionReference,
          notes: body.notes || "",
          status: "awaiting_verification",
          submittedAt: "2026-11-27T10:00:00Z",
          withdrawnAt: null,
          reviewedAt: null,
          rejectionReason: null,
          attachment: null,
          linkedReceipt: null,
          canWithdraw: true,
          canCopyToDraft: false,
        });
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ reportId, reference, status: "awaiting_verification" }));
      });
      return;
    }
    if (reqUrl.pathname === "/api/admin/dues" && !reqUrl.searchParams.get("propertyId")) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        hotels: [{ id: "hotel-1", name: "Cosmozin Hotel", pendingReportsCount: reports.filter((r) => r.status === "awaiting_verification").length }],
        nextCursor: null,
      }));
      return;
    }
    if (reqUrl.pathname === "/api/admin/dues") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        hotel: { id: "hotel-1", name: "Cosmozin Hotel", timezone: "Asia/Kolkata" },
        totals: { outstandingPaise, paymentsReceivedPaise: receipts.reduce((n, r) => n + Number(r.amountPaise), 0), bookingsNeedingAttention: 0, pendingReportsCount: reports.filter((r) => r.status === "awaiting_verification").length },
        outstanding: outstandingPaise > 0 ? [{ bookingId: "bk-dues-1", reference: "HK-DUES-1", duesPaise: outstandingPaise, firstRecordedAt: "2026-11-24T00:00:00Z", fingerprint: "fp-1", status: "Outstanding", collectible: true, reasons: [], details: { earnedCommissionPaise: 20000, guestOutstandingPaise: 0, serviceIssues: [] } }] : [],
        attention: [],
        payments: receipts,
        reports: reports.map((r) => ({ ...r, matchingReceipts: [] })),
        pendingReportsCount: reports.filter((r) => r.status === "awaiting_verification").length,
        policy: { duesLimit: null, duesWarningPaise: null, duesGraceDays: null },
        warnings: [],
      }));
      return;
    }
    if (reqUrl.pathname === "/api/admin/dues/commands" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (body.action === "preview_report_payment") {
          const rep = reports.find((r) => r.id === body.reportId)!;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            confirmation: {
              id: "conf-rep-1",
              propertyId: "hotel-1",
              actorId: "admin-1",
              hotelName: "Cosmozin Hotel",
              createdAt: "2026-11-27T10:00:00Z",
              expiresAt: "2099-01-01T00:00:00Z",
              snapshots: [{ bookingId: "bk-dues-1", fingerprint: "fp-1", duesPaise: outstandingPaise }],
              allocations: [{ bookingId: "bk-dues-1", reference: "HK-DUES-1", amountPaise: rep.amountPaise, beforePaise: outstandingPaise, afterPaise: outstandingPaise - Number(rep.amountPaise), firstRecordedAt: "2026-11-24T00:00:00Z", evidenceFingerprint: "fp-1" }],
              kind: "report_payment",
              reportId: rep.id,
              reportReference: rep.reference,
              reportFingerprint: "rfp",
              payment: { bookingIds: body.bookingIds, amountPaise: rep.amountPaise, paymentDate: rep.paymentDate, method: rep.method, transactionReference: rep.transactionReference, notes: rep.notes, replacesId: null },
              maximumPaise: outstandingPaise,
            },
          }));
          return;
        }
        if (body.action === "record_report_payment") {
          const rep = reports.find((r) => r.status === "awaiting_verification")!;
          const paymentId = `pay-${receipts.length + 1}`;
          const receiptRef = `HKD-PAY00${receipts.length + 1}`;
          outstandingPaise -= Number(rep.amountPaise);
          const rec = {
            id: paymentId,
            reference: receiptRef,
            propertyId: "hotel-1",
            hotelName: "Cosmozin Hotel",
            amountPaise: rep.amountPaise,
            paymentDate: rep.paymentDate,
            method: rep.method,
            transactionReference: rep.transactionReference,
            normalizedReference: String(rep.transactionReference).toUpperCase(),
            notes: "",
            allocations: [{ bookingId: "bk-dues-1", reference: "HK-DUES-1", amountPaise: rep.amountPaise, beforePaise: 20000, afterPaise: outstandingPaise, firstRecordedAt: "2026-11-24T00:00:00Z", evidenceFingerprint: "fp-1" }],
            actorId: "admin-1",
            recordedAt: "2026-11-27T10:05:00Z",
            replacesId: null,
            status: "Received",
            correction: null,
            replacedBy: null,
            needsAttention: false,
            history: [],
          };
          receipts.unshift(rec);
          rep.status = "recorded";
          rep.canWithdraw = false;
          rep.linkedReceipt = { id: paymentId, reference: receiptRef, recordedAt: rec.recordedAt, mode: "created", corrected: false, correctionReason: null, correctedAt: null, replacement: null };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ paymentId, reportId: rep.id, status: "Received" }));
          return;
        }
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "UNKNOWN_COMMAND" }));
      });
      return;
    }
    if (reqUrl.pathname === "/api/test/trigger-fail-once") {
      failOnce = true;
      res.end("ok");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  }).listen(3016, "127.0.0.1");
}

void main();
