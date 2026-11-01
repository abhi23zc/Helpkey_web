/** Real customer/partner components with isolated HTTP fixtures; no live services. */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
const routing = `import React from 'react';
let current = location.search;
const listeners = new Set();
for (const method of ['pushState','replaceState']) { const original = history[method].bind(history); history[method] = (...args) => { original(...args); current=location.search; listeners.forEach(fn=>fn()); }; }
addEventListener('popstate', () => { current=location.search; listeners.forEach(fn=>fn()); });
export const useRouter = () => ({ replace: url => location.assign(url), push: url => location.assign(url), refresh: () => {} });
export const useSearchParams = () => { const search=React.useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>current); return new URLSearchParams(search); };
export const usePathname = () => location.pathname;
export default function Link({ href, children, ...props }) { return <a href={String(href)} {...props}>{children}</a>; }`;
const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryProvider } from '@/components/providers/query-provider';
import { PartnerOverviewPage } from '@/components/partner/dashboard/partner-overview-page';
import { PartnerReservationsPage } from '@/components/partner/dashboard/partner-reservations-page';
import { PartnerRoomsRatesPage } from '@/components/partner/dashboard/partner-rooms-rates-page';
createRoot(document.getElementById('root')).render(<QueryProvider>{location.pathname.startsWith("/partner/rooms") ? <PartnerRoomsRatesPage /> : location.pathname.startsWith("/partner/reservations") ? <PartnerReservationsPage /> : <PartnerOverviewPage />}</QueryProvider>);`;
const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
  bundle: true,
  write: false,
  outdir: "/tmp/helpkey-fixture-memory",
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
  plugins: [
    {
      name: "fixture-boundaries",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link)$/ }, (args) => ({
          path: args.path,
          namespace: "next-fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "next-fixture" }, () => ({
          contents: routing,
          loader: "jsx",
          resolveDir: process.cwd(),
        }));
        b.onResolve({ filter: /components\/auth\/auth-provider$/ }, () => ({
          path: "auth",
          namespace: "auth-fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "auth-fixture" }, () => ({
          contents: `export const useAuth = () => ({ appUser: { uid: 'guest', fullName: 'Test Guest', email: 'guest@example.com', phoneNumber: '+919876543210', roles: ['customer','partner'] }, loading: false, refreshUser: async () => {} });`,
        }));
      },
    },
  ],
});
const css = await postcss([tailwind()]).process(
  await readFile("app/globals.css", "utf8"),
  { from: path.resolve("app/globals.css") },
);
const html =
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
createServer(async (req, res) => {
  if (req.url === "/fixture.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles.find(f => f.path.endsWith(".js")).contents);
  } else if (req.url === "/fixture.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css.css + "\n" + (bundle.outputFiles.find(f => f.path.endsWith(".css"))?.text || ""));
  } else if (req.url === "/photo-unavailable.svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(await readFile("public/photo-unavailable.svg"));
  } else if (req.url?.startsWith("/api/")) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end('{"error":"Missing fixture"}');
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  }
}).listen(Number(process.env.PARTNER_TEST_PORT || 3004), "127.0.0.1", () =>
  console.log("Dashboard fixture listening on port 3004"),
);
