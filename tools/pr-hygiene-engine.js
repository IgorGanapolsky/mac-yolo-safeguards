#!/usr/bin/env node
'use strict';

/**
 * pr-hygiene-engine.js
 *
 * Automated Multi-Agent PR Queue Classifier, Health Auditor, and Triage Engine.
 * Follows AGENTS.md PR hygiene session pattern (2026-08-17).
 *
 * Classifies PRs into:
 *  - MERGEABLE: Clean branches passing required checks ready for squash auto-merge.
 *  - CONFLICTING: Branches with merge conflicts against main (needs rebase).
 *  - DRAFT_LOGS: Superseded automated draft runs (content/OSS logs).
 *  - DEPENDABOT: Automated dependency updates.
 */

const { execSync } = require('child_process');

function fetchOpenPrs() {
  try {
    const raw = execSync(
      'gh pr list --json number,title,isDraft,mergeable,mergeStateStatus,headRefName,author,createdAt,updatedAt --limit 60',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function classifyPrs(prs = []) {
  const result = {
    total: prs.length,
    mergeable: [],
    conflicting: [],
    draftLogs: [],
    dependabot: [],
    activeInFlight: [],
  };

  for (const pr of prs) {
    const title = pr.title.toLowerCase();
    const branch = pr.headRefName || '';

    if (pr.author?.login === 'app/dependabot' || branch.startsWith('dependabot/')) {
      result.dependabot.push(pr);
    } else if (pr.isDraft || title.startsWith('content:') || title.startsWith('docs(oss-engagement):') || title.startsWith('docs(buzz):')) {
      result.draftLogs.push(pr);
    } else if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
      result.conflicting.push(pr);
    } else if (pr.mergeable === 'MERGEABLE' && (pr.mergeStateStatus === 'CLEAN' || pr.mergeStateStatus === 'UNSTABLE')) {
      result.mergeable.push(pr);
    } else {
      result.activeInFlight.push(pr);
    }
  }

  return result;
}

function generateTriagePlan(classification) {
  const actions = [];

  if (classification.mergeable.length > 0) {
    actions.push({
      phase: '1_AUTO_MERGE_GREEN',
      description: `Squash-merge ${classification.mergeable.length} clean PRs passing required checks.`,
      prNumbers: classification.mergeable.map(p => p.number),
    });
  }

  if (classification.draftLogs.length > 0) {
    actions.push({
      phase: '2_RETIRE_SUPERSEDED_DRAFTS',
      description: `Archive/close ${classification.draftLogs.length} superseded draft content and OSS logs.`,
      prNumbers: classification.draftLogs.map(p => p.number),
    });
  }

  if (classification.conflicting.length > 0) {
    actions.push({
      phase: '3_SEQUENTIAL_REBASE',
      description: `Schedule sequential rebase for ${classification.conflicting.length} conflicting feature branches.`,
      prNumbers: classification.conflicting.map(p => p.number),
    });
  }

  return actions;
}

module.exports = {
  fetchOpenPrs,
  classifyPrs,
  generateTriagePlan,
};

if (require.main === module) {
  const prs = fetchOpenPrs();
  const classified = classifyPrs(prs);
  const plan = generateTriagePlan(classified);

  console.log(`\n=== PR HYGIENE AUDIT REPORT ===`);
  console.log(`Total Open PRs: ${classified.total}`);
  console.log(`- Mergeable Candidates: ${classified.mergeable.length}`);
  console.log(`- Conflicting (Needs Rebase): ${classified.conflicting.length}`);
  console.log(`- Draft Content & OSS Logs: ${classified.draftLogs.length}`);
  console.log(`- Dependabot Updates: ${classified.dependabot.length}`);
  console.log(`- Active In-Flight: ${classified.activeInFlight.length}`);
  console.log(`\nRecommended Action Plan:`, JSON.stringify(plan, null, 2));
}
