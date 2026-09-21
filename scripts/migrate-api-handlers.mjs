import { readFile, writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function routeName(file) {
  return `/${file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`;
}

function isPublic(path, method) {
  if (path.startsWith("/api/home") || path.startsWith("/api/search/") || path.startsWith("/api/properties/")) return method === "GET";
  if (path === "/api/bookings/quote") return true;
  if (path.startsWith("/api/auth/")) return true;
  return false;
}

for await (const file of glob("app/api/**/route.ts")) {
  const path = routeName(file);
  if (path === "/api/webhooks/razorpay" || path.startsWith("/api/internal/") || file.includes("search/properties") || file.includes("search/suggestions") || file.includes("api/home/") || file.includes("properties/[slug]/bookable")) continue;
  let source = await readFile(file, "utf8");
  const exports = [];
  for (const method of methods) {
    const marker = `export async function ${method}`;
    if (!source.includes(marker)) continue;
    source = source.replace(marker, `const raw${method} = async function ${method}`);
    const publicRoute = isPublic(path, method);
    const auth = publicRoute ? "public" : method === "GET" ? "read" : "strict";
    const requireAuth = !publicRoute && !path.startsWith("/api/auth/");
    const cache = publicRoute && method === "GET" ? "public" : "private";
    exports.push(`export const ${method} = withApiHandler(raw${method}, { route: ${JSON.stringify(path)}, auth: ${JSON.stringify(auth)}, requireAuth: ${requireAuth}, cache: ${JSON.stringify(cache)} });`);
  }
  if (!exports.length) continue;
  if (!source.includes('from "@/lib/api/handler"')) source = `import { withApiHandler } from "@/lib/api/handler";\n${source}`;
  source = `${source.trimEnd()}\n\n${exports.join("\n")}\n`;
  await writeFile(file, source);
}
