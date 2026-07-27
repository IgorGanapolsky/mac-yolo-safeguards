#!/usr/bin/env node
'use strict';

/**
 * arc-skill-efficiency.js — ARC-AGI-inspired skill-acquisition probe for Hermes.
 *
 * ARC Prize (https://arcprize.org/arc-agi) defines intelligence as
 * skill-acquisition efficiency on novel tasks given core knowledge priors —
 * not crystallized benchmark skill bought with unlimited training data.
 *
 * This tool ships a *local, deterministic* battery of few-shot grid tasks in that
 * spirit (original tasks, not the official ARC corpus). It measures whether a
 * solver can induce a rule from train pairs and apply it to held-out tests.
 *
 * High-ROI uses in this fleet:
 *  - Gate model/"smart agent" claims: held-out induction > memorized demos
 *  - agent-decision-stack telemetry before promoting routes/profiles
 *  - CI smoke: solvers + scoring stay green without network/API cost
 *
 * Usage:
 *   node tools/arc-skill-efficiency.js [--json] [--verbose]
 *   node tools/arc-skill-efficiency.js --gate --min-holdout 0.8
 */

const DEFAULT_MIN_HOLDOUT = 0.8;

// --- grid helpers (core priors: objectness, geometry, number, color) ----------

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

function gridsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let r = 0; r < a.length; r += 1) {
    if (a[r].length !== b[r].length) return false;
    for (let c = 0; c < a[r].length; c += 1) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

function rotate90(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      out[c][h - 1 - r] = grid[r][c];
    }
  }
  return out;
}

function flipH(grid) {
  return grid.map((row) => row.slice().reverse());
}

function flipV(grid) {
  return grid.slice().reverse().map((row) => row.slice());
}

function mapColors(grid, mapping) {
  return grid.map((row) => row.map((v) => (Object.prototype.hasOwnProperty.call(mapping, v) ? mapping[v] : v)));
}

function tile2x2(grid) {
  const top = grid.map((row) => row.concat(row));
  return top.concat(top.map((row) => row.slice()));
}

function gravityDown(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const out = Array.from({ length: h }, () => Array(w).fill(0));
  for (let c = 0; c < w; c += 1) {
    const col = [];
    for (let r = 0; r < h; r += 1) {
      if (grid[r][c] !== 0) col.push(grid[r][c]);
    }
    let r = h - 1;
    for (let i = col.length - 1; i >= 0; i -= 1, r -= 1) {
      out[r][c] = col[i];
    }
  }
  return out;
}

function cropNonZero(grid) {
  let r0 = grid.length;
  let r1 = -1;
  let c0 = grid[0].length;
  let c1 = -1;
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      if (grid[r][c] !== 0) {
        r0 = Math.min(r0, r);
        r1 = Math.max(r1, r);
        c0 = Math.min(c0, c);
        c1 = Math.max(c1, c);
      }
    }
  }
  if (r1 < 0) return [[0]];
  const out = [];
  for (let r = r0; r <= r1; r += 1) {
    out.push(grid[r].slice(c0, c1 + 1));
  }
  return out;
}

function scale2(grid) {
  const out = [];
  for (const row of grid) {
    const expanded = [];
    for (const v of row) expanded.push(v, v);
    out.push(expanded.slice(), expanded.slice());
  }
  return out;
}

function fillBackground(grid, from, to) {
  return grid.map((row) => row.map((v) => (v === from ? to : v)));
}

// --- program library (inducible from few train pairs) ------------------------

