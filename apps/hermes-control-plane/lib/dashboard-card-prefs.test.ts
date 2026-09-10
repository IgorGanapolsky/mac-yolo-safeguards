import { describe, expect, it } from "vitest";
import { emptyCardPrefs, parseCardPrefs, toggleId } from "./dashboard-card-prefs.ts";

describe("dashboard card prefs", () => {
  it("toggles dismiss and collapse ids", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("parses stored prefs without inventing threads", () => {
    expect(parseCardPrefs(null)).toEqual(emptyCardPrefs());
    expect(parseCardPrefs({
      dismissedTaskIds: ["t1"],
      collapsedTaskIds: ["t1"],
      archivedThreadIds: ["c1"],
      conversationMinimized: true,
    })).toEqual({
      dismissedTaskIds: ["t1"],
      collapsedTaskIds: ["t1"],
      archivedThreadIds: ["c1"],
      conversationMinimized: true,
    });
  });
});
