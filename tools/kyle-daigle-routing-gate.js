'use strict';

/**
 * Routing checks from Kyle Daigle's interview.
 * Source: https://www.youtube.com/watch?v=pPCAQ7UulGA
 *
 * Start on the local clerk. A keyword, a file count, or a caller flag is not
 * a small-model difficulty score. A different model family is a plan, not a
 * finished critique. His published token-cut and speed figures are not copied
 * onto this machine. GitHub secret-scanning products are not turned on here.
 */

const SOURCE = 'https://www.youtube.com/watch?v=pPCAQ7UulGA';
const LOCAL_CLERK = 'mlx-community/Llama-3.2-1B-Instruct-4bit';

const SECRET_SHAPES = [
  { name: 'aws_access_key_id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'pem_private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'github_token', re: /\bghp_[A-Za-z0-9]{20,}/ },
  { name: 'openai_style_key', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
];

function modelFamily(modelId) {
  const id = String(modelId || '').toLowerCase();
  if (!id) return null;
  if (/claude|anthropic|sonnet|opus|haiku/.test(id)) return 'anthropic';
  if (/gemini|google|gemma/.test(id)) return 'google';
  if (/gpt|openai|\bo1\b|\bo3\b/.test(id)) return 'openai';
  if (/llama|meta/.test(id)) return 'meta';
  if (/mistral|codestral/.test(id)) return 'mistral';
  return 'other';
}

function classifyCascadeRoute({
  promptText = '',
  filesTouchedCount = null,
  callerSaidEscalate = false,
  objectiveChecked = false,
  objectiveMet = false,
  domainByokContext = null,
  byokKeyPresent = false,
} = {}) {
  const text = String(promptText || '').trim();
  const byokName = String(domainByokContext || '').trim();
  const fileCount = Number(filesTouchedCount);
  const checked = objectiveChecked === true;
  const failedCheck = checked && objectiveMet !== true;
  const base = {
    source: SOURCE,
    routed_model: LOCAL_CLERK,
    difficulty_score: null,
    difficulty_measured: false,
    slm_eval_ran: false,
    online_eval_tracked: false,
    zero_cloud_token_execution: false,
    cloud_tokens_measured: false,
    paid_frontier_default: false,
    higher_tier_invoked: false,
    caller_said_escalate: Boolean(callerSaidEscalate),
    caller_escalate_accepted: false,
    caller_said_files_touched: Number.isFinite(fileCount) ? fileCount : null,
    file_count_accepted_as_difficulty: false,
    specialist_invoked: false,
    byok_key_present: byokKeyPresent === true,
  };

  if (byokName) {
    return {
      ...base,
      fusion_tier: 'DOMAIN_BYOK_SPECIALIST',
      byok_context_named: byokName,
      cascade_escalated: false,
      reason: byokKeyPresent === true
        ? 'key_flag_is_not_a_connected_specialist'
        : 'byok_key_not_present',
    };
  }

  if (failedCheck) {
    return {
      ...base,
      fusion_tier: 'ESCALATE_AFTER_FAILED_CHECK',
      cascade_escalated: true,
      reason: 'objective_check_failed_higher_tier_not_invoked',
    };
  }

  return {
    ...base,
    fusion_tier: 'LOCAL_CLERK',
    cascade_escalated: false,
    prompt_present: text.length > 0,
    reason: checked ? 'objective_met_stay_local' : 'no_objective_check_yet_stay_local',
  };
}

function planCrossFamilyCritique({
  generatorModel = '',
  criticModel = '',
  taskSummary = '',
} = {}) {
  const generator = String(generatorModel || '').trim();
  const generatorFamily = modelFamily(generator);
  let critic = String(criticModel || '').trim();
  let criticFamily = modelFamily(critic);
  let reason = 'critique_not_run';
  if (!critic) {
    if (generatorFamily && generatorFamily !== 'meta') {
      critic = LOCAL_CLERK;
      criticFamily = 'meta';
      reason = 'planned_critic_is_the_local_clerk';
    } else {
      criticFamily = null;
      reason = 'no_second_model_named';
    }
  }
  const differs = Boolean(generatorFamily && criticFamily && generatorFamily !== criticFamily);
  return {
    source: SOURCE,
    task_summary: String(taskSummary || ''),
    generator_model: generator || null,
    generator_family: generatorFamily,
    critic_model: critic || null,
    critic_family: criticFamily,
    planned_critic_family_differs: differs,
    cross_family_disjoint: differs,
    critique_ran: false,
    critic_invoked: false,
    token_spend_reduction_measured: false,
    speed_boost_measured: false,
    measured_token_spend_reduction_pct: null,
    measured_speed_boost_pct: null,
    interview_claim: 'The interview cites a 50% to 77% token cut and a 40% speed gain. This gate does not measure either.',
    reason,
  };
}

function assessWorkspaceClaim({ repoNames = [] } = {}) {
  const names = Array.isArray(repoNames)
    ? repoNames.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  return {
    source: SOURCE,
    named_repos: names,
    grouped_repos_count: names.length,
    copilot_project_created: false,
    cloud_sandbox_started: false,
    steerable_interruptible_loop: false,
    autonomous_merge_enabled: false,
    merge_started: false,
  };
}

function assessSecretScanClaim({
  deterministicSecretLeaks = null,
  localAiRedTeamReady = false,
} = {}) {
  const leaks = Number(deterministicSecretLeaks);
  return {
    source: SOURCE,
    secret_scan_ran_by_this_gate: false,
    caller_said_leak_count: Number.isFinite(leaks) ? leaks : null,
    caller_leak_count_accepted: false,
    caller_said_red_team_ready: Boolean(localAiRedTeamReady),
    red_team_claim_accepted: false,
    github_secret_protection_enabled: false,
    ghas_license_purchased: false,
    marginal_scan_cost_usd: null,
    cost_measured: false,
    passed: false,
  };
}

function inspectSnippetForSecretShapes(text) {
  const sample = String(text || '');
  const shapeNames = SECRET_SHAPES.filter((shape) => shape.re.test(sample)).map((shape) => shape.name);
  return {
    source: SOURCE,
    secret_shape_found: shapeNames.length > 0,
    shape_names: shapeNames,
    sample_echoed: false,
    github_secret_protection_enabled: false,
    ghas_license_purchased: false,
  };
}

function assessPrototypeClaim({ artifactPaths = [] } = {}) {
  const paths = Array.isArray(artifactPaths)
    ? artifactPaths.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return {
    source: SOURCE,
    named_artifacts: paths,
    artifacts_executed: false,
    passed: false,
    engineering_scaleup_started: false,
    merged_to_main: false,
  };
}

module.exports = {
  LOCAL_CLERK,
  modelFamily,
  classifyCascadeRoute,
  planCrossFamilyCritique,
  assessWorkspaceClaim,
  assessSecretScanClaim,
  inspectSnippetForSecretShapes,
  assessPrototypeClaim,
};
