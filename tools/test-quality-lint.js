#!/usr/bin/env node
'use strict';
/*
 * test-quality-lint.js — flag the two "flawed test" failure modes that
 * SWE-Bench ProMax (arXiv 2608.09802) found in ~60% of unsolved SWE-bench
 * Verified instances, and that have bitten THIS repo repeatedly:
 *
 *   1. OPT-OUT assertion  — an assertion guarded by `if (cond) { ...assert }`
 *      with no failing branch, so it silently PASSES when cond is false
 *      (false green). Also literal no-op assertions (`assert.ok(true)`,
 *      `expect(true).toBe(true)`) and empty test bodies.
 *      → ProMax "overly broad": the test checks nothing it claims to.
 *
 *   2. BRITTLE exact-literal pin — an assertion matching a long, prose-like
 *      exact string literal (implementation output pinned verbatim). A valid
 *      refactor that reword the string fails the test (false red — the class
 *      that reddened main via PR #1941).
 *      → ProMax "overly narrow": the test rejects correct solutions.
 *
 * Usage:  node tools/test-quality-lint.js [dir=tests] [--json] [--max N]
 * Exit 1 if findings > --max (default: report-only, exit 0).
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const maxIdx = args.indexOf('--max');
const max = maxIdx >= 0 ? Number(args[maxIdx + 1]) : Infinity;
// Consume the `--max <n>` value before resolving the positional directory.
// Otherwise `--max 0` picks "0" as the scan dir and crashes with ENOENT.
const positional = args.filter((a, i) => !a.startsWith('--') && !(maxIdx >= 0 && i === maxIdx + 1));
const dir = positional[0] || 'tests';

function walk(d, acc) {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git' || name === 'fixtures' || name === '__fixtures__') continue;
      walk(p, acc);
    } else if (/\.(test|spec)\.[mc]?[jt]sx?$/.test(name) || /^test-.*\.[mc]?js$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

const ASSERT = /\b(?:assert|expect|should|t\.(?:is|deepEqual|truthy|ok|regex))\b/;
const FAIL_IN_BLOCK = /\b(?:else|throw|\.fail\(|assert\.fail|t\.fail|reject|done\()/;

// A long prose-ish literal: >=45 chars and >=6 whitespace-separated words.
function isBrittleLiteral(lit) {
  if (lit.length < 45) return false;
  const words = lit.trim().split(/\s+/).filter(Boolean);
  return words.length >= 6;
}
const STRING_LIT = /(['"`])((?:\\.|(?!\1).){45,})\1/g;

function scanFile(file) {
  const findings = [];
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    // 1a. Single-line guarded assertion: `if (cond) assert...` / `if (cond) expect(...)`
    if (/^\s*if\s*\(.+\)\s*(?:assert|expect|should)\b/.test(line) && !/\belse\b|\bthrow\b/.test(line)) {
      findings.push({ file, line: ln, category: 'opt-out-assertion', snippet: trimmed.slice(0, 120),
        why: 'assertion guarded by a single-line `if` with no failing branch — passes silently when the condition is false' });
    }
    // 1b. Block guarded assertion: `if (cond) {` ... assert ... `}` with no else/throw/fail
    if (/^\s*if\s*\(.+\)\s*\{\s*$/.test(line)) {
      let depth = 1, hasAssert = false, hasFail = false, end = i;
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
        if (ASSERT.test(lines[j])) hasAssert = true;
        if (FAIL_IN_BLOCK.test(lines[j])) hasFail = true;
        if (depth <= 0) { end = j; break; }
      }
      if (hasAssert && !hasFail) {
        findings.push({ file, line: ln, category: 'opt-out-assertion', snippet: trimmed.slice(0, 120),
          why: 'assertion inside `if (...) {}` block with no else/throw/fail — the whole check is skipped when the condition is false (false green)' });
      }
    }
    // 1c. Literal no-op assertions
    if (/\b(?:assert(?:\.ok)?\(\s*true\s*\)|assert\.(?:equal|strictEqual)\(\s*true\s*,\s*true\s*\)|expect\(\s*(?:true|1)\s*\)\.toBe\(\s*(?:true|1)\s*\)|assert\.ok\(\s*1\s*\))/.test(line)) {
      findings.push({ file, line: ln, category: 'noop-assertion', snippet: trimmed.slice(0, 120),
        why: 'tautological assertion — always passes, verifies nothing' });
    }
    // 1d. Empty test body
    if (/\b(?:it|test)\(\s*(['"`]).*?\1\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line)) {
      findings.push({ file, line: ln, category: 'empty-test', snippet: trimmed.slice(0, 120),
        why: 'test body is empty — passes without asserting anything' });
    }

    // 2. Brittle exact prose-literal pinned by an assertion.
    // Only the needle-in-haystack matchers, where a long literal is genuinely
    // the pinned VALUE (the PR #1941 class). Deliberately excludes
    // assert.equal/strictEqual/deepEqual — there the long literal is almost
    // always the descriptive message arg, not a pinned value (avoid the
    // overly-broad detector the ProMax paper warns about).
    if (ASSERT.test(line) && /\.(?:includes|toContain|toBe|toEqual|toMatch|stringContaining)\s*\(/.test(line)) {
      let m;
      STRING_LIT.lastIndex = 0;
      while ((m = STRING_LIT.exec(line))) {
        if (isBrittleLiteral(m[2])) {
          findings.push({ file, line: ln, category: 'brittle-literal-pin', snippet: trimmed.slice(0, 140),
            why: 'assertion pins a long exact prose literal — a valid reword/refactor turns this red (overly narrow test)' });
          break;
        }
      }
    }
  }
  return findings;
}

function run() {
  const files = walk(dir, []);
  let all = [];
  for (const f of files) { try { all = all.concat(scanFile(f)); } catch { /* skip unreadable */ } }

  const byCat = all.reduce((acc, x) => ((acc[x.category] = (acc[x.category] || 0) + 1), acc), {});
  if (asJson) {
    console.log(JSON.stringify({ scanned: files.length, total: all.length, byCategory: byCat, findings: all }, null, 2));
  } else {
    console.log(`test-quality-lint — scanned ${files.length} test files, ${all.length} findings`);
    console.log(`by category: ${JSON.stringify(byCat)}`);
    const top = all.slice(0, 40);
    for (const f of top) console.log(`  ${f.category}  ${f.file}:${f.line}\n      ${f.snippet}`);
    if (all.length > top.length) console.log(`  … +${all.length - top.length} more`);
  }
  process.exit(all.length > max ? 1 : 0);
}

module.exports = { scanFile, isBrittleLiteral };

if (require.main === module) run();
