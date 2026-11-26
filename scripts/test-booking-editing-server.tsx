/** Isolated real customer editor; browser tests intercept APIs. No credentials or database. */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
async function main() {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { EditBooking } from '@/components/trips/edit-booking'; const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main className="p-8"><h1>My Trips</h1><EditBooking bookingId="fixture" /></main></QueryClientProvider>);`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
  });
  const css = await postcss([tailwind()]).process(
    await readFile("app/globals.css", "utf8"),
    { from: path.resolve("app/globals.css") },
  );
  createServer((req, res) => {
    if (req.url === "/fixture.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].contents);
      return;
    }
    if (req.url === "/fixture.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(css.css);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
    );
  }).listen(3019, "127.0.0.1");
}
void main();
