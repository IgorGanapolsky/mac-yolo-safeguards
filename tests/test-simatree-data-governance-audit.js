import test from "node:test";
import assert from "node:assert/strict";
import { GOVERNANCE_RULES, runDataGovernanceAudit } from "../tools/simatree-data-governance-audit.js";

test("GOVERNANCE_RULES contains core enterprise data safety checks", () => {
  assert.ok(GOVERNANCE_RULES.length >= 5);
  const ids = GOVERNANCE_RULES.map((r) => r.id);
  assert.ok(ids.includes("DATA-01-DESTRUCTIVE-DDL"));
  assert.ok(ids.includes("DATA-02-PII-EGRESS-FILTER"));
  assert.ok(ids.includes("DATA-03-TOKEN-COMPRESSION-HARNESS"));
});

test("runDataGovernanceAudit gives 100% score for compliant policy", () => {
  const compliantPolicy = {
    allowUnrestrictedDDL: false,
    hasPiiFilter: true,
    tokenCompressionEnabled: true,
    immutableReceiptsEnabled: true,
    leaseSeconds: 90,
  };

  const audit = runDataGovernanceAudit(compliantPolicy);
  assert.equal(audit.overallScore, 100);
  assert.equal(audit.complianceStatus, "COMPLIANT");
  assert.equal(audit.failedRules, 0);
});

test("runDataGovernanceAudit detects violations and penalizes score correctly", () => {
  const nonCompliantPolicy = {
    allowUnrestrictedDDL: true, // violation (-30)
    hasPiiFilter: false, // violation (-30)
    tokenCompressionEnabled: false, // violation (-15)
    immutableReceiptsEnabled: false, // violation (-15)
    leaseSeconds: 300, // violation (-10)
  };

  const audit = runDataGovernanceAudit(nonCompliantPolicy);
  assert.equal(audit.overallScore, 0);
  assert.equal(audit.complianceStatus, "NON_COMPLIANT");
  assert.equal(audit.failedRules, 5);
});
