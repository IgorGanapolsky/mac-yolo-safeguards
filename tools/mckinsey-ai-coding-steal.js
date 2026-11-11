#!/usr/bin/env node
'use strict';

/**
 * mckinsey-ai-coding-steal.js — Operationalizes McKinsey's "What the Top Companies Do
 * Differently With AI Coding" (https://www.youtube.com/watch?v=21tuT-e4NVo — Martin
 * Harrysson, Prakhar Dixit, Shilpa) across Mac YOLO Safeguards, ThumbGate, and Dayglass:
 *
 * 1. Redesign Operating Model & Delivery Flow:
 *    - 1–2 day Kanban & Night-Shift loops (no 2-week sprints)
 *    - Strict standardized PRD/Spec input validator
 *    - Progressive human-in-the-loop autonomy pullback gated by consecutive green runs
 * 2. Restructure Teams & Roles:
 *    - 2–4 agent/person mini-pods (capped at 3 concurrent agents per repo)
 *    - Role collapse into Definer (PM+Spec), Builder (Dev+QA), and Reviewer (Adversarial Validation)
 *    - Review-first validation parity (reviewToGenerationRatio >= 1.0)
 * 3. Curate Context, Golden Examples & Skills:
 *    - Programmatic Tribal Knowledge Semantic Layer
 *    - Golden Examples (top-tier exemplars, not codebase averages)
 *    - Vetted Skill Curation auditor against SKILLS.md
 * 4. Eliminate Upstream, Downstream & Sideways Bottlenecks:
 *    - Upstream context + downstream release checklist verifier
 *    - Baked-in "Sideways" Enterprise Guardrails: DLP/air-gap, $10/mo compliance,
 *      WCAG AA contrast ratio (>= 4.5:1), colorblind-safe palette check, >= 44px tap targets,
 *      and focus-visible accessibility rules
 * 5. Track Token ROI & Value (AIOps):
 *    - Scores task business impact vs token spend under the $10/mo ceiling
 *    - Emits vendor-neutral OpenTelemetry (otel) spans to ~/.paperclip/operations/telemetry/otel_spans.jsonl
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'mckinsey-ai-coding-system.json');
const DEFAULT_OTEL_PATH = path.join(
  os.homedir(),
  '.paperclip',
  'operations',
  'telemetry',
  'otel_spans.jsonl',
);

const CORP_AIRGAP_RE = /(ecinexus\.com|eciplatform\.net|dist03|stockservice|10\.10\.20\.81|psn-qa)/i;
const SECRET_TOKEN_RE = /\b(sk_live_[0-9a-zA-Z]{16,}|ghp_[0-9a-zA-Z]{20,}|xoxb-[0-9a-zA-Z-]{16,}|AKIA[0-9A-Z]{16})\b/;

function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

/**
 * Pillar 1A: Standardized PRD/Spec Input Artifact Validator.
 * Rejects fragmented or vague specs before agents spend tokens.
 */
function validateStandardPrd(prd, config = loadConfig()) {
  const requiredFields = config.operatingModel.prdTemplateRequiredFields;
  const input = prd && typeof prd === 'object' ? prd : {};
  const missingFields = [];
  const qualityIssues = [];

  for (const field of requiredFields) {
    const val = input[field];
    const isEmptyArray = Array.isArray(val) && val.length === 0;
    const isEmptyString = typeof val === 'string' && val.trim().length === 0;
    if (val === undefined || val === null || isEmptyArray || isEmptyString) {
      missingFields.push(field);
    }
  }

  if (typeof input.problemStatement === 'string' && input.problemStatement.trim().length < 20) {
    qualityIssues.push('problemStatement must be at least 20 characters of concrete context');
  }
  if (Array.isArray(input.acceptanceCriteria)) {
    if (input.acceptanceCriteria.some((ac) => typeof ac !== 'string' || ac.trim().length < 10)) {
      qualityIssues.push('every acceptanceCriteria entry must be a verifiable statement (>= 10 chars)');
    }
  } else if (input.acceptanceCriteria !== undefined) {
    qualityIssues.push('acceptanceCriteria must be an array of verifiable criteria');
  }
  if (
    typeof input.verificationCommand === 'string' &&
    !/\b(node|npm|pytest|bash|sh|cargo|go|dotnet)\b/.test(input.verificationCommand)
  ) {
    qualityIssues.push('verificationCommand must invoke a deterministic test/verification runner');
  }

  const passed = missingFields.length === 0 && qualityIssues.length === 0;
  const canonicalJson = JSON.stringify({
    id: input.id || null,
    missingFields,
    qualityIssues,
    passed,
  });

  return {
    status: passed ? 'PASS' : 'BLOCK',
    passed,
    missingFields,
    qualityIssues,
    receiptHash: sha256Hex(canonicalJson).slice(0, 16),
  };
}

