#!/usr/bin/env node
'use strict';

/**
 * Hosted browser ref-batch for thumbgate.app.
 *
 * New Stack 2026-08-21: Anthropic Browser Use does not run a browser.
 * The executor hosts it. Refs replace x,y pixels. Batches are ordered
 * fail-stop, including mid-batch approval.
 *
 * Complementary to PR #2037 (member/network/sanitize). Do not dual-edit.
 * Complementary to PR #2020 (SSRF). Do not dual-edit hosted-tool-approvals.
 *
 * We do not clone browser_toolset_20260801 (~6600 tokens / 27 ops).
 * Hosted Hermes is $10/mo fenced VPS chat, not Computer Use.
 */

const SCHEMA = 'hosted-browser-ref-batch/v1';
const COUNSEL_CLEARANCE = false;
const HOSTED_PRICE_USD = 10;
const DEFAULT_OPS = Object.freeze([
  'read_page',
  'left_click',
  'form_input',
  'type',
  'navigate',
  'scroll',
]);
const CONFIRM_OPS = Object.freeze(['javascript_exec', 'file_upload']);
const PRIVATE_HOST = /127\.0\.0\.1|localhost|0\.0\.0\.0|169\.254\.169\.254|10\.\d|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]/i;

function honesty() {
  return {
    schema: SCHEMA,
    anthropicRunsTheBrowser: false,
    weHostTheBrowser: true,
    clonedAnthropicToolset: false,
    notComputerUse: true,
    hostedHermesPriceUsd: HOSTED_PRICE_USD,
    counselClearance: COUNSEL_CLEARANCE,
    clonedContinuityPicker: false,
    protocol: 'executor-hosted',
  };
}

function deny(code, extra = {}) {
  return { ok: false, decision: 'deny', deny: code, ...honesty(), ...extra };
}

function confirm(code, extra = {}) {
  return { ok: false, decision: 'confirm', deny: code, ...honesty(), ...extra };
}

function allow(extra = {}) {
  return { ok: true, decision: 'allow', ...honesty(), ...extra };
}

function hasPixelTarget(action) {
  return (
    Number.isFinite(action.x) ||
    Number.isFinite(action.y) ||
    (action.coordinate && (Number.isFinite(action.coordinate.x) || Number.isFinite(action.coordinate.y)))
  );
}

