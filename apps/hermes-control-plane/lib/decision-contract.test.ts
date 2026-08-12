import { describe, expect, it } from "vitest";
import {
  DECISION_CONTRACT_VERSION,
  contractForCloudContinuity,
  contractForLocalToolCall,
  evaluateDecisionContract,
  formatDecisionContractDocument,
} from "./decision-contract";

const FIXED = "2026-08-12T20:10:00.000Z";

describe("evaluateDecisionContract — recommend vs execute", () => {
  it("always allows recommend even when evidence is incomplete (provisional)", () => {
    const contract = contractForLocalToolCall("manual");
    const result = evaluateDecisionContract({
      contract,
      mode: "recommend",
      evidence: {
        machineOnline: false,
        leaseHeld: false,
        offlinePolicy: "manual",
        evidenceComplete: false,
        sourceApproved: false,
      },
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.provisional).toBe(true);
      expect(result.reasons).toEqual(
        expect.arrayContaining(["machine_offline_provisional", "incomplete_evidence_provisional"]),
      );
      expect(result.receipt.outcome).toBe("allow");
    }
  });

  it("denies local execute when Mac is offline under manual offline policy", () => {
    const result = evaluateDecisionContract({
      contract: contractForLocalToolCall("manual"),
      mode: "execute",
      evidence: {
        machineOnline: false,
        leaseHeld: true,
        offlinePolicy: "manual",
        sourceApproved: true,
      },
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("machine_offline");
      expect(result.message).toMatch(/needs_failover|explicit Continuity/i);
      expect(result.receipt.outcome).toBe("deny");
    }
  });

  it("denies local execute without a lease even when online", () => {
    const result = evaluateDecisionContract({
      contract: contractForLocalToolCall("auto"),
      mode: "execute",
      evidence: {
        machineOnline: true,
        leaseHeld: false,
        offlinePolicy: "auto",
        sourceApproved: true,
      },
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("lease_missing");
    }
  });

  it("allows local execute when online + lease + approved source + fresh heartbeat", () => {
    const result = evaluateDecisionContract({
      contract: contractForLocalToolCall("manual"),
      mode: "execute",
      evidence: {
        machineOnline: true,
        leaseHeld: true,
        offlinePolicy: "manual",
        sourceApproved: true,
        heartbeatAgeSec: 12,
      },
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.provisional).toBe(false);
      expect(result.reasons).toContain("execute_allowed");
      expect(result.receipt.version).toBe(DECISION_CONTRACT_VERSION);
    }
  });

  it("denies stale heartbeat for local execute", () => {
    const result = evaluateDecisionContract({
      contract: contractForLocalToolCall("manual"),
      mode: "execute",
      evidence: {
        machineOnline: true,
        leaseHeld: true,
        offlinePolicy: "manual",
        sourceApproved: true,
        heartbeatAgeSec: 120,
        maxHeartbeatAgeSec: 90,
      },
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.code).toBe("stale_heartbeat");
  });

  it("denies cloud continuity execute when not entitled", () => {
    const result = evaluateDecisionContract({
      contract: contractForCloudContinuity("auto"),
      mode: "execute",
      evidence: {
        machineOnline: false,
        leaseHeld: false,
        offlinePolicy: "auto",
        sourceApproved: true,
        evidenceComplete: true,
      },
      entitled: false,
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.message).toMatch(/trial or paid/i);
    }
  });

  it("allows cloud continuity execute when entitled and evidence complete", () => {
    const result = evaluateDecisionContract({
      contract: contractForCloudContinuity("auto"),
      mode: "execute",
      evidence: {
        machineOnline: false,
        leaseHeld: false,
        offlinePolicy: "auto",
        sourceApproved: true,
        evidenceComplete: true,
      },
      entitled: true,
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(true);
  });

  it("denies unapproved source on execute", () => {
    const result = evaluateDecisionContract({
      contract: contractForLocalToolCall("manual"),
      mode: "execute",
      evidence: {
        machineOnline: true,
        leaseHeld: true,
        offlinePolicy: "manual",
        sourceApproved: false,
      },
      generatedAt: FIXED,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.code).toBe("source_unapproved");
  });
});

describe("formatDecisionContractDocument", () => {
  it("exports a portable decision_contract document", () => {
    const contract = contractForLocalToolCall("manual");
    const evaluation = evaluateDecisionContract({
      contract,
      mode: "recommend",
      evidence: { machineOnline: true, leaseHeld: true, offlinePolicy: "manual", sourceApproved: true },
      generatedAt: FIXED,
    });
    const doc = formatDecisionContractDocument(contract, evaluation);
    const parsed = JSON.parse(doc);
    expect(parsed.decision_contract.decision_class).toBe("tool_call_local");
    expect(parsed.decision_contract.action_boundary).toBe("execute_with_leash");
    expect(parsed.last_evaluation.allowed).toBe(true);
    expect(parsed.last_evaluation.receipt.kind).toBe("decision_contract_receipt");
  });
});
