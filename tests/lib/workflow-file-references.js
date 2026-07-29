/**
 * Resolve the file paths a workflow's `run:` steps actually reach for, honouring
 * each job's working-directory.
 *
 * Motivated by a real failure: `store-release.yml`'s iOS job runs with
 * `working-directory: hermes-mobile` but loaded `./hermes-mobile/app.json`,
 * i.e. `hermes-mobile/hermes-mobile/app.json`. That path never existed, so every
 * iOS submit died before reaching `eas submit` - and the test covering it
 * asserted the workflow *contained that exact broken string*, so it stayed green
 * and the bug survived.
 *
 * Asserting on text is not the same as asserting the thing works. This module
 * resolves references against the filesystem instead.
 */
const fs = require('fs');
const path = require('path');

/** Reference forms worth checking. Each capture group 1 is the path. */
const PATTERNS = [
  /require\(\s*['"](\.\/[^'"]+|\.\.\/[^'"]+)['"]\s*\)/g,
  /readFileSync\(\s*['"]([^'"$][^'"]*)['"]/g,
  /\bnode\s+(?:--\S+\s+)*(\.\/[^\s'"|;&>]+\.(?:c?js|mjs))/g,
  /\b(?:bash|sh)\s+(\.\/[^\s'"|;&>]+\.sh)/g,
];

/**
 * Skip anything whose target is not knowable from the repo alone: runtime temp,
 * expressions, env vars, globs, home paths, and absolute system paths.
 */
function isCheckable(ref) {
  if (!ref) return false;
  if (ref.includes('${{') || ref.includes('$')) return false;
  if (ref.includes('*') || ref.includes('~')) return false;
  if (ref.startsWith('/')) return false;
  if (ref.includes('node_modules')) return false;
  if (/^https?:/.test(ref)) return false;
  return ref.startsWith('./') || ref.startsWith('../') || /^[A-Za-z0-9_.-]+\//.test(ref) || /\.[a-z]+$/.test(ref);
}

/** Lines are `key: value` at some indent; find the job each line belongs to. */
function parseJobs(text) {
  const lines = text.split('\n');
  const jobs = [];
  let inJobs = false;
  lines.forEach((line, i) => {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      return;
    }
    if (inJobs && /^[A-Za-z]/.test(line)) inJobs = false;
    if (inJobs && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line)) {
      jobs.push({ id: line.trim().replace(':', ''), start: i });
    }
  });
  return jobs.map((job, idx) => ({
    ...job,
    end: jobs[idx + 1] ? jobs[idx + 1].start : lines.length,
  }));
}

/** A job's default working-directory, if it declares one. */
function jobWorkingDirectory(block) {
  const m = block.match(/defaults:\s*\n\s*run:\s*\n\s*working-directory:\s*(\S+)/);
  return m ? m[1].replace(/['"]/g, '') : '.';
}

/**
 * @returns {{workflow:string, job:string, ref:string, resolved:string, workingDirectory:string}[]}
 *   every reference that does not exist on disk
 */
function findUnresolvedReferences(workflowDir, repoRoot) {
  const problems = [];
  for (const file of fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f))) {
    const text = fs.readFileSync(path.join(workflowDir, file), 'utf8');
    const lines = text.split('\n');
    for (const job of parseJobs(text)) {
      const block = lines.slice(job.start, job.end).join('\n');
      const cwd = jobWorkingDirectory(block);
      // A step may override the job default; those steps are checked against
      // their own directory.
      for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(block)) !== null) {
          const ref = match[1];
          if (!isCheckable(ref)) continue;
          const resolved = path.resolve(repoRoot, cwd, ref);
          if (!fs.existsSync(resolved)) {
            problems.push({
              workflow: file,
              job: job.id,
              ref,
              workingDirectory: cwd,
              resolved: path.relative(repoRoot, resolved),
            });
          }
        }
      }
    }
  }
  return problems;
}

module.exports = { findUnresolvedReferences, jobWorkingDirectory, parseJobs, isCheckable };