function createExecutor() {
  let generation = 0;
  let snapshot = null;

  function readPage(action = {}) {
    generation += 1;
    const id = `snap_${generation}`;
    const refs = {};
    for (const [key, value] of Object.entries(action.refs || {})) {
      const rec = value && typeof value === 'object' ? value : { name: String(value) };
      refs[key] = { role: rec.role || 'button', name: rec.name || key, generation };
    }
    snapshot = {
      id,
      generation,
      url: action.url || snapshot?.url || 'about:blank',
      refs,
    };
    return allow({
      op: 'read_page',
      snapshotId: id,
      generation,
      refCount: Object.keys(refs).length,
    });
  }

  function act(action = {}) {
    const op = String(action.op || action.member || '')
      .trim()
      .toLowerCase();
    if (!op) return deny('missing_op');

    if (CONFIRM_OPS.includes(op)) {
      return confirm(`${op}_requires_approval`, {
        op,
        reason: 'JS and uploads stay off unless a person enables them (article + PR #2037).',
      });
    }

    if (hasPixelTarget(action)) {
      return deny('coords_not_refs', {
        op,
        reason: 'Use an accessibility ref (ref_3), not x,y pixels.',
      });
    }

    if (op === 'read_page') return readPage(action);

    if (op === 'navigate') {
      const url = String(action.url || '');
      if (!/^https?:\/\//i.test(url)) return deny('scheme_not_allowed', { op, url });
      if (PRIVATE_HOST.test(url)) {
        return deny('host_blocked', {
          op,
          url,
          note: 'Shallow fail-closed. Full SSRF is PR #2020.',
        });
      }
      generation += 1;
      snapshot = { id: `snap_${generation}`, generation, url, refs: {} };
      return allow({
        op: 'navigate',
        snapshotId: snapshot.id,
        generation,
        refsInvalidated: true,
      });
    }

    const elementOps = ['left_click', 'form_input', 'type', 'scroll'];
    if (elementOps.includes(op)) {
      const ref = action.ref;
      if (!ref) {
        return deny('coords_not_refs', {
          op,
          reason: 'Element actions need ref_N from read_page.',
        });
      }
      if (!snapshot) {
        return deny('stale_ref', {
          op,
          ref,
          requireReadPage: true,
          reason: 'No snapshot. Call read_page.',
        });
      }
      if (action.snapshotId && action.snapshotId !== snapshot.id) {
        return deny('stale_ref', {
          op,
          ref,
          requireReadPage: true,
          reason: 'Snapshot changed. Read the page again.',
        });
      }
      if (action.generation != null && Number(action.generation) !== snapshot.generation) {
        return deny('stale_ref', {
          op,
          ref,
          requireReadPage: true,
          reason: 'Generation mismatch. Read the page again.',
        });
      }
      if (!snapshot.refs[ref]) {
        return deny('stale_ref', {
          op,
          ref,
          requireReadPage: true,
          reason: 'Ref is not in the current accessibility tree.',
        });
      }
      return allow({ op, ref, snapshotId: snapshot.id, generation: snapshot.generation });
    }

    if (!DEFAULT_OPS.includes(op)) {
      return deny('optional_member_disabled', {
        op,
        reason: 'Subset toolset. Not Anthropic 27-op dump.',
      });
    }

    return allow({ op });
  }

  function runBatch(actions = []) {
    const executed = [];
    const skipped = [];
    let stopped = false;
    let stop = null;
    for (let i = 0; i < actions.length; i += 1) {
      const op = actions[i].op || actions[i].member;
      if (stopped) {
        skipped.push({ index: i, op, reason: 'batch_stopped' });
        continue;
      }
      const result = act(actions[i]);
      executed.push({ index: i, op, ...result });
      if (!result.ok || result.decision === 'confirm' || result.decision === 'deny') {
        stopped = true;
        stop = { index: i, op, deny: result.deny, decision: result.decision };
      }
    }
    return {
      ...honesty(),
      ok: !stopped,
      stopped,
      stop,
      executed,
      skipped,
      skippedCount: skipped.length,
    };
  }

  return {
    readPage,
    act,
    runBatch,
    honesty,
    snapshot: () => snapshot,
  };
}

function parseJsonFlag(raw) {
  if (raw == null || raw === '') return null;
  return JSON.parse(raw);
}

function main(argv = process.argv.slice(2)) {
  const args = { json: true, honestyOnly: false, batch: null, act: null, read: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--honesty') args.honestyOnly = true;
    else if (a === '--batch') args.batch = parseJsonFlag(argv[++i]);
    else if (a === '--act') args.act = parseJsonFlag(argv[++i]);
    else if (a === '--read-page') args.read = parseJsonFlag(argv[++i] || '{}');
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'hosted-browser-ref-batch — executor refs, not pixels; batch fail-stop\n' +
          '  --honesty --json\n' +
          '  --read-page JSON --json\n' +
          '  --act JSON --json\n' +
          '  --batch JSON --json\n',
      );
      return 0;
    }
  }

  if (args.honestyOnly) {
    process.stdout.write(`${JSON.stringify(honesty(), null, 2)}\n`);
    return 0;
  }

  const ex = createExecutor();
  let payload;
  if (args.read) payload = ex.readPage(args.read);
  else if (args.act) payload = ex.act(args.act);
  else if (args.batch) payload = ex.runBatch(args.batch);
  else payload = honesty();

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return payload.ok === false ? 2 : 0;
}

module.exports = {
  SCHEMA,
  COUNSEL_CLEARANCE,
  HOSTED_PRICE_USD,
  DEFAULT_OPS,
  CONFIRM_OPS,
  honesty,
  createExecutor,
  main,
};

if (require.main === module) process.exit(main());
