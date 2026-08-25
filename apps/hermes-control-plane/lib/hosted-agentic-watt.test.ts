import { describe, expect, it } from "vitest";
import {
  classifySession,
  contextReuse,
  gradeHostedWatt,
  normalizeTurns,
} from "./hosted-agentic-watt";

const FAKE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EXAMPLE_SHA = "34d1a8bd31cd27c386c8a0076cd8a94eef27ad20";

describe("hosted-agentic-watt", () => {
  it("does not treat static 8k/1k chat as an agentic replay", () => {
    const session = classifySession({ claimedClass: "chat" }, [
      { promptTokens: 8000, hasToolCall: false },
    ]);
    expect(session.class).toBe("chat");
    const grade = gradeHostedWatt({
      claimedClass: "chat",
      turns: [{ promptTokens: 8000, outputTokens: 1000, ttftMs: 400, e2eMs: 2000 }],
    });
    expect(grade.liveClaim).toBe(false);
    expect(grade.clonedAgentX).toBe(false);
    expect(grade.workerLive).toBe(false);
  });

  it("refuses NVIDIA factory / AgentX megawatt claims", () => {
    const grade = gradeHostedWatt({
      claimedClass: "chat",
      prompt: "Vera Rubin NVL72 AgentX 160 TPS",
      claimedTokensPerMegawatt: 30,
    });
    expect(grade.status).toBe("NOT_OFFERED");
    expect(grade.liveClaim).toBe(false);
    expect(grade.nvidiaMegawattClaim).toBe(false);
  });

  it("credits overlapping prompt tokens as a context-reuse analog", () => {
    const turns = normalizeTurns({
      turns: [
        { promptTokens: 2000, outputTokens: 80, ttftMs: 300, toolGapMs: 8000, e2eMs: 9000 },
        { promptTokens: 4200, outputTokens: 120, ttftMs: 250, e2eMs: 1500 },
      ],
    });
    expect(turns[0].decodeMs).toBe(700);
    expect(contextReuse(turns)).toEqual({
      reusedPromptTokens: 2000,
      billedPrefillTokens: 4200,
    });
  });

  it("marks slow E2E as UNUSABLE even when tokens-per-watt looks high", () => {
    const grade = gradeHostedWatt({
      turns: [
        {
          promptTokens: 1000,
          outputTokens: 50000,
          ttftMs: 200,
          e2eMs: 120000,
          hasToolCall: true,
        },
      ],
      evalArtifact: "tests/test-hosted-agentic-watt.js",
      deploySha: EXAMPLE_SHA,
      testsPass: true,
      workerLive: true,
    });
    expect(grade.usable).toBe(false);
    expect(grade.status).toBe("UNUSABLE");
    expect(grade.liveClaim).toBe(false);
    expect(grade.watt.notTokensPerMegawatt).toBe(true);
  });

  it("does not coerce string false into testsPass", () => {
    const grade = gradeHostedWatt({
      turns: [{ promptTokens: 10, outputTokens: 5, ttftMs: 10, e2eMs: 20, hasToolCall: true }],
      evalArtifact: "tests/test-hosted-agentic-watt.js",
      deploySha: EXAMPLE_SHA,
      testsPass: "false" as unknown as boolean,
      workerLive: true,
    });
    expect(grade.reasons).toContain("tests_not_pass");
    expect(grade.liveClaim).toBe(false);
  });

  it("rejects placeholder deploy SHAs", () => {
    const grade = gradeHostedWatt({
      turns: [{ promptTokens: 10, outputTokens: 5, ttftMs: 10, e2eMs: 20, hasToolCall: true }],
      evalArtifact: "tests/test-hosted-agentic-watt.js",
      deploySha: FAKE_SHA,
      testsPass: true,
      workerLive: true,
    });
    expect(grade.reasons).toContain("deploy_sha_placeholder");
    expect(grade.liveClaim).toBe(false);
  });
});
