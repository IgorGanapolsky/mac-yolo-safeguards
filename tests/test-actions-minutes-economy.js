const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const dir = path.resolve(__dirname, '../.github/workflows');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'));

/** Split a workflow into job blocks keyed by job id (two-space-indented keys). */
function jobBlocks(text) {
  const lines = text.split('\n');
  const starts = [];
  let inJobs = false;
  lines.forEach((line, i) => {
    if (/^jobs:\s*$/.test(line)) inJobs = true;
    else if (inJobs && /^[A-Za-z]/.test(line)) inJobs = false;
    else if (inJobs && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line)) starts.push(i);
  });
  return starts.map((s, idx) => ({
    id: lines[s].trim().replace(':', ''),
    body: lines.slice(s, starts[idx + 1] ?? lines.length).join('\n'),
  }));
}

test('every job caps its runtime', () => {
  // A job with no timeout-minutes runs to GitHub's 360-minute default. The
  // "Release APK + embedded bundle" job did exactly that (6h00m15s), and a
  // macOS job doing the same bills 3,600 minutes at the 10x multiplier - more
  // than the entire monthly included allowance.
  const uncapped = [];
  for (const file of files) {
    for (const job of jobBlocks(fs.readFileSync(path.join(dir, file), 'utf8'))) {
      if (!/^\s+timeout-minutes:\s*\d+/m.test(job.body)) uncapped.push(`${file}:${job.id}`);
    }
  }
  assert.deepEqual(uncapped, [], `jobs without timeout-minutes: ${uncapped.join(', ')}`);
});

test('macOS jobs stay capped because they bill at 10x', () => {
  // Ceiling is 60, not 40: the Maestro macOS job has a *successful* run at
  // 36.9 min, and a 35-minute cap killed it at 36m8s. A cap must sit above
  // observed successful duration or it manufactures failures.
  const tooLoose = [];
  for (const file of files) {
    for (const job of jobBlocks(fs.readFileSync(path.join(dir, file), 'utf8'))) {
      if (!/runs-on:\s*macos/i.test(job.body)) continue;
      const m = job.body.match(/timeout-minutes:\s*(\d+)/);
      if (m && Number(m[1]) > 60) tooLoose.push(`${file}:${job.id}=${m[1]}min`);
    }
  }
  assert.deepEqual(tooLoose, [], `macOS jobs over 60 min (=600 billed): ${tooLoose.join(', ')}`);
});

test('the macOS continuous workflow does not run more than daily', () => {
  const text = fs.readFileSync(path.join(dir, 'mobile-continuous.yml'), 'utf8');
  const crons = [...text.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]);
  for (const cron of crons) {
    const hour = cron.split(/\s+/)[1];
    assert.doesNotMatch(hour, /\*\//, `mobile-continuous carries a macOS job; '${cron}' repeats intraday`);
  }
});
