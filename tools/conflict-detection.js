#!/usr/bin/env node
/**
 * Conflict Detection Script
 * High-ROI: Detect and resolve merge conflicts before PR
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return e.stdout?.trim() || null;
  }
}

function detectConflicts() {
  // Check if current branch has conflicts with target
  const targetBranch = process.env.BASE_REF || 'main';
  const currentBranch = run('git branch --show-current').trim();
  
  console.log('🔍 Conflict Detection Report');
  console.log('============================\n');
  console.log(`Target: ${targetBranch}`);
  console.log(`Current: ${currentBranch}\n`);
  
  // Fetch latest target
  run(`git fetch origin ${targetBranch}`);
  
  // Check for merge conflicts
  const mergeBase = run(`git merge-base origin/${targetBranch} HEAD`);
  if (!mergeBase) {
    console.log('❌ Could not find merge base');
    return 1;
  }
  
  // Get changed files on both sides
  const targetFiles = run(`git diff --name-only origin/${targetBranch} ${mergeBase}`)?.split('\n').filter(Boolean) || [];
  const currentFiles = run(`git diff --name-only ${mergeBase} HEAD`)?.split('\n').filter(Boolean) || [];
  
  // Find overlapping files
  const targetSet = new Set(targetFiles);
  const conflicts = currentFiles.filter(f => targetSet.has(f));
  
  if (conflicts.length > 0) {
    console.log('⚠️ Potential conflicts in:', conflicts.length, 'files');
    conflicts.forEach(f => console.log(`  - ${f}`));
    
    // Try a dry-run merge to confirm conflicts
    const mergeResult = run(`git merge-tree --write-tree origin/${targetBranch} HEAD 2>&1`);
    if (mergeResult?.includes('conflict') || mergeResult?.includes('CONFLICT')) {
      console.log('\n❌ CONFIRMED merge conflicts detected!');
      console.log('\nRecommended resolution strategy:');
      console.log('  1. git fetch origin');
      console.log('  2. git rebase origin/' + targetBranch);
      console.log('  3. Resolve conflicts manually if needed');
      console.log('  4. git rebase --continue');
      return 1;
    }
  } else {
    console.log('✅ No file conflicts detected');
  }
  
  // Check for CI impact
  const ciFiles = [...targetFiles, ...currentFiles].filter(f => 
    f.includes('.github/') || f.includes('package.json') || f.includes('tsconfig.json')
  );
  
  if (ciFiles.length > 0) {
    console.log('\n⚠️ CI configuration changes detected:', ciFiles.length, 'files');
    console.log('Run tests before merging to catch CI issues');
  }
  
  console.log('\n✅ Conflict check complete');
  return 0;
}

detectConflicts();