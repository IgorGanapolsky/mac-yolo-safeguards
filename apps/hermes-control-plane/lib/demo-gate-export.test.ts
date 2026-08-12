import { describe, expect, it } from "vitest";
import {
  buildDemoGateExport,
  isDemoExportReady,
  type DemoPhase,
} from "./demo-gate-export";

const FIXED = "2026-08-12T20:00:00.000Z";

describe("buildDemoGateExport (Amphi-style visual → code)", () => {
  it("exports a deny gate with PreToolUse-style matcher for deploy commands", () => {
    const exp = buildDemoGateExport({
      phase: "denied",
      policy: "manual",
      generatedAt: FIXED,
    });
    expect(exp.title).toBe("Export gate as code");
    expect(exp.decision).toBe("deny_tool_call");
    expect(exp.steps).toHaveLength(1);
    expect(exp.steps[0]).toMatch(/Leash gate/);
    expect(exp.gateJson).toContain('"decision": "deny_tool_call"');
    expect(exp.gateJson).toContain("npm run deploy");
    expect(exp.gateJson).toContain(FIXED);
    expect(exp.hookSnippet).toContain("decision\":\"deny\"");
    expect(exp.hookSnippet).toMatch(/npm run deploy|--prod/);
    expect(exp.clipboardText).toContain("durable gate JSON");
    expect(exp.clipboardText).toContain(exp.gateJson.trim());
    expect(exp.decisionContractJson).toContain("decision_contract");
    expect(exp.decisionContractJson).toContain("tool_call_local");
    expect(exp.clipboardText).toContain("decision contract");
  });

  it("exports approve_local_lease with two visual steps after approve", () => {
    const exp = buildDemoGateExport({
      phase: "running",
      policy: "manual",
      generatedAt: FIXED,
    });
    expect(exp.decision).toBe("approve_local_lease");
    expect(exp.steps).toHaveLength(2);
    expect(exp.hookSnippet).toContain("approve_local_lease");
    expect(exp.hookSnippet).not.toContain('"deny"');
  });

  it("exports full four-step path for cloud continuity", () => {
    const exp = buildDemoGateExport({
      phase: "cloud",
      policy: "auto",
      generatedAt: FIXED,
    });
    expect(exp.decision).toBe("cloud_auto_fenced_lease");
    expect(exp.steps).toHaveLength(4);
    expect(exp.gateJson).toContain("auto_cloud_continuity");
  });

  it("maps offline policies into stable offlinePolicy labels", () => {
    expect(
      JSON.parse(
        buildDemoGateExport({ phase: "paused", policy: "disabled", generatedAt: FIXED }).gateJson,
      ).path.offlinePolicy,
    ).toBe("pause_until_online");
    expect(
      JSON.parse(
        buildDemoGateExport({ phase: "ask", policy: "manual", generatedAt: FIXED }).gateJson,
      ).path.offlinePolicy,
    ).toBe("ask_before_cloud");
  });

  it("is deterministic for fixed generatedAt", () => {
    const a = buildDemoGateExport({ phase: "denied", policy: "manual", generatedAt: FIXED });
    const b = buildDemoGateExport({ phase: "denied", policy: "manual", generatedAt: FIXED });
    expect(a.clipboardText).toBe(b.clipboardText);
  });

  it("allows custom tool/command overrides", () => {
    const exp = buildDemoGateExport({
      phase: "denied",
      policy: "manual",
      toolName: "Shell",
      command: "rm -rf /",
      generatedAt: FIXED,
    });
    expect(exp.gateJson).toContain('"name": "Shell"');
    expect(exp.gateJson).toContain("rm -rf /");
  });
});

describe("isDemoExportReady", () => {
  const cases: Array<[DemoPhase, boolean]> = [
    ["pending", false],
    ["offline_choice", false],
    ["denied", true],
    ["running", true],
    ["paused", true],
    ["ask", true],
    ["cloud", true],
  ];
  for (const [phase, ready] of cases) {
    it(`${phase} → ${ready}`, () => {
      expect(isDemoExportReady(phase)).toBe(ready);
    });
  }
});
