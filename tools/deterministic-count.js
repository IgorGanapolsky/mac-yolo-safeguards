#!/usr/bin/env node
'use strict';

/**
 * deterministic-count.js — Never trust LLM arithmetic for ship claims.
 *
 * Steals the operational lesson from arXiv:2410.19730 ("Counting Ability of
 * Large Language Models and Impact of Tokenization"): Transformers + BPE
 * tokenize poorly for inductive counting; CoT helps but code remains the
 * ground truth. Agents must count with this tool (or equivalent code), not
 * estimate from context.
 *
 * Usage:
 *   node tools/deterministic-count.js chars "hello"
 *   node tools/deterministic-count.js bytes --file path
 *   node tools/deterministic-count.js lines --file path
 *   node tools/deterministic-count.js words "a b  c"
 *   node tools/deterministic-count.js tokens-approx "text"   # whitespace/punct split (NOT BPE)
 *   node tools/deterministic-count.js set-size --json '[1,1,2]'
 *   node tools/deterministic-count.js claim-counts --claim "5 replies LIVE" --results-json f.json
 *   node tools/deterministic-count.js --self-test
 *
 * Exit 0 always for pure counts; claim-counts exits 1 on mismatch.
 */

const fs = require('fs');
const path = require('path');

function countChars(s) {
  return [...String(s)].length; // code points, not UTF-16 units
}

function countBytes(buf) {
  if (Buffer.isBuffer(buf)) return buf.length;
  return Buffer.byteLength(String(buf), 'utf8');
}

/** Line count matching common agent use: non-empty split; trailing newline does not add extra. */
function countLinesSimple(s) {
  const t = String(s);
  if (!t) return 0;
  return t.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line, i, arr) => {
    // keep all but drop final empty segment from trailing newline
    if (i === arr.length - 1 && line === '') return false;
    return true;
  }).length;
}

function countWords(s) {
  const m = String(s).trim().match(/\S+/g);
  return m ? m.length : 0;
}

/**
 * Approximate "tokens" for agent budgeting — NOT model BPE.
 * Explicitly labeled so agents cannot claim tokenizer parity.
 */
function countTokensApprox(s) {
  const t = String(s);
  if (!t) return 0;
  // Split on whitespace and common punctuation; keep alphanum runs
  const parts = t.match(/[A-Za-z0-9_]+|[\u0080-\uFFFF]+|[^\sA-Za-z0-9_]/g) || [];
  return parts.filter((p) => p.trim().length > 0).length;
}

function setSize(values) {
  return new Set(values.map((v) => JSON.stringify(v))).size;
}

function parseClaimIntegers(claim) {
  const text = String(claim || '');
  const out = [];
  const re =
    /\b(\d+)\s+(replies?|posts?|comments?|channels?|items?|alerts?|prs?|pull requests?|checks?|tests?|files?)\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ n: parseInt(m[1], 10), unit: m[2].toLowerCase(), index: m.index });
  }
  const all = /\b(all|every|both|entire)\b/i.test(text);
  return { numbers: out, universal: all };
}

function compareClaimToResults(claim, resultsSummary) {
  const parsed = parseClaimIntegers(claim);
  const blocks = [];
  const allows = [];
  if (!resultsSummary) {
    if (parsed.numbers.length || parsed.universal) {
      blocks.push(
        'Numeric/universal claim without deterministic results (pass --results-json). See arXiv:2410.19730 — do not LLM-count.',
      );
    }
    return { ok: blocks.length === 0, blocks, allows, parsed };
  }
  const okCount = Number(resultsSummary.okCount || 0);
  const total = Number(resultsSummary.total || 0);
  for (const { n, unit } of parsed.numbers) {
    if (n > okCount) {
      blocks.push(
        `Claimed ${n} ${unit} but deterministic okCount=${okCount} (total=${total})`,
      );
    } else {
      allows.push(`claimed ${n} ≤ okCount ${okCount}`);
    }
  }
  if (parsed.universal && resultsSummary.failCount > 0) {
    blocks.push(
      `Universal all/every with failCount=${resultsSummary.failCount} — not deterministically all green`,
    );
  }
  return { ok: blocks.length === 0, blocks, allows, parsed, okCount, total };
}

