#!/usr/bin/env node
/**
 * tools/control-band-sentinel.js
 * 
 * Deterministic Statistical Control-Band Sentinel (Anthropic AI-Native SDLC Stage 6: Maintain).
 * Evaluates production/CI metrics against baseline mean & std using Western Electric rules.
 * Automatically closes the loop by writing a new `intent/incident-*.md` when bands are breached.
 */

const fs = require('fs');
const path = require('path');
let yaml = null;
try {
  yaml = require('js-yaml');
} catch (_) {}

// Fallback robust YAML parser for bands.yaml format
/**
 * Minimal reader for this file's bands.yaml shape, used when js-yaml is absent.
 *
 * It reads each tier's declared `action` rather than assuming one. An earlier
 * version hardcoded `propose_and_revert` for the 3sigma tier, which meant the
 * fallback path could introduce auto-acting behaviour that bands.yaml never
 * asked for - the config said "report" and the parser said "revert". Anything
 * it cannot read stays at the safest tier it knows.
 */
function parseYamlFallback(str) {
  const metrics = [];
  const lines = str.split('\n');
  let currentMetric = null;
  let currentTier = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (rawLine.startsWith('  - id:')) {
      currentMetric = { id: line.split(':')[1].trim(), tiers: {} };
      currentTier = null;
      metrics.push(currentMetric);
      continue;
    }
    if (!currentMetric) continue;

    const tierMatch = line.match(/^(1sigma|2sigma|3sigma):$/);
    if (tierMatch) {
      currentTier = tierMatch[1];
      // Default to the safest action; the declared one overwrites it below.
      currentMetric.tiers[currentTier] = { action: 'log' };
      continue;
    }

    if (line.startsWith('baseline_mean:')) {
      currentMetric.baseline_mean = parseFloat(line.split(':')[1].trim());
    } else if (line.startsWith('baseline_std:')) {
      currentMetric.baseline_std = parseFloat(line.split(':')[1].trim());
    } else if (line.startsWith('name:') && !currentTier) {
      currentMetric.name = line.split(':')[1].trim();
    } else if (line.startsWith('action:') && currentTier) {
      currentMetric.tiers[currentTier].action = line.slice('action:'.length).trim();
    }
  }
  return { metrics };
}

function loadConfig(configPath) {
  const content = fs.readFileSync(configPath, 'utf8');
  if (yaml && typeof yaml.load === 'function') {
    try {
      return yaml.load(content);
    } catch (_) {}
  }
  return parseYamlFallback(content);
}

/**
 * Evaluates metric samples against Western Electric SPC rules
 * @param {Array<number>} samples Recent metric data points
 * @param {number} mean Baseline mean
 * @param {number} std Baseline standard deviation
 */
function evaluateWesternElectric(samples, mean, std) {
  if (!samples || samples.length === 0) return { status: 'NO_DATA', zScore: 0 };

  const latest = samples[samples.length - 1];
  const sigma = std || 1e-6;
  const zScore = (latest - mean) / sigma;
  const absZ = Math.abs(zScore);

  let breached = false;
  let tier = '1sigma';
  let ruleFired = 'Normal within 1 sigma';

  // Each rule is evaluated independently. They were previously chained as
  // `else if` on sample count, which made Rules 3 and 4 unreachable for any
  // series of 3 or more points -- i.e. persistent drift, the exact failure
  // control bands exist to catch, was never detected.
  const countBeyond = (window, k) => ({
    above: window.filter((v) => (v - mean) / sigma >= k).length,
    below: window.filter((v) => (mean - v) / sigma >= k).length,
  });

  // Rule 1: one point beyond 3 sigma (Zone A).
  if (absZ >= 3.0) {
    breached = true;
    tier = '3sigma';
    ruleFired = 'Western Electric Rule 1: Single observation beyond 3 sigma';
  }

  // Rule 2: 2 of 3 consecutive points beyond 2 sigma on the same side.
  if (!breached && samples.length >= 3) {
    const c = countBeyond(samples.slice(-3), 2.0);
    if (c.above >= 2 || c.below >= 2) {
      breached = true;
      tier = '2sigma';
      ruleFired = 'Western Electric Rule 2: 2 of 3 consecutive points beyond 2 sigma';
    }
  }

  // Rule 3: 4 of 5 consecutive points beyond 1 sigma on the same side.
  if (!breached && samples.length >= 5) {
    const c = countBeyond(samples.slice(-5), 1.0);
    if (c.above >= 4 || c.below >= 4) {
      breached = true;
      tier = '2sigma';
      ruleFired = 'Western Electric Rule 3: 4 of 5 consecutive points beyond 1 sigma';
    }
  }

  // Rule 4: 8 consecutive points on one side of the centerline (persistent drift).
  if (!breached && samples.length >= 8) {
    const last8 = samples.slice(-8);
    if (last8.every((v) => v > mean) || last8.every((v) => v < mean)) {
      breached = true;
      tier = '2sigma';
      ruleFired = 'Western Electric Rule 4: 8 consecutive points on one side of centerline (persistent drift)';
    }
  }

  if (!breached && absZ >= 1.0) {
    tier = '1sigma';
    ruleFired = 'Observation in Zone C (1 sigma to 2 sigma)';
  }

  return {
    latest,
    mean,
    std,
    zScore: parseFloat(zScore.toFixed(2)),
    absZ: parseFloat(absZ.toFixed(2)),
    tier,
    breached,
    ruleFired
  };
}

