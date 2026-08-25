#!/usr/bin/env node
'use strict';

/**
 * Hosted Academy 4D — Claude Academy process steal for thumbgate.app.
 * Source: https://academy.claude.com/ (AI Fluency 4D + Cowork)
 *
 * Steal: Description chain before hosted execute; five-lens discernment
 * (completed ≠ quality); Cowork whole-task needs workspace + context +
 * deliverable; diligence ship/fix/stop. Not Academy courses, not Claude
 * Cowork/Code/Tag, not a fluency SKU.
 * Do not dual-edit tools/ai-native-sdlc.js or PR #2052 prompt-distill.
 */

const fs = require('fs');

const SOURCE = 'Claude Academy AI Fluency 4D + Cowork (https://academy.claude.com/)';
const SCHEMA = 'hosted-academy-4d/v1';
const LENSES = ['correctness', 'quality', 'fit', 'experience', 'responsibility'];

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedAcademy: false,
    clonedCowork: false,
    clonedClaudeCode: false,
    dualEditAiNativeSdlc: false,
    dualEditPromptDistill: false,
    nextTokenIsNotSearch: true,
    completedIsNotQuality: true,
    workerLive: false,
    capturedRevenueUsd: 0,
    steal: [
      'Description chain: observable ACs + proof surface before hosted execute',
      'Discernment: five lenses; completed without proof is claimed_done',
      'Cowork handoff: workspace + context + deliverable for whole-task',
    ],
    skip: [
      'Claude Academy course text / badges',
      'Claude Cowork desktop / plugins',
      'Claude Code / Tag / Platform Console',
      'editing tools/ai-native-sdlc.js',
      'editing hosted-prompt-distill (PR #2052)',
      '$499 fluency SKU',
    ],
  };
}

function isChatKind(kind) {
  const k = String(kind || 'chat').toLowerCase();
  return k === 'chat' || k === 'ask' || k === 'summarize';
}

function admitDescriptionChain(input) {
  const kind = String((input && input.kind) || 'chat').toLowerCase();
  if (isChatKind(kind)) {
    return {
      ok: true,
      reason: 'chat_skip',
      descriptionRequired: false,
      liveClaim: false,
    };
  }
  const done = String((input && input.done) || '').trim();
  const acceptance = Array.isArray(input && input.acceptance) ? input.acceptance : [];
  if (!done) {
    return {
      ok: false,
      reason: 'description_missing',
      descriptionRequired: true,
      liveClaim: false,
      message:
        'Hosted execute needs one-sentence done plus 1–5 observable ACs before the VPS acts.',
    };
  }
  if (acceptance.length < 1 || acceptance.length > 5) {
    return {
      ok: false,
      reason: 'acceptance_count',
      descriptionRequired: true,
      liveClaim: false,
      message: 'Description chain needs 1–5 observable acceptance criteria.',
    };
  }
  for (const ac of acceptance) {
    const criterion = String((ac && ac.criterion) || '').trim();
    const proof = String((ac && (ac.proofSurface || ac.proof)) || '').trim();
    if (!criterion || !proof) {
      return {
        ok: false,
        reason: 'acceptance_incomplete',
        descriptionRequired: true,
        liveClaim: false,
        message: 'Each AC needs an observable criterion and a named proof surface.',
      };
    }
  }
  return {
    ok: true,
    reason: 'ok',
    descriptionRequired: true,
    liveClaim: false,
    done,
    acceptanceCount: acceptance.length,
  };
}

const EXECUTE_KINDS = new Set(['execute', 'run', 'agent', 'task']);

function admitHostedTaskDescription(input) {
  const raw = String((input && input.kind) || 'chat').toLowerCase();
  const kind = EXECUTE_KINDS.has(raw) ? 'execute' : raw;
  return admitDescriptionChain({
    kind,
    done: input && input.done,
    acceptance: input && input.acceptance,
  });
}

function requireCoworkHandoff(input) {
  const workspace = String((input && input.workspace) || '').trim();
  const context = String((input && input.context) || '').trim();
  const deliverable = String((input && input.deliverable) || '').trim();
  const missing = [];
  if (!workspace) missing.push('workspace');
  if (!context) missing.push('context');
  if (!deliverable) missing.push('deliverable');
  if (missing.length) {
    return {
      ok: false,
      reason: 'cowork_incomplete',
      missing,
      liveClaim: false,
      message: 'Whole-task hosted handoff needs workspace, context, and deliverable.',
    };
  }
  return {
    ok: true,
    reason: 'ok',
    liveClaim: false,
    workspace,
    context,
    deliverable,
  };
}

