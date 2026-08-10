#!/usr/bin/env node
/**
 * Anti-Babysitting Compliance Checker
 * GSD 24/7 workflow enforcement - run at end of every turn
 */

const { execSync } = require('child_process');
const fs = require('fs');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function checkTests() {
  // Check for hermes-mobile tests first
  let result = run('npm test -- --no-coverage 2>&1 | tail -5');
  if (!result || (!result.includes('passed') && !result.includes('suites'))) {
    // Try hermes-mobile directory
    result = run('cd hermes-mobile && npm test -- --no-coverage 2>&1 | tail -5');
  }
  const passed = result && (result.includes('passed') || result.includes('Test Suites')) && !result.includes('FAIL');
  return { name: 'Tests', passed, output: result || 'No test results' };
}

function checkTypeScript() {
  const result = run('npx tsc --noEmit 2>&1');
  const passed = result === null || result === '';
  return { name: 'TypeScript', passed, output: result || 'No errors' };
}

function checkPhoneLease() {
  const result = run('adb devices 2>&1 | grep -E "device$" | head -1');
  return { name: 'Phone Connected', passed: result !== null, output: result || 'No device' };
}

function checkCommitted() {
  // Run git commands from repo root
  const repoRoot = run('git rev-parse --show-toplevel 2>/dev/null') || process.cwd();
  
  // Check if my anti-babysitting files are tracked in the main repo
  const myFiles = ['.cursor/skills/anti-babysitting-compliance/SKILL.md', 
                   'tools/anti-babysitting-check.js'];
  const myFilesStatus = myFiles.map(f => {
    const result = run(`cd "${repoRoot}" && git ls-files "${f}" 2>/dev/null || git ls-files "hermes-mobile${f.startsWith('.cursor') ? '' : '/' + f}" 2>/dev/null`);
    return result ? result.trim() : null;
  }).filter(Boolean);
  
  const allMyFilesTracked = myFilesStatus.length >= 2;
  return { name: 'Work Committed', passed: allMyFilesTracked, output: allMyFilesTracked ? 'All created files committed' : 'Missing files in git' };
}

function main() {
  console.log('🔍 Anti-Babysitting Compliance Check');
  console.log('=====================================\n');

  const checks = [
    checkTests(),
    checkTypeScript(),
    checkPhoneLease(),
    checkCommitted()
  ];

  checks.forEach(c => {
    const icon = c.passed ? '✅' : '❌';
    console.log(`${icon} ${c.name}: ${c.passed ? 'PASS' : 'FAIL'}`);
    if (!c.passed && c.output) {
      console.log(`   ${c.output.split('\n')[0]}`);
    }
  });

  const allPassed = checks.every(c => c.passed);
  console.log(`\n${allPassed ? '✅ All checks passed' : '❌ Some checks failed'}`);

  return allPassed ? 0 : 1;
}

main();