const PROGRAMS = [
  { id: 'identity', complexity: 1, apply: (g) => cloneGrid(g) },
  { id: 'rotate90', complexity: 2, apply: rotate90 },
  { id: 'rotate180', complexity: 2, apply: (g) => rotate90(rotate90(g)) },
  { id: 'flip_h', complexity: 2, apply: flipH },
  { id: 'flip_v', complexity: 2, apply: flipV },
  { id: 'tile_2x2', complexity: 3, apply: tile2x2 },
  { id: 'gravity_down', complexity: 3, apply: gravityDown },
  { id: 'crop_nonzero', complexity: 3, apply: cropNonZero },
  { id: 'scale_2', complexity: 3, apply: scale2 },
  {
    id: 'color_1_to_2',
    complexity: 2,
    apply: (g) => mapColors(g, { 1: 2 }),
  },
  {
    id: 'color_2_to_3',
    complexity: 2,
    apply: (g) => mapColors(g, { 2: 3 }),
  },
  {
    id: 'bg_0_to_5',
    complexity: 2,
    apply: (g) => fillBackground(g, 0, 5),
  },
  {
    id: 'rotate90_then_flip_h',
    complexity: 4,
    apply: (g) => flipH(rotate90(g)),
  },
];

function programFits(program, trainPairs) {
  return trainPairs.every((pair) => gridsEqual(program.apply(pair.input), pair.output));
}

/**
 * Few-shot induction: try core-knowledge programs on train pairs only, pick
 * simplest (lowest complexity, then id) that fits all demos, apply to test.
 * This is the *skill-acquisition* path — no leaked test labels.
 */
function induceAndApply(trainPairs, testInput) {
  const fits = PROGRAMS.filter((p) => programFits(p, trainPairs));
  if (!fits.length) {
    return { ok: false, programId: null, complexity: null, prediction: null, reason: 'no_program_fits_train' };
  }
  fits.sort((a, b) => a.complexity - b.complexity || a.id.localeCompare(b.id));
  const best = fits[0];
  return {
    ok: true,
    programId: best.id,
    complexity: best.complexity,
    prediction: best.apply(testInput),
    reason: 'induced',
  };
}

// --- task battery (original; ARC spirit: easy for humans, few demos) ---------

function task(id, train, testInput, testOutput, humanHint) {
  return { id, train, testInput, testOutput, humanHint };
}

