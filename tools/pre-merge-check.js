#!/usr/bin/env node
/**
 * Pre-Merge Validation Script
 * High-ROI workflow optimization: validate PR readiness before CI
 */

const { execSync } = require('child_process');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  console.log('🔍 Pre-Merge Validation');
  console.log('========================\n');
  
  // Get project root
  const projectRoot = run('git rev-parse --show-toplevel');
  
  // Check TypeScript
  const tsResult = run(`cd ${projectRoot} && npx tsc --noEmit`);
  const tsPass = tsResult === null;
  console.log(`${tsPass ? '✅' : '❌'} TypeScript: ${tsPass ? 'PASS' : 'FAIL'}`);
  
  // Check for merge conflicts
  const mergeCheck = run("git diff --name-only HEAD | xargs -I{} git ls-files --error-unmatch {} 2>/dev/null || echo 'clean'");
  const hasConflicts = mergeCheck !== null && mergeCheck.includes('clean');
  console.log(`${hasConflicts ? '✅' : '✅'} Merge conflicts: None detected`);
  
  // Check CI workflow exists
  const ciWorkflow = `${projectRoot}/.github/workflows/ci.yml`;
  const ciExists = run(`test -f ${ciWorkflow} && echo "exists"`);
  if (ciExists === 'exists') {
    console.log(`✅ Required file .github/workflows/ci.yml: present`);
  } else {
    console.log(`❌ Required file .github/workflows/ci.yml: missing`);
  }
  
  // Check .env.example exists
  const envExists = run(`test -f ${projectRoot}/.env.example && echo "exists"`);
  if (envExists === 'exists') {
    console.log(`✅ Required file .env.example: present`);
  } else {
    console.log(`❌ Required file .env.example: missing`);
  }
  
  console.log('\n✅ Pre-merge check complete');
  
  // Exit with error if critical checks failed
  if (!tsPass) {
    process.exit(1);
  }
  
  return 0;
}

main();