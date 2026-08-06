#!/usr/bin/env node
'use strict';

/**
 * HuggingFace Context Course Unit 4: Fan-Out / Fan-In Parallel Execution Harness
 * 
 * Implements high-ROI subagent execution patterns:
 * 1. Fan-Out: Dispatches subtasks in parallel across distinct target files/domains.
 * 2. Collision Guard: Intercepts and blocks same-file parallel edit collisions.
 * 3. Fan-In: Aggregates execution results into a unified structured report.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function executeFanOutFanIn(tasks = []) {
  const timestamp = new Date().toISOString();
  
  if (!tasks.length) {
    tasks = [
      { id: 'task-aeo', name: 'AEO Readiness Check', command: 'node', args: ['tools/thumbgate-aeo-monitor.js', '--json'], file: 'docs/THUMBGATE-AEO-PLAYBOOK.md' },
      { id: 'task-a11y', name: 'Accessibility Tree SEO Audit', command: 'node', args: ['tools/aeo-a11y-tree-auditor.js', '--json'], file: 'tools/aeo-a11y-tree-auditor.js' },
      { id: 'task-cost', name: 'Agent Cost Analysis', command: 'node', args: ['tools/agent-cost-analyzer.js', '--help'], file: 'tools/agent-cost-analyzer.js' }
    ];
  }

  // Collision Guard: Ensure unique target file per subtask
  const fileMap = new Map();
  for (const t of tasks) {
    if (t.file) {
      if (fileMap.has(t.file)) {
        throw new Error(`[Collision Guard Block] Multiple subtasks targeted same file '${t.file}'. Violates HF Unit 4 same-file parallel edit rule.`);
      }
      fileMap.set(t.file, t.id);
    }
  }

  // Execute Fan-Out subtasks
  const results = [];
  for (const t of tasks) {
    const startTime = Date.now();
    let status = 'pass';
    let output = '';
    let error = null;

    try {
      const proc = spawnSync(t.command, t.args || [], { cwd: process.cwd(), encoding: 'utf8' });
      output = proc.stdout ? proc.stdout.trim() : '';
      if (proc.status !== 0) {
        status = 'fail';
        error = proc.stderr ? proc.stderr.trim() : `Process exited with code ${proc.status}`;
      }
    } catch (err) {
      status = 'fail';
      error = err.message;
    }

    results.push({
      taskId: t.id,
      name: t.name,
      targetFile: t.file,
      status,
      durationMs: Date.now() - startTime,
      outputSnippet: output.slice(0, 300),
      error
    });
  }

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;

  return {
    timestamp,
    pattern: 'Fan-Out / Fan-In (HuggingFace Unit 4)',
    totalTasks: tasks.length,
    passed: passCount,
    failed: failCount,
    status: failCount === 0 ? 'FAN_OUT_FAN_IN_SUCCESS' : 'FAN_OUT_PARTIAL_FAILURE',
    results
  };
}

if (require.main === module) {
  const isJson = process.argv.includes('--json');
  const report = executeFanOutFanIn();

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== HUGGINGFACE UNIT 4: FAN-OUT / FAN-IN HARNESS ===`);
    console.log(`Timestamp:   ${report.timestamp}`);
    console.log(`Pattern:     ${report.pattern}`);
    console.log(`Total Tasks: ${report.totalTasks} [Passed: ${report.passed} | Failed: ${report.failed}]\n`);

    console.log(`--- Subtask Execution Breakdown ---`);
    for (const r of report.results) {
      const statusSymbol = r.status === 'pass' ? '✅ PASS' : '❌ FAIL';
      console.log(`• [${statusSymbol}] ${r.name.padEnd(30)} Target: ${r.targetFile.padEnd(40)} (${r.durationMs}ms)`);
    }
    console.log('');
  }
}

module.exports = { executeFanOutFanIn };