function buildBattery() {
  return [
    task(
      'recolor-1-to-2',
      [
        { input: [[1, 0], [0, 1]], output: [[2, 0], [0, 2]] },
        { input: [[0, 1, 1], [1, 0, 0]], output: [[0, 2, 2], [2, 0, 0]] },
      ],
      [[1, 1, 0], [0, 0, 1]],
      [[2, 2, 0], [0, 0, 2]],
      'Map color 1 → 2; keep 0',
    ),
    task(
      'rotate-square',
      [
        {
          input: [
            [1, 2],
            [3, 4],
          ],
          output: [
            [3, 1],
            [4, 2],
          ],
        },
        {
          input: [
            [5, 0],
            [0, 6],
          ],
          output: [
            [0, 5],
            [6, 0],
          ],
        },
      ],
      [
        [1, 0, 2],
        [0, 0, 0],
        [3, 0, 4],
      ],
      [
        [3, 0, 1],
        [0, 0, 0],
        [4, 0, 2],
      ],
      'Rotate 90° clockwise',
    ),
    task(
      'mirror-horizontal',
      [
        { input: [[1, 2, 3]], output: [[3, 2, 1]] },
        {
          input: [
            [1, 0],
            [2, 3],
          ],
          output: [
            [0, 1],
            [3, 2],
          ],
        },
      ],
      [
        [7, 8, 9],
        [0, 1, 0],
      ],
      [
        [9, 8, 7],
        [0, 1, 0],
      ],
      'Flip horizontally',
    ),
    task(
      'tile-pattern',
      [
        {
          input: [
            [1, 2],
            [3, 4],
          ],
          output: [
            [1, 2, 1, 2],
            [3, 4, 3, 4],
            [1, 2, 1, 2],
            [3, 4, 3, 4],
          ],
        },
      ],
      [
        [9, 0],
        [0, 8],
      ],
      [
        [9, 0, 9, 0],
        [0, 8, 0, 8],
        [9, 0, 9, 0],
        [0, 8, 0, 8],
      ],
      'Tile 2×2',
    ),
    task(
      'gravity',
      [
        {
          input: [
            [1, 0],
            [0, 0],
            [0, 2],
          ],
          output: [
            [0, 0],
            [0, 0],
            [1, 2],
          ],
        },
      ],
      [
        [3, 0, 4],
        [0, 0, 0],
        [0, 5, 0],
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
        [3, 5, 4],
      ],
      'Objects fall down',
    ),
    task(
      'crop-object',
      [
        {
          input: [
            [0, 0, 0],
            [0, 7, 7],
            [0, 7, 0],
            [0, 0, 0],
          ],
          output: [
            [7, 7],
            [7, 0],
          ],
        },
      ],
      [
        [0, 0, 0, 0],
        [0, 1, 2, 0],
        [0, 0, 0, 0],
      ],
      [
        [1, 2],
      ],
      'Crop non-zero bounding box',
    ),
    task(
      'scale-up',
      [
        {
          input: [
            [1, 0],
            [0, 2],
          ],
          output: [
            [1, 1, 0, 0],
            [1, 1, 0, 0],
            [0, 0, 2, 2],
            [0, 0, 2, 2],
          ],
        },
      ],
      [[3]],
      [
        [3, 3],
        [3, 3],
      ],
      'Scale each cell 2×2',
    ),
    task(
      'compose-rotate-flip',
      [
        {
          input: [
            [1, 2],
            [3, 4],
          ],
          // rotate90 then flipH
          output: [
            [1, 3],
            [2, 4],
          ],
        },
      ],
      [
        [5, 6],
        [7, 8],
      ],
      [
        [5, 7],
        [6, 8],
      ],
      'Rotate 90° then flip H',
    ),
    // Holdout-oriented: same family as recolor but different mapping — induction must re-fit
    task(
      'recolor-2-to-3',
      [
        { input: [[2, 0], [0, 2]], output: [[3, 0], [0, 3]] },
        { input: [[2, 2]], output: [[3, 3]] },
      ],
      [[0, 2, 0], [2, 0, 2]],
      [[0, 3, 0], [3, 0, 3]],
      'Map color 2 → 3',
    ),
    task(
      'bg-fill',
      [
        {
          input: [
            [0, 1],
            [1, 0],
          ],
          output: [
            [5, 1],
            [1, 5],
          ],
        },
      ],
      [
        [0, 0, 2],
        [2, 0, 0],
      ],
      [
        [5, 5, 2],
        [2, 5, 5],
      ],
      'Background 0 → 5',
    ),
  ];
}

/**
 * Chollet-style efficiency proxy:
 * success / (complexity * train_pairs). Higher is better skill-acquisition.
 */
function efficiencyScore({ success, complexity, trainCount }) {
  if (!success) return 0;
  const c = Math.max(1, complexity || 1);
  const t = Math.max(1, trainCount || 1);
  return Number((1 / (c * t)).toFixed(6));
}

function evaluateTask(taskSpec) {
  const induced = induceAndApply(taskSpec.train, taskSpec.testInput);
  const success =
    induced.ok && induced.prediction != null && gridsEqual(induced.prediction, taskSpec.testOutput);
  return {
    id: taskSpec.id,
    humanHint: taskSpec.humanHint,
    trainCount: taskSpec.train.length,
    success,
    programId: induced.programId,
    complexity: induced.complexity,
    reason: induced.reason,
    efficiency: efficiencyScore({
      success,
      complexity: induced.complexity,
      trainCount: taskSpec.train.length,
    }),
  };
}

