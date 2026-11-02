#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  BLOCK_SIZE_TOKENS,
  PagedAttentionPrefixCache,
  computeDeterministicSeed,
  buildVllmGuidedRequest,
  sharedPrefixCacheSalt,
  clerkModelAllowed,
  pinLiveClerkRequest,
  measurePrefixReuse,
  measureBatchInvariantDeterminism,
  routeInteractionVsBackground,
  captureOnPolicyDistillationReceipt,
  guardExpiredCacheTrivialTurn,
  evaluateTurnDepthAlignmentRisk,
  routeByTrustAndAlignmentTier,
  auditReflectionToolCallingThought,
  exportReflectionBeamSelfDistillationTrace,
  classifyModelEnterpriseProvenance,
  auditIntelligenceSovereigntyAndTheCar,
  planJevonsParadoxComputeAllocation,
  runFeynmanAntiFoolingAudit,
  classifyFirstTurnSlmAndCascadeRoute,
  runCrossFamilyCritiqueLoop,
  runBenchmarkSimulation,
} = require('../tools/vllm-inference-router');
const {
  runDisposableAgentLifecycleAudit,
  auditKyleDaigleMultiRepoAndSecurity,
  auditRememberEverythingProductSalesAndHarness,
  bootstrapLiamFallenPersonalIntelligenceHq,
  auditWestMonroeSlownessTaxAndSevenSpeedLevers,
  auditInteractCueAdaptiveIntranetAndConductor,
  bootstrapGooseAaifAdversaryRecipesAndAcp,
  auditElicitSystematicEvidenceAndLivingRoutines,
  auditResearchRabbitCitationGraphMonetization,
  auditRigRustModularAgentAndCassetteReplay,
  runAiAmArenaProductionGuard,
} = require('../tools/ai-am-arena-production-guard');

