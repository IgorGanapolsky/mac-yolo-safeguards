#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  assessBeamCheckpointFit,
  routeBeamRequest,
  candidateSelfDistillationTrace,
} = require('../tools/reflection-beam-gate');

const hostBytes = 51539607552;

const smallest = assessBeamCheckpointFit({ hostMemoryBytes: hostBytes, numeric: 'NVFP4' });
assert.strictEqual(smallest.weights_fit_on_host, false);
assert.strictEqual(smallest.active_params_are_the_checkpoint, false);
assert.strictEqual(smallest.reason, 'weights_exceed_host_memory');
assert.ok(smallest.estimated_weight_bytes > hostBytes);
assert.strictEqual(smallest.runtime_and_kv_not_included, true);

const bf16 = assessBeamCheckpointFit({ hostMemoryBytes: hostBytes, numeric: 'BF16' });
assert.ok(bf16.estimated_weight_bytes > smallest.estimated_weight_bytes);

const activeTrick = assessBeamCheckpointFit({ hostMemoryBytes: hostBytes, countActiveParamsOnly: true });
assert.strictEqual(activeTrick.weights_fit_on_host, false);
assert.strictEqual(activeTrick.reason, 'active_parameter_count_is_not_the_checkpoint');

const refused = routeBeamRequest({
  requestedModel: 'Beam-1.0-501B-A23B',
  hostMemoryBytes: hostBytes,
});
assert.strictEqual(refused.route, 'refused_local_checkpoint');
assert.strictEqual(refused.local_substitute_is_beam, false);
assert.strictEqual(refused.paid_api_default, false);

const stay = routeBeamRequest({
  requestedModel: 'mlx-community/Llama-3.2-1B-Instruct-4bit',
  hostMemoryBytes: hostBytes,
});
assert.strictEqual(stay.route, 'leave_current_clerk');
assert.strictEqual(stay.local_substitute_is_beam, false);

const beamTeacher = candidateSelfDistillationTrace({
  teacherModel: 'Beam-1.0-501B-A23B',
  decision: 'keep the local clerk',
  evidence: 'sysctl -n hw.memsize',
  thoughtAuditPassed: true,
  hostMemoryBytes: hostBytes,
});
assert.strictEqual(beamTeacher.accepted_for_later_recipe, false);
assert.strictEqual(beamTeacher.training_started, false);
assert.strictEqual(beamTeacher.weights_written, false);
assert.strictEqual(beamTeacher.reason, 'teacher_checkpoint_does_not_fit');

const localTeacher = candidateSelfDistillationTrace({
  teacherModel: 'mlx-community/Llama-3.2-1B-Instruct-4bit',
  decision: 'keep the local clerk',
  evidence: 'node tests/test-reflection-beam-gate.js',
  thoughtAuditPassed: true,
  hostMemoryBytes: hostBytes,
});
assert.strictEqual(localTeacher.accepted_for_later_recipe, true);
assert.strictEqual(localTeacher.training_started, false);
assert.strictEqual(localTeacher.weights_written, false);

const noEvidence = candidateSelfDistillationTrace({
  teacherModel: 'mlx-community/Llama-3.2-1B-Instruct-4bit',
  decision: 'done',
  evidence: '',
  thoughtAuditPassed: true,
  hostMemoryBytes: hostBytes,
});
assert.strictEqual(noEvidence.accepted_for_later_recipe, false);
assert.strictEqual(noEvidence.reason, 'decision_and_evidence_required');

console.log('PASS tests/test-reflection-beam-gate.js');
