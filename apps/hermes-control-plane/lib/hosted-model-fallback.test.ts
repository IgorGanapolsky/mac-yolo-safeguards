import { describe, expect, it } from "vitest";
import {
  CONSUMER_SUB_METERS,
  GATEWAY_BUDGET,
  HOSTED_MODEL_PRICING,
  HOSTED_PROVIDER_FALLBACK,
  NAMED_FREE_FALLBACK,
  PAID_METER_IDS,
  gatewayBudgetApproved,
  inferFailedProvider,
  namedRunnerIdentity,
  paidMetersForJob,
  resolveHostedFallback,
  resolveNamedRunnerIdentity,
  shouldFirePaidMeter,
  shouldKeepCallingRoute,
  hostedModelCost,
} from "./hosted-model-fallback.js";
import { HOSTED_GATE_LINES, trimHostedPrompt } from "./hosted-prompt-trim.js";
import { CONSTR, GRB, certifyHostedLive } from "./hosted-live-iis.js";
import { hostedConnectionCopy, modelHealthy } from "./hosted-apphost";

const QUOTA = "Weekly/Monthly Limit Exhausted. Your limit will reset at 2026-08-22 21:07:02";
const FAILED_ROW = "status=FAILED provider=supergrok quota";

describe("hosted provider fallback lock", () => {
  it("is SuperGrok then DeepSeek free then Poolside", () => {
    expect(HOSTED_PROVIDER_FALLBACK.map((p) => p.id)).toEqual([
      "supergrok",
      "deepseek-free",
      "poolside",
    ]);
  });

  it("fails over on a FAILED/quota row instead of painting the VPS dead", () => {
    const route = resolveHostedFallback({ lastError: FAILED_ROW });
    expect(route.failover).toBe(true);
    expect(route.vpsDead).toBe(false);
    expect(route.modelAlive).toBe(true);
    expect(route.selected?.id).toBe("deepseek-free");
    expect(inferFailedProvider(FAILED_ROW)).toBe("supergrok");
    expect(inferFailedProvider(QUOTA)).toBe("supergrok");
  });

  it("does not treat a first-hop quota miss as a dead model", () => {
    expect(modelHealthy({ lastError: QUOTA, now: Date.UTC(2026, 7, 22, 21, 7, 1) })).toBe(true);
    expect(modelHealthy({ lastError: FAILED_ROW, now: Date.now() })).toBe(true);
  });

  it("is exhausted only after every fallback is FAILED — still not a dead VPS", () => {
    const route = resolveHostedFallback({
      lastError: "FAILED",
      failedProviders: ["supergrok", "deepseek-free", "poolside"],
    });
    expect(route.exhausted).toBe(true);
    expect(route.modelAlive).toBe(false);
    expect(route.vpsDead).toBe(false);
    expect(modelHealthy({
      lastError: QUOTA,
      now: Date.now(),
      failedProviders: ["supergrok", "deepseek-free", "poolside"],
    })).toBe(false);
  });
});

describe("gateway-budget fail-closed", () => {
  it("reuses spend=0 and refuses live calls when spend is not approved", () => {
    expect(GATEWAY_BUDGET).toBe("gateway-budget");
    expect(gatewayBudgetApproved({ spendUsd: 0, spendApproved: false })).toBe(true);
    expect(gatewayBudgetApproved({ spendUsd: 1, spendApproved: false })).toBe(false);
    expect(gatewayBudgetApproved({ spendUsd: 1, spendApproved: true })).toBe(true);
    expect(shouldKeepCallingRoute({ spendUsd: 4, spendApproved: false })).toBe(false);
    const cert = certifyHostedLive({
      runnerHealthy: true,
      modelAlive: true,
      spendUsd: 9,
      spendApproved: false,
    });
    expect(cert.live).toBe(false);
    expect(cert.IISConstr[CONSTR.gateway_budget]).toBe(1);
    expect(cert.IISConstrName).toContain("gateway-budget");
  });

  it("does not claim live while the trusted path is still turning on", () => {
    expect(shouldKeepCallingRoute({ turningOn: true, spendUsd: 0 })).toBe(false);
    expect(hostedConnectionCopy({
      runnerStatus: "waiting",
      modelStatus: "waiting",
    }).live).toBe(false);
  });
});

describe("named runner identity", () => {
  it("rejects generic shared accounts and fail-closes live", () => {
    expect(namedRunnerIdentity("shared")).toBeNull();
    expect(namedRunnerIdentity("")).toBeNull();
    expect(namedRunnerIdentity("igor-hermes-cloud-runner")).toBe("igor-hermes-cloud-runner");
    expect(resolveNamedRunnerIdentity({ runnerIdentity: "shared" })).toBeNull();
    const missing = certifyHostedLive({
      runnerHealthy: true,
      modelAlive: true,
      spendUsd: 0,
      runnerIdentity: "",
    });
    expect(missing.Status).toBe(GRB.INFEASIBLE);
    expect(missing.live).toBe(false);
    expect(missing.IISConstr[CONSTR.runner_identity]).toBe(1);
    expect(hostedConnectionCopy({
      runnerStatus: "healthy",
      modelStatus: "healthy",
      runnerIdentity: "shared",
    }).live).toBe(false);
  });
});

