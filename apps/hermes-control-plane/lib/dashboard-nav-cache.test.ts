import { describe, expect, it, beforeEach } from "vitest";
import {
  DASHBOARD_CACHE_KEYS,
  clearDashboardNavCache,
  isThreadDetailFresh,
  pruneThreadDetailStorage,
  readJsonSessionStorage,
  selectPreheatThreadIds,
  threadDetailsStorageKey,
  writeJsonSessionStorage,
  THREAD_DETAIL_FRESH_MS,
} from "./dashboard-nav-cache";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

describe("dashboard-nav-cache", () => {
  beforeEach(() => {
    const mem = new MemoryStorage();
    Object.defineProperty(globalThis, "sessionStorage", {
      value: mem,
      configurable: true,
      writable: true,
    });
  });

  it("round-trips JSON session entries", () => {
    writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.threads, [{ id: "t1" }]);
    expect(readJsonSessionStorage<{ id: string }[]>(DASHBOARD_CACHE_KEYS.threads)).toEqual([{ id: "t1" }]);
  });

  it("clears all thumbgate.cache.* keys on sign-out", () => {
    writeJsonSessionStorage(DASHBOARD_CACHE_KEYS.me, { user: { id: "u" } });
    writeJsonSessionStorage(threadDetailsStorageKey("abc"), { details: {}, cachedAt: 1 });
    writeJsonSessionStorage("unrelated", 1);
    clearDashboardNavCache();
    expect(readJsonSessionStorage(DASHBOARD_CACHE_KEYS.me)).toBeNull();
    expect(readJsonSessionStorage(threadDetailsStorageKey("abc"))).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("1");
  });

  it("treats thread details as fresh within the TTL window", () => {
    const now = 1_000_000;
    expect(isThreadDetailFresh(now - THREAD_DETAIL_FRESH_MS + 1, now)).toBe(true);
    expect(isThreadDetailFresh(now - THREAD_DETAIL_FRESH_MS - 1, now)).toBe(false);
  });

  it("prunes oldest thread-detail entries beyond the cap", () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < 10; i += 1) {
      storage.setItem(
        threadDetailsStorageKey(`t${i}`),
        JSON.stringify({ details: { id: i }, cachedAt: i * 1000 }),
      );
    }
    pruneThreadDetailStorage(storage, 8);
    expect(storage.length).toBe(8);
    expect(storage.getItem(threadDetailsStorageKey("t0"))).toBeNull();
    expect(storage.getItem(threadDetailsStorageKey("t1"))).toBeNull();
    expect(storage.getItem(threadDetailsStorageKey("t9"))).not.toBeNull();
  });

  it("preheats selected thread first then newest list peers", () => {
    const threads = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(selectPreheatThreadIds(threads, "c", 3)).toEqual(["c", "a", "b"]);
    expect(selectPreheatThreadIds(threads, null, 3)).toEqual(["a", "b", "c"]);
  });
});
