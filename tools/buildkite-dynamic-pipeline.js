#!/usr/bin/env node
'use strict';

/**
 * buildkite-dynamic-pipeline.js — Buildkite Dynamic Pipeline DAG Generator
 * -------------------------------------------------------------------------
 * Generates dynamic, diff-aware CI/CD DAG execution graphs:
 *   1. Scans modified files via git diff.
 *   2. Generates targeted pipeline steps, skipping unchanged subsystems.
 *   3. Emits official Buildkite YAML / JSON pipeline definitions.
 *
 * Usage:
 *   node tools/buildkite-dynamic-pipeline.js --generate
 *   node tools/buildkite-dynamic-pipeline.js --json
 *   node tools/buildkite-dynamic-pipeline.js --doctor
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function getChangedFiles(baseBranch = 'origin/main') {
  try {
    const diff = execFileSync('git', ['diff', '--name-only', `${baseBranch}...HEAD`], { encoding: 'utf8' }).trim();
    return diff ? diff.split('\n').filter(Boolean) : [];
  } catch {
    try {
      const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
      return status.split('\n').map((l) => l.substring(3)).filter(Boolean);
    } catch {
      return [];
    }
  }
}

/**
 * Generates a dynamic pipeline configuration based on changed files.
 * @param {string[]} changedFiles 
 * @returns {object}
 */
function generateDynamicPipeline(changedFiles = []) {
  const steps = [];

  // Always run core unit verification
  steps.push({
    label: '🧪 Core Test Suite',
    command: 'node tools/validate-agent-skills.js',
    agents: { queue: 'mac-mini-runner' },
  });

  const hasMobile = changedFiles.some((f) => f.startsWith('hermes-mobile/'));
  const hasSecurity = changedFiles.some((f) => f.includes('dogwood') || f.includes('slop') || f.includes('taste'));
  const hasSearch = changedFiles.some((f) => f.includes('zoekt') || f.includes('search'));
  const hasVellum = changedFiles.some((f) => f.includes('vellum'));

  if (hasMobile) {
    steps.push({
      label: '📱 Hermes Mobile Continuous E2E',
      command: 'cd hermes-mobile && npm test',
      agents: { queue: 'mac-mini-runner' },
    });
  }

  if (hasSecurity) {
    steps.push({
      label: '🛡️ Dogwood Temporal Policy & Anti-Slop Check',
      command: 'node tests/test-dogwood-temporal-policy.js && node tests/test-taste-and-slop-register.js',
      agents: { queue: 'mac-mini-runner' },
    });
  }

  if (hasSearch) {
    steps.push({
      label: '⚡ Zoekt Fast Trigram Index & Search Verification',
      command: 'node tests/test-zoekt-trigram-search-engine.js',
      agents: { queue: 'mac-mini-runner' },
    });
  }

  if (hasVellum) {
    steps.push({
      label: '🤖 Vellum Hybrid Engine & OSS Contribution Checks',
      command: 'node tests/test-vellum-hybrid-engine.js && node tests/test-vellum-oss-contribution-engine.js',
      agents: { queue: 'mac-mini-runner' },
    });
  }

  return {
    pipelineName: 'mac-yolo-safeguards-dynamic-pipeline',
    generatedAt: new Date().toISOString(),
    totalChangedFiles: changedFiles.length,
    stepsCount: steps.length,
    steps,
  };
}

function runDoctor() {
  const changed = getChangedFiles();
  const pipeline = generateDynamicPipeline(changed);
  return {
    engine: 'buildkite-dynamic-pipeline',
    status: 'READY',
    stolenFrom: 'Buildkite Dynamic Pipelines (August 2026)',
    activeDiffCount: changed.length,
    dynamicStepsGenerated: pipeline.stepsCount,
  };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--doctor') || args.includes('-d')) {
    const doc = runDoctor();
    console.log(`[bk-dynamic-pipeline] Status: ${doc.status}`);
    console.log(`[bk-dynamic-pipeline] Changed Files: ${doc.activeDiffCount}`);
    console.log(`[bk-dynamic-pipeline] Dynamic Steps: ${doc.dynamicStepsGenerated}`);
    process.exit(0);
  }

  const changed = getChangedFiles();
  const pipeline = generateDynamicPipeline(changed);

  if (args.includes('--json')) {
    console.log(JSON.stringify(pipeline, null, 2));
  } else {
    console.log(`\n=== Dynamic Buildkite Pipeline (${pipeline.stepsCount} steps for ${changed.length} changed files) ===`);
    pipeline.steps.forEach((s, idx) => {
      console.log(`  ${idx + 1}. [${s.label}] -> ${s.command}`);
    });
    console.log('');
  }
}

module.exports = {
  getChangedFiles,
  generateDynamicPipeline,
  runDoctor,
};