function runProbe(options = {}) {
  const battery = options.battery || buildBattery();
  const holdoutIds = new Set(
    options.holdoutIds || ['recolor-2-to-3', 'bg-fill', 'compose-rotate-flip', 'scale-up'],
  );
  const results = battery.map(evaluateTask);
  const trainPool = results.filter((r) => !holdoutIds.has(r.id));
  const holdout = results.filter((r) => holdoutIds.has(r.id));
  const rate = (xs) => (xs.length ? xs.filter((x) => x.success).length / xs.length : 0);
  const meanEff = (xs) => {
    const ok = xs.filter((x) => x.success);
    if (!ok.length) return 0;
    return ok.reduce((s, x) => s + x.efficiency, 0) / ok.length;
  };
  const trainAcc = rate(trainPool);
  const holdoutAcc = rate(holdout);
  const report = {
    schema: 'hermes/arc-skill-efficiency-v1',
    checkedAt: new Date().toISOString(),
    source: {
      philosophy: 'https://arcprize.org/arc-agi',
      paper: 'https://arxiv.org/abs/1911.01547',
      note: 'Original few-shot grid battery (ARC spirit). Not the official ARC Prize corpus.',
    },
    metrics: {
      totalTasks: results.length,
      trainPoolTasks: trainPool.length,
      holdoutTasks: holdout.length,
      trainAccuracy: Number(trainAcc.toFixed(4)),
      holdoutAccuracy: Number(holdoutAcc.toFixed(4)),
      meanTrainEfficiency: Number(meanEff(trainPool).toFixed(6)),
      meanHoldoutEfficiency: Number(meanEff(holdout).toFixed(6)),
      failures: results.filter((r) => !r.success).map((r) => r.id),
    },
    results,
    gates: {
      minHoldoutAccuracy: options.minHoldout ?? DEFAULT_MIN_HOLDOUT,
      holdoutPass: holdoutAcc + 1e-9 >= (options.minHoldout ?? DEFAULT_MIN_HOLDOUT),
      trainPass: trainAcc + 1e-9 >= 0.9,
    },
  };
  report.overallStatus =
    report.gates.holdoutPass && report.gates.trainPass ? 'pass' : 'fail';
  report.recommendation =
    report.overallStatus === 'pass'
      ? 'Skill-acquisition probe green: prefer this induction path over claiming intelligence from memorized evals.'
      : `Holdout induction weak (holdout=${report.metrics.holdoutAccuracy}). Do not promote models/profiles on crystallized skill alone; improve few-shot rule induction first.`;
  return report;
}

function parseArgs(argv) {
  const args = { json: false, verbose: false, gate: false, minHoldout: DEFAULT_MIN_HOLDOUT, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--gate') args.gate = true;
    else if (a === '--min-holdout') args.minHoldout = Number(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isFinite(args.minHoldout) || args.minHoldout <= 0 || args.minHoldout > 1) {
    throw new Error('--min-holdout must be in (0,1]');
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/arc-skill-efficiency.js [--json] [--verbose] [--gate] [--min-holdout 0.8]

ARC-AGI-inspired skill-acquisition probe (local, no API).
See docs/RESEARCH-ARC-AGI-HERMES-ROI-20260725.md`);
    process.exit(0);
  }
  const report = runProbe({ minHoldout: args.minHoldout });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`# ARC skill-efficiency probe — ${report.checkedAt}`);
    console.log(`status=${report.overallStatus} train=${report.metrics.trainAccuracy} holdout=${report.metrics.holdoutAccuracy}`);
    console.log(report.recommendation);
    if (args.verbose) {
      for (const r of report.results) {
        console.log(`- ${r.id}: ${r.success ? 'ok' : 'FAIL'} program=${r.programId || '-'} eff=${r.efficiency}`);
      }
    }
  }
  if (args.gate && report.overallStatus !== 'pass') process.exit(2);
}

module.exports = {
  PROGRAMS,
  buildBattery,
  cloneGrid,
  efficiencyScore,
  gridsEqual,
  induceAndApply,
  parseArgs,
  programFits,
  runProbe,
  rotate90,
  flipH,
  gravityDown,
  tile2x2,
  cropNonZero,
  scale2,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
