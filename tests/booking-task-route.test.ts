import { afterEach, expect, it, vi } from "vitest";
const execute = vi.hoisted(() => vi.fn().mockResolvedValue({ outcome: "completed" }));
vi.mock("@/lib/booking/tasks", () => ({ executeBookingTask: execute }));
import { POST } from "@/app/api/internal/bookings/tasks/route";
afterEach(() => { vi.unstubAllEnvs(); execute.mockClear(); });
const task = { kind: "expiry", recordId: "booking", revision: 0, dueAt: 0 };
function request(secret: string, body: unknown = task) { return new Request("http://localhost/api/internal/bookings/tasks", { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": secret }, body: JSON.stringify(body) }); }
it("rejects execution when the server secret is unset", async () => {
  vi.stubEnv("CRON_SECRET", ""); expect((await POST(request(""))).status).toBe(401); expect(execute).not.toHaveBeenCalled();
});
it("rejects an incorrect secret before executing business logic", async () => {
  vi.stubEnv("CRON_SECRET", "correct"); expect((await POST(request("invalid"))).status).toBe(401); expect(execute).not.toHaveBeenCalled();
});
it("rejects arbitrary paths and invalid job kinds", async () => {
  vi.stubEnv("CRON_SECRET", "correct");
  expect((await POST(request("correct", { ...task, recordId: "bookings/other" }))).status).toBe(400);
  expect((await POST(request("correct", { ...task, kind: "delete" }))).status).toBe(400); expect(execute).not.toHaveBeenCalled();
});
it("executes only the validated authenticated task", async () => {
  vi.stubEnv("CRON_SECRET", "correct"); const response = await POST(request("correct"));
  expect(response.status).toBe(200); expect(execute).toHaveBeenCalledExactlyOnceWith(task); expect(await response.json()).toEqual({ outcome: "completed" });
});
