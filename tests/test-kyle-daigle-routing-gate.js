'use strict';

const assert = require('assert');
const {
  LOCAL_CLERK,
  classifyCascadeRoute,
  planCrossFamilyCritique,
  assessWorkspaceClaim,
  assessSecretScanClaim,
  inspectSnippetForSecretShapes,
  assessPrototypeClaim,
} = require('../tools/kyle-daigle-routing-gate');

const local = classifyCascadeRoute({
  promptText: 'Format string',
  filesTouchedCount: 1,
  callerSaidEscalate: false,
});
assert.strictEqual(local.fusion_tier, 'LOCAL_CLERK');
assert.strictEqual(local.routed_model, LOCAL_CLERK);
assert.strictEqual(local.difficulty_score, null);
assert.strictEqual(local.difficulty_measured, false);
assert.strictEqual(local.slm_eval_ran, false);
assert.strictEqual(local.online_eval_tracked, false);
assert.strictEqual(local.zero_cloud_token_execution, false);
assert.strictEqual(local.cloud_tokens_measured, false);
assert.strictEqual(local.paid_frontier_default, false);
assert.strictEqual(local.higher_tier_invoked, false);

const callerEscalate = classifyCascadeRoute({
  promptText: 'Format string',
  callerSaidEscalate: true,
});
assert.strictEqual(callerEscalate.fusion_tier, 'LOCAL_CLERK');
assert.strictEqual(callerEscalate.caller_escalate_accepted, false);
assert.strictEqual(callerEscalate.higher_tier_invoked, false);
assert.strictEqual(callerEscalate.paid_frontier_default, false);

const failed = classifyCascadeRoute({
  promptText: 'Format string',
  objectiveChecked: true,
  objectiveMet: false,
});
assert.strictEqual(failed.fusion_tier, 'ESCALATE_AFTER_FAILED_CHECK');
assert.strictEqual(failed.cascade_escalated, true);
assert.strictEqual(failed.routed_model, LOCAL_CLERK);
assert.strictEqual(failed.higher_tier_invoked, false);

const met = classifyCascadeRoute({
  promptText: 'Format string',
  objectiveChecked: true,
  objectiveMet: true,
});
assert.strictEqual(met.fusion_tier, 'LOCAL_CLERK');
assert.strictEqual(met.reason, 'objective_met_stay_local');

const byok = classifyCascadeRoute({
  promptText: 'Verify Nexus STS claim',
  domainByokContext: 'eci_nexus',
});
assert.strictEqual(byok.fusion_tier, 'DOMAIN_BYOK_SPECIALIST');
assert.strictEqual(byok.specialist_invoked, false);
assert.strictEqual(byok.byok_key_present, false);
assert.strictEqual(byok.routed_model, LOCAL_CLERK);

const critique = planCrossFamilyCritique({
  generatorModel: 'google-antigravity/gemini-4-argon',
  taskSummary: 'unit_test_cross_family_critique',
});
assert.strictEqual(critique.cross_family_disjoint, true);
assert.notStrictEqual(critique.generator_family, critique.critic_family);
assert.strictEqual(critique.critique_ran, false);
assert.strictEqual(critique.critic_invoked, false);
assert.strictEqual(critique.token_spend_reduction_measured, false);
assert.strictEqual(critique.speed_boost_measured, false);
assert.strictEqual(critique.measured_token_spend_reduction_pct, null);
assert.strictEqual(critique.measured_speed_boost_pct, null);

const sameFamily = planCrossFamilyCritique({
  generatorModel: LOCAL_CLERK,
  criticModel: LOCAL_CLERK,
});
assert.strictEqual(sameFamily.cross_family_disjoint, false);
assert.strictEqual(sameFamily.critique_ran, false);

const workspace = assessWorkspaceClaim({
  repoNames: ['mac-yolo-safeguards', 'ThumbGate'],
});
assert.strictEqual(workspace.grouped_repos_count, 2);
assert.strictEqual(workspace.copilot_project_created, false);
assert.strictEqual(workspace.cloud_sandbox_started, false);
assert.strictEqual(workspace.autonomous_merge_enabled, false);
assert.strictEqual(workspace.merge_started, false);

const secrets = assessSecretScanClaim({
  deterministicSecretLeaks: 0,
  localAiRedTeamReady: true,
});
assert.strictEqual(secrets.passed, false);
assert.strictEqual(secrets.caller_leak_count_accepted, false);
assert.strictEqual(secrets.github_secret_protection_enabled, false);
assert.strictEqual(secrets.ghas_license_purchased, false);
assert.strictEqual(secrets.marginal_scan_cost_usd, null);

const hit = inspectSnippetForSecretShapes('token AKIAIOSFODNN7EXAMPLE is a shape');
assert.strictEqual(hit.secret_shape_found, true);
assert.strictEqual(hit.sample_echoed, false);
assert.strictEqual(Object.hasOwn(hit, 'sample'), false);
assert.ok(!JSON.stringify(hit).includes('AKIA'));

const clean = inspectSnippetForSecretShapes('no credential in this sentence');
assert.strictEqual(clean.secret_shape_found, false);

const prototype = assessPrototypeClaim({
  artifactPaths: ['tools/kyle-daigle-routing-gate.js'],
});
assert.strictEqual(prototype.passed, false);
assert.strictEqual(prototype.artifacts_executed, false);
assert.strictEqual(prototype.engineering_scaleup_started, false);
assert.strictEqual(prototype.merged_to_main, false);

console.log('PASS tests/test-kyle-daigle-routing-gate.js');
