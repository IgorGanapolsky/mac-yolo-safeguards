'use strict';

const assert = require('assert');
const { assessRig, EFFECT_KINDS } = require('../tools/rig-cassette-gate');

const empty = assessRig();
assert.strictEqual(empty.passed, false);
assert.strictEqual(empty.files_written, false);
assert.strictEqual(empty.rig_installed, false);
assert.strictEqual(empty.cargo_add_ran, false);
assert.strictEqual(empty.network_called, false);
assert.strictEqual(empty.recording_ran, false);
assert.strictEqual(empty.replay_ran, false);
assert.strictEqual(empty.log_written, false);
assert.strictEqual(empty.log_path, null);
assert.strictEqual(empty.plugins_toml_path, null);
assert.strictEqual(empty.effects_named, 0);
assert.strictEqual(empty.request_matches_recorded, false);
assert.strictEqual(empty.request_diverged, false);
assert.strictEqual(empty.replay_guessed_answer, false);
assert.strictEqual(empty.hand_edited_log_accepted, false);
assert.strictEqual(empty.hook_stack_checked, false);
assert.strictEqual(empty.stamp_checked, false);
assert.strictEqual(empty.workflow_shape_complete, false);
assert.strictEqual(empty.workflow_ran, false);
assert.strictEqual(empty.plugins_named, 0);
assert.strictEqual(empty.plugins_loaded, false);
assert.strictEqual(empty.reload_ran, false);
assert.strictEqual(empty.compile_ran, false);
assert.strictEqual(empty.keeps_old_build_on_compile_failure, null);
assert.strictEqual(empty.reload_keeps_old_build_documented, true);
assert.strictEqual(empty.keys_sorted_equal, false);
assert.strictEqual(empty.mcp_client_enabled, false);
assert.strictEqual(empty.mcp_client_default_off_documented, true);
assert.strictEqual(empty.vendor_counts_stored, false);
assert.deepStrictEqual(empty.effect_kinds, EFFECT_KINDS);

const secret = 'rig-secret-do-not-echo-4b2c';
const filled = assessRig({
  effects: [
    { kind: 'completion', request: secret, outcome: secret },
    { kind: 'hook', request: secret, outcome: secret },
    { kind: 'tool', request: secret, outcome: '' },
  ],
  recordedRequest: secret,
  replayRequest: secret + '-changed',
  recordedHookStack: secret + '-hooks',
  replayHookStack: secret + '-other-hooks',
  configHash: secret,
  steps: [
    { name: 'draft', controller: 'code' },
    { name: 'wander', controller: 'model' },
  ],
  plugins: ['cost_budget', ''],
  left: { z: 1, a: { d: secret, b: 2 } },
  right: { a: { b: 2, d: secret }, z: 1 },
  mcpEnabled: true,
  keepsOldBuild: true,
  handEdited: true,
});
assert.strictEqual(filled.passed, false);
assert.strictEqual(filled.files_written, false);
assert.strictEqual(filled.recording_ran, false);
assert.strictEqual(filled.replay_ran, false);
assert.strictEqual(filled.effects_named, 1);
assert.strictEqual(filled.request_matches_recorded, false);
assert.strictEqual(filled.request_diverged, true);
assert.strictEqual(filled.replay_guessed_answer, false);
assert.strictEqual(filled.hook_stack_named, true);
assert.strictEqual(filled.hook_stack_diverged, true);
assert.strictEqual(filled.hook_stack_checked, false);
assert.strictEqual(filled.config_hash_named, true);
assert.strictEqual(filled.stamp_checked, false);
assert.strictEqual(filled.code_steps_named, 1);
assert.strictEqual(filled.model_steps_named, 1);
assert.strictEqual(filled.workflow_shape_complete, false);
assert.strictEqual(filled.workflow_ran, false);
assert.strictEqual(filled.plugins_named, 1);
assert.strictEqual(filled.plugins_loaded, false);
assert.strictEqual(filled.reload_ran, false);
assert.strictEqual(filled.keeps_old_build_on_compile_failure, null);
assert.strictEqual(filled.keys_sorted_equal, true);
assert.strictEqual(filled.objects_echoed, false);
assert.strictEqual(filled.requests_echoed, false);
assert.strictEqual(filled.mcp_client_enabled, false);
assert.strictEqual(filled.caller_mcp_claim_accepted, false);
assert.strictEqual(filled.hand_edited_log_accepted, false);
const dumped = JSON.stringify(filled);
assert.strictEqual(dumped.includes(secret), false);
assert.strictEqual(dumped.includes('4.0M'), false);
assert.strictEqual(dumped.includes('0.46.0'), false);

const matched = assessRig({
  recordedRequest: 'same-prompt',
  replayRequest: 'same-prompt',
  steps: [{ name: 'draft', controller: 'code' }, { name: 'edit', controller: 'code' }],
});
assert.strictEqual(matched.request_matches_recorded, true);
assert.strictEqual(matched.request_diverged, false);
assert.strictEqual(matched.replay_ran, false);
assert.strictEqual(matched.workflow_shape_complete, true);
assert.strictEqual(matched.workflow_ran, false);
assert.strictEqual(matched.passed, false);

const drifted = assessRig({
  left: { a: 1 },
  right: { a: 2 },
});
assert.strictEqual(drifted.keys_sorted_equal, false);
assert.strictEqual(drifted.passed, false);

console.log('test-rig-cassette-gate: PASS');