/**
 * Emits an incident intent.md file into intent/ directory
 */
function generateIncidentIntent(metricConfig, evaluation, intentDir = path.join(__dirname, '../intent')) {
  if (!fs.existsSync(intentDir)) {
    fs.mkdirSync(intentDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `incident-${metricConfig.id}-${timestamp}.md`;
  const targetPath = path.join(intentDir, filename);

  const content = `# Intent: Auto-Remediate ${metricConfig.name} (${metricConfig.id})

Author: AI-Native SDLC Control-Band Sentinel (Stage 6: Maintain)
Date: ${new Date().toISOString()}
Status: draft
Lifecycle: production
Trigger: Control-Band Breach (${evaluation.tier.toUpperCase()})

## Problem
A statistically significant anomaly was detected by Western Electric SPC rules for metric \`${metricConfig.id}\`.
- **Observed Value**: ${evaluation.latest}
- **Baseline Expected Mean**: ${evaluation.mean} (±${evaluation.std} σ)
- **Calculated Z-Score**: ${evaluation.zScore}σ
- **Violation Rule**: ${evaluation.ruleFired}

## Proposed outcome
Restore \`${metricConfig.id}\` within normal statistical baseline (within ±1.5σ).
Identify root-cause commit/dependency/service drift, apply fix or quarantine, and add permanent regression eval in \`evals/\`.

## Affected users and systems
- Metric: ${metricConfig.id} (${metricConfig.name})
- Systems: Automated CI Pipeline, Deployment Gate, Health Sentinel

## Constraints
- Zero manual human paging for non-critical alerts.
- Follow "fix the code, not the test" rule if test quarantine is triggered.
- Must attach verified test proof before merging resolution PR.

## Open questions
- Did a specific upstream dependency bump or recent PR cause the deviation?
- Is this a permanent workload shift requiring baseline recalibration?
`;

  fs.writeFileSync(targetPath, content, 'utf8');
  return targetPath;
}

function runSentinel(metricData, configPath = path.join(__dirname, '../bands.yaml'), options = {}) {
  const config = loadConfig(configPath);
  const results = [];

  for (const metric of config.metrics || []) {
    const samples = metricData[metric.id] || [];

    // A configured metric with no observations is NOT the same as a metric
    // nobody configured, and the difference is the one a reader cares about:
    // silence here usually means the collector broke, not that the system is
    // healthy. Skipping it made evaluateWesternElectric's NO_DATA branch
    // unreachable through this runner, so the absence looked identical to
    // "nothing to report".
    const evaluation = evaluateWesternElectric(samples, metric.baseline_mean, metric.baseline_std);
    const tierConfig = metric.tiers?.[evaluation.tier] || {};

    // `report` means "file something a human can triage". Keying artifact
    // generation off a separate `auto_intent` flag meant it never fired: no
    // tier in bands.yaml defines that key, so generateIncidentIntent was dead
    // code and the committed config promised an artifact that never appeared.
    // `auto_intent` still works as an explicit opt-in where a tier sets it.
    const wantsArtifact = tierConfig.action === 'report' || tierConfig.auto_intent === true;

    let generatedIntent = null;
    if (evaluation.breached && wantsArtifact && !options.dryRun) {
      generatedIntent = generateIncidentIntent(metric, evaluation, options.intentDir);
    }

    results.push({
      metricId: metric.id,
      name: metric.name,
      evaluation,
      action: tierConfig.action || 'log',
      autoIntentGenerated: generatedIntent
    });
  }

  return results;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let configPath = path.join(__dirname, '../bands.yaml');
  let sampleJson = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === '--data' && args[i + 1]) {
      sampleJson = JSON.parse(args[i + 1]);
      i++;
    }
  }

  // Default demonstration data if none provided
  const data = sampleJson || {
    ci_test_failure_rate: [0.02, 0.021, 0.019, 0.022, 0.055], // 0.055 > 3σ breach
    post_deploy_5xx_rate: [0.001, 0.0009, 0.0011],
    pr_cycle_time_hours: [4.2, 4.5, 4.8, 5.0]
  };

  const results = runSentinel(data, configPath);
  console.log('\n📊 AI-Native SDLC Statistical Control-Band Sentinel Report:\n');
  results.forEach(r => {
    const icon = r.evaluation.breached ? (r.evaluation.tier === '3sigma' ? '🚨' : '⚠️') : '✅';
    console.log(`${icon} [${r.metricId}] Value: ${r.evaluation.latest} (z: ${r.evaluation.zScore}σ) | Action: ${r.action}`);
    console.log(`   ↳ Rule: ${r.evaluation.ruleFired}`);
    if (r.autoIntentGenerated) {
      console.log(`   ↳ 🔁 Auto-Closed Loop -> Created: ${r.autoIntentGenerated}`);
    }
  });
}

module.exports = {
  loadConfig,
  evaluateWesternElectric,
  generateIncidentIntent,
  runSentinel
};
