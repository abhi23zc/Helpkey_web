import { spawn } from "node:child_process";
import { backgroundMode } from "../lib/background/config";
const mode = backgroundMode(), all = process.argv.includes("--all");
const tasks: [string, string[]][] = [
  ["next", ["node_modules/next/dist/bin/next", "dev"]],
  ["bookings", ["--import", "tsx", "workers/bookings/runner.ts"]],
];
if (mode !== "legacy") tasks.push(["recovery", ["--import", "tsx", "workers/shared/recovery-runner.ts"]]);
if (all) {
  tasks.push(["media", ["dist/workers/media/runner.js"]], ["projections", ["dist/workers/projections/runner.js"]]);
  if (mode !== "queue") tasks.push(["media-dispatcher", ["dist/workers/media/dispatcher.js"]], ["projection-dispatcher", ["dist/workers/projections/dispatcher.js"]]);
}
const children = tasks.map(([name, args]) => {
  const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
  child.on("error", error => { console.error(`${name}: ${error.message}`); shutdown(1); });
  child.on("exit", code => { if (!stopping) { console.error(`${name} exited (${code})`); shutdown(code ?? 1); } });
  return child;
});
let stopping = false;
function shutdown(code: number) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const force = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); process.exit(code); }, 15000); force.unref();
  void Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise(resolve => child.once("exit", resolve)))).then(() => { clearTimeout(force); process.exit(code); });
}
process.once("SIGTERM", () => shutdown(0)); process.once("SIGINT", () => shutdown(0));
