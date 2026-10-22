import { expect, it, vi } from "vitest";
import type Redis from "ioredis";
const sleeps = vi.hoisted(() => [] as number[]);
vi.mock("node:timers/promises", () => ({ setTimeout: async (ms: number) => { sleeps.push(ms); } }));
import { poll } from "../workers/shared/poll";

it("checks Redis leadership again within five seconds without running standby Firestore work", async () => {
  let acquisitions = 0, owner = "";
  const redis = {
    set: vi.fn(async (key: string, value: string) => {
      if (key.includes(":leader:")) { owner = value; return ++acquisitions === 1 ? null : "OK"; }
      return "OK";
    }),
    get: vi.fn(async () => owner), eval: vi.fn(async () => 1), removeListener: vi.fn(),
  } as unknown as Redis;
  const task = vi.fn(async (_signal: AbortSignal, assertLeadership: () => Promise<void>) => {
    await assertLeadership(); stop(); return { examined: 0 };
  });
  const running = poll({ name: "test-recovery-election", redis, minimum: 300000, maximum: 300000, fixedInterval: true, task });
  const stop = process.listeners("SIGTERM").at(-1) as () => void;
  await running;
  expect(acquisitions).toBe(2); expect(sleeps).toEqual([5000]); expect(task).toHaveBeenCalledOnce();
});