/**
 * Pillar 1B: Progressive Autonomy Gate.
 * Pulls back human-in-the-loop sign-off as consecutive green runs grow,
 * while keeping irreversible actions fail-closed.
 */
function evaluateProgressiveAutonomy(
  { consecutiveGreenRuns = 0, defectRate = 0, actionClass = 'read' } = {},
  config = loadConfig(),
) {
  const irreversible = new Set(config.operatingModel.irreversibleAlwaysGate || []);
  if (irreversible.has(actionClass)) {
    return {
      status: 'HOLD_FOR_HUMAN',
      tier: 'irreversible_guard',
      humanSignOffRequired: true,
      allowed: false,
      reason: `Action '${actionClass}' is on irreversibleAlwaysGate and always requires human sign-off.`,
    };
  }

  const ladder = [...(config.operatingModel.progressiveAutonomyLadder || [])].sort(
    (a, b) => b.minConsecutiveGreenRuns - a.minConsecutiveGreenRuns,
  );

  let matchedTier = ladder[ladder.length - 1];
  for (const rung of ladder) {
    if (consecutiveGreenRuns >= rung.minConsecutiveGreenRuns && defectRate <= rung.maxDefectRate) {
      matchedTier = rung;
      break;
    }
  }

  const allowed = (matchedTier.allowedActionClasses || []).includes(actionClass);
  const humanSignOffRequired = Boolean(matchedTier.humanSignOffRequired || !allowed);

  return {
    status: allowed && !humanSignOffRequired ? 'AUTONOMOUS_ALLOW' : 'HOLD_FOR_HUMAN',
    tier: matchedTier.tier,
    humanSignOffRequired,
    allowed,
    consecutiveGreenRuns,
    defectRate,
    actionClass,
    reason: allowed
      ? `Action '${actionClass}' permitted under ${matchedTier.tier} (${consecutiveGreenRuns} green runs, defectRate=${defectRate}).`
      : `Action '${actionClass}' exceeds ${matchedTier.tier} allowance; requires ${
          ladder[0]?.tier || 'higher tier'
        } or human sign-off.`,
  };
}

/**
 * Pillar 2: Mini-Pod Sizing (2-4), Role Collapse (Definer + Builder + Reviewer),
 * and Review-First Validation Gate.
 */
function evaluateMiniPodStructure(
  {
    podSize = 3,
    concurrentAgents = 2,
    rolesPresent = ['definer', 'builder', 'reviewer'],
    generatedPrCount = 1,
    reviewedPrCount = 1,
    hasReviewReceipt = true,
  } = {},
  config = loadConfig(),
) {
  const bounds = config.teamStructure.podSizeBounds || { min: 2, max: 4 };
  const maxConcurrent = config.teamStructure.maxConcurrentAgentsPerRepo || 3;
  const requiredRoles = Object.keys(config.teamStructure.collapsedRoles || {});
  const presentSet = new Set((rolesPresent || []).map((r) => String(r).toLowerCase()));
  const missingRoles = requiredRoles.filter((r) => !presentSet.has(r));
  const reviewRatio = generatedPrCount > 0 ? reviewedPrCount / generatedPrCount : 1.0;

  const violations = [];
  if (podSize < bounds.min || podSize > bounds.max) {
    violations.push(`podSize=${podSize} outside mini-pod bounds [${bounds.min}, ${bounds.max}]`);
  }
  if (concurrentAgents > maxConcurrent) {
    violations.push(
      `concurrentAgents=${concurrentAgents} exceeds maxConcurrentAgentsPerRepo=${maxConcurrent}`,
    );
  }
  if (missingRoles.length > 0) {
    violations.push(`missing collapsed roles: ${missingRoles.join(', ')}`);
  }
  if (reviewRatio < (config.teamStructure.reviewToGenerationRatioMin || 1.0) || !hasReviewReceipt) {
    violations.push(
      `review-first gate failed: reviewRatio=${reviewRatio.toFixed(2)}, hasReviewReceipt=${Boolean(
        hasReviewReceipt,
      )}`,
    );
  }

  return {
    status: violations.length === 0 ? 'PASS' : 'BLOCK',
    passed: violations.length === 0,
    podSize,
    concurrentAgents,
    missingRoles,
    reviewRatio: Number(reviewRatio.toFixed(2)),
    hasReviewReceipt: Boolean(hasReviewReceipt),
    violations,
  };
}

