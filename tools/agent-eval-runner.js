#!/usr/bin/env node
/**
 * tools/agent-eval-runner.js
 *
 * Continuous Agent Eval Runner (AI-Native SDLC Stage 4: Test).
 *
 * Design rule: NEVER report an unchecked eval as PASS.
 *
 * The previous implementation gated every assertion on `results[item.id]` being
 * present, so invoking it the way evals/check.sh does (no results file) reported
 * 5/5 PASS / 100% having asserted nothing at all. Three of the five evals also
 * carried no executable assertion whatsoever and could not fail under any input.
 *
 * This version fails closed:
 *   - An eval declaring no known assertion key is a CONFIG ERROR -> FAIL.
 *   - A runtime eval with no recorded result is SKIP (never PASS), and the
 *     suite reports skips distinctly from passes.
 *   - Static evals assert against the repo itself and always execute.
 *
 * Exit code is non-zero when any eval FAILs or any eval is unassertable.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Assertion keys verifiable from the repo alone (no agent transcript required).
const STATIC_KEYS = ['required_artifacts', 'required_file_contains'];
// Assertion keys that need a recorded agent result to evaluate.
const RUNTIME_KEYS = ['must_not_contain', 'must_contain', 'max_nits_allowed', 'forbidden_edit_globs', 'triggers_action'];
const ALL_KEYS = [...STATIC_KEYS, ...RUNTIME_KEYS];

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*') + '$');
}

/** Assertions that read the repository. Always executable. */
function runStaticAssertions(item, rootDir, failures) {
  if (item.required_artifacts) {
    for (const rel of item.required_artifacts) {
      if (!fs.existsSync(path.join(rootDir, rel))) {
        failures.push('Required artifact missing from repo: ' + rel);
      }
    }
  }

  if (item.required_file_contains) {
    for (const [rel, needles] of Object.entries(item.required_file_contains)) {
      const abs = path.join(rootDir, rel);
      if (!fs.existsSync(abs)) {
        failures.push('Required file missing: ' + rel);
        continue;
      }
      const body = fs.readFileSync(abs, 'utf8');
      for (const needle of [].concat(needles)) {
        if (!body.includes(needle)) {
          failures.push(rel + ' does not declare the required contract string: "' + needle + '"');
        }
      }
    }
  }
}

/** Assertions that read a recorded agent result. */
function runRuntimeAssertions(item, result, failures) {
  const output = result.output || '';

  if (item.must_not_contain) {
    for (const forbidden of item.must_not_contain) {
      if (output.includes(forbidden)) {
        failures.push('Output contains forbidden string: ' + forbidden);
      }
    }
  }

  if (item.must_contain) {
    for (const required of item.must_contain) {
      if (!output.includes(required)) {
        failures.push('Output missing required string: ' + required);
      }
    }
  }

  if (item.max_nits_allowed !== undefined) {
    const nitCount = result.nit_count;
    if (typeof nitCount !== 'number') {
      failures.push('Result records no nit_count; cannot verify cap of ' + item.max_nits_allowed);
    } else if (nitCount > item.max_nits_allowed) {
      failures.push('Nit count (' + nitCount + ') exceeded cap (' + item.max_nits_allowed + ')');
    }
  }

  if (item.forbidden_edit_globs) {
    const edited = result.edited_files;
    if (!Array.isArray(edited)) {
      failures.push('Result records no edited_files; cannot verify the fix-code-not-test invariant');
    } else {
      const patterns = item.forbidden_edit_globs.map(globToRegExp);
      for (const file of edited) {
        if (patterns.some((re) => re.test(file))) {
          failures.push('Agent edited a protected file during a fix task: ' + file);
        }
      }
    }
  }

  if (item.triggers_action) {
    if (result.action !== item.triggers_action) {
      failures.push('Expected triggered action "' + item.triggers_action + '", recorded "' + (result.action || 'none') + '"');
    }
  }
}

function runEvals(evalsFilePath, resultsFilePath = null, options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const evals = JSON.parse(fs.readFileSync(evalsFilePath, 'utf8'));
  const results =
    resultsFilePath && fs.existsSync(resultsFilePath)
      ? JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'))
      : {};

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const details = [];

  for (const item of evals) {
    const failures = [];
    const declared = ALL_KEYS.filter((k) => item[k] !== undefined);

    // Fail closed: an eval that asserts nothing is a broken eval, not a passing one.
    if (declared.length === 0) {
      failed++;
      details.push({
        id: item.id,
        name: item.name,
        status: 'FAIL',
        reasons: ['Eval declares no executable assertion (expected one of: ' + ALL_KEYS.join(', ') + ')'],
      });
      continue;
    }

    const staticKeys = declared.filter((k) => STATIC_KEYS.includes(k));
    const runtimeKeys = declared.filter((k) => RUNTIME_KEYS.includes(k));

    if (staticKeys.length) runStaticAssertions(item, rootDir, failures);

    let didSkipRuntime = false;
    if (runtimeKeys.length) {
      const result = results[item.id];
      if (result) {
        runRuntimeAssertions(item, result, failures);
      } else {
        didSkipRuntime = true;
      }
    }

    if (failures.length) {
      failed++;
      details.push({ id: item.id, name: item.name, status: 'FAIL', reasons: failures });
    } else if (didSkipRuntime && !staticKeys.length) {
      // Nothing was actually verified. Never call that a pass.
      skipped++;
      details.push({
        id: item.id,
        name: item.name,
        status: 'SKIP',
        reasons: ['No recorded result for ' + runtimeKeys.join(', ') + '; nothing was verified'],
      });
    } else {
      passed++;
      const detail = { id: item.id, name: item.name, status: 'PASS' };
      if (didSkipRuntime) {
        detail.partial = 'static checks only; runtime keys unverified (' + runtimeKeys.join(', ') + ')';
      }
      details.push(detail);
    }
  }

  const verified = passed + failed;
  const passRate = verified > 0 ? (passed / verified) * 100 : 0;
  return {
    total: evals.length,
    passed,
    failed,
    skipped,
    verified,
    // Rate is over evals actually verified; skips are reported separately, never as passes.
    passRate: passRate.toFixed(1) + '%',
    details,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let evalsPath = path.join(ROOT_DIR, 'evals/sdlc-evals.json');
  let resultsPath = null;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--evals' && args[i + 1]) evalsPath = args[++i];
    else if (args[i] === '--results' && args[i + 1]) resultsPath = args[++i];
    else if (args[i] === '--json') json = true;
  }

  try {
    const summary = runEvals(evalsPath, resultsPath);
    if (json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(
        '\nContinuous Agent Evals: ' + summary.passed + ' passed, ' + summary.failed + ' failed, ' +
          summary.skipped + ' skipped (' + summary.passRate + ' of ' + summary.verified + ' verified)'
      );
      summary.details.forEach((d) => {
        console.log('  [' + d.status + '] ' + d.id + ': ' + d.name);
        if (d.partial) console.log('      - ' + d.partial);
        if (d.reasons) d.reasons.forEach((r) => console.log('      - ' + r));
      });
      if (summary.skipped > 0) {
        console.log('\n  Note: ' + summary.skipped + ' eval(s) verified nothing. Skips are not passes.');
      }
    }
    process.exit(summary.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Eval runner error: ' + err.message);
    process.exit(1);
  }
}

module.exports = { runEvals, ALL_KEYS, STATIC_KEYS, RUNTIME_KEYS };
