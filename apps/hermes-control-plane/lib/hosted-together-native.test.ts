import { describe, expect, it } from "vitest";
import {
  attachTogetherNative,
  capacityIsNotFrontier,
  classifyWorkload,
  gradeHostedClaim,
  researchToProduction,
} from "./hosted-together-native";

const FAKE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EXAMPLE_SHA = "d1ced6147a909de93aafd05b096585e3e6d0ab69";

describe("hosted-together-native", () => {
  it("treats leftover quota as capacity, not a LIVE frontier claim", () => {
    const cap = capacityIsNotFrontier({ quotaRemainingUsd: 8.5, vpsUp: true });
    expect(cap.capacity).toBe(true);
    expect(cap.liveFromCapacity).toBe(false);
    const grade = gradeHostedClaim({
      claimedClass: "chat",
      quotaRemainingUsd: 8.5,
      vpsUp: true,
    });
    expect(grade.liveClaim).toBe(false);
    expect(grade.status).toBe("NOT_LIVE");
    expect(grade.reasons).toContain("capacity_is_not_frontier");
    expect(grade.clonedTogetherCloud).toBe(false);
    expect(grade.workerLive).toBe(false);
  });

  it("refuses dedicated GPU / Instant Cluster claims", () => {
    expect(classifyWorkload({ claimedClass: "gpu" }).offered).toBe(false);
    const grade = gradeHostedClaim({
      claimedClass: "chat",
      prompt: "spin up Instant Clusters",
    });
    expect(grade.status).toBe("NOT_OFFERED");
    expect(grade.liveClaim).toBe(false);
  });

  it("marks batch completions as BATCH_COMPLETE, never LIVE", () => {
    const grade = gradeHostedClaim({
      claimedClass: "batch",
      evalArtifact: "tests/test-hosted-together-native.js",
      deploySha: EXAMPLE_SHA,
      testsPass: true,
      workerLive: true,
    });
    expect(grade.status).toBe("BATCH_COMPLETE");
    expect(grade.liveClaim).toBe(false);
  });

  it("does not let claimedClass=chat hide overnight/batch prompts", () => {
    const grade = gradeHostedClaim({
      claimedClass: "chat",
      prompt: "run the overnight eval",
      evalArtifact: "tests/test-hosted-together-native.js",
      deploySha: EXAMPLE_SHA,
      testsPass: true,
      workerLive: true,
    });
    expect(grade.status).toBe("BATCH_COMPLETE");
    expect(grade.liveClaim).toBe(false);
  });

  it("rejects placeholder SHAs and stringly-typed proof flags", () => {
    expect(
      researchToProduction({
        evalArtifact: "tests/test-hosted-together-native.js",
        deploySha: FAKE_SHA,
        testsPass: true,
      }).reason,
    ).toBe("deploy_sha_placeholder");
    const coerced = gradeHostedClaim({
      claimedClass: "serverless",
      evalArtifact: "tests/test-hosted-together-native.js",
      deploySha: EXAMPLE_SHA,
      testsPass: "false" as unknown as boolean,
      workerLive: "false" as unknown as boolean,
    });
    expect(coerced.liveClaim).toBe(false);
    expect(coerced.reasons).toContain("tests_not_pass");
  });

  it("rejects conference talks and vendor blogs as production receipts", () => {
    expect(
      researchToProduction({ blogUrl: "https://www.together.ai/ainativeconf" }).reason,
    ).toBe("talk_is_not_production");
    expect(
      researchToProduction({
        evalArtifact: "https://www.together.ai/blog/flashattention-4",
        deploySha: FAKE_SHA,
        testsPass: true,
      }).ok,
    ).toBe(false);
  });

  it("allows LIVE only with eval artifact + deploy SHA + tests + workerLive", () => {
    const missingWorker = gradeHostedClaim({
      claimedClass: "serverless",
      evalArtifact: "tests/test-hosted-together-native.js",
      deploySha: EXAMPLE_SHA,
      testsPass: true,
      workerLive: false,
    });
    expect(missingWorker.liveClaim).toBe(false);
    const ok = gradeHostedClaim({
      claimedClass: "serverless",
      evalArtifact: "tests/test-hosted-together-native.js",
      deploySha: EXAMPLE_SHA,
      testsPass: true,
      workerLive: true,
    });
    expect(ok.liveClaim).toBe(true);
    expect(ok.status).toBe("LIVE");
    expect(ok.workerLive).toBe(false);
  });

  it("strips a false LIVE receipt when only capacity is present", () => {
    const attached = attachTogetherNative(
      { liveClaim: true, outcome: "done" },
      { claimedClass: "chat", quotaRemainingUsd: 10, vpsUp: true },
    );
    expect(attached.liveClaim).toBe(false);
    expect(attached.togetherNative.capacityIsNotFrontier).toBe(true);
  });

  it("requires a paid subscriber for provisioned SLA LIVE", () => {
    const unpaid = gradeHostedClaim({
      claimedClass: "provisioned",
      evalArtifact: "tests/test-hosted-together-native.js",
      deploySha: EXAMPLE_SHA,
      testsPass: true,
      workerLive: true,
    });
    expect(unpaid.liveClaim).toBe(false);
    expect(unpaid.reasons).toContain("provisioned_requires_paid");
    const paid = gradeHostedClaim({
      claimedClass: "provisioned",
      evalArtifact: "tests/test-hosted-together-native.js",
      deploySha: EXAMPLE_SHA,
      testsPass: true,
      workerLive: true,
      stripePaid: true,
    });
    expect(paid.liveClaim).toBe(true);
  });
});
