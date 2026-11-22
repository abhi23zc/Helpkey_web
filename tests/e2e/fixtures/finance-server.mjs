/** Real finance components with deterministic HTTP fixtures; no live services. */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryProvider} from '@/components/providers/query-provider';
import {AccountWorkspace} from '@/components/finance/account-workspace';
import {DeductionWorkspace} from '@/components/finance/deduction-workspace';
import {AdminFinancePage,FinanceWorkspace} from '@/components/finance/workspace';
createRoot(document.getElementById('root')).render(<QueryProvider>{location.pathname.includes('phase3-rules') ? <DeductionWorkspace/> : location.pathname.includes('phase3') ? <AccountWorkspace propertyId="hotel" admin={location.pathname.startsWith('/admin')}/> : location.pathname.startsWith('/admin') ? <AdminFinancePage/>:<main style={{padding:24}}><h1>Finance</h1><FinanceWorkspace propertyId="hotel"/></main>}</QueryProvider>);`;
const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
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
  } else if (req.url === "/fixture.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css.css);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
    );
  }
}).listen(3017, "127.0.0.1");
