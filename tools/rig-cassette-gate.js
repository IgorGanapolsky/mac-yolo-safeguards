'use strict';

/**
 * Checks from Rig's recording docs and the coding-agent README.
 * Sources:
 * https://rig.rs/
 * https://rig.rs/docs/concepts/recording/
 * https://github.com/0xPlaygrounds/rig/blob/main/README.md
 *
 * An effect, a code-owned step, a plugin name, and two objects with the
 * same keys are shapes. This module does not install Rig, record a run,
 * replay a log, reload a build, or write a cassette.
 */

const SOURCE = 'https://rig.rs/';
const RECORDING_DOC = 'https://rig.rs/docs/concepts/recording/';
const EFFECT_KINDS = ['completion', 'tool', 'memory_load', 'memory_append', 'vector_search'];

function filled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.prototype.toString.call(value) === '[object Object]';
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plainObject(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonical(value[key]);
    return sorted;
  }
  return value;
}

function effectNamed(effect) {
  return plainObject(effect)
    && EFFECT_KINDS.includes(effect.kind)
    && filled(effect.request)
    && filled(effect.outcome);
}

function assessRig({
  effects,
  recordedRequest,
  replayRequest,
  recordedHookStack,
  replayHookStack,
  configHash,
  steps,
  plugins,
  left,
  right,
} = {}) {
  const list = Array.isArray(effects) ? effects : [];
  const named = list.filter(effectNamed);
  const recorded = typeof recordedRequest === 'string' ? recordedRequest : '';
  const replay = typeof replayRequest === 'string' ? replayRequest : '';
  const bothRequests = filled(recorded) && filled(replay);
  const recordedHooks = typeof recordedHookStack === 'string' ? recordedHookStack : '';
  const replayHooks = typeof replayHookStack === 'string' ? replayHookStack : '';
  const bothHooks = filled(recordedHooks) && filled(replayHooks);
  const stepList = Array.isArray(steps) ? steps : [];
  const codeSteps = stepList.filter((step) => plainObject(step) && filled(step.name) && step.controller === 'code');
  const modelSteps = stepList.filter((step) => plainObject(step) && filled(step.name) && step.controller === 'model');
  const pluginList = Array.isArray(plugins) ? plugins : [];
  const pluginNames = pluginList.filter(filled);

  return {
    source: SOURCE,
    recording_doc: RECORDING_DOC,
    passed: false,
    files_written: false,
    rig_installed: false,
    cargo_add_ran: false,
    network_called: false,
    recording_ran: false,
    replay_ran: false,
    log_written: false,
    log_path: null,
    plugins_toml_path: null,
    effect_kinds: EFFECT_KINDS,
    effects_named: named.length,
    requests_echoed: false,
    outcomes_echoed: false,
    request_matches_recorded: bothRequests && recorded.trim() === replay.trim(),
    request_diverged: bothRequests && recorded.trim() !== replay.trim(),
    replay_guessed_answer: false,
    hand_edited_log_accepted: false,
    hook_stack_named: filled(recordedHooks),
    hook_stack_diverged: bothHooks && recordedHooks.trim() !== replayHooks.trim(),
    hook_stack_checked: false,
    config_hash_named: filled(configHash),
    stamp_checked: false,
    code_steps_named: codeSteps.length,
    model_steps_named: modelSteps.length,
    workflow_shape_complete: codeSteps.length > 0 && modelSteps.length === 0 && codeSteps.length === stepList.length,
    workflow_ran: false,
    plugins_named: pluginNames.length,
    plugins_loaded: false,
    reload_ran: false,
    compile_ran: false,
    keeps_old_build_on_compile_failure: null,
    reload_keeps_old_build_documented: true,
    keys_sorted_equal: plainObject(left) && plainObject(right)
      && JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)),
    objects_echoed: false,
    mcp_client_default_off_documented: true,
    mcp_client_enabled: false,
    caller_mcp_claim_accepted: false,
    vendor_counts_stored: false,
  };
}

module.exports = {
  assessRig,
  EFFECT_KINDS,
};
