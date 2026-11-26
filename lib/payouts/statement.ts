import { businessAddressText } from "../payout-readiness/domain";
import { categories, categoryLabels } from "./deductions";
import type { Payout } from "./service";

const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
type Deduction = {
  label: string;
  status: "amount" | "confirmed_zero" | "not_applicable" | "not_reviewed";
  amountPaise: number | null;
};
function deduction(label: string, value: unknown): Deduction {
  const item = value as { status?: string; amountPaise?: unknown } | undefined;
  if (item?.status === "not_applicable")
    return { label, status: "not_applicable", amountPaise: null };
  const n = item?.status === "amount" ? amount(item.amountPaise) : null;
  return {
    label,
    status: n === null ? "not_reviewed" : n === 0 ? "confirmed_zero" : "amount",
    amountPaise: n,
  };
}

/** Explicit allowlist: statements never contain internal assessment reasons, notes or audit fields. */
export function settlementStatement(p: Payout & { reviewWarnings?: string[] }) {
  const bookings = (p.bookings ?? []).map((b) => ({
    reference: b.reference,
    onlinePaise: amount(b.verifiedOnlinePaise),
    hotelPaise: amount(b.hotelCollectionsPaise),
    commissionPaise: amount(b.commissionPaise),
    grossPaise: amount(b.grossPaise),
    deductionsPaise: amount(b.deductionsPaise),
    finalPaise: amount(b.finalPaise),
    deductions: categories.map((k) =>
      deduction(categoryLabels[k], b.assessment?.items?.[k]),
    ),
  }));
  const deductions = categories.map((k, index): Deduction => {
    const items = bookings.map((b) => b.deductions[index]);
    if (!items.length || items.some((i) => i.status === "not_reviewed"))
      return {
        label: categoryLabels[k],
        status: "not_reviewed",
        amountPaise: null,
      };
    if (items.every((i) => i.status === "not_applicable"))
      return {
        label: categoryLabels[k],
        status: "not_applicable",
        amountPaise: null,
      };
    const total = items.reduce((n, i) => n + (i.amountPaise ?? 0), 0);
    return {
      label: categoryLabels[k],
      status: total === 0 ? "confirmed_zero" : "amount",
      amountPaise: total,
    };
  });
  return {
    business: p.readinessSnapshot?.business ?? null,
    bank: p.readinessSnapshot?.bank ?? null,
    paymentBank: p.payment?.bank ?? null,
    hotelName: p.hotelName,
    reference: p.reference,
    status: p.status,
    createdAt: p.createdAt,
    timezone: typeof p.policy?.timezone === "string" ? p.policy.timezone : null,
    grossPaise: amount(p.grossPaise),
    deductionsPaise: amount(p.deductionsPaise),
    finalPaise: amount(p.finalPaise),
    bookings,
    deductions,
    reviewRequired: !!p.reviewWarnings?.length,
    payment: p.payment
      ? {
          date: p.payment.paymentDate,
          method: p.payment.method,
          reference: p.payment.reference,
        }
      : null,
  };
}
export type SettlementStatement = ReturnType<typeof settlementStatement>;
const escape = (value: unknown) =>
  String(value ?? "Not available").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (n: number | null) =>
  n === null
    ? "Not available"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(n / 100);
