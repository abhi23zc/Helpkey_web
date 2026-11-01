/** Isolated receipt preview using the real component and application styles. */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
const bundle = await build({
  stdin: {
    contents: `import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookingReceiptModal } from '@/components/trips/booking-receipt-modal';
const booking = await (await fetch('/receipt-data')).json();
function App() { const [open, setOpen] = useState(false); return <main><h1>Receipt preview</h1><button onClick={() => setOpen(true)}>View receipt</button><BookingReceiptModal booking={open ? booking : null} onClose={() => setOpen(false)} /></main>; }
createRoot(document.getElementById('root')).render(<App />);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  plugins: [
    {
      name: "receipt-links",
      setup(b) {
        b.onResolve({ filter: /^next\/link$/ }, () => ({
          path: "link",
          namespace: "receipt-fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "receipt-fixture" }, () => ({
          contents: `import React from 'react'; export default function Link(props) { return <a {...props} />; }`,
          loader: "jsx",
          resolveDir: process.cwd(),
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
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/receipt.css"></head><body><div id="root"></div><script type="module" src="/receipt.js"></script></body></html>';
createServer((req, res) => {
  if (req.url === "/receipt.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].contents);
  } else if (req.url === "/receipt.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css.css);
  } else if (req.url === "/receipt-data") {
    res.writeHead(500);
    res.end("Missing receipt fixture");
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  }
}).listen(Number(process.env.RECEIPT_TEST_PORT || 3005), "127.0.0.1");
