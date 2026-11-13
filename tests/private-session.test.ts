import { describe, it, expect } from "vitest";
import {
  bindPrivateStorage,
  clearPrivateStorage,
} from "@/lib/query/private-session";
class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] || null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}
describe("private browser storage", () => {
  it("removes all previous guest drafts and offer prompts on account changes", () => {
    const storage = new MemoryStorage();
    bindPrivateStorage(storage, "owner-a");
    storage.setItem("arrival-draft:booking-a", "private guest notes");
    storage.setItem("offer-prompt:booking-a", "1");
    storage.setItem("display-preference", "compact");
    bindPrivateStorage(storage, "staff-b");
    expect(storage.getItem("arrival-draft:booking-a")).toBeNull();
    expect(storage.getItem("offer-prompt:booking-a")).toBeNull();
    expect(storage.getItem("helpkey-private-account")).toBe("staff-b");
    expect(storage.getItem("display-preference")).toBe("compact");
  });
  it("retains a same-account draft and clears drafts at logout", () => {
    const storage = new MemoryStorage();
    bindPrivateStorage(storage, "owner-a");
    storage.setItem("arrival-draft:a", "draft");
    bindPrivateStorage(storage, "owner-a");
    expect(storage.getItem("arrival-draft:a")).toBe("draft");
    clearPrivateStorage(storage);
    expect(storage.length).toBe(0);
  });
});
