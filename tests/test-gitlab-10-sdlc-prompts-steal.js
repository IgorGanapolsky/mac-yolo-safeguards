#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  SDLC_10_PROMPTS,
  renderSdlcPrompt,
  detectBreakingChangesInDiff,
  compileReleaseNotesFromCommits,
  detectDocDriftFromChangedFiles,
  diagnosePipelineFailure,
  runAllGitlabSdlcChecks,
} = require('../tools/gitlab-10-sdlc-prompts-steal');
const { callTool } = require('../tools/mac-yolo-mcp-server');

function main() {
  // 1. All 10 GitLab SDLC prompts registered across all lifecycle stages
  assert.strictEqual(SDLC_10_PROMPTS.length, 10);
  const ids = SDLC_10_PROMPTS.map((p) => p.id);
  assert.ok(ids.includes('review_mr_logical_errors'));
  assert.ok(ids.includes('identify_breaking_changes'));
  assert.ok(ids.includes('analyze_security_scan_results'));
  assert.ok(ids.includes('review_code_security_issues'));
  assert.ok(ids.includes('generate_release_notes'));
  assert.ok(ids.includes('update_docs_after_code_changes'));
  assert.ok(ids.includes('break_down_epic_into_issues'));
  assert.ok(ids.includes('generate_unit_tests'));
  assert.ok(ids.includes('review_test_coverage_gaps'));
  assert.ok(ids.includes('debug_failing_pipeline'));

  // 2. Prompt rendering
  const rendered = renderSdlcPrompt('debug_failing_pipeline', {
    job: 'verify',
    stage: 'test',
    error: 'exit code 1',
  });
  assert.ok(rendered.rendered.includes('Job: verify'));
  assert.ok(rendered.rendered.includes('Error: exit code 1'));

  // 3. Breaking change detector (Prompt #2)
  const breaking = detectBreakingChangesInDiff(
    '-export function oldPublicFn(a) {}\n+export function newPublicFn(a, b) {}\nALTER TABLE users DROP COLUMN email;',
  );
  assert.strictEqual(breaking.breaking, true);
  assert.strictEqual(breaking.findingCount, 2);

  // 4. Release notes compiler (Prompt #5)
  const notes = compileReleaseNotesFromCommits([
    'feat(mcp): add mac-yolo-mcp server',
    'fix(hud): update On screen now on window switch',
    'perf(schema): reduce tokens by 94.5%',
    'feat(api)!: drop v0 endpoint',
    'deprecate(semrush): retire unauthenticated semrush entry',
  ]);
  assert.strictEqual(notes.groups.newFeatures.length, 1);
  assert.strictEqual(notes.groups.bugFixes.length, 1);
  assert.strictEqual(notes.groups.performanceImprovements.length, 1);
  assert.strictEqual(notes.groups.breakingChanges.length, 1);
  assert.strictEqual(notes.groups.deprecations.length, 1);

  // 5. Documentation drift detector (Prompt #6)
  const drift = detectDocDriftFromChangedFiles([
    '.mcp.json',
    'apps/hermes-control-plane/db/schema.ts',
    'macos/MacYoloSafeguardsApp.swift',
  ]);
  assert.strictEqual(drift.docsToUpdate.length, 3);

  // 6. Pipeline failure RCA (Prompt #10) + MCP integration
  const rca = diagnosePipelineFailure({
    job: 'verify',
    stage: 'security',
    error: 'FAIL: production high/critical advisories: critical next',
  });
  assert.strictEqual(rca.ok, true);
  assert.ok(rca.suggestedFix.includes('next'));

  const mcpOut = callTool('yolo_sdlc_10_prompts', {});
  assert.strictEqual(mcpOut.ok, true);
  assert.strictEqual(mcpOut.promptsCount, 10);

  const all = runAllGitlabSdlcChecks();
  assert.strictEqual(all.ok, true);

  console.log('test-gitlab-10-sdlc-prompts-steal: PASS (all 10 SDLC prompts & executors verified)');
}

main();
