import { describe, expect, it } from "vitest";
import {
  DUE_SOON_WINDOW_MS,
  VPS_UNFINISHED_CHECK_INTERVAL_MS,
  VPS_UNFINISHED_CHECK_VERSION,
  evaluateUnfinishedCheck,
  selectPingItems,
} from "./vps-unfinished-check";

const NOW = 1_800_000_000_000;

const unfinished = {
  id: "task-1",
  kind: "unfinished" as const,
  dueAt: null,
  summary: "Finish the grant-window PR",
};

const dueSoon = {
  id: "task-2",
  kind: "due_soon" as const,
  dueAt: NOW + 2 * 60 * 60 * 1000,
  summary: "Invoice follow-up due this afternoon",
};

const dueLater = {
  id: "task-3",
  kind: "due_soon" as const,
  dueAt: NOW + DUE_SOON_WINDOW_MS + 1,
  summary: "Something next week",
};

describe("VPS hourly unfinished / due-soon check", () => {
  it("only fires on the hosted VPS — laptop sleep is the fail", () => {
    for (const runtime of ["laptop", "unknown", "cloud", "", null] as const) {
      expect(
        evaluateUnfinishedCheck({
          runtime,
          now: NOW,
          lastFiredAt: null,
          conversationActive: false,
          items: [unfinished],
        }),
      ).toMatchObject({ fire: false, reason: "not_vps", version: VPS_UNFINISHED_CHECK_VERSION });
    }
  });

  it("does not interrupt an active conversation", () => {
    expect(
      evaluateUnfinishedCheck({
        runtime: "vps",
        now: NOW,
        lastFiredAt: null,
        conversationActive: true,
        items: [unfinished],
      }),
    ).toMatchObject({ fire: false, reason: "conversation_active" });
  });

  it("waits a full hour between pings", () => {
    expect(
      evaluateUnfinishedCheck({
        runtime: "vps",
        now: NOW + VPS_UNFINISHED_CHECK_INTERVAL_MS - 1,
        lastFiredAt: NOW,
        conversationActive: false,
        items: [unfinished],
      }),
    ).toMatchObject({ fire: false, reason: "interval_not_elapsed" });
    expect(
      evaluateUnfinishedCheck({
        runtime: "vps",
        now: NOW + VPS_UNFINISHED_CHECK_INTERVAL_MS,
        lastFiredAt: NOW,
        conversationActive: false,
        items: [unfinished],
      }),
    ).toMatchObject({ fire: true, reason: "unfinished_or_due_soon" });
  });

  it("pings unfinished work and items due within 24h, not later", () => {
    expect(selectPingItems([unfinished, dueSoon, dueLater], NOW).map((item) => item.id)).toEqual([
      "task-1",
      "task-2",
    ]);
    expect(
      evaluateUnfinishedCheck({
        runtime: "vps",
        now: NOW,
        lastFiredAt: null,
        conversationActive: false,
        items: [dueLater],
      }),
    ).toMatchObject({ fire: false, reason: "nothing_due" });
  });

  it("drops blank rows and is not a second product (no channel fanout fields)", () => {
    const result = evaluateUnfinishedCheck({
      runtime: "vps",
      now: NOW,
      lastFiredAt: null,
      conversationActive: false,
      items: [
        { id: " ", kind: "unfinished", dueAt: null, summary: "nope" },
        { id: "ok", kind: "unfinished", dueAt: null, summary: "Ship the VPS ping" },
      ],
    });
    expect(result.fire).toBe(true);
    if (result.fire) {
      expect(result.items).toEqual([
        { id: "ok", kind: "unfinished", dueAt: null, summary: "Ship the VPS ping" },
      ]);
      expect(result).not.toHaveProperty("channels");
      expect(result).not.toHaveProperty("phone");
    }
  });
});
