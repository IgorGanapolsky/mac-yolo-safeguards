import { describe, expect, it } from "vitest";
import {
  THREAD_MESSAGES_TASK_VISIBILITY_SQL,
  isThreadTaskVisibleAfterSync,
} from "./thread-messages-visibility";

describe("isThreadTaskVisibleAfterSync", () => {
  it("hides unsynced-duplicate local rows created before the Mac snapshot", () => {
    expect(
      isThreadTaskVisibleAfterSync({
        createdAt: 100,
        syncedAt: 200,
        route: "local",
        result: null,
      }),
    ).toBe(false);
  });

  it("keeps a hosted cloud run even when synced_at moved past created_at", () => {
    expect(
      isThreadTaskVisibleAfterSync({
        createdAt: 1787508628108,
        syncedAt: 1787606391980,
        route: "cloud",
        result: "**Direct answer:** Not constantly",
      }),
    ).toBe(true);
  });

  it("keeps any row that already has a result", () => {
    expect(
      isThreadTaskVisibleAfterSync({
        createdAt: 1,
        syncedAt: 9,
        route: "local",
        result: "done",
      }),
    ).toBe(true);
  });

  it("keeps rows when the thread has never synced", () => {
    expect(
      isThreadTaskVisibleAfterSync({
        createdAt: 1,
        syncedAt: null,
        route: "local",
        result: null,
      }),
    ).toBe(true);
  });
});

describe("THREAD_MESSAGES_TASK_VISIBILITY_SQL", () => {
  it("keeps the Mac-sync bound and carves out hosted cloud plus results", () => {
    expect(THREAD_MESSAGES_TASK_VISIBILITY_SQL).toContain("created_at > ?");
    expect(THREAD_MESSAGES_TASK_VISIBILITY_SQL).toContain("k.route = 'cloud'");
    expect(THREAD_MESSAGES_TASK_VISIBILITY_SQL).toContain("length(k.result)");
  });
});
