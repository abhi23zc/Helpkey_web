/** Shared by Node workers and Next.js; never imports server-only modules. */
export function positiveInteger(name: string, fallback: number, maximum = 3_600_000): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${name}: expected integer 1..${maximum}`);
  return value;
}
export function backgroundKey(...parts: string[]) {
  return ["helpkey", process.env.HELPKEY_ENV ?? process.env.NODE_ENV ?? "development", "background", ...parts].join(":");
}
export const recoveryInterval = () => positiveInteger("WORKER_RECOVERY_INTERVAL_MS", 300_000);
export function backgroundMode(): "legacy" | "hybrid" | "queue" {
  const mode = process.env.BACKGROUND_MODE ?? "legacy";
  if (mode !== "legacy" && mode !== "hybrid" && mode !== "queue") throw new Error("Invalid BACKGROUND_MODE");
  return mode;
}
export function queueRedisUrl() {
  const url = backgroundMode() === "legacy" ? process.env.REDIS_URL ?? process.env.QUEUE_REDIS_URL : process.env.QUEUE_REDIS_URL;
  if (!url) throw new Error("QUEUE_REDIS_URL is required outside legacy mode");
  return url;
}
export const queuePrefix = () => process.env.BULLMQ_PREFIX ?? (backgroundMode() === "legacy" ? "helpkey" : `helpkey-${process.env.HELPKEY_ENV ?? process.env.NODE_ENV ?? "development"}`);
export function retryDelay(attempt: number, base = 5_000, cap = 3_600_000) {
  return Math.min(cap, base * 2 ** Math.min(Math.max(attempt - 1, 0), 16));
}
export class IdleSchedule {
  private delay: number;
  constructor(readonly minimum: number, readonly maximum: number) {
    if (minimum > maximum) throw new Error("Minimum polling interval exceeds maximum");
    this.delay = minimum;
  }
  next(busy: boolean) {
    if (busy) { this.delay = this.minimum; return 0; }
    const result = this.delay;
    this.delay = Math.min(this.maximum, this.delay * 2);
    return result;
  }
}
