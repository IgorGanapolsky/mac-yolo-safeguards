#!/usr/bin/env node
/**
 * jcode-adaptive-job-sizer.js
 * High-ROI jcode steal: Adaptive Job Sizer / Memory-Pressure Budgeting.
 *
 * jcode's dev_cargo commits budget memory per job (e.g. ~1536 MiB/job) and
 * size parallelism so the harness is never SIGTERM'd by earlyoom or killed
 * under memory pressure (the same crash class as our PostHog SIGTRAP cluster).
 * This tool reads live macOS memory state (vm_stat + hw.memsize) and computes
 * the maximum safe concurrent heavy jobs for a given per-job budget, plus the
 * current pressure level.
 *
 * Usage:
 *   node tools/jcode-adaptive-job-sizer.js                    # pressure + safe -j for defaults
 *   node tools/jcode-adaptive-job-sizer.js --job-budget-mb 1536
 *   node tools/jcode-adaptive-job-sizer.js --json
 */

const { execFileSync } = require('child_process');
const os = require('os');

const PAGE_SIZE = 16384; // macOS ARM64 default; we re-read from vm_stat when possible

const DEFAULT_JOB_BUDGET_MB = 1536; // mirrors jcode dev_cargo per-job budget
const RESERVE_PRESSURE_MB = 4096; // keep this much headroom for macOS itself

function readVmStat() {
  const out = execFileSync('vm_stat', [], { encoding: 'utf8' });
  const stats = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([^:]+):\s+([\d.]+)\.?$/);
    if (m) stats[m[1].trim()] = parseFloat(m[2]);
  }
  return stats;
}

function getMemoryState(vmOverride) {
  const vm = vmOverride || readVmStat();
  const pageSize = 16384;
  const totalBytes = os.totalmem();
  const pages = {
    free: vm['Pages free'] || 0,
    inactive: vm['Pages inactive'] || 0,
    speculative: vm['Pages speculative'] || 0,
    wired: vm['Pages wired down'] || 0,
    active: vm['Pages active'] || 0,
    compressed: vm['Pages occupied by compressor'] || 0,
  };
  const freeBytes = (pages.free + pages.inactive + pages.speculative) * pageSize;
  const wiredBytes = pages.wired * pageSize;
  const compressedBytes = pages.compressed * pageSize;
  const availableMb = Math.floor(freeBytes / 1024 / 1024);
  const wiredMb = Math.floor(wiredBytes / 1024 / 1024);
  const compressedMb = Math.floor(compressedBytes / 1024 / 1024);
  const totalMb = Math.floor(totalBytes / 1024 / 1024);
  const pressure = (1 - availableMb / totalMb) * 100;
  return { availableMb, wiredMb, compressedMb, totalMb, pressure, rawPages: pages };
}

function pressureLabel(pressure) {
  if (pressure < 60) return 'calm';
  if (pressure < 80) return 'elevated';
  if (pressure < 90) return 'high';
  return 'critical';
}

function computeSafeJobs({ availableMb, pressure }, jobBudgetMb = DEFAULT_JOB_BUDGET_MB, reserveMb = RESERVE_PRESSURE_MB) {
  const budgetable = Math.max(0, availableMb - reserveMb);
  const parallel = Math.max(1, Math.floor(budgetable / jobBudgetMb));
  return { parallel, budgetableMb: budgetable };
}

function sizeJobs({ vmOverride, jobBudgetMb, reserveMb }) {
  const state = getMemoryState(vmOverride);
  const safe = computeSafeJobs(state, jobBudgetMb, reserveMb);
  const label = pressureLabel(state.pressure);
  return {
    generatedAt: new Date().toISOString(),
    totalMb: state.totalMb,
    availableMb: state.availableMb,
    wiredMb: state.wiredMb,
    compressedMb: state.compressedMb,
    pressurePercent: Math.round(state.pressure * 10) / 10,
    pressureLabel: label,
    jobBudgetMb,
    reserveMb: reserveMb || RESERVE_PRESSURE_MB,
    safeParallelJobs: safe.parallel,
    budgetableMb: safe.budgetableMb,
    verdict:
      label === 'critical' ? `CRITICAL: only ${state.availableMb} MB usable — do NOT start heavy jobs` : `Safe parallelism: ${safe.parallel} concurrent job(s) at ${jobBudgetMb} MB/job`,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let jobBudgetMb = DEFAULT_JOB_BUDGET_MB;
  let reserveMb = RESERVE_PRESSURE_MB;
  const budgetIdx = args.indexOf('--job-budget-mb');
  if (budgetIdx >= 0 && args[budgetIdx + 1]) jobBudgetMb = parseInt(args[budgetIdx + 1], 10);
  const reserveIdx = args.indexOf('--reserve-mb');
  if (reserveIdx >= 0 && args[reserveIdx + 1]) reserveMb = parseInt(args[reserveIdx + 1], 10);

  const result = sizeJobs({ jobBudgetMb, reserveMb });
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`=== Adaptive Job Sizer (jcode steal) ===`);
    console.log(`Total RAM        : ${result.totalMb} MB`);
    console.log(`Available (free + inactive + speculative): ${result.availableMb} MB`);
    console.log(`Wired            : ${result.wiredMb} MB`);
    console.log(`Compressed       : ${result.compressedMb} MB`);
    console.log(`Pressure         : ${result.pressurePercent}% (${result.pressureLabel})`);
    console.log(`Job budget       : ${jobBudgetMb} MB/job`);
    console.log(`Budgetable       : ${result.budgetableMb} MB (after ${result.reserveMb} MB reserve)`);
    console.log(`Safe concurrency: ${result.safeParallelJobs} concurrent job(s)`);
    console.log(`Verdict          : ${result.verdict}`);
    if (result.pressureLabel === 'critical') process.exitCode = 3;
    else if (result.pressureLabel === 'high') process.exitCode = 1;
  }
}

module.exports = { sizeJobs, getMemoryState, computeSafeJobs, pressureLabel };