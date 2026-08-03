#!/usr/bin/env node
'use strict';

/**
 * ship-claim-gate.js — Leading harness gate for LIVE / shipped / done language.
 *
 * Humans ON the loop: agents must pass this before claiming completion.
 * Encodes failure classes from 2026-08 Reddit overclaim + 2026-07 OTA unit-green.
 *
 * Usage:
 *   node tools/ship-claim-gate.js --claim "5 replies LIVE on r/hermesagent" \
 *     --results-json /tmp/reddit-hermesagent/results.json [--json]
 *   node tools/ship-claim-gate.js --claim "works on device" --device [--json]
 *   node tools/ship-claim-gate.js --claim "shipped to production" --require-sha abc123 [--json]
 *   node tools/ship-claim-gate.js --self-test
 *
 * Exit: 0 ALLOW · 1 BLOCK · 2 usage
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_E2E = path.join(ROOT, 'hermes-mobile/docs/proofs/continuous/latest.json');

const LIVE_WORDS =
  /\b(live|published|posted|shipped|done|merged|fixed|works\s+on\s+device|all\s+green|fan-?out\s+(is\s+)?(complete|done|shipping))\b/i;
const COUNT_ALL =
  /\b(all|every|entire)\s+(\d+\s+)?(replies?|posts?|comments?|channels?|items?)\b/i;
const COUNT_N =
  /\b(\d+)\s+(replies?|posts?|comments?|channels?)\s+(are\s+)?(live|published|posted|done)\b/i;
const DEVICE_CLAIM =
  /\b(works?\s+on\s+(device|phone)|device\s+verified|e2e\s*=?\s*pass|production\s+ota)\b/i;
const SHIP_CLAIM = /\b(shipped|merged\s+to\s+main|production\s+ready|released)\b/i;

function parseArgs(argv) {
  const out = {
    claim: '',
    resultsJson: null,
    matrixFile: null,
    device: false,
    e2ePath: DEFAULT_E2E,
    requireSha: null,
    requireUrl: null,
    json: false,
    selfTest: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--device') out.device = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--claim') out.claim = String(argv[++i] || '');
    else if (a === '--claim-file') {
      const p = argv[++i];
      out.claim = fs.readFileSync(p, 'utf8');
    } else if (a === '--results-json') out.resultsJson = argv[++i];
    else if (a === '--matrix-file') out.matrixFile = argv[++i];
    else if (a === '--e2e-path') out.e2ePath = path.resolve(argv[++i] || '');
    else if (a === '--require-sha') out.requireSha = String(argv[++i] || '').trim();
    else if (a === '--require-url') out.requireUrl = String(argv[++i] || '').trim();
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Normalize engine-style results: array of { ok, comment_id, permalink, error, id }
 */
function summarizeResults(raw) {
  if (!raw) return null;
  const rows = Array.isArray(raw) ? raw : raw.results || raw.items || [];
  if (!Array.isArray(rows)) return null;
  const ok = [];
  const fail = [];
  const other = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') {
      other.push(r);
      continue;
    }
    if (r.ok === true || r.status === 'LIVE' || r.status === 'ok') ok.push(r);
    else if (r.ok === false || r.error || r.status === 'FAIL' || r.status === 'BLOCKED') fail.push(r);
    else other.push(r);
  }
  return {
    total: rows.length,
    okCount: ok.length,
    failCount: fail.length,
    otherCount: other.length,
    okIds: ok.map((r) => r.comment_id || r.permalink || r.id || r.identifier).filter(Boolean),
    failIds: fail.map((r) => r.id || r.identifier || 'unknown'),
  };
}

function loadDeviceE2e(e2ePath) {
  const j = readJson(e2ePath) || {};
  return {
    e2e: j.e2e || 'missing',
    unit: j.unit || 'missing',
    pass: j.e2e === 'pass',
    path: e2ePath,
    updatedAt: j.updatedAt || null,
  };
}

/**
 * Parse a simple markdown status matrix:
 * | post | status | proof |
 * | x | LIVE | t1_abc |
 */
function parseMatrixFile(file) {
  if (!file || !fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.includes('|'));
  const rows = [];
  for (const line of lines) {
    if (/^\s*\|?\s*-+/.test(line)) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));
    if (cells.length < 2) continue;
    if (/^post$/i.test(cells[0]) || /^id$/i.test(cells[0])) continue;
    const status = (cells[1] || '').toUpperCase();
    rows.push({
      id: cells[0],
      status,
      proof: cells[2] || '',
    });
  }
  return rows;
}

function matrixSummary(rows) {
  if (!rows) return null;
  const live = rows.filter((r) => /^(LIVE|PUBLISHED|OK|DONE)$/i.test(r.status));
  const fail = rows.filter((r) => /^(FAIL|BLOCKED|ERROR|PENDING|DRAFT)$/i.test(r.status));
  const liveWithoutProof = live.filter((r) => !String(r.proof || '').trim());
  return {
    total: rows.length,
    liveCount: live.length,
    failCount: fail.length,
    liveWithoutProof: liveWithoutProof.map((r) => r.id),
  };
}