function selfTest() {
  const assert = require('assert');
  assert.strictEqual(countChars('hi'), 2);
  assert.strictEqual(countChars('👍'), 1); // one code point
  assert.strictEqual(countBytes('👍'), 4);
  assert.strictEqual(countWords('  a  b\tc '), 3);
  assert.ok(countTokensApprox('hello, world!') >= 3);
  assert.strictEqual(setSize([1, 1, 2, '2']), 3);
  const c = compareClaimToResults('5 replies LIVE', { okCount: 3, total: 5, failCount: 2 });
  assert.strictEqual(c.ok, false);
  const c2 = compareClaimToResults('2 replies LIVE', { okCount: 2, total: 2, failCount: 0 });
  assert.strictEqual(c2.ok, true);
  console.log('PASS deterministic-count self-test');
}

function parseArgs(argv) {
  const out = { cmd: null, text: '', file: null, jsonIn: null, claim: '', resultsJson: null, json: false, selfTest: false, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--json-in') out.jsonIn = argv[++i];
    else if (a === '--claim') out.claim = argv[++i];
    else if (a === '--results-json') out.resultsJson = argv[++i];
    else rest.push(a);
  }
  out.cmd = rest[0] || null;
  out.text = rest.slice(1).join(' ');
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`deterministic-count — code-grounded counting (arXiv:2410.19730)

Commands: chars|bytes|lines|words|tokens-approx|set-size|claim-counts
Never use model BPE for ship claims; tokens-approx is explicitly approximate.
`);
    process.exit(0);
  }
  if (args.selfTest) {
    selfTest();
    process.exit(0);
  }

  let text = args.text;
  if (args.file) {
    text = fs.readFileSync(path.resolve(args.file));
  }

  let report;
  switch (args.cmd) {
    case 'chars':
      report = { kind: 'chars', n: countChars(Buffer.isBuffer(text) ? text.toString('utf8') : text) };
      break;
    case 'bytes':
      report = { kind: 'bytes', n: countBytes(text) };
      break;
    case 'lines':
      report = {
        kind: 'lines',
        n: countLinesSimple(Buffer.isBuffer(text) ? text.toString('utf8') : text),
      };
      break;
    case 'words':
      report = {
        kind: 'words',
        n: countWords(Buffer.isBuffer(text) ? text.toString('utf8') : text),
      };
      break;
    case 'tokens-approx':
      report = {
        kind: 'tokens-approx',
        n: countTokensApprox(Buffer.isBuffer(text) ? text.toString('utf8') : text),
        disclaimer: 'Not model BPE — approximate agent budget only (arXiv:2410.19730)',
      };
      break;
    case 'set-size': {
      const raw = args.jsonIn
        ? fs.readFileSync(path.resolve(args.jsonIn), 'utf8')
        : args.text || '[]';
      const arr = JSON.parse(raw);
      report = { kind: 'set-size', n: setSize(Array.isArray(arr) ? arr : [arr]) };
      break;
    }
    case 'claim-counts': {
      let results = null;
      if (args.resultsJson) {
        const raw = JSON.parse(fs.readFileSync(path.resolve(args.resultsJson), 'utf8'));
        if (Array.isArray(raw)) {
          const ok = raw.filter((r) => r && (r.ok === true || r.status === 'LIVE' || r.status === 'ok'));
          results = {
            okCount: ok.length,
            total: raw.length,
            failCount: raw.length - ok.length,
          };
        } else {
          results = raw;
        }
      }
      report = compareClaimToResults(args.claim || args.text, results);
      if (args.json) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(report.ok ? 'PASS claim-counts' : 'FAIL claim-counts');
        for (const b of report.blocks || []) console.log('  BLOCK:', b);
        for (const a of report.allows || []) console.log('  OK:', a);
      }
      process.exit(report.ok ? 0 : 1);
      return;
    }
    default:
      console.error('Unknown command. Use --help');
      process.exit(2);
  }

  if (args.json) console.log(JSON.stringify(report));
  else console.log(`${report.kind}=${report.n}${report.disclaimer ? ` (${report.disclaimer})` : ''}`);
}

module.exports = {
  countChars,
  countBytes,
  countLinesSimple,
  countWords,
  countTokensApprox,
  setSize,
  parseClaimIntegers,
  compareClaimToResults,
};

if (require.main === module) main();