function date(value: string | null | undefined, timezone: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not available";
  // A payment's date is a calendar date, not an instant in UTC.
  const zone = /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : (timezone ?? "UTC");
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: zone,
    }).format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
}
function deductionText(d: Deduction) {
  return d.status === "not_reviewed"
    ? "Not reviewed"
    : d.status === "not_applicable"
      ? "Not applicable"
      : d.status === "confirmed_zero"
        ? `${money(0)} · Confirmed zero`
        : money(d.amountPaise);
}
export function renderSettlementStatement(s: SettlementStatement) {
  const e = escape;
  const status =
    s.status === "Prepared" ? "Prepared — awaiting payment" : s.status;
  const notice =
    s.status === "Paid"
      ? "External payment recorded. This statement does not initiate a transfer."
      : s.status === "Cancelled"
        ? "This payout was cancelled. It is not evidence of a completed payment."
        : "This payout is prepared. Payment has not been recorded.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Settlement statement ${e(s.reference)}</title><style>
*{box-sizing:border-box}body{font:14px/1.55 system-ui,sans-serif;color:#0b2038;background:#f8f6f2;margin:0;padding:32px 20px}.sheet{max-width:1100px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:20px;padding:40px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #d4ad58;padding-bottom:24px}.brand{font-weight:800;font-size:22px;letter-spacing:-.5px}h1{font-size:30px;line-height:1.2;margin:12px 0}h2{font-size:18px;margin-top:30px}.muted{color:#64748b}.badge{display:inline-block;background:#edf4fc;border-radius:20px;padding:6px 12px;font-weight:600}.toolbar{max-width:1100px;margin:0 auto 16px;display:flex;justify-content:flex-end}button{font:inherit;cursor:pointer;background:#0b2038;color:white;border:0;border-radius:10px;padding:12px 20px}.notice{padding:14px 18px;border-radius:10px;background:#f1f5f9;margin:22px 0}.warning{background:#fffbeb;color:#92400e}.summary{max-width:560px;margin:26px 0 26px auto}.line{display:flex;justify-content:space-between;gap:16px;padding:8px 0}.final{border-top:2px solid #d4ad58;font-size:20px;font-weight:750;margin-top:10px;padding-top:16px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}th,td{padding:12px 7px;text-align:right;vertical-align:top;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere}th:first-child,td:first-child{text-align:left;width:20%}th{background:#f8fafc;font-weight:650}thead{display:table-header-group}tr{break-inside:avoid}footer{border-top:1px solid #e2e8f0;margin-top:28px;padding-top:16px;font-size:12px}.ref{overflow-wrap:anywhere}@media(max-width:700px){.sheet{padding:20px}header{flex-direction:column}.table-wrap{overflow-x:auto}table{min-width:800px}.summary{margin-left:0}h1{font-size:26px}}@media print{@page{size:A4 landscape;margin:14mm}body{background:white;padding:0;font-size:11px}.toolbar{display:none}.sheet{max-width:none;border:0;border-radius:0;padding:0}header{display:flex;flex-direction:row}.table-wrap{overflow:visible}table{min-width:0;font-size:10px}th,td{padding:8px 4px}h1,h2{break-after:avoid}.summary{break-inside:avoid}.notice{break-inside:avoid;margin:10px 0;padding:8px 12px}.notice p{margin:5px 0}body{line-height:1.35}header{padding-bottom:10px}header p{margin:6px 0}.brand{font-size:18px}h1{font-size:22px;margin:6px 0}h2{font-size:14px;margin:14px 0 8px}.summary{margin:12px 0 12px auto}.line{padding:3px 0}.final{font-size:16px;padding-top:8px;margin-top:6px}.summary p{margin:8px 0}footer{margin-top:14px;padding-top:8px;font-size:10px}}
</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div><main class="sheet"><header><div><div class="brand">Helpkey</div><h1>Settlement statement</h1><p class="muted ref">${e(s.reference)}</p></div><div><span class="badge">${e(status)}</span><p><strong>${e(s.hotelName)}</strong><br>Prepared ${e(date(s.createdAt, s.timezone))}<br>${s.bookings.length} ${s.bookings.length === 1 ? "booking" : "bookings"}</p></div></header><p class="notice">${e(notice)}</p>${s.reviewRequired ? '<p class="notice warning"><strong>Accounting review required.</strong> Booking evidence has changed. The saved statement amounts remain unchanged.</p>' : ""}
<section><h2>Saved business and bank details</h2>${
    s.business
      ? `<p>${e(s.business.businessName)}<br>${e(
          businessAddressText(s.business.address),
        )}<br>${e(s.business.contact)}</p>`
      : "<p>Business identity unavailable in this historical payout.</p>"
  }${s.bank ? `<p>Prepared bank: ${e(s.bank.holderName)} · ${e(s.bank.bankName)} · ${e(s.bank.maskedAccount)} · ${e(s.bank.ifsc)}</p>` : "<p>Prepared bank details unavailable in this payout.</p>"}${s.paymentBank ? `<p>Payment-time bank: ${e(s.paymentBank.holderName)} · ${e(s.paymentBank.bankName)} · ${e(s.paymentBank.maskedAccount)} · ${e(s.paymentBank.ifsc)}</p>` : ""}</section>
<section class="summary" aria-label="Settlement totals"><div class="line"><strong>Hotel amount before deductions</strong><span>${money(s.grossPaise)}</span></div>${s.deductions.map((d) => `<div class="line"><span>${e(d.label)}</span><span>${e(deductionText(d))}</span></div>`).join("")}<div class="line"><span>Total deductions</span><strong>${money(s.deductionsPaise)}</strong></div><div class="line final"><span>${s.status === "Paid" ? "Payment recorded" : "Final hotel payment"}</span><span>${money(s.finalPaise)}</span></div><p class="muted">Helpkey commission is already included in the amount before deductions. It is not deducted again here.</p></section>
${s.payment ? `<section class="notice"><strong>Payment details</strong><p>Date: ${e(date(s.payment.date, s.timezone))}<br>Method: ${e(s.payment.method.replaceAll("_", " "))}<br>Transaction reference: <span class="ref">${e(s.payment.reference)}</span></p></section>` : ""}
<h2>Included bookings</h2><div class="table-wrap"><table><thead><tr><th>Booking</th><th>Online collected</th><th>Collected by hotel</th><th>Helpkey commission</th><th>Before deductions</th><th>Deductions</th><th>Final payment</th></tr></thead><tbody>${s.bookings.map((b) => `<tr><td>${e(b.reference)}</td><td>${money(b.onlinePaise)}</td><td>${money(b.hotelPaise)}</td><td>${money(b.commissionPaise)}</td><td>${money(b.grossPaise)}</td><td>${money(b.deductionsPaise)}</td><td>${money(b.finalPaise)}</td></tr>`).join("")}</tbody></table></div><h2>Deductions by booking</h2><div class="table-wrap"><table><thead><tr><th>Booking</th>${s.deductions.map((d) => `<th>${e(d.label)}</th>`).join("")}</tr></thead><tbody>${s.bookings.map((b) => `<tr><td>${e(b.reference)}</td>${b.deductions.map((d) => `<td>${e(deductionText(d))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<footer class="muted">Settlement statement — not a tax invoice. Amounts reflect the saved payout record. Hotel collections are shown for reference and are not added to the online payout.</footer></main></body></html>`;
}
export function settlementResponse(s: SettlementStatement) {
  return new Response(renderSettlementStatement(s), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
