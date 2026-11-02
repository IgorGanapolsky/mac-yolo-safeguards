'use strict';

/**
 * Open-weight checks from Misha Laskin's interview.
 * Source: https://www.youtube.com/watch?v=yFDQX4Yy4N8
 *
 * The interview argues for owning a model layer, training on an open base,
 * selling the harness rather than the weights, and not treating Chinese open
 * models as a bank deployment. This module records those as fail-closed
 * checks. It does not certify a bank, start training, install Mirror, or
 * measure a margin.
 */

const { assessBeamCheckpointFit } = require('./reflection-beam-gate');

const SOURCE = 'https://www.youtube.com/watch?v=yFDQX4Yy4N8';
const LOCAL_CLERK = 'mlx-community/Llama-3.2-1B-Instruct-4bit';
const RESTRICTED_ORIGIN = /deepseek|qwen|glm|tencent|hunyuan|baichuan|yi-|internlm/i;

function classifyEnterpriseClaim({
  modelId = '',
  enterpriseComplianceMode = true,
} = {}) {
  const id = String(modelId || '');
  const restricted = RESTRICTED_ORIGIN.test(id);
  const blocked = Boolean(enterpriseComplianceMode && restricted);
  return {
    source: SOURCE,
    requested_model: id,
    interview_flags_restricted_origin: restricted,
    fortune_500_certified: false,
    banking_deployment_certified: false,
    public_sector_deployment_certified: false,
    allowed_for_f500_banking_gov: false,
    organizational_transformation_delivered: false,
    self_serve_sale_is_a_bank_deployment: false,
    blocked_by_policy: blocked,
    routed_model: blocked ? LOCAL_CLERK : id,
    fallback_is_beam: false,
    beam_checkpoint_used_as_fallback: false,
  };
}

function assessOwnedIntelligenceLayer({
  liveClerkReachable = false,
  callerSharePct = null,
} = {}) {
  const share = Number(callerSharePct);
  return {
    source: SOURCE,
    sovereign_intelligence_owned: false,
    closed_api_platform_risk_mitigated: false,
    caller_said_clerk_reachable: Boolean(liveClerkReachable),
    clerk_reachability_measured: false,
    caller_share_pct_accepted: false,
    caller_share_pct: Number.isFinite(share) ? share : null,
    local_open_weight_workload_share_pct: null,
    weights_are_the_product: false,
    margin_measured: false,
    inference_margin_usd: null,
    mirror_installed: false,
    fine_tune_started: false,
    training_started: false,
    weights_written: false,
    current_clerk: LOCAL_CLERK,
    product_surface: 'local_harness_gates',
  };
}

function assessOpenBaseReinforcement({
  baseModel = '',
  hostMemoryBytes,
  rewardEvidence = '',
  approvePaid = false,
  approveDataUpload = false,
} = {}) {
  const teacher = String(baseModel || '').trim();
  const namesBeam = /beam/i.test(teacher);
  const fit = assessBeamCheckpointFit({ hostMemoryBytes, numeric: 'NVFP4' });
  const evidence = String(rewardEvidence || '').trim();
  let reason = 'no_trainer_in_this_module';
  if (!teacher) reason = 'base_model_required';
  else if (namesBeam && !fit.weights_fit_on_host) reason = 'base_checkpoint_does_not_fit';
  else if (!evidence) reason = 'external_reward_required';
  else if (approvePaid !== true || approveDataUpload !== true) reason = 'paid_and_data_approval_required';
  return {
    source: SOURCE,
    pretraining_from_scratch_started: false,
    training_started: false,
    weights_written: false,
    job_submitted: false,
    base_model: teacher || null,
    reason,
  };
}

function planJevonsVolume({
  workloadType = '',
  costBeforeUsd = null,
  costAfterUsd = null,
} = {}) {
  const before = Number(costBeforeUsd);
  const after = Number(costAfterUsd);
  const measured = Number.isFinite(before) && Number.isFinite(after) && before > 0 && after < before;
  const cyber = /cyber/i.test(String(workloadType || ''));
  let reason = 'cost_drop_not_measured';
  if (cyber) reason = 'cyber_volume_is_not_started_from_this_gate';
  else if (measured) reason = 'cost_drop_recorded_no_job_started';
  return {
    source: SOURCE,
    workload_type: String(workloadType || ''),
    cost_drop_measured: measured,
    caller_cost_accepted: false,
    marginal_cost_per_token_usd: null,
    jevons_paradox_multiplier: null,
    demand_multiplier_measured: false,
    scale_volume: false,
    volume_job_started: false,
    cyber_sweeps_started: false,
    reason,
  };
}

function auditSelfDeception({
  motivation = '',
  priorCollaborator = '',
  problemFromPriorWork = '',
} = {}) {
  const motive = String(motivation || '').trim();
  const hype = /hype|financial return|be a founder|for the sake of/i.test(motive);
  return {
    source: SOURCE,
    principle: 'The first principle is that you must not fool yourself — and you are the easiest person to fool.',
    self_report_counts: false,
    self_grade_accepted: false,
    passed: false,
    company_formed: false,
    hiring_started: false,
    motivation_looks_like_hype: hype,
    prior_collaborator_named: String(priorCollaborator || '').trim().length > 0,
    problem_from_prior_work_named: String(problemFromPriorWork || '').trim().length > 0,
    conviction_proven: false,
    reason: 'a self-report is not evidence',
  };
}

module.exports = {
  LOCAL_CLERK,
  classifyEnterpriseClaim,
  assessOwnedIntelligenceLayer,
  assessOpenBaseReinforcement,
  planJevonsVolume,
  auditSelfDeception,
};