function gradeDiscernment(input) {
  const lensesIn = (input && input.lenses) || {};
  const lenses = {};
  const unsupported = [];
  for (const name of LENSES) {
    const v = String(lensesIn[name] || 'unknown');
    lenses[name] = v;
    if (v !== 'supported') unsupported.push(name);
  }
  const externalCheckPassed = Boolean(input && input.externalCheckPassed);
  const status = String((input && input.status) || '');
  const failed = status === 'failed' || status === 'claimed_failed';
  const completed = status === 'completed' || status === 'done';

  let diligenceCall = 'fix';
  if (lenses.responsibility === 'unsupported') diligenceCall = 'stop';
  else if (failed) diligenceCall = 'fix';
  else if (completed && unsupported.length === 0 && externalCheckPassed) diligenceCall = 'ship';

  const liveClaim = diligenceCall === 'ship';
  let outcome = 'open';
  if (failed) outcome = 'open';
  else if (liveClaim) outcome = 'done';
  else if (completed || status === 'claimed_done') outcome = 'claimed_done';
  return {
    ok: true,
    completedIsNotQuality: true,
    lenses,
    unsupported,
    externalCheckPassed,
    diligenceCall,
    liveClaim,
    quality: liveClaim ? 'supported' : 'claimed_only',
    outcome,
  };
}

function attachAcademyDiscernment(receiptLike) {
  const outcome = String((receiptLike && receiptLike.outcome) || '');
  const externalCheckPassed = Boolean(
    receiptLike && receiptLike.externalCheck && receiptLike.externalCheck.passed === true,
  );
  return gradeDiscernment({
    status: outcome,
    externalCheckPassed,
    lenses: receiptLike && receiptLike.lenses,
  });
}

function demoTask() {
  return {
    kind: 'execute',
    done: 'Hosted 4D gate refuses whole-task handoff without workspace/context/deliverable.',
    acceptance: [
      {
        criterion: 'CLI without args returns UNAVAILABLE liveClaim false',
        proofSurface: 'node tests/test-hosted-academy-4d.js',
      },
      {
        criterion: 'Cowork missing workspace is denied',
        proofSurface: 'vitest hosted-academy-4d.test.ts',
      },
    ],
    cowork: {
      workspace: 'hosted-vps',
      context: 'thumbgate.app $10 fenced VPS; do not clone Academy',
      deliverable: 'PR with tests proving description/discernment/cowork gates',
    },
    lenses: {
      correctness: 'supported',
      quality: 'supported',
      fit: 'supported',
      experience: 'supported',
      responsibility: 'supported',
    },
    externalCheckPassed: true,
    status: 'completed',
  };
}

function evaluateTask(task) {
  const t = task && typeof task === 'object' ? task : {};
  const description = admitDescriptionChain(t);
  const coworkInput =
    t.cowork ||
    (String(t.kind).toLowerCase() === 'handoff'
      ? t
      : { workspace: t.workspace, context: t.context, deliverable: t.deliverable });
  const cowork = requireCoworkHandoff(coworkInput);
  const discernment = gradeDiscernment(t);
  const kind = String(t.kind || 'chat').toLowerCase();
  const coworkRequired = kind === 'handoff' || Boolean(t.wholeTask);
  const admitted = description.ok && (!coworkRequired || cowork.ok);
  return {
    ...honesty(),
    status: admitted ? 'SUCCESS' : 'DENIED',
    liveClaim: admitted ? discernment.liveClaim : false,
    description,
    cowork,
    discernment,
    diligenceCall: discernment.diligenceCall,
  };
}

function parseArgs(argv) {
  const out = { json: false, demo: false, taskFile: null };
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === '--json') out.json = true;
    else if (list[i] === '--demo') out.demo = true;
    else if (list[i] === '--task' && list[i + 1]) {
      out.taskFile = list[i + 1];
      i += 1;
    }
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  const write = (obj) => {
    process.stdout.write(`${JSON.stringify(obj)}\n`);
  };
  if (!args.demo && !args.taskFile) {
    write({
      ...honesty(),
      status: 'UNAVAILABLE',
      liveClaim: false,
      message: 'pass --demo or --task FILE.json',
    });
    return 1;
  }
  let task;
  if (args.taskFile) {
    try {
      task = JSON.parse(fs.readFileSync(args.taskFile, 'utf8'));
    } catch (err) {
      write({
        ...honesty(),
        status: 'UNAVAILABLE',
        liveClaim: false,
        message: `cannot read task file: ${err && err.message ? err.message : err}`,
      });
      return 1;
    }
  } else {
    task = demoTask();
  }
  const report = evaluateTask(task);
  write(report);
  return report.status === 'SUCCESS' ? 0 : 2;
}

module.exports = {
  SCHEMA,
  LENSES,
  honesty,
  admitDescriptionChain,
  admitHostedTaskDescription,
  requireCoworkHandoff,
  gradeDiscernment,
  attachAcademyDiscernment,
  evaluateTask,
  demoTask,
  main,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