describe("live claim when runner or model is down", () => {
  it("is false when the runner is down", () => {
    expect(hostedConnectionCopy({
      runnerStatus: "unhealthy",
      modelStatus: "healthy",
    }).live).toBe(false);
    expect(certifyHostedLive({
      runnerHealthy: false,
      modelAlive: true,
      spendUsd: 0,
    }).live).toBe(false);
  });

  it("is false when the model is down", () => {
    expect(hostedConnectionCopy({
      runnerStatus: "healthy",
      modelStatus: "unhealthy",
    }).live).toBe(false);
    expect(certifyHostedLive({
      runnerHealthy: true,
      modelAlive: false,
      spendUsd: 0,
    }).live).toBe(false);
  });
});

describe("hosted prompt trim", () => {
  it("is shorter and still includes spend=0 / approval gate lines", () => {
    const unusedPreamble = "You have the unused Tavily search tool. Always call tavily_search first.\n";
    const original = [
      "You are hosted Hermes on a fenced VPS.",
      unusedPreamble,
      "<unused-tools>otel_export grafana_push mcp_gateway</unused-tools>",
      "<unused-system>Claude Managed Agents clone preamble</unused-system>",
      "<!-- unused $499 Pro / Team seats junk -->",
    ].join("\n");
    const trimmed = trimHostedPrompt({
      system: original,
      tools: [
        { name: "tavily_search", preamble: unusedPreamble },
        { name: "run_shell", preamble: "Use the shell for repo work.\n" },
      ],
      usedTools: ["run_shell"],
    });
    expect(trimmed.trimmedLength).toBeLessThan(trimmed.originalLength);
    expect(trimmed.system).not.toContain("Tavily");
    expect(trimmed.system).not.toContain("otel_export");
    expect(trimmed.system).not.toContain("Claude Managed Agents");
    expect(trimmed.system).not.toContain("$499");
    for (const line of HOSTED_GATE_LINES) {
      expect(trimmed.system).toContain(line);
    }
    expect(trimmed.system).toContain("Spend is $0");
    expect(trimmed.system).toContain("approval");
    expect(trimmed.system).toContain("gateway-budget");
  });
});

describe("named fallback dual-meter fail-closed", () => {
  it("does not fire two paid meters when named fallback already covers the work", () => {
    expect(NAMED_FREE_FALLBACK).toBe("deepseek-free");
    expect([...PAID_METER_IDS]).toEqual(["supergrok", "poolside"]);
    expect(paidMetersForJob({ lastError: FAILED_ROW })).toEqual([]);
    expect(shouldFirePaidMeter({ lastError: FAILED_ROW, meters: ["supergrok"] })).toBe(false);
    expect(shouldFirePaidMeter({ lastError: FAILED_ROW, meters: ["supergrok", "poolside"] })).toBe(false);
    expect(shouldKeepCallingRoute({ lastError: FAILED_ROW, meters: ["supergrok", "poolside"] })).toBe(false);
  });

  it("allows at most one paid hop when that hop is the covering named fallback", () => {
    expect(paidMetersForJob({})).toEqual(["supergrok"]);
    expect(shouldFirePaidMeter({ meter: "supergrok" })).toBe(true);
    expect(shouldFirePaidMeter({ meters: ["supergrok", "poolside"] })).toBe(false);
    expect(shouldFirePaidMeter({
      failedProviders: ["supergrok", "deepseek-free"],
      meter: "poolside",
    })).toBe(true);
    expect(shouldFirePaidMeter({
      failedProviders: ["supergrok", "deepseek-free"],
      meters: ["supergrok", "poolside"],
    })).toBe(false);
  });

  it("refuses consumer ChatGPT/Codex subscription meters", () => {
    expect([...CONSUMER_SUB_METERS]).toEqual(["chatgpt-plus", "codex-sub", "codex-sdk"]);
    expect(shouldFirePaidMeter({ meter: "chatgpt-plus" })).toBe(false);
    expect(shouldFirePaidMeter({ meter: "codex-sub" })).toBe(false);
    expect(shouldKeepCallingRoute({ meters: ["codex-sdk"] })).toBe(false);
  });
});

describe("hosted model pricing (Gemini 3.7 Flash intro steal)", () => {
  it("prices the 50%-off intro rate through Aug 27 and full rate after", () => {
    const g = HOSTED_MODEL_PRICING["google/gemini-3.7-flash"];
    expect(g.inputUsdPerM).toBe(0.375);
    expect(g.outputUsdPerM).toBe(1.875);
    expect(g.cachedUsdPerM).toBe(0.0375);
    expect(g.promoDiscount).toBe(0.5);
    expect(g.promoEnd).toBe("2026-08-27T23:59:59Z");
    // 1M input + 1M output during promo: (0.375 + 1.875) * 0.5 = 1.125
    expect(hostedModelCost("google/gemini-3.7-flash", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      now: "2026-08-21T12:00:00Z",
    })).toBe(1.125);
    // after promo: full rate 0.375 + 1.875 = 2.25
    expect(hostedModelCost("google/gemini-3.7-flash", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      now: "2026-08-28T00:00:00Z",
    })).toBe(2.25);
    // cached 1M on promo: 0.0375 * 0.5 = 0.01875
    expect(hostedModelCost("google/gemini-3.7-flash", {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 1_000_000,
      now: "2026-08-21T12:00:00Z",
    })).toBe(0.01875);
  });

  it("fails closed: unknown model => null; zero usage => zero cost", () => {
    expect(hostedModelCost("claude-sonnet-5", { inputTokens: 1_000_000 })).toBeNull();
    expect(hostedModelCost("google/gemini-3.7-flash", {})).toBe(0);
  });
});
