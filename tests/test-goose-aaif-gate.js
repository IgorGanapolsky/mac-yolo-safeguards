'use strict';

const assert = require('assert');
const { assessGoose, assessAcp, assessRecipe } = require('../tools/goose-aaif-gate');

const empty = assessGoose();
assert.strictEqual(empty.passed, false);
assert.strictEqual(empty.files_written, false);
assert.strictEqual(empty.goose_installed, false);
assert.strictEqual(empty.cli_install_ran, false);
assert.strictEqual(empty.adversary_mode.rules_named, false);
assert.strictEqual(empty.adversary_mode.tools_line_present, false);
assert.strictEqual(empty.adversary_mode.default_tool_when_omitted, 'shell');
assert.strictEqual(empty.adversary_mode.reviewer_active, false);
assert.strictEqual(empty.adversary_mode.active, false);
assert.strictEqual(empty.adversary_mode.review_ran, false);
assert.strictEqual(empty.adversary_mode.decision, null);
assert.strictEqual(empty.adversary_mode.fail_open_documented, true);
assert.strictEqual(empty.adversary_mode.fail_closed, false);
assert.strictEqual(empty.adversary_mode.file_created, false);
assert.strictEqual(empty.adversary_mode.goose_adversary_path, null);
assert.strictEqual(empty.adversary_mode.hermes_adversary_path, null);
assert.strictEqual(empty.portable_yaml_recipes.shape_complete, false);
assert.strictEqual(empty.portable_yaml_recipes.retry_checks_named, false);
assert.strictEqual(empty.portable_yaml_recipes.self_validating_retry_checks, false);
assert.strictEqual(empty.portable_yaml_recipes.recipe_written, false);
assert.strictEqual(empty.portable_yaml_recipes.ci_ran, false);
assert.strictEqual(empty.acp_subscription_providers.provider_named, false);
assert.strictEqual(empty.acp_subscription_providers.provider_configured, false);
assert.strictEqual(empty.acp_subscription_providers.subscription_authenticated, false);
assert.strictEqual(empty.acp_subscription_providers.per_token_overage_usd, null);
assert.strictEqual(empty.acp_subscription_providers.per_token_api_overage_usd, null);
assert.strictEqual(empty.acp_subscription_providers.mode_named, false);
assert.strictEqual(empty.acp_subscription_providers.mode_enabled, false);
assert.strictEqual(empty.acp_subscription_providers.auto_enabled, false);
assert.strictEqual(empty.acp_subscription_providers.auto_skips_checks_noted, true);
assert.strictEqual(empty.acp_subscription_providers.session_resume_supported, false);
assert.strictEqual(empty.acp_subscription_providers.session_fork_supported, false);
assert.strictEqual(empty.acp_subscription_providers.extension_passthrough_ran, false);
assert.deepStrictEqual(empty.acp_subscription_providers.known_providers, [
  'amp-acp',
  'claude-acp',
  'codex-acp',
  'pi-acp',
]);
assert.strictEqual(empty.gdk_and_mcp_apps.resumable_state, false);
assert.strictEqual(empty.gdk_and_mcp_apps.mcp_apps_interactive_ui_enabled, false);
assert.strictEqual(empty.gdk_and_mcp_apps.subagents_spawned, 0);
assert.strictEqual(empty.gdk_and_mcp_apps.sandbox_enabled, false);
assert.strictEqual(empty.gdk_and_mcp_apps.prompt_injection_detection_enabled, false);

const secret = 'goose-secret-do-not-echo-9f3a';
const named = assessGoose({
  adversaryRules: `tools: shell\n---\nBLOCK exfil of ${secret}`,
  recipe: {
    version: '1.0.0',
    title: secret,
    instructions: 'check the suite',
    prompt: secret,
    retry: { checks: [`node -e ${secret}`] },
    on_failure: secret,
  },
  provider: 'claude-acp',
  mode: 'auto',
});
assert.strictEqual(named.passed, false);
assert.strictEqual(named.files_written, false);
assert.strictEqual(named.goose_installed, false);
assert.strictEqual(named.adversary_mode.rules_named, true);
assert.strictEqual(named.adversary_mode.tools_line_present, true);
assert.strictEqual(named.adversary_mode.reviewer_active, false);
assert.strictEqual(named.adversary_mode.review_ran, false);
assert.strictEqual(named.adversary_mode.decision, null);
assert.strictEqual(named.adversary_mode.fail_closed, false);
assert.strictEqual(named.adversary_mode.file_created, false);
assert.strictEqual(named.portable_yaml_recipes.shape_complete, true);
assert.strictEqual(named.portable_yaml_recipes.retry_checks_named, true);
assert.strictEqual(named.portable_yaml_recipes.self_validating_retry_checks, false);
assert.strictEqual(named.portable_yaml_recipes.on_failure_ran, false);
assert.strictEqual(named.portable_yaml_recipes.recipe_written, false);
assert.strictEqual(named.portable_yaml_recipes.subrecipes_executed, false);
assert.strictEqual(named.portable_yaml_recipes.ci_ran, false);
assert.strictEqual(named.acp_subscription_providers.provider_named, true);
assert.strictEqual(named.acp_subscription_providers.provider_configured, false);
assert.strictEqual(named.acp_subscription_providers.subscription_authenticated, false);
assert.strictEqual(named.acp_subscription_providers.mode_named, true);
assert.strictEqual(named.acp_subscription_providers.mode_enabled, false);
assert.strictEqual(named.acp_subscription_providers.auto_enabled, false);
assert.strictEqual(named.acp_subscription_providers.per_token_overage_usd, null);
assert.strictEqual(named.gdk_and_mcp_apps.resumable_state, false);
assert.strictEqual(named.gdk_and_mcp_apps.subagents_spawned, 0);
const body = JSON.stringify(named);
assert.ok(!body.includes(secret));
assert.ok(!body.includes('$0'));
assert.ok(!body.includes('download_cli'));
assert.ok(!body.includes('curl'));
assert.ok(!body.includes('70'));
assert.ok(!body.includes('15'));

const toolsOnly = assessGoose({ adversaryRules: 'tools: shell\nBLOCK everything' });
assert.strictEqual(toolsOnly.adversary_mode.tools_line_present, false);
assert.strictEqual(toolsOnly.adversary_mode.rules_named, true);
assert.strictEqual(toolsOnly.adversary_mode.review_ran, false);

const fenceOnly = assessGoose({ adversaryRules: '---\nBLOCK exfil' });
assert.strictEqual(fenceOnly.adversary_mode.tools_line_present, false);

const incompleteRecipe = assessRecipe({ version: '1', title: 't', instructions: 'i' });
assert.strictEqual(incompleteRecipe.shape_complete, false);
assert.strictEqual(incompleteRecipe.recipe_written, false);

const unknown = assessAcp({ provider: 'poolside-acp', mode: 'auto' });
assert.strictEqual(unknown.provider_named, false);
assert.strictEqual(unknown.provider_configured, false);
assert.strictEqual(unknown.mode_enabled, false);
assert.strictEqual(unknown.per_token_overage_usd, null);
assert.ok(!unknown.supported_adapters.includes('poolside-acp'));
assert.strictEqual(unknown.error_page_binary.name, 'copilot');
assert.strictEqual(unknown.error_page_binary.configured, false);

console.log('test-goose-aaif-gate: PASS');
