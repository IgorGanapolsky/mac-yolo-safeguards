import { describe, expect, it } from "vitest";
import {
  formatEngine,
  formatTtft,
  formatTurnCost,
  formatTurnStatusline,
} from "./turn-statusline.ts";

const MAC_OLLAMA = /Ollama \(http:\/\/localhost|127\.0\.0\.1:11434/i;

describe("turn statusline", () => {
  it("defaults engine to hosted Hermes, not Mac localhost Ollama", () => {
    const engine = formatEngine();
    expect(engine).toBe("Hosted Hermes · SuperGrok (grok-4.5)");
    expect(MAC_OLLAMA.test(engine)).toBe(false);
  });

  it("maps provider ids and rejects a Mac Ollama engine string", () => {
    expect(formatEngine({ providerLabel: "supergrok" })).toBe(
      "Hosted Hermes · SuperGrok (grok-4.5)",
    );
    expect(
      formatEngine({
        providerLabel: "Ollama (http://localhost:11434/v1/models)",
        model: "llama",
      }),
    ).toBe("Hosted Hermes · SuperGrok (grok-4.5)");
  });

  it("keeps TTFT unmeasured until a real first-token sample exists", () => {
    expect(formatTtft(null)).toBe("unmeasured");
    expect(formatTtft(undefined)).toBe("unmeasured");
    expect(formatTtft(-1)).toBe("unmeasured");
    expect(formatTtft(4)).toBe("<10ms");
    expect(formatTtft(42)).toBe("42ms");
    expect(formatTtft(1500)).toBe("1.5s");
  });

  it("treats unknown turn cost as included in the $10/mo plan", () => {
    expect(formatTurnCost(null)).toBe("$0.00 · included in $10/mo");
    expect(formatTurnCost(0)).toBe("$0.00");
    expect(formatTurnCost(1.234)).toBe("$1.23");
  });

  it("prints Engine | TTFT | Cost chrome", () => {
    const { line } = formatTurnStatusline({
      providerLabel: "DeepSeek free",
      model: "deepseek-v4-flash",
      ttftMs: 12,
      costUsd: 0,
    });
    expect(line).toBe(
      "Turn Statusline | Engine: Hosted Hermes · DeepSeek free (deepseek-v4-flash) | TTFT: 12ms | Cost: $0.00",
    );
    expect(MAC_OLLAMA.test(line)).toBe(false);
    const defaults = formatTurnStatusline();
    expect(defaults.line).toBe(
      "Turn Statusline | Engine: Hosted Hermes · SuperGrok (grok-4.5) | TTFT: unmeasured | Cost: $0.00 · included in $10/mo",
    );
  });
});
