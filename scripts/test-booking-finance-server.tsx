/** Isolated browser fixture: real UI and calculation module; no database/provider access. */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { captureAgreement, resolveBookingFinance } from "../lib/booking-finance/domain";
async function main() {
const bundle = await build({
  stdin: { contents: `import React, { useState } from 'react'; import { createRoot } from 'react-dom/client'; import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { BookingFinanceSection } from '@/components/booking-finance/booking-finance-section';
const client = new QueryClient(); function App() { const [scenario, setScenario] = useState('partial'); return <QueryClientProvider client={client}><main className="mx-auto max-w-5xl p-4"><h1 className="text-xl font-bold">Booking finance preview</h1><nav className="my-4 flex flex-wrap gap-2">{['partial','online','hotel','outstanding','earned','review','historical','setup','payment_failed','unknown','retry','staff'].map(s => <button className="min-h-10 rounded border px-3" key={s} onClick={() => setScenario(s)}>{s}</button>)}</nav><BookingFinanceSection key={scenario} bookingId={scenario} audience="partner" /></main></QueryClientProvider>; } createRoot(document.getElementById('root')).render(<App />);`, loader: "tsx", resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
});
const css = await postcss([tailwind()]).process(await readFile("app/globals.css", "utf8"), { from: path.resolve("app/globals.css") });
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const policy = { marketplaceCommission: true, commissionBasis: "rooms" as const, commissionBasisPoints: 1000 };
let failures = 0;
createServer((req, res) => {
  if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].contents); return; }
  if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css.css); return; }
  if (req.url?.startsWith("/api/partner/bookings/")) {
    const scenario = req.url.split("/")[4];
    if (scenario === "staff") { res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "FORBIDDEN" })); return; }
    if (scenario === "retry" && failures++ === 0) { res.writeHead(503, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Temporary fixture error" })); return; }
    const online = scenario === "online" ? 210000 : scenario === "hotel" ? 0 : 40000;
    const hotel = scenario === "online" || scenario === "outstanding" ? 0 : scenario === "hotel" ? 210000 : 170000;
    const booking = { propertyId: "fixture", subtotalPaise: 200000, taxPaise: 10000, customerFeePaise: 0, extrasTotalPaise: 0, totalPaise: 210000, payableNowPaise: online, paidPaise: online + hotel, bookingStatus: scenario === "earned" ? "checked_out" : scenario === "payment_failed" ? "payment_failed" : scenario === "unknown" ? "unsupported" : "confirmed", customizations: [] };
    const a = captureAgreement(scenario, booking, "owner", [], scenario === "setup" ? {} : policy, {}, 3, 0, "2026-11-24T00:00:00.000Z");
    if (scenario === "review") { a.setupReasons.push("Charge ownership unresolved: Customer fee."); }
    const proof = scenario === "earned" ? { bookingId: scenario, propertyId: "fixture", actorId: "owner", agreementVersion: 1 as const, calculationVersion: 1 as const, validated: true as const, originalChargeState: a.originalChargeState, checkoutChargeState: a.originalChargeState } : null;
    const result = resolveBookingFinance(booking, scenario === "historical" ? null : a, proof, { entries: [], property: hotel ? [{ id: "c", type: "collection", amountPaise: hotel }] : [], online: online ? [{ id: "p", status: "captured", amountPaise: online }] : [], refunds: [] });
    setTimeout(() => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(result)); }, 150); return;
  }
  res.setHeader("Content-Type", "text/html"); res.end(html);
}).listen(3015, "127.0.0.1");

}
void main();