function main() {
  const cache = new PagedAttentionPrefixCache(BLOCK_SIZE_TOKENS);
  const sys =
    'You are a single-purpose Worker Agent in the MacYoloSafeguards + ThumbGate + Nanobot revenue fleet. Follow strict JSON output contracts and never fabricate revenue numbers.';
  const schemaText =
    'Schema Contract: {"status":"PASS|BLOCK","verified_external_usd":0,"evidence_refs":["string"]}';

  // Turn 1: Cold cache miss -> allocates full prefix blocks
  const req1 = buildVllmGuidedRequest({
    workerId: 'RevenueTruthWorker',
    systemPrompt: sys,
    sharedSchemaPrefix: schemaText,
    userPrompt: 'Audit live Stripe external_net_cents for 2026-11-01.',
    jsonSchema: { type: 'object', required: ['status'] },
    cache,
  });
  assert.strictEqual(req1.pd_tier, 'prefill_heavy');
  assert.strictEqual(req1.profile.kv_cache_dtype, 'nvfp4');
  assert.strictEqual(req1.kv_probe.cached_prefix_tokens, 0);

  // Turn 2: Warm prefix hit across a different worker sharing the prefix!
  const req2 = buildVllmGuidedRequest({
    workerId: 'NanobotRevenueCloser',
    systemPrompt: sys,
    sharedSchemaPrefix: schemaText,
    userPrompt: 'Generate $49 corporate-expense downsell for 4 checkout cancel bounces.',
    jsonSchema: { type: 'object', required: ['status'] },
    cache,
  });
  assert.strictEqual(req2.pd_tier, 'decode_fast');
  assert.strictEqual(req2.profile.kv_cache_dtype, 'fp8_e4m3');
  assert.ok(
    req2.kv_probe.cached_prefix_tokens >= 48,
    `Expected >= 48 cached prefix tokens on warm hit, got ${req2.kv_probe.cached_prefix_tokens}`,
  );
  assert.ok(req2.request_payload.response_format.type === 'json_schema');

  // Deterministic seed invariant
  const s1 = computeDeterministicSeed('OutreachCopyWorker', 'abc12345', 'prospect_01');
  const s2 = computeDeterministicSeed('OutreachCopyWorker', 'abc12345', 'prospect_01');
  assert.strictEqual(s1, s2, 'Seed must be deterministic for identical (worker, prefix, task)');

  assert.strictEqual(req1.prefix_cache_salt, req2.prefix_cache_salt);
  assert.strictEqual(
    req1.prefix_cache_salt,
    sharedPrefixCacheSalt(sys, schemaText),
  );
  assert.strictEqual(req1.request_payload.extra_body.kv_cache_dtype, undefined);
  assert.strictEqual(req1.request_payload.extra_body.speculative_config, undefined);

  assert.strictEqual(clerkModelAllowed('mlx-community/Llama-3.2-1B-Instruct-4bit'), true);
  assert.strictEqual(clerkModelAllowed('mlx-community/Some-30B-4bit'), false);
  const refused = pinLiveClerkRequest(req2, 'mlx-community/Some-30B-4bit');
  assert.strictEqual(refused.applied, false);
  const pinned = pinLiveClerkRequest(req2, 'mlx-community/Llama-3.2-1B-Instruct-4bit');
  assert.strictEqual(pinned.applied, true);
  assert.strictEqual(pinned.request_payload.model, 'mlx-community/Llama-3.2-1B-Instruct-4bit');
  assert.strictEqual(pinned.request_payload.extra_body.cache_salt, req2.prefix_cache_salt);
  assert.strictEqual(pinned.request_payload.response_format, undefined);

  const reuse = measurePrefixReuse('http://127.0.0.1:8000/v1', 'mlx-community/Llama-3.2-1B-Instruct-4bit', (url, opts) => {
    const body = JSON.parse(opts.body);
    const n = body.messages[1].content === 'turn B' ? 48 : 0;
    return {
      status: 200,
      json: { usage: { prompt_tokens_details: { cached_tokens: n } } },
    };
  });
  assert.strictEqual(reuse.prefix_reuse_proven, true);
  assert.strictEqual(reuse.reason, 'server_reported_cached_tokens');
  assert.ok(reuse.first.latency_ms >= 0);

  const silent = measurePrefixReuse('http://127.0.0.1:8000/v1', 'mlx-community/Llama-3.2-1B-Instruct-4bit', () => ({
    status: 200,
    json: { usage: { prompt_tokens: 20 } },
  }));
  assert.strictEqual(silent.measured, true);
  assert.strictEqual(silent.prefix_reuse_proven, false);
  assert.strictEqual(silent.reason, 'server_did_not_report_cached_tokens');


  // Thinking Machines Lab Steal #1: Batch-invariant determinism across cold vs cached prefill
  const det = measureBatchInvariantDeterminism(
    'http://127.0.0.1:8000/v1',
    'mlx-community/Llama-3.2-1B-Instruct-4bit',
    (url, opts) => {
      assert.strictEqual(JSON.parse(opts.body).seed, 42);
      return {
        status: 200,
        json: {
          choices: [{ message: { content: 'DETERMINISTIC' } }],
          usage: { prompt_tokens_details: { cached_tokens: 48 } },
        },
      };
    },
  );
  assert.strictEqual(det.deterministic_proven, true);

  // Thinking Machines Lab Steal #2: 200ms Interaction Model vs Background Model Router
  const microRoute = routeInteractionVsBackground({
    taskType: 'gate_check',
    latencyBudgetMs: 200,
    estimatedPromptTokens: 256,
  });
  assert.strictEqual(microRoute.role, 'interaction_model');
  assert.strictEqual(microRoute.sla_ms, 200);
  assert.strictEqual(microRoute.delegate_to_background, false);

  const bgRoute = routeInteractionVsBackground({
    taskType: 'code_synthesis',
    latencyBudgetMs: 5000,
    requiresMultiFileSynthesis: true,
  });
  assert.strictEqual(bgRoute.role, 'background_model');
  assert.strictEqual(bgRoute.delegate_to_background, true);

  // Thinking Machines Lab Steal #3: On-Policy Reverse-KL Distillation + LoRA without Regret
  const distReceipt = captureOnPolicyDistillationReceipt({
    workerId: 'GoldfishVerifierWorker',
    promptPrefixHash: req1.prefix_cache_salt,
    studentOutput: 'draft_v1',
    teacherCorrection: 'verified_v1',
    rewardSignal: 1.0,
  });
  assert.strictEqual(distReceipt.objective, 'reverse_kl_on_policy');
  assert.strictEqual(distReceipt.lora_config.target_modules, 'all_linear_mlp_moe_attn');
  assert.strictEqual(distReceipt.lora_config.lr_multiplier_vs_full_ft, 10.0);

  // AI:AM Steal #1: $40 Cold-Cache Trivial Follow-Up Guard
  const coldGuard = guardExpiredCacheTrivialTurn({
    message: 'Thank you!',
    idleSeconds: 1200,
    contextTokens: 140000,
  });
  assert.strictEqual(coldGuard.intercepted, true);
  assert.strictEqual(coldGuard.re_prefill_blocked, true);
  assert.strictEqual(coldGuard.savings_measured, false);
  assert.strictEqual(coldGuard.estimated_saved_usd, undefined);

  // AI:AM Steal #2: 20-Turn Misalignment Cliff (>50% misalignment past 20 turns)
  const turn22Unverified = evaluateTurnDepthAlignmentRisk({
    turnCount: 22,
    hasExternalGoldfishProof: false,
    modelFamily: 'open_weight_qwen',
  });
  assert.strictEqual(turn22Unverified.past_20_turn_cliff, true);
  assert.strictEqual(turn22Unverified.misalignment_probability_measured, false);
  assert.strictEqual(turn22Unverified.block_unverified_completion, true);
  assert.strictEqual(turn22Unverified.hard_gate, 'BLOCK_UNVERIFIED_COMPLETION_PAST_20_TURNS');

  // AI:AM Steal #3: Local Open-Weight Vulnerability Scanner vs Frontier High-Trust Router
  const redTeamRoute = routeByTrustAndAlignmentTier({
    workloadType: 'vuln_scan',
    isDefensiveSecurityScan: true,
  });
  assert.strictEqual(redTeamRoute.tier, 'local_open_weight_defensive_security');
  assert.strictEqual(redTeamRoute.zero_api_refusal_guarantee, false);
  assert.strictEqual(redTeamRoute.refusal_guarantee, false);

  // Reflection AI Steal: 350-char Tool-Calling Thought Auditor (-45% output tokens) + Future-Leak Rejection
  const goodThought = auditReflectionToolCallingThought({
    thought:
      'Call runFivePillarSmartCare with clean=false to inspect live disk and LaunchAgents before mutating state.',
    hasToolCall: true,
    nextToolResult: '{"status":"ok","freeGiB":101.7}',
    toolCallArgs: { clean: false },
  });
  assert.strictEqual(goodThought.passed, true);
  assert.strictEqual(goodThought.token_reduction_measured, false);
  assert.strictEqual(Object.hasOwn(goodThought, 'expected_token_reduction_pct'), false);

  const leakedThought = auditReflectionToolCallingThought({
    thought: 'The tool will return {"status":"ok","freeGiB":101.7} in the example rewrite.',
    hasToolCall: true,
    nextToolResult: '{"status":"ok","freeGiB":101.7}',
  });
  assert.strictEqual(leakedThought.passed, false);
  assert.strictEqual(leakedThought.audit_checks.future_leak, true);
  assert.strictEqual(leakedThought.audit_checks.task_reference, true);

  const beamDistil = exportReflectionBeamSelfDistillationTrace({
    conversationId: 'test-beam-distil',
    verdict: 'PASS',
  });
  assert.strictEqual(beamDistil.accepted_for_distillation, false);
  assert.strictEqual(beamDistil.training_started, false);
  assert.strictEqual(beamDistil.weights_written, false);
  assert.strictEqual(Object.hasOwn(beamDistil, 'speculative_drafter'), false);


  // Misha Laskin (yFDQX4Yy4N8) Steals: US/Western Enterprise Provenance Gate, Sovereign Intelligence Car, Jevons Paradox & Feynman Audit
  const usProvenance = classifyModelEnterpriseProvenance({
    modelId: 'Beam-1.0-501B-A23B',
    enterpriseComplianceMode: true,
  });
  assert.strictEqual(usProvenance.allowed_for_f500_banking_gov, false);
  assert.strictEqual(usProvenance.fortune_500_certified, false);
  assert.strictEqual(usProvenance.blocked_by_policy, false);

  const blockedForeign = classifyModelEnterpriseProvenance({
    modelId: 'deepseek-r1:latest',
    enterpriseComplianceMode: true,
  });
  assert.strictEqual(blockedForeign.allowed_for_f500_banking_gov, false);
  assert.strictEqual(blockedForeign.blocked_by_policy, true);
  assert.strictEqual(blockedForeign.routed_model, 'mlx-community/Llama-3.2-1B-Instruct-4bit');
  assert.strictEqual(blockedForeign.fallback_is_beam, false);
  assert.strictEqual(blockedForeign.beam_checkpoint_used_as_fallback, false);

  const carAudit = auditIntelligenceSovereigntyAndTheCar({
    liveVllmReachable: true,
    ollamaReachable: true,
    localRoutedSharePct: 84.0,
  });
  assert.strictEqual(carAudit.sovereign_intelligence_owned, false);
  assert.strictEqual(carAudit.closed_api_platform_risk_mitigated, false);
  assert.strictEqual(carAudit.caller_share_pct_accepted, false);
  assert.strictEqual(carAudit.margin_measured, false);
  assert.strictEqual(carAudit.mirror_installed, false);
  assert.strictEqual(carAudit.open_base_reinforcement.training_started, false);

  const jevons = planJevonsParadoxComputeAllocation({
    workloadType: 'cyber_defense_and_rd',
    localMarginalCostPerTokenUsd: 0.0,
  });
  assert.strictEqual(jevons.jevons_paradox_multiplier, null);
  assert.strictEqual(jevons.scale_volume, false);
  assert.strictEqual(jevons.cyber_sweeps_started, false);
  assert.strictEqual(jevons.caller_cost_accepted, false);

  const feynman = runFeynmanAntiFoolingAudit({
    prefixReuseProven: true,
    batchDeterminismProven: true,
    unverifiedPast20Turns: 0,
    exposedSecretsCount: 0,
  });
  assert.strictEqual(feynman.passed, false);
  assert.strictEqual(feynman.self_report_counts, false);
  assert.strictEqual(feynman.caller_flags_accepted, false);
  assert.strictEqual(feynman.company_formed, false);

  // GitHub COO Kyle Daigle (pPCAQ7UulGA) Steals: First-Turn SLM + 4-Tier Fusion Cascade Router & Cross-Family Critique Loop
  const local4bRoute = classifyFirstTurnSlmAndCascadeRoute({
    promptText: 'Format string',
    filesTouchedCount: 1,
    cascadeEscalated: false,
  });
  assert.strictEqual(local4bRoute.fusion_tier, 'LOCAL_CLERK');
  assert.strictEqual(local4bRoute.routed_model, 'mlx-community/Llama-3.2-1B-Instruct-4bit');
  assert.strictEqual(local4bRoute.zero_cloud_token_execution, false);
  assert.strictEqual(local4bRoute.slm_eval_ran, false);
  assert.strictEqual(local4bRoute.paid_frontier_default, false);

  const fusionMaxEscalated = classifyFirstTurnSlmAndCascadeRoute({
    promptText: 'Format string',
    filesTouchedCount: 1,
    cascadeEscalated: true,
  });
  assert.strictEqual(fusionMaxEscalated.fusion_tier, 'LOCAL_CLERK');
  assert.strictEqual(fusionMaxEscalated.caller_escalate_accepted, false);
  assert.strictEqual(fusionMaxEscalated.higher_tier_invoked, false);

  const byokRoute = classifyFirstTurnSlmAndCascadeRoute({
    promptText: 'Verify Nexus STS claim',
    domainByokContext: 'eci_nexus',
  });
  assert.strictEqual(byokRoute.fusion_tier, 'DOMAIN_BYOK_SPECIALIST');
  assert.strictEqual(byokRoute.specialist_invoked, false);
  assert.strictEqual(byokRoute.routed_model, 'mlx-community/Llama-3.2-1B-Instruct-4bit');

  const critiqueLoop = runCrossFamilyCritiqueLoop({
    generatorModel: 'google-antigravity/gemini-4-argon',
    taskSummary: 'unit_test_cross_family_critique',
  });
  assert.strictEqual(critiqueLoop.cross_family_disjoint, true);
  assert.notStrictEqual(critiqueLoop.generator_family, critiqueLoop.critic_family);
  assert.strictEqual(critiqueLoop.critique_ran, false);
  assert.strictEqual(critiqueLoop.token_spend_reduction_measured, false);
  assert.strictEqual(critiqueLoop.speed_boost_measured, false);
  assert.strictEqual(critiqueLoop.measured_token_spend_reduction_pct, null);
  assert.strictEqual(critiqueLoop.measured_speed_boost_pct, null);

  const kyleAudit = auditKyleDaigleMultiRepoAndSecurity();
  assert.strictEqual(kyleAudit.hybrid_payg_security_and_secret_scanning.passed, false);
  assert.strictEqual(kyleAudit.hybrid_payg_security_and_secret_scanning.github_secret_protection_enabled, false);
  assert.strictEqual(kyleAudit.multi_repo_project_workspace.copilot_project_created, false);
  assert.strictEqual(kyleAudit.multi_repo_project_workspace.autonomous_merge_enabled, false);
  assert.strictEqual(kyleAudit.prototype_first_validation_gate.passed, false);
  assert.ok(kyleAudit.multi_repo_project_workspace.grouped_repos_count >= 1);

  // This AI Assistant REMEMBERS Everything You Won't (tSBx5l9VFwE) Steals
  const rememberAudit = auditRememberEverythingProductSalesAndHarness();
  assert.strictEqual(rememberAudit.passed, false);
  assert.strictEqual(rememberAudit.ledger_written, false);
  assert.strictEqual(rememberAudit.product_validation_framework.three_line_weekly_cadence.number_measured, false);
  assert.strictEqual(rememberAudit.sales_and_meeting_workflows.weekly_call_coaching.max_weekly_coaching_insights, 1);
  assert.strictEqual(rememberAudit.sales_and_meeting_workflows.weekly_call_coaching.coaching_insight, null);
  assert.strictEqual(
    rememberAudit.personal_productivity_and_harness.human_written_origin_story_guard
      .ai_ghostwriting_blocked_on_personal_origin_story,
    false,
  );
  assert.strictEqual(
    rememberAudit.personal_productivity_and_harness.human_written_origin_story_guard
      .origin_story_generated_by_this_module,
    false,
  );

  // Liam Fallen (@liam_fallen 2116881320282386726) 5-Bot Personal Intelligence System + Personal HQ
  const liamHq = bootstrapLiamFallenPersonalIntelligenceHq();
  assert.strictEqual(liamHq.passed, false);
  assert.strictEqual(liamHq.files_written, false);
  assert.strictEqual(liamHq.five_documents_verified, false);
  assert.strictEqual(liamHq.bots_created, 0);
  assert.strictEqual(liamHq.five_bot_roster.length, 5);
  assert.strictEqual(liamHq.primary_bot, null);
  assert.strictEqual(liamHq.primary_bot_set, false);
  assert.strictEqual(liamHq.security_boundary_upgrade.per_bot_disposable_30m_lease_enforced, false);
  assert.strictEqual(liamHq.prompt_catalog_copied, false);

  // West Monroe "Why Speed Matters / Slowness Tax" + 7 Speed Levers (westmonroe.com/insights/why-speed-matters)
  const wmSpeed = auditWestMonroeSlownessTaxAndSevenSpeedLevers({
    personalHqVerified: liamHq.five_documents_verified,
  });
  assert.strictEqual(wmSpeed.passed, false);
  assert.strictEqual(wmSpeed.files_written, false);
  assert.strictEqual(wmSpeed.cadence_written, false);
  assert.strictEqual(wmSpeed.revenue_loss_measured, false);
  assert.strictEqual(wmSpeed.revenue_loss_pct, null);
  assert.strictEqual(wmSpeed.levers_happening, 0);
  assert.strictEqual(wmSpeed.seven_speed_levers.length, 7);
  assert.ok(wmSpeed.seven_speed_levers.every((lever) => lever.happening === false));
  assert.strictEqual(wmSpeed.ai_handoff_friction_guard.slowness_tax_eliminated, false);
  assert.strictEqual(wmSpeed.ai_handoff_friction_guard.estimated_weekly_time_saved_from_zero_rework_pct, null);
  assert.deepStrictEqual(wmSpeed.ai_handoff_friction_guard.decision_states, ['approve', 'revise', 'escalate']);

  // Interact Software Cue AI Intranet + Conductor (interactsoftware.com/clp/cue-ai-intranet)
  const cueAudit = auditInteractCueAdaptiveIntranetAndConductor();
  assert.strictEqual(cueAudit.passed, false);
  assert.strictEqual(cueAudit.cue_installed, false);
  assert.strictEqual(cueAudit.answer_first_cited_retrieval.answer_comes_first, false);
  assert.strictEqual(cueAudit.answer_first_cited_retrieval.citation_checked, false);
  assert.deepStrictEqual(cueAudit.system_of_record_task_completion.action_preview_card_contract.controls, [
    'Confirm',
    'Edit',
  ]);
  assert.strictEqual(cueAudit.system_of_record_task_completion.action_preview_card_contract.controls_enabled, false);
  assert.strictEqual(cueAudit.system_of_record_task_completion.action_performed, false);
  assert.strictEqual(cueAudit.two_lane_priority_feed.needs_you_split, false);
  assert.strictEqual(cueAudit.permission_aware_governance.enforces_caller_lease_permissions, false);
  assert.strictEqual(cueAudit.layout_adapted, false);

  // AAIF Goose (goose-docs.ai) Adversary Mode + Portable YAML Recipes + ACP providers
  const gooseAudit = bootstrapGooseAaifAdversaryRecipesAndAcp();
  assert.strictEqual(gooseAudit.passed, false);
  assert.strictEqual(gooseAudit.files_written, false);
  assert.strictEqual(gooseAudit.goose_installed, false);
  assert.strictEqual(gooseAudit.adversary_mode.active, false);
  assert.strictEqual(gooseAudit.adversary_mode.reviewer_active, false);
  assert.strictEqual(gooseAudit.adversary_mode.fail_closed, false);
  assert.strictEqual(gooseAudit.portable_yaml_recipes.self_validating_retry_checks, false);
  assert.strictEqual(gooseAudit.portable_yaml_recipes.recipe_written, false);
  assert.strictEqual(gooseAudit.acp_subscription_providers.per_token_api_overage_usd, null);
  assert.strictEqual(gooseAudit.acp_subscription_providers.per_token_overage_usd, null);
  assert.strictEqual(gooseAudit.acp_subscription_providers.provider_configured, false);
  assert.strictEqual(gooseAudit.acp_subscription_providers.mode_enabled, false);

  // Elicit (elicit.com) five-step review, sentence citations, and living routines
  const elicitAudit = auditElicitSystematicEvidenceAndLivingRoutines();
  assert.strictEqual(elicitAudit.passed, false);
  assert.strictEqual(elicitAudit.files_written, false);
  assert.strictEqual(elicitAudit.account_signed_in, false);
  assert.strictEqual(elicitAudit.vendor_figures_stored, false);
  assert.strictEqual(elicitAudit.five_step_prisma_pipeline.steps.length, 5);
  assert.strictEqual(elicitAudit.five_step_prisma_pipeline.protocol.searches_ran, false);
  assert.strictEqual(elicitAudit.top_five_claims_rubric.measured_accuracy_score, null);
  assert.strictEqual(elicitAudit.top_five_claims_rubric.measured_citation_support_score, null);
  assert.strictEqual(elicitAudit.living_routines_and_shared_library.updates_existing_artifact_instead_of_reading_list, false);
  assert.strictEqual(elicitAudit.living_routines_and_shared_library.artifact_updated, false);
  assert.strictEqual(elicitAudit.living_routines_and_shared_library.files_written, false);

  // ResearchRabbit (app.researchrabbit.ai) citation library
  const rrAudit = auditResearchRabbitCitationGraphMonetization();
  assert.strictEqual(rrAudit.passed, false);
  assert.strictEqual(rrAudit.files_written, false);
  assert.strictEqual(rrAudit.monetization_pack_written, false);
  assert.strictEqual(rrAudit.outreach_sent, false);
  assert.strictEqual(rrAudit.authenticated_google_sso, null);
  assert.strictEqual(rrAudit.account_email_seen, false);
  assert.strictEqual(rrAudit.discovered_guardrail_papers_count, 0);
  assert.strictEqual(rrAudit.buyer_emails_named, 0);
  assert.strictEqual(rrAudit.cash_received_usd, null);
  assert.strictEqual(rrAudit.outbound_spend_usd, null);

  // Rig (rig.rs) cassette recording and replay
  const rigAudit = auditRigRustModularAgentAndCassetteReplay();
  assert.strictEqual(rigAudit.passed, false);
  assert.strictEqual(rigAudit.files_written, false);
  assert.strictEqual(rigAudit.recording_ran, false);
  assert.strictEqual(rigAudit.replay_ran, false);
  assert.strictEqual(rigAudit.log_path, null);
  assert.strictEqual(rigAudit.plugins_toml_path, null);
  assert.strictEqual(rigAudit.effects_named, 0);
  assert.strictEqual(rigAudit.keys_sorted_equal, false);
  assert.strictEqual(rigAudit.keeps_old_build_on_compile_failure, null);
  assert.strictEqual(rigAudit.mcp_client_enabled, false);
  // Disposable Agents 6-Step Lifecycle (Navveen Balani Z78LjQn0u2E)
  const disp = runDisposableAgentLifecycleAudit({
    objective: 'unit_test_disposable_lifecycle',
    ttlMinutes: 30,
    maxTurns: 20,
  });
  assert.strictEqual(disp.step_2_equip_time_bound_least_privilege.ttl_minutes, 30);
  assert.strictEqual(disp.step_5_extract_intelligence_gc.intermediate_thoughts_discarded, true);
  assert.strictEqual(disp.step_5_extract_intelligence_gc.dissent_verified, false);
  assert.strictEqual(disp.step_6_retire.status, 'still_active');
  assert.strictEqual(disp.locks_deleted, false);
  assert.strictEqual(disp.credentials_issued, false);

  const arenaReport = runAiAmArenaProductionGuard();
  assert.strictEqual(arenaReport.cold_cache_trivial_turn_guard.savings_measured, false);
  assert.strictEqual(arenaReport.production_trace_audit.misalignment_probability_measured, false);
  assert.strictEqual(arenaReport.live_meeting_execution_pipe.pipes_meetings_into_code, false);
  const sim = runBenchmarkSimulation();
  assert.strictEqual(sim.simulated_prefix_cache, true);
  assert.ok(sim.live_server && typeof sim.live_server.reachable === 'boolean');
  assert.strictEqual(sim.schema_version, 'vllm-inference-router/3');
  assert.strictEqual(typeof sim.live_prefix_reuse.prefix_reuse_proven, 'boolean');
  assert.ok(sim.thinking_machines_steals && sim.thinking_machines_steals.batch_invariant_determinism);
  assert.ok(
    sim.apc_summary.overall_prefix_cache_hit_rate_pct >= 55.0,
    `Expected overall APC hit rate >= 55%, got ${sim.apc_summary.overall_prefix_cache_hit_rate_pct}%`,
  );

  console.log(
    `PASS tests/test-vllm-inference-router.js (APC hit rate=${sim.apc_summary.overall_prefix_cache_hit_rate_pct}%, KV blocks=${sim.apc_summary.active_kv_blocks})`,
  );
}

main();
