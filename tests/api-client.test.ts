import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("opt-in API query deadlines", () => {
  it("aborts a stalled query and returns a retryable user-facing error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () =>
              reject(init.signal!.reason),
            );
          }),
      ),
    );
    const result = expect(
      apiFetch("/api/partner/dashboard", { timeoutMs: 15000 }),
    ).rejects.toMatchObject({ status: 408, code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(15000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("preserves caller cancellation and releases the deadline", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () =>
              reject(init.signal!.reason),
            );
          }),
      ),
    );
    const pending = apiFetch("/private", {
      timeoutMs: 15000,
      signal: caller.signal,
    });
    const result = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    caller.abort();
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not impose deadlines on existing financial mutations", async () => {
    vi.useFakeTimers();
    const signal = new AbortController().signal;
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { ok: true } }));
    vi.stubGlobal("fetch", fetch);
    expect(await apiFetch("/payment", { method: "POST", signal })).toEqual({
      ok: true,
    });
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("covers a response whose headers arrive but whose body stalls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init: RequestInit) => ({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener("abort", () =>
              reject(init.signal!.reason),
            ),
          ),
      })),
    );
    const result = expect(
      apiFetch("/private", { timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(100);
    await result;
  });
});
