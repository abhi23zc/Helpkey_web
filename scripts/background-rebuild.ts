import { backgroundMode } from "../lib/background/config";
import { requestRebuild } from "../lib/background/queue-admin";
async function main() {
  const project = process.argv.find(arg => arg.startsWith("--project="))?.slice(10);
  if (!project || project !== (process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)) throw new Error("Pass --project=<configured project> explicitly");
  if (backgroundMode() === "legacy") throw new Error("Enable hybrid or queue mode first");
  if (!process.argv.includes("--apply")) { console.info(JSON.stringify({ project, mode: "dry-run", action: "request-timer-rebuild" })); return; }
  const result = await requestRebuild(); if (!result) throw new Error("QUEUE_UNAVAILABLE");
  console.info(JSON.stringify({ project, action: "rebuild-requested", ...result }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "REBUILD_FAILED"); process.exitCode = 1; });
