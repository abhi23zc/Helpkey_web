/** Isolated browser harness: real hotel/editor components, mocked Next routing/auth,
 * and HTTP fixtures supplied by Playwright. Never connects to live databases. */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const routing = `import React, { useSyncExternalStore } from 'react';
const subscribe = listener => { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); };
const navigate = url => { history.replaceState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')); };
export const useRouter = () => ({ replace: navigate, push: navigate, refresh: () => {} });
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribe, () => location.search, () => ''));
export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname, () => '/');
export default function Link({ href, children, ...props }) { return <a href={String(href)} {...props}>{children}</a>; }`;
const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryProvider } from '@/components/providers/query-provider';
import { LiveHotelDetail } from '@/components/hotel/live-hotel-detail';
import { PoliciesEditor } from '@/components/partner/dashboard/listing-editors';
const originalReplace = history.replaceState.bind(history);
history.replaceState = (...args) => { originalReplace(...args); window.dispatchEvent(new PopStateEvent('popstate')); };
const listing = { property: { id: 'hotel', amenityIds: ['wifi'], childrenPolicy: { allowed: false }, identityRequirements: { governmentIdRequired: false }, minimumCheckInAge: 21 }, policies: [] };
createRoot(document.getElementById('root')).render(<QueryProvider>{location.pathname === '/partner-fixture' ? <div style={{ maxWidth: 600, margin: '40px auto' }}><PoliciesEditor propertyId="hotel" listing={listing} onSaved={() => {}} mutations={{ patchProperty: () => {} }} /></div> : <LiveHotelDetail slug="garden" />}</QueryProvider>);`;
const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "browser-fixture-boundaries", setup(builder) {
  builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "next-fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "next-fixture" }, () => ({ contents: routing, loader: "jsx", resolveDir: process.cwd() }));
  builder.onResolve({ filter: /components\/auth\/auth-provider$/ }, () => ({ path: "auth", namespace: "auth-fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "auth-fixture" }, () => ({ contents: `export const useAuth = () => ({ appUser: { uid: 'browser-user', fullName: 'Test Guest', roles: ['customer'] }, loading: false, logout: async () => {}, refreshUser: async () => {} });` }));
} }] });
const css = await postcss([tailwind()]).process((await readFile("app/globals.css", "utf8")).replace(/^@import url\([^\n]+\n/, ""), { from: path.resolve("app/globals.css") });
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
createServer(async (request, response) => {
  if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); }
  else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css.css); }
  else if (request.url === "/photo-unavailable.svg") { response.setHeader("Content-Type", "image/svg+xml"); response.end(await readFile("public/photo-unavailable.svg")); }
  else if (request.url?.startsWith("/api/")) { response.writeHead(500, { "Content-Type": "application/json" }); response.end('{"error":"Missing browser fixture"}'); }
  else if (request.url?.startsWith("/broken")) { response.writeHead(404); response.end(); }
  else { response.setHeader("Content-Type", "text/html"); response.end(html); }
}).listen(3001, "127.0.0.1", () => console.log("Hotel browser fixture listening on port 3001"));
