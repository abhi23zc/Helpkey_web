import type { RecordData } from "../dashboard/domain";
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (n: number) => `₹${(n / 100).toFixed(2)}`;
export function printDocument(d: RecordData) {
  const title =
    d.documentType === "credit_note"
      ? "Credit note"
      : d.documentType === "tax_invoice"
        ? "Tax invoice"
        : "Ordinary invoice";
  const e = escape,
    seller = d.seller,
    customer = d.customer;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} ${e(d.invoiceNumber)}</title><style>body{font:14px system-ui;color:#0b1f3a;max-width:1000px;margin:32px auto;padding:16px}h1{font-size:28px}section{margin:20px 0}table{border-collapse:collapse;width:100%;font-size:12px}th,td{text-align:left;padding:10px 5px;border-bottom:1px solid #ccc}td{overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}p{white-space:pre-line}@media print{button{display:none}body{margin:0}@page{margin:14mm}}@media(max-width:600px){.scroll{overflow:auto}}</style></head><body><button onclick="window.print()">Print</button><h1>${title}</h1><p>${e(d.invoiceNumber)} · ${e(d.date)} · Financial year ${e(d.financialYear)}</p><section><h2>${e(seller.legalName)}</h2><p>${e(seller.address)}\n${e(seller.state)} (${e(seller.stateCode)})\n${e(seller.contact)}${seller.gstin ? `\nGSTIN ${e(seller.gstin)}` : "\nUnregistered business — no GST collected; no input-tax-credit claim."}</p></section><section><h2>Bill to: ${e(customer.name)}</h2><p>${e(customer.address)}\n${e(customer.state)} (${e(customer.stateCode)})${customer.gstin ? `\nGSTIN ${e(customer.gstin)}` : ""}\nDelivery: ${e(customer.deliveryAddress)}</p></section>${d.original ? `<p>Original invoice: ${e(d.original.number)} · ${e(d.original.date)}</p><p>Reason: ${e(d.reason)}</p><p>This credit note documents an existing folio reduction. It does not initiate a refund.</p>` : ""}<div class="scroll"><table><thead><tr><th>Item / source</th><th>Quantity / SAC</th><th>Taxable value</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead><tbody>${d.lines.map((l: RecordData) => `<tr><td>${e(l.description)}<br>${e(l.sourceId)}${d.documentType === "credit_note" ? (l.originalLineId && l.originalSourceId ? `<br>Original invoice line: ${e(l.originalLineId)} · source ${e(l.originalSourceId)}` : "<br>Original line reference unavailable in this historical document.") : ""}<br>Place of supply: ${e(l.placeOfSupply)} (${e(l.placeOfSupplyCode)})</td><td>${e(l.quantity)} ${e(l.unit)}<br>${e(l.sac)}</td><td>${money(l.taxablePaise * l.sign)}</td><td>${money(l.cgstPaise * l.sign)} (${e(l.cgstRate)}%)</td><td>${money(l.sgstPaise * l.sign)} (${e(l.sgstRate)}%)</td><td>${money(l.igstPaise * l.sign)} (${e(l.igstRate)}%)</td><td>${money(l.amountPaise)}</td></tr>`).join("")}</tbody></table></div><h2>Total ${money(d.totalPaise)}</h2><p>Reverse charge: No</p><p>Amount paid at issuance: ${money(d.settlementAtIssuance.netPaidPaise)}\nBalance due at issuance: ${money(d.settlementAtIssuance.balanceDuePaise)}</p><p>Authorized signatory: ${e(seller.signatory)}\n${e(seller.signatoryDesignation)}</p><p>Signature: ____________________</p><p>${e(seller.footer)}</p></body></html>`;
}
