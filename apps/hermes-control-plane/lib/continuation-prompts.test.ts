import { describe, expect, it } from "vitest";

import { isSameThreadCompactionCommand, resolveContinuationPrompt } from "./continuation-prompts";

describe("continuation prompts", () => {
  it("preserves user copy while creating a context-bound execution instruction", () => {
    const resolved = resolveContinuationPrompt("  show receipts? ", { hasContext: true });
    expect(resolved).toMatchObject({
      applied: true,
      command: "show_receipts",
      displayPrompt: "show receipts?",
    });
    expect(resolved.executionPrompt).toMatch(/evidence/i);
    expect(resolved.executionPrompt).toMatch(/unknown/i);
  });

  it("does not expand without an established conversation", () => {
    expect(resolveContinuationPrompt("keep going", { hasContext: false })).toEqual({
      applied: false,
      command: "keep_going",
      displayPrompt: "keep going",
      executionPrompt: "keep going",
      reason: "context_required",
    });
  });

  it("does not treat ordinary prose as a magic command", () => {
    expect(resolveContinuationPrompt("please keep going through the tests", { hasContext: true })).toMatchObject({
      applied: false,
      command: null,
      reason: "not_continuation_command",
    });
  });

  it("keeps Bot Mode reset commands on the same durable thread", () => {
    expect(isSameThreadCompactionCommand(" /RESET! ")).toBe(true);
    expect(isSameThreadCompactionCommand("reset the thread please")).toBe(false);
    expect(resolveContinuationPrompt("/new", { hasContext: true })).toMatchObject({
      applied: true,
      command: "compact_same_thread",
      displayPrompt: "/new",
    });
    expect(resolveContinuationPrompt("/new", { hasContext: true }).executionPrompt).toMatch(/becomes the durable context/i);
    expect(resolveContinuationPrompt("/reset", { hasContext: false })).toMatchObject({
      applied: false,
      command: "compact_same_thread",
      reason: "context_required",
    });
  });
});
