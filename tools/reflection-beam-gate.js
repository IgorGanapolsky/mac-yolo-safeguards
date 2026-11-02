'use strict';

/**
 * Reflection Beam gate.
 * Sources: https://reflection.ai/beam-model-card
 *          https://reflection.ai/blog/beam-is-available
 *
 * The model card lists 501.3B total parameters, 23.4B active, and BF16, FP8,
 * and NVFP4 checkpoints. Active parameters are the compute per token, not the
 * file you download. This module does not download weights or call the API.
 */

const TOTAL_PARAMETERS = 501.3e9;
const ACTIVE_PARAMETERS = 23.4e9;
const NUMERIC_BITS = { BF16: 16, FP8: 8, NVFP4: 4 };
const SOURCE = 'https://reflection.ai/beam-model-card';

function assessBeamCheckpointFit({
  hostMemoryBytes,
  numeric = 'NVFP4',
  countActiveParamsOnly = false,
} = {}) {
  const base = {
    source: SOURCE,
    total_parameters_b: 501.3,
    active_parameters_b: 23.4,
    active_params_are_the_checkpoint: false,
    numeric,
    runtime_and_kv_not_included: true,
  };
  if (countActiveParamsOnly) {
    return {
      ...base,
      weights_fit_on_host: false,
      estimated_weight_bytes: null,
      reason: 'active_parameter_count_is_not_the_checkpoint',
    };
  }
  const bits = NUMERIC_BITS[numeric];
  if (!bits) {
    return { ...base, weights_fit_on_host: false, estimated_weight_bytes: null, reason: 'unknown_numeric' };
  }
  const estimated = Math.round(TOTAL_PARAMETERS * bits / 8);
  const host = Number(hostMemoryBytes);
  const hostOk = Number.isFinite(host) && host > 0;
  const fits = hostOk && estimated < host;
  return {
    ...base,
    estimated_weight_bytes: estimated,
    host_memory_bytes: hostOk ? host : null,
    weights_fit_on_host: fits,
    reason: fits
      ? 'weights_estimate_fits_host_before_runtime'
      : hostOk
        ? 'weights_exceed_host_memory'
        : 'host_memory_required',
  };
}

function routeBeamRequest({ requestedModel = '', hostMemoryBytes } = {}) {
  const asksForBeam = /beam/i.test(String(requestedModel || ''));
  const fit = assessBeamCheckpointFit({ hostMemoryBytes, numeric: 'NVFP4' });
  if (!asksForBeam) {
    return {
      source: 'https://reflection.ai/blog/beam-is-available',
      route: 'leave_current_clerk',
      local_substitute_is_beam: false,
      paid_api_default: false,
      weights_fit_on_host: fit.weights_fit_on_host,
    };
  }
  if (!fit.weights_fit_on_host) {
    return {
      source: 'https://reflection.ai/blog/beam-is-available',
      route: 'refused_local_checkpoint',
      local_substitute_is_beam: false,
      paid_api_default: false,
      weights_fit_on_host: false,
      reason: fit.reason,
    };
  }
  return {
    source: 'https://reflection.ai/blog/beam-is-available',
    route: 'weights_estimate_only',
    local_substitute_is_beam: false,
    paid_api_default: false,
    weights_fit_on_host: true,
    reason: 'runtime_and_kv_not_included',
  };
}

function candidateSelfDistillationTrace({
  teacherModel = '',
  decision = '',
  evidence = '',
  thoughtAuditPassed = false,
  hostMemoryBytes,
} = {}) {
  const teacher = String(teacherModel || '').trim();
  const keptDecision = String(decision || '').trim();
  const keptEvidence = String(evidence || '').trim();
  const namesBeam = /beam/i.test(teacher);
  const fit = assessBeamCheckpointFit({ hostMemoryBytes, numeric: 'NVFP4' });
  let reason = 'eligible_for_a_later_recipe';
  if (!teacher) reason = 'teacher_model_required';
  else if (namesBeam && !fit.weights_fit_on_host) reason = 'teacher_checkpoint_does_not_fit';
  else if (!keptDecision || !keptEvidence) reason = 'decision_and_evidence_required';
  else if (thoughtAuditPassed !== true) reason = 'thought_audit_not_passed';
  const accepted = reason === 'eligible_for_a_later_recipe';
  return {
    source: 'https://reflection.ai/blog/beam-is-available',
    accepted_for_later_recipe: accepted,
    accepted_for_distillation: accepted,
    training_started: false,
    weights_written: false,
    teacher_model: teacher || null,
    teacher_is_beam: namesBeam,
    reason: accepted ? reason : reason,
  };
}

module.exports = {
  TOTAL_PARAMETERS,
  ACTIVE_PARAMETERS,
  assessBeamCheckpointFit,
  routeBeamRequest,
  candidateSelfDistillationTrace,
};
