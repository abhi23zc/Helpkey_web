/** Real production Next router + real hotel/provider components. Isolated app,
 * no database imports or credentials; HTTP fixtures are supplied by Playwright. */
import { mkdtemp, mkdir, writeFile, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const directory = await mkdtemp(path.join(tmpdir(), "helpkey-hotel-next-"));
const route = path.join(directory, "app/hotels/[hotelId]");
await mkdir(route, { recursive: true });
await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
await symlink(path.join(root, "public"), path.join(directory, "public"), "dir");
await writeFile(path.join(directory, "package.json"), JSON.stringify({ private: true, scripts: {}, dependencies: { next: "16.3.3", react: "19.2.8", "react-dom": "19.2.8" } }));
await writeFile(path.join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2020", jsx: "react-jsx", module: "esnext", moduleResolution: "bundler", esModuleInterop: true, skipLibCheck: true, paths: { "@/*": [`${root}/*`] } } }));
await symlink(path.join(root, "postcss.config.mjs"), path.join(directory, "postcss.config.mjs"));
await writeFile(path.join(directory, "next.config.mjs"), `export default { typescript: { ignoreBuildErrors: true }, webpack(config) { config.resolve.alias["@"] = ${JSON.stringify(root)}; return config; } };`);
await writeFile(path.join(directory, "app/layout.tsx"), await readFile(path.join(root, "app/layout.tsx"), "utf8"));
// Tailwind's automatic discovery otherwise only sees this temporary app.
const css = (await readFile(path.join(root, "app/globals.css"), "utf8")) + `\n@source "${root}/components";\n@source "${root}/app";\n`;
await writeFile(path.join(directory, "app/globals.css"), css);
await writeFile(path.join(route, "page.tsx"), `import { Suspense } from 'react';
import { LiveHotelDetail } from ${JSON.stringify(path.join(root, "components/hotel/live-hotel-detail.tsx"))};
export default function Page() { return <Suspense fallback={<p>Loading hotel…</p>}><LiveHotelDetail slug="garden" /></Suspense>; }`);
await writeFile(path.join(directory, "app/page.tsx"), "export default function Page() { return <p>Hotel integration fixture</p>; }");

let active;
let stopping = false;
const stop = () => { stopping = true; active?.kill("SIGTERM"); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
async function run(args) {
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), ...args], {
    cwd: directory, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  active = child;
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", code => code === 0 || stopping ? resolve() : reject(new Error(`Next fixture exited ${code}`)));
  });
}
console.log(`Production hotel fixture: ${directory}`);
await run(["build", "--webpack"]);
if (!stopping) await run(["start", "--hostname", "127.0.0.1", "--port", "3002"]);