/**
 * Core evaluator — pure enough for unit tests.
 */
function evaluateShipClaim(input) {
  const claim = String(input.claim || '').trim();
  const blocks = [];
  const allows = [];
  const warnings = [];

  if (!claim) {
    return {
      ok: false,
      code: 'NO_CLAIM',
      blocks: ['--claim or --claim-file required'],
      allows: [],
      warnings: [],
      summary: null,
    };
  }

  const hasLiveLanguage = LIVE_WORDS.test(claim);
  const results = input.resultsSummary || null;
  const matrix = input.matrixSummary || null;
  const device = input.device || null;
  const requireSha = input.requireSha || null;
  const requireUrl = input.requireUrl || null;

  // --- Device / phone ship claims ---
  if (input.checkDevice || DEVICE_CLAIM.test(claim)) {
    if (!device) {
      blocks.push('Device/phone claim requires continuous e2e evidence (pass --device)');
    } else if (!device.pass) {
      blocks.push(
        `Device claim BLOCKED: e2e=${device.e2e} (need pass) at ${device.path}`,
      );
    } else {
      allows.push(`device e2e=pass (${device.updatedAt || 'ok'})`);
    }
  }

  // --- Results.json fan-out ---
  if (results) {
    const mAll = claim.match(COUNT_ALL);
    const mN = claim.match(COUNT_N);
    const universal =
      /\b(all|every|both|entire)\b/i.test(claim) ||
      /\ball\b.*\blive\b/i.test(claim) ||
      /\blive\b.*\ball\b/i.test(claim);
    let claimedLive = null;
    if (mN) claimedLive = parseInt(mN[1], 10);
    if (mAll || universal) {
      claimedLive = /\bboth\b/i.test(claim) ? Math.min(2, results.total) : results.total;
    }
    if (claimedLive != null && claimedLive > results.okCount) {
      blocks.push(
        `Claimed ${claimedLive} LIVE but results only have okCount=${results.okCount} (fail=${results.failCount}, total=${results.total})`,
      );
    }
    if (
      hasLiveLanguage &&
      results.okCount === 0 &&
      (results.failCount > 0 || results.total > 0)
    ) {
      blocks.push(
        `LIVE language with zero ok:true rows (fail=${results.failCount}, total=${results.total})`,
      );
    }
    if (results.okCount > 0 && results.failCount > 0) {
      if (universal && hasLiveLanguage) {
        blocks.push(
          `Partial success only: ok=${results.okCount} fail=${results.failCount} — cannot claim all/both LIVE`,
        );
      } else {
        warnings.push(
          `Partial fan-out: ok=${results.okCount} fail=${results.failCount} — report matrix, not victory`,
        );
      }
    }
    if (results.okCount > 0 && !blocks.length) {
      allows.push(
        `results ok=${results.okCount}/${results.total} ids=${results.okIds.slice(0, 5).join(',')}`,
      );
    }
  } else if (
    hasLiveLanguage &&
    (COUNT_ALL.test(claim) || COUNT_N.test(claim) || /\bfan-?out\b/i.test(claim))
  ) {
    blocks.push(
      'Multi-item LIVE/fan-out claim requires --results-json or --matrix-file with proof rows',
    );
  }

  // --- Matrix ---
  if (matrix) {
    if (matrix.liveWithoutProof.length) {
      blocks.push(
        `LIVE rows without proof column: ${matrix.liveWithoutProof.join(', ')}`,
      );
    }
    if (/\ball\b/i.test(claim) && matrix.failCount > 0) {
      blocks.push(
        `Matrix has fail/pending=${matrix.failCount}; cannot claim all LIVE (live=${matrix.liveCount})`,
      );
    }
    if (matrix.liveCount > 0 && !matrix.liveWithoutProof.length) {
      allows.push(`matrix live=${matrix.liveCount} with proofs`);
    }
  }

  // --- SHA / URL requirements ---
  if (requireSha) {
    if (!claim.includes(requireSha) && !input.claimMentionsSha) {
      // requireSha is external proof; presence is enough
      allows.push(`sha provided ${requireSha.slice(0, 12)}`);
    } else {
      allows.push(`sha ${requireSha.slice(0, 12)}`);
    }
  } else if (SHIP_CLAIM.test(claim) && !results && !matrix && !device?.pass) {
    warnings.push(
      'Ship/merged language without --require-sha, --device, --results-json, or matrix — weak proof',
    );
  }

  if (requireUrl) {
    if (!/^https?:\/\//i.test(requireUrl)) {
      blocks.push(`--require-url must be http(s): ${requireUrl}`);
    } else {
      allows.push(`url ${requireUrl}`);
    }
  }

  // --- Bare completion theater ---
  if (
    hasLiveLanguage &&
    !results &&
    !matrix &&
    !device?.pass &&
    !requireSha &&
    !requireUrl &&
    !blocks.length
  ) {
    blocks.push(
      'Completion language without evidence. Pass --results-json, --matrix-file, --device, --require-sha, and/or --require-url',
    );
  }

  const ok = blocks.length === 0;
  return {
    ok,
    code: ok ? 'ALLOW' : 'BLOCK',
    blocks,
    allows,
    warnings,
    summary: {
      hasLiveLanguage,
      results,
      matrix,
      device: device
        ? { e2e: device.e2e, pass: device.pass, updatedAt: device.updatedAt }
        : null,
    },
  };
}

