import { describe, expect, it } from "vitest";
import { estimateUsageUsdMicros, microsToUsd } from "./model-usage-pricing";

describe("estimateUsageUsdMicros", () => {
  it("prices 1M in + 1M out at default rates (0.15 + 0.60)", () => {
    const micros = estimateUsageUsdMicros({ promptTokens: 1_000_000, completionTokens: 1_000_000 });
    expect(microsToUsd(micros)).toBeCloseTo(0.75, 6);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateUsageUsdMicros({ promptTokens: 0, completionTokens: 0 })).toBe(0);
  });

  it("handles small canary-sized usage", () => {
    const micros = estimateUsageUsdMicros({ promptTokens: 500, completionTokens: 120 });
    expect(micros).toBeGreaterThan(0);
    expect(microsToUsd(micros)).toBeLessThan(0.01);
  });
});
