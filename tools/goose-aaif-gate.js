'use strict';

/**
 * Checks from goose docs.
 * Sources:
 * https://goose-docs.ai/
 * https://goose-docs.ai/docs/guides/security/adversary-mode
 * https://goose-docs.ai/docs/guides/acp-providers
 *
 * A reviewer rule, a recipe, and a provider name are shapes.
 * This module does not install goose, write adversary.md, write a recipe,
 * or configure a provider.
 */

const SOURCE = 'https://goose-docs.ai/';
const ADVERSARY_DOC = 'https://goose-docs.ai/docs/guides/security/adversary-mode';
const ACP_DOC = 'https://goose-docs.ai/docs/guides/acp-providers';
const KNOWN_PROVIDERS = ['amp-acp', 'claude-acp', 'codex-acp', 'pi-acp'];
const PERMISSION_MODES = ['auto', 'smart-approve', 'approve', 'chat'];

function filled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assessAdversary(rules) {
  const text = typeof rules === 'string' ? rules : '';
  const fenceAt = text.indexOf('---');
  const beforeFence = fenceAt === -1 ? '' : text.slice(0, fenceAt);
  const toolsLinePresent = fenceAt !== -1 && /^[ \t]*tools[ \t]*:/m.test(beforeFence);
  return {
    rules_named: text.trim().length > 0,
    tools_line_present: toolsLinePresent,
    default_tool_when_omitted: 'shell',
    reviewer_active: false,
    active: false,
    review_ran: false,
    decision: null,
    fail_open_documented: true,
    fail_closed: false,
    file_created: false,
    goose_adversary_path: null,
    hermes_adversary_path: null,
  };
}

function assessRecipe(recipe) {
  const source = recipe && typeof recipe === 'object' && !Array.isArray(recipe) ? recipe : {};
  const checks = source.retry && Array.isArray(source.retry.checks) ? source.retry.checks : [];
  return {
    shape_complete: filled(source.version) && filled(source.title) && filled(source.instructions) && filled(source.prompt),
    retry_checks_named: checks.length > 0,
    self_validating_retry_checks: false,
    on_failure_ran: false,
    recipe_written: false,
    active: false,
    recipe_path: null,
    supports_subrecipes_and_json_schema: false,
    subrecipes_executed: false,
    ci_ran: false,
  };
}

function assessAcp({ provider, mode } = {}) {
  const providerName = typeof provider === 'string' ? provider.trim() : '';
  const modeName = typeof mode === 'string' ? mode.trim() : '';
  return {
    known_providers: KNOWN_PROVIDERS,
    supported_adapters: KNOWN_PROVIDERS,
    provider_named: KNOWN_PROVIDERS.includes(providerName),
    provider_configured: false,
    subscription_authenticated: false,
    extension_passthrough_ran: false,
    mcp_extension_passthrough: false,
    per_token_overage_usd: null,
    per_token_api_overage_usd: null,
    codex_can_bill_api_credits_documented: true,
    session_resume_supported: false,
    session_fork_supported: false,
    permission_modes: PERMISSION_MODES,
    mode_named: PERMISSION_MODES.includes(modeName),
    mode_enabled: false,
    auto_skips_checks_noted: true,
    auto_enabled: false,
    error_page_binary: {
      name: 'copilot',
      configured: false,
    },
  };
}

function assessGoose({ adversaryRules, recipe, provider, mode } = {}) {
  return {
    source: SOURCE,
    adversary_doc: ADVERSARY_DOC,
    acp_doc: ACP_DOC,
    passed: false,
    files_written: false,
    goose_installed: false,
    cli_install_ran: false,
    adversary_mode: assessAdversary(adversaryRules),
    portable_yaml_recipes: assessRecipe(recipe),
    acp_subscription_providers: assessAcp({ provider, mode }),
    gdk_and_mcp_apps: {
      resumable_state: false,
      composable_state_machine_resumable: false,
      mcp_apps_interactive_ui_enabled: false,
      subagents_spawned: 0,
      sandbox_enabled: false,
      prompt_injection_detection_enabled: false,
    },
  };
}

module.exports = {
  assessGoose,
  assessAdversary,
  assessRecipe,
  assessAcp,
  KNOWN_PROVIDERS,
  PERMISSION_MODES,
};
