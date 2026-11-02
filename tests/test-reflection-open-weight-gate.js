'use strict';

const assert = require('assert');
const {
  classifyEnterpriseClaim,
  assessOwnedIntelligenceLayer,
  assessOpenBaseReinforcement,
  planJevonsVolume,
  auditSelfDeception,
} = require('../tools/reflection-open-weight-gate');

const HOST_BYTES = 51539607552;

const beam = classifyEnterpriseClaim({
  modelId: 'Beam-1.0-501B-A23B',
  enterpriseComplianceMode: true,
});
assert.strictEqual(beam.allowed_for_f500_banking_gov, false);
assert.strictEqual(beam.fortune_500_certified, false);
assert.strictEqual(beam.banking_deployment_certified, false);
assert.strictEqual(beam.blocked_by_policy, false);
assert.strictEqual(beam.fallback_is_beam, false);
assert.strictEqual(beam.organizational_transformation_delivered, false);

const deepseek = classifyEnterpriseClaim({
  modelId: 'deepseek-r1:latest',
  enterpriseComplianceMode: true,
});
assert.strictEqual(deepseek.interview_flags_restricted_origin, true);
assert.strictEqual(deepseek.blocked_by_policy, true);
assert.strictEqual(deepseek.allowed_for_f500_banking_gov, false);
assert.strictEqual(deepseek.routed_model, 'mlx-community/Llama-3.2-1B-Instruct-4bit');
assert.strictEqual(deepseek.beam_checkpoint_used_as_fallback, false);

const layer = assessOwnedIntelligenceLayer({
  liveClerkReachable: true,
  callerSharePct: 84,
});
assert.strictEqual(layer.sovereign_intelligence_owned, false);
assert.strictEqual(layer.closed_api_platform_risk_mitigated, false);
assert.strictEqual(layer.caller_share_pct_accepted, false);
assert.strictEqual(layer.local_open_weight_workload_share_pct, null);
assert.strictEqual(layer.margin_measured, false);
assert.strictEqual(layer.inference_margin_usd, null);
assert.strictEqual(layer.mirror_installed, false);
assert.strictEqual(layer.weights_are_the_product, false);
assert.strictEqual(layer.training_started, false);
assert.strictEqual(layer.product_surface, 'local_harness_gates');

const beamRl = assessOpenBaseReinforcement({
  baseModel: 'Beam-1.0-501B-A23B',
  hostMemoryBytes: HOST_BYTES,
  rewardEvidence: 'node tests/test-reflection-open-weight-gate.js',
  approvePaid: true,
  approveDataUpload: true,
});
assert.strictEqual(beamRl.reason, 'base_checkpoint_does_not_fit');
assert.strictEqual(beamRl.training_started, false);
assert.strictEqual(beamRl.pretraining_from_scratch_started, false);
assert.strictEqual(beamRl.job_submitted, false);

const approvedButUntrained = assessOpenBaseReinforcement({
  baseModel: 'mlx-community/Llama-3.2-1B-Instruct-4bit',
  hostMemoryBytes: HOST_BYTES,
  rewardEvidence: 'node tests/test-reflection-open-weight-gate.js',
  approvePaid: true,
  approveDataUpload: true,
});
assert.strictEqual(approvedButUntrained.reason, 'no_trainer_in_this_module');
assert.strictEqual(approvedButUntrained.training_started, false);
assert.strictEqual(approvedButUntrained.weights_written, false);

const zeroCost = planJevonsVolume({
  workloadType: 'cyber_defense_and_rd',
  costBeforeUsd: 0,
  costAfterUsd: 0,
});
assert.strictEqual(zeroCost.jevons_paradox_multiplier, null);
assert.strictEqual(zeroCost.demand_multiplier_measured, false);
assert.strictEqual(zeroCost.scale_volume, false);
assert.strictEqual(zeroCost.cyber_sweeps_started, false);
assert.strictEqual(zeroCost.volume_job_started, false);
assert.strictEqual(zeroCost.caller_cost_accepted, false);

const cheaper = planJevonsVolume({
  workloadType: 'document_review',
  costBeforeUsd: 1,
  costAfterUsd: 0.4,
});
assert.strictEqual(cheaper.cost_drop_measured, true);
assert.strictEqual(cheaper.scale_volume, false);
assert.strictEqual(cheaper.volume_job_started, false);
assert.strictEqual(cheaper.reason, 'cost_drop_recorded_no_job_started');

const selfGrade = auditSelfDeception({
  motivation: 'chase financial returns and be a founder',
  priorCollaborator: 'someone from a previous project',
  problemFromPriorWork: 'the local clerk is not a bank certification',
});
assert.strictEqual(selfGrade.passed, false);
assert.strictEqual(selfGrade.self_report_counts, false);
assert.strictEqual(selfGrade.self_grade_accepted, false);
assert.strictEqual(selfGrade.company_formed, false);
assert.strictEqual(selfGrade.hiring_started, false);
assert.strictEqual(selfGrade.conviction_proven, false);
assert.strictEqual(selfGrade.motivation_looks_like_hype, true);
assert.strictEqual(selfGrade.prior_collaborator_named, true);

console.log('PASS tests/test-reflection-open-weight-gate.js');