/**
 * Pillar 3: Curated Context, Tribal Knowledge Semantic Layer, Golden Examples,
 * and Vetted Skill Curation.
 */
function getGoldenExamplesAndTribalKnowledge(
  { category = 'all', domain = 'all', skillsMdPath = path.join(REPO_ROOT, 'SKILLS.md') } = {},
  config = loadConfig(),
) {
  const allTribal = config.contextAndSkills.tribalKnowledgeSemanticLayer || [];
  const tribalKnowledge =
    domain === 'all' ? allTribal : allTribal.filter((t) => t.domain === domain);

  const allGolden = config.contextAndSkills.goldenExamples || {};
  const goldenExamples =
    category === 'all'
      ? allGolden
      : allGolden[category]
      ? { [category]: allGolden[category] }
      : {};

  const vettedAllowlist = config.contextAndSkills.coreVettedSkillsAllowlist || [];
  let skillsMdText = '';
  try {
    skillsMdText = fs.readFileSync(skillsMdPath, 'utf8');
  } catch {
    skillsMdText = '';
  }

  const registeredVettedSkills = vettedAllowlist.filter(
    (skillName) =>
      skillsMdText.includes(`\`${skillName}\``) ||
      fs.existsSync(path.join(REPO_ROOT, '.agents', 'skills', skillName, 'SKILL.md')),
  );

  return {
    status: 'READY',
    tribalKnowledgeCount: tribalKnowledge.length,
    tribalKnowledge,
    goldenExampleKeys: Object.keys(goldenExamples),
    goldenExamples,
    vettedSkillsAudit: {
      allowlistCount: vettedAllowlist.length,
      registeredCount: registeredVettedSkills.length,
      missingFromRegistry: vettedAllowlist.filter((s) => !registeredVettedSkills.includes(s)),
    },
  };
}

/**
 * Helper: WCAG 2.1 relative luminance and contrast ratio from hex colors (#RRGGBB or #RGB).
 */
