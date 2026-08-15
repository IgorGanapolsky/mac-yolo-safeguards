'use strict';

/**
 * Drop-in hook for hermes-yolo / seed-yolo / ali-yolo / grok-yolo wrappers.
 * Wrappers may require this file; lean-context also discovers the skill
 * once installFleet() links it into agent homes.
 */

const path = require('path');
const { runOptimizedSearch, printSacFleetBrief, runDoctor } = require('../sac-fleet');

const RESEARCH_RE =
  /\b(search|research|lookup|find all|wide research|wandr|cite|sources?|who|what is|compare|benchmark)\b/i;

function shouldUseSac(taskText) {
  return RESEARCH_RE.test(String(taskText || ''));
}

async function runSacForTask(taskText, options = {}) {
  if (!shouldUseSac(taskText) && !options.force) {
    return { used: false, reason: 'task_not_research' };
  }
  const result = await runOptimizedSearch(String(taskText || ''), {
    offline: options.offline !== false,
    fanout: true,
    rerank: true,
    compact: true,
    repoRoot: options.repoRoot,
  });
  return {
    used: true,
    compactMarkdown: result.compact.markdown,
    cost: result.cost,
    hits: result.hits.length,
  };
}

function skillHint() {
  return {
    name: 'search-as-code-fleet',
    path: path.join(__dirname, '..', '..', '.agents', 'skills', 'search-as-code-fleet', 'SKILL.md'),
    rule: 'Never serial-dump search hits into context. Generate a SaC program: fanout → filter → dedupe → rerank → compact.',
  };
}

module.exports = {
  shouldUseSac,
  runSacForTask,
  skillHint,
  printSacFleetBrief,
  runDoctor,
};