function runSelfTests() {
  let failed = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else {
      console.error(`FAIL ${name}`);
      failed += 1;
    }
  };

  const over = evaluateShipClaim({
    claim: 'All 5 replies are LIVE on r/hermesagent',
    resultsSummary: {
      total: 4,
      okCount: 1,
      failCount: 3,
      otherCount: 0,
      okIds: ['t1_p1ccuu5'],
      failIds: ['a', 'b', 'c'],
    },
  });
  check('blocks all-live when partial', !over.ok && over.blocks.length >= 1);

  const honest = evaluateShipClaim({
    claim: '1 LIVE (t1_p1ccuu5); 3 rate-limited FAIL',
    resultsSummary: {
      total: 4,
      okCount: 1,
      failCount: 3,
      otherCount: 0,
      okIds: ['t1_p1ccuu5'],
      failIds: ['a', 'b', 'c'],
    },
  });
  check('allows honest partial matrix language', honest.ok);

  const bare = evaluateShipClaim({ claim: 'Everything is LIVE and shipped' });
  check('blocks bare LIVE', !bare.ok);

  const devFail = evaluateShipClaim({
    claim: 'works on device',
    checkDevice: true,
    device: { e2e: 'fail', pass: false, path: '/x' },
  });
  check('blocks device without e2e', !devFail.ok);

  const devOk = evaluateShipClaim({
    claim: 'works on device',
    checkDevice: true,
    device: { e2e: 'pass', pass: true, path: '/x', updatedAt: 't' },
  });
  check('allows device with e2e pass', devOk.ok);

  const matrixBad = evaluateShipClaim({
    claim: 'all posts LIVE',
    matrixSummary: {
      total: 2,
      liveCount: 1,
      failCount: 1,
      liveWithoutProof: [],
    },
  });
  check('blocks all-live with matrix fails', !matrixBad.ok);

  const matrixNoProof = evaluateShipClaim({
    claim: 'post LIVE',
    matrixSummary: {
      total: 1,
      liveCount: 1,
      failCount: 0,
      liveWithoutProof: ['1uq5aqg'],
    },
  });
  check('blocks LIVE without proof cell', !matrixNoProof.ok);

  process.exitCode = failed ? 1 : 0;
  if (!failed) console.log('ship-claim-gate self-test: all passed');
  return failed === 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`ship-claim-gate — block completion theater without evidence

Usage:
  node tools/ship-claim-gate.js --claim "..." [evidence flags] [--json]
  node tools/ship-claim-gate.js --self-test

Evidence flags:
  --results-json PATH   engine fan-out [{ok,comment_id,...}]
  --matrix-file PATH    markdown table | id | status | proof |
  --device              require continuous e2e=pass
  --e2e-path PATH       override latest.json
  --require-sha SHA     ship/merge proof
  --require-url URL     public LIVE permalink

Exit 0 ALLOW · 1 BLOCK · 2 usage`);
    process.exit(0);
  }

  if (args.selfTest) {
    runSelfTests();
    return;
  }

  if (!args.claim) {
    console.error('Error: --claim or --claim-file required (or --self-test)');
    process.exit(2);
  }

  let resultsSummary = null;
  if (args.resultsJson) {
    const raw = readJson(args.resultsJson);
    if (!raw) {
      console.error(`Error: cannot parse --results-json ${args.resultsJson}`);
      process.exit(2);
    }
    resultsSummary = summarizeResults(raw);
  }

  let matrixSum = null;
  if (args.matrixFile) {
    const rows = parseMatrixFile(args.matrixFile);
    if (!rows) {
      console.error(`Error: cannot parse --matrix-file ${args.matrixFile}`);
      process.exit(2);
    }
    matrixSum = matrixSummary(rows);
  }

  const device = args.device || DEVICE_CLAIM.test(args.claim) ? loadDeviceE2e(args.e2ePath) : null;

  const result = evaluateShipClaim({
    claim: args.claim,
    resultsSummary,
    matrixSummary: matrixSum,
    device,
    checkDevice: args.device || DEVICE_CLAIM.test(args.claim),
    requireSha: args.requireSha,
    requireUrl: args.requireUrl,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`ship-claim-gate: ${result.code}`);
    for (const b of result.blocks) console.log(`  BLOCK: ${b}`);
    for (const w of result.warnings) console.log(`  WARN:  ${w}`);
    for (const a of result.allows) console.log(`  OK:    ${a}`);
  }

  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  evaluateShipClaim,
  summarizeResults,
  parseMatrixFile,
  matrixSummary,
  loadDeviceE2e,
  parseArgs,
  LIVE_WORDS,
};

if (require.main === module) {
  main();
}
