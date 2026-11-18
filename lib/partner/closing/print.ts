import "server-only";
import { ApiException } from "@/lib/api/errors";
import { formatPaise } from "@/lib/currency";
import type { RecordData } from "@/lib/partner/dashboard/domain";
import { readShifts } from "./shifts";
import { dailyHistory } from "./daily";
const escape = (s: unknown) =>
  String(s ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function printClosing(
  uid: string,
  hotel: string,
  id: string,
  daily: boolean,
) {
  let content: RecordData;
  if (daily)
    content = (await dailyHistory(uid, hotel, id, undefined, 0, true)).report!;
  else {
    const result = await readShifts(uid, hotel, id);
    if (result.shift!.status !== "closed")
      throw new ApiException(
        "SHIFT_OPEN",
        409,
        "Close the shift before printing a permanent summary.",
      );
    content = { ...result.shift, ...result.review };
  }
  const timezone = content.timezone || "Asia/Kolkata";
  const money = (n: unknown) =>
    typeof n === "number" ? formatPaise(n, { withFractions: true }) : "—";
  const when = (v: string) =>
    v && Number.isFinite(Date.parse(v))
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: timezone,
        }).format(new Date(v))
      : "—";
  const table = (headers: string[], rows: unknown[][]) =>
    rows.length
      ? `<table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : "<p>None.</p>";
  const section = (title: string, html: string) =>
    `<section><h2>${escape(title)}</h2>${html}</section>`;
  let body: string;
  if (!daily) {
    body = `<p>Opened by ${escape(content.openerName)} (${escape(content.actorId)}) at ${escape(when(content.openedAt))}. Closed by ${escape(content.closerName)} (${escape(content.closedBy)}).</p>`;
    body += table(
      ["Drawer count", "Amount"],
      [
        ["Opening cash", money(content.openingPaise)],
        ["Net cash collections", money(content.collectedPaise)],
        ["Cash physically returned", money(content.returnedPaise)],
        [
          "Corrections (separate from returns)",
          money(content.correctionsPaise),
        ],
        ["Expected cash", money(content.expectedPaise)],
        ["Counted cash", money(content.countedPaise)],
        ["Surplus / shortage", money(content.differencePaise)],
      ],
    );
    body += `<p><strong>Discrepancy explanation:</strong> ${escape(content.reason || "No difference")}</p><p>${escape(content.sourceCount)} immutable source references · Reviewed revision ${escape(content.reviewedRevision)} · Shift ${escape(id)}</p><p>Opening cash is not revenue. Historical/closed-shift corrections have zero physical-cash effect. Source receipt detail is available in the authorized paginated shift view.</p>`;
  } else {
    body = `<p>Report date: <strong>${escape(content.date)}</strong> · Closed by ${escape(content.actorName)} (${escape(content.actorId)})</p><p><strong>Closing note:</strong> ${escape(content.note || "None")}</p><p>Outstanding work acknowledged: ${content.acknowledged ? "Yes" : "Not required"}. Outstanding balances are snapshots and must not be added across reports.</p>`;
    for (const [title, rows, totals] of [
      ["Day activity", content.activity, content.activityTotals],
      [
        "Late activity for previously closed dates",
        content.late,
        content.lateTotals,
      ],
    ] as [string, RecordData[], RecordData][]) {
      body += section(
        title,
        table(
          [
            "Activity / method / ownership",
            "Amount",
            "Physical cash effect",
            "Sources",
          ],
          Object.entries(totals || {}).map(([label, t]) => [
            label,
            money(t.amountPaise),
            t.cashEffectPaise === null
              ? "Unavailable"
              : money(t.cashEffectPaise),
            t.count,
          ]),
        ) +
          table(
            [
              "Original date / time",
              "Activity",
              "Method / ownership",
              "Amount",
              "Physical cash effect",
              "Source reference",
            ],
            (rows || []).map((r) => [
              `${r.date} · ${when(r.occurredAt)}`,
              r.type,
              `${r.method} / ${r.ownership}${r.unattributed ? " · Unattributed" : ""}`,
              money(r.amountPaise),
              r.cashEffectPaise === null
                ? "Unavailable"
                : money(r.cashEffectPaise),
              r.key,
            ]),
          ),
      );
    }
    body += section(
      "Shift summaries (not additional revenue)",
      table(
        [
          "Staff / shift",
          "Opened → closed",
          "Opening",
          "Expected",
          "Counted",
          "Closing-date difference / reason",
        ],
        (content.shiftSummaries || []).map((s: RecordData) => [
          `${s.openerName || s.actorId} / ${s.id}`,
          `${s.openedDate} → ${s.closedDate || "Open"}`,
          money(s.openingPaise),
          money(s.expectedPaise),
          money(s.countedPaise),
          `${money(s.differencePaise)} ${s.reason}`,
        ]),
      ),
    );
    body += section(
      "Late shift activity for previously closed dates (not revenue)",
      table(
        [
          "Original date / event",
          "Staff / shift",
          "Opening",
          "Expected / counted",
          "Difference / reason",
        ],
        (content.lateShiftSummaries || []).map((s: RecordData) => [
          `${s.date} / ${s.event}`,
          `${s.openerName || s.actorId} / ${s.id}`,
          money(s.openingPaise),
          `${money(s.expectedPaise)} / ${money(s.countedPaise)}`,
          `${money(s.differencePaise)} ${s.reason}`,
        ]),
      ),
    );
    body += section(
      "Outstanding at review",
      table(
        [
          "Reservation",
          "Reservation balance",
          "Separate service balance",
          "Pending refunds",
          "Operational work",
        ],
        (content.unresolved || []).map((r: RecordData) => [
          `${r.reference || r.bookingId}${r.guestName ? ` · ${r.guestName}` : ""}`,
          money(r.reservationBalancePaise),
          money(r.serviceBalancePaise),
          money(r.pendingRefundPaise),
          (r.queues || []).join(", ") || "None",
        ]),
      ),
    );
    body += section(
      "Pending refunds at review",
      table(
        ["Refund / reservation", "Amount", "Status"],
        (content.pendingRefunds || []).map((r: RecordData) => [
          `${r.bookingReference || r.bookingId}${r.guestName ? ` (${r.guestName})` : ""} / ${r.id}`,
          money(r.amountPaise),
          r.status,
        ]),
      ),
    );
    body += section(
      "Open shifts at review",
      table(
        ["Staff / shift", "Opened date"],
        (content.openShifts || []).map((s: RecordData) => [
          `${s.openerName || s.actorId} / ${s.id}`,
          s.openedDate,
        ]),
      ),
    );
    body += `<p>Reporting start: ${escape(content.reportingStart)}. Coverage: ${escape(content.coverage.bookings)} bookings, ${escape(content.coverage.propertyPayments)} property receipts, ${escape(content.coverage.providerPayments)} provider receipts, ${escape(content.coverage.providerRefunds)} provider refunds.</p><p>${escape(content.coverage.description)}</p><p>Report ${escape(id)}</p>`;
  }
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${daily ? "Daily closing" : "Closed shift"}</title><style>body{font:13px system-ui;max-width:1100px;margin:24px auto;padding:16px;color:#0b1f3a}h1{font-size:24px}h2{font-size:17px;margin:22px 0 8px}p{line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px;table-layout:fixed}th,td{border:1px solid #ccd3da;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f4f7}button{padding:12px} @page{margin:14mm} @media print{button{display:none}body{margin:0;padding:0}h1,h2{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}}</style></head><body><button onclick="window.print()">Print</button><h1>${escape(content.hotelName || hotel)} · ${daily ? "Daily closing" : "Closed cashier shift"}</h1><p>Information available when closed at ${escape(when(content.closedAt))} (${escape(timezone)}). This permanent summary does not change after later activity.</p>${body}</body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