function parseHexRgb(hex) {
  const clean = String(hex || '')
    .trim()
    .replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

function relativeLuminance([r, g, b]) {
  const transform = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [transform(r), transform(g), transform(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function computeWcagContrastRatio(fgHex, bgHex) {
  const l1 = relativeLuminance(parseHexRgb(fgHex));
  const l2 = relativeLuminance(parseHexRgb(bgHex));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Pillar 4: "Sideways" Enterprise Guardrails (Security/DLP, Compliance Budget,
 * Design & Accessibility incl. colorblind/WCAG AA contrast + tap targets + focus ring).
 */
function runSidewaysGuardrailsGate(
  {
    textContent = '',
    htmlOrCssContent = '',
    fgHex = '#0f172a',
    bgHex = '#ffffff',
    isLargeText = false,
    tapTargetPx = 48,
    usesRedGreenOnlyStatus = false,
    estimatedMonthlySpendUsd = 0.0,
  } = {},
  config = loadConfig(),
) {
  const rules = config.bottleneckElimination.sidewaysGuardrails;
  const combinedText = `${textContent}\n${htmlOrCssContent}`;
  const violations = [];

  // 1. Security & Corporate Air-Gap Diode
  if (CORP_AIRGAP_RE.test(combinedText)) {
    violations.push('security_airgap: corporate air-gap identifier detected (CORP_AIRGAP_RE)');
  }
  if (SECRET_TOKEN_RE.test(combinedText)) {
    violations.push('security_dlp: raw secret or API token detected in content');
  }

  // 2. FinOps & Compliance ($10/mo metered API ceiling)
  if (estimatedMonthlySpendUsd > rules.maxMonthlyMeteredBudgetUsd) {
    violations.push(
      `compliance_budget: estimatedMonthlySpendUsd=$${estimatedMonthlySpendUsd} exceeds $${rules.maxMonthlyMeteredBudgetUsd}/mo cap`,
    );
  }

  // 3. Accessibility: WCAG AA contrast ratio & colorblind safety
  const contrastRatio = computeWcagContrastRatio(fgHex, bgHex);
  const minContrast = isLargeText ? rules.wcagContrastMinLarge : rules.wcagContrastMinNormal;
  if (contrastRatio < minContrast) {
    violations.push(
      `accessibility_contrast: contrastRatio=${contrastRatio}:1 is below WCAG AA minimum ${minContrast}:1 (${fgHex} on ${bgHex})`,
    );
  }
  if (rules.forbidRedGreenOnlyDistinction && usesRedGreenOnlyStatus) {
    violations.push(
      'accessibility_colorblind: status relies on red/green hue alone without icon, label, or shape distinction',
    );
  }
  if (tapTargetPx < rules.minTapTargetPx) {
    violations.push(
      `accessibility_tap_target: tapTargetPx=${tapTargetPx}px is below minimum ${rules.minTapTargetPx}px`,
    );
  }
  if (
    rules.requireFocusVisibleWhenOutlineNone &&
    /outline\s*:\s*(none|0)\b/i.test(htmlOrCssContent) &&
    !/:focus-visible\b/i.test(htmlOrCssContent)
  ) {
    violations.push(
      'accessibility_focus: CSS removes outline without providing a :focus-visible replacement style',
    );
  }

  return {
    status: violations.length === 0 ? 'PASS' : 'BLOCK',
    passed: violations.length === 0,
    contrastRatio,
    minContrastRequired: minContrast,
    tapTargetPx,
    estimatedMonthlySpendUsd,
    violations,
  };
}

/**
 * Emit vendor-neutral OpenTelemetry (otel) span with fail-closed CORP_AIRGAP_RE check.
 */
function emitOtelSpan(spanName, attributes = {}, otelPath = DEFAULT_OTEL_PATH) {
  const serializedAttrs = JSON.stringify(attributes);
  if (CORP_AIRGAP_RE.test(serializedAttrs) || CORP_AIRGAP_RE.test(spanName)) {
    throw new Error('CORP_AIRGAP_RE violation detected in OTel payload; refusing to emit span.');
  }
  const span = {
    trace_id: crypto.randomBytes(16).toString('hex'),
    span_id: crypto.randomBytes(8).toString('hex'),
    name: spanName,
    service_name: 'mac-yolo-mckinsey-ai-coding',
    timestamp: new Date().toISOString(),
    attributes: {
      'vcs.repository.name': 'IgorGanapolsky/mac-yolo-safeguards',
      ...attributes,
    },
  };
  try {
    fs.mkdirSync(path.dirname(otelPath), { recursive: true });
    fs.appendFileSync(otelPath, `${JSON.stringify(span)}\n`, 'utf8');
    return { emitted: true, traceId: span.trace_id, spanId: span.span_id, otelPath };
  } catch (err) {
    return { emitted: false, error: err.message, otelPath };
  }
}

/**
 * Pillar 5: Token ROI & Business Value Scorer (AIOps).
 * Evaluates feature intent & business value so token budgets go toward high-impact work.
 */
function scoreTaskTokenRoi(
  {
    taskId = 'TASK-UNSPECIFIED',
    taskTitle = '',
    category = 'direct_revenue',
    estimatedTokens = 25000,
    costPerMillionTokensUsd = 0.0, // $0 on GLM Coding Plan / local Apple Silicon; >0 on metered APIs
    expectedValueUsd = 49.0,
    confidence = 0.8,
    currentMonthlySpendUsd = 0.0,
    otelPath = DEFAULT_OTEL_PATH,
    emitTelemetry = true,
  } = {},
  config = loadConfig(),
) {
  if (CORP_AIRGAP_RE.test(`${taskId} ${taskTitle}`)) {
    throw new Error('CORP_AIRGAP_RE violation detected in task title/ID.');
  }

  const aiOps = config.tokenRoiAiOps;
  const multiplier = aiOps.categoryMultipliers[category] ?? 1.0;
  const tokenCostUsd = Number(((estimatedTokens / 1_000_000) * costPerMillionTokensUsd).toFixed(4));
  const projectedMonthlySpendUsd = Number((currentMonthlySpendUsd + tokenCostUsd).toFixed(4));
  const weightedBusinessValueUsd = Number((expectedValueUsd * confidence * multiplier).toFixed(2));
  const effectiveDenominator = Math.max(tokenCostUsd, 0.01); // avoid division by zero on $0 local/coding-plan routes
  const roiMultiplier = Number((weightedBusinessValueUsd / effectiveDenominator).toFixed(2));

  let decision = 'SCHEDULE_IMMEDIATE';
  if (projectedMonthlySpendUsd > aiOps.monthlyTokenBudgetUsd) {
    decision = 'BLOCK_BUDGET_EXCEEDED';
  } else if (roiMultiplier < aiOps.minRoiMultiplierToSchedule || category === 'speculative_refactor') {
    decision = 'HOLD_LOW_ROI';
  }

  const result = {
    taskId,
    taskTitle,
    category,
    estimatedTokens,
    tokenCostUsd,
    projectedMonthlySpendUsd,
    monthlyBudgetCapUsd: aiOps.monthlyTokenBudgetUsd,
    weightedBusinessValueUsd,
    roiMultiplier,
    decision,
  };

  if (emitTelemetry) {
    result.otel = emitOtelSpan(
      'gen_ai.mckinsey.token_roi_eval',
      {
        'gen_ai.task.id': taskId,
        'gen_ai.task.category': category,
        'gen_ai.usage.estimated_tokens': estimatedTokens,
        'finance.token_cost_usd': tokenCostUsd,
        'finance.weighted_value_usd': weightedBusinessValueUsd,
        'finance.roi_multiplier': roiMultiplier,
        'gen_ai.decision': decision,
      },
      otelPath,
    );
  }

  return result;
}

/**
 * Night-Shift Kanban Planner: ranks a batch of candidate tasks by ROI, filters out
 * low-ROI / speculative work and unvalidated PRDs, and emits a 1–2 day Kanban schedule.
 */
function buildNightShiftKanbanPlan(tasks = [], config = loadConfig(), options = {}) {
  const scheduled = [];
  const held = [];
  let runningSpendUsd = Number(options.currentMonthlySpendUsd || 0);

  for (const item of tasks) {
    const prdCheck = item.prd ? validateStandardPrd(item.prd, config) : { status: 'PASS', passed: true };
    if (!prdCheck.passed) {
      held.push({
        taskId: item.taskId || item.prd?.id || 'UNKNOWN',
        reason: 'prd_validation_failed',
        prdCheck,
      });
      continue;
    }

    const roi = scoreTaskTokenRoi(
      {
        ...item,
        currentMonthlySpendUsd: runningSpendUsd,
        emitTelemetry: Boolean(options.emitTelemetry),
        otelPath: options.otelPath || DEFAULT_OTEL_PATH,
      },
      config,
    );

    if (roi.decision === 'SCHEDULE_IMMEDIATE') {
      runningSpendUsd = roi.projectedMonthlySpendUsd;
      scheduled.push(roi);
    } else {
      held.push({
        taskId: roi.taskId,
        reason: roi.decision,
        roi,
      });
    }
  }

  scheduled.sort((a, b) => b.roiMultiplier - a.roiMultiplier);

  return {
    cadence: config.operatingModel.deliveryCadence,
    nightShiftWindowLocal: config.operatingModel.nightShiftWindowLocal,
    scheduledCount: scheduled.length,
    heldCount: held.length,
    projectedMonthlySpendUsd: runningSpendUsd,
    scheduled,
    held,
  };
}

/**
 * Full 5-pillar Doctor check verifying all McKinsey AI Coding Operating System components.
 */
function runDoctor(options = {}) {
  const config = loadConfig(options.configPath);
  const goldenCheck = getGoldenExamplesAndTribalKnowledge(
    { skillsMdPath: options.skillsMdPath },
    config,
  );
  const samplePrdCheck = validateStandardPrd(config.contextAndSkills.goldenExamples.prd_spec, config);
  const samplePodCheck = evaluateMiniPodStructure(
    {
      podSize: 3,
      concurrentAgents: 2,
      rolesPresent: ['definer', 'builder', 'reviewer'],
      generatedPrCount: 4,
      reviewedPrCount: 4,
      hasReviewReceipt: true,
    },
    config,
  );
  const sampleSidewaysCheck = runSidewaysGuardrailsGate(
    {
      textContent: 'Clean public SaaS release for Dayglass, ThumbGate, and Mac YOLO Safeguards.',
      htmlOrCssContent: '.cta:focus-visible { outline: 2px solid #38bdf8; }',
      fgHex: '#0f172a',
      bgHex: '#ffffff',
      tapTargetPx: 48,
      estimatedMonthlySpendUsd: 0.0,
    },
    config,
  );
  const sampleRoi = scoreTaskTokenRoi(
    {
      taskId: 'MAC-MCKINSEY-DOCTOR',
      taskTitle: 'Verify 5-pillar McKinsey AI coding operating system',
      category: 'direct_revenue',
      estimatedTokens: 12000,
      costPerMillionTokensUsd: 0.0,
      expectedValueUsd: 49.0,
      confidence: 0.9,
      emitTelemetry: Boolean(options.emitTelemetry),
      otelPath: options.otelPath || DEFAULT_OTEL_PATH,
    },
    config,
  );

  const ok =
    samplePrdCheck.passed &&
    samplePodCheck.passed &&
    sampleSidewaysCheck.passed &&
    sampleRoi.decision === 'SCHEDULE_IMMEDIATE' &&
    goldenCheck.tribalKnowledgeCount >= 5;

  return {
    status: ok ? 'READY' : 'DEGRADED',
    schemaVersion: config.schemaVersion,
    sourceUrl: config.source.url,
    pillars: {
      operatingModelPrdGate: samplePrdCheck,
      miniPodRoleCollapse: samplePodCheck,
      contextGoldenAndSkills: {
        tribalKnowledgeCount: goldenCheck.tribalKnowledgeCount,
        goldenExampleKeys: goldenCheck.goldenExampleKeys,
        vettedSkillsAudit: goldenCheck.vettedSkillsAudit,
      },
      sidewaysEnterpriseGuardrails: sampleSidewaysCheck,
      tokenRoiAiOps: sampleRoi,
    },
  };
}

function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'doctor';
  const jsonFlag = argv.includes('--json');

  if (cmd === 'doctor') {
    const report = runDoctor({ emitTelemetry: true });
    if (jsonFlag) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`# McKinsey AI Coding Operating System — ${report.status}`);
      console.log(`Source: ${report.sourceUrl}`);
      console.log(`1. PRD Gate: ${report.pillars.operatingModelPrdGate.status}`);
      console.log(`2. Mini-Pod Role Collapse: ${report.pillars.miniPodRoleCollapse.status}`);
      console.log(
        `3. Tribal Knowledge & Golden Examples: ${report.pillars.contextGoldenAndSkills.tribalKnowledgeCount} rules, ${report.pillars.contextGoldenAndSkills.goldenExampleKeys.length} golden exemplars`,
      );
      console.log(`4. Sideways Enterprise Guardrails: ${report.pillars.sidewaysEnterpriseGuardrails.status}`);
      console.log(
        `5. Token ROI AIOps: ${report.pillars.tokenRoiAiOps.decision} (ROI=${report.pillars.tokenRoiAiOps.roiMultiplier}x)`,
      );
    }
    process.exit(report.status === 'READY' ? 0 : 1);
  }

  if (cmd === 'golden') {
    const out = getGoldenExamplesAndTribalKnowledge();
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (cmd === 'sideways-gate') {
    const out = runSidewaysGuardrailsGate({});
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.passed ? 0 : 1);
  }

  if (cmd === 'score-roi') {
    const out = scoreTaskTokenRoi({
      taskId: 'CLI-ROI-CHECK',
      taskTitle: 'CLI Token ROI Check',
      category: 'direct_revenue',
    });
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.decision === 'SCHEDULE_IMMEDIATE' ? 0 : 1);
  }

  console.error(`Unknown subcommand: ${cmd}. Use: doctor | golden | sideways-gate | score-roi [--json]`);
  process.exit(1);
}

module.exports = {
  CORP_AIRGAP_RE,
  buildNightShiftKanbanPlan,
  computeWcagContrastRatio,
  emitOtelSpan,
  evaluateMiniPodStructure,
  evaluateProgressiveAutonomy,
  getGoldenExamplesAndTribalKnowledge,
  loadConfig,
  runDoctor,
  runSidewaysGuardrailsGate,
  scoreTaskTokenRoi,
  validateStandardPrd,
};

if (require.main === module) {
  main();
}
