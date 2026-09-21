import { createHash } from "node:crypto";
export const clientIp = (request: Request) => (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim();
export const privateFingerprint = (value: string) => createHash("sha256").update(value).digest("hex");
