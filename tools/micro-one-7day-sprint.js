#!/usr/bin/env node
'use strict';

/**
 * 7-day workflow validation sprint — honest checklist (episode steal).
 * Default workflow: agency AHLS first-cash (real pain), not vapor field-IT SKUs.
 *
 *   node tools/micro-one-7day-sprint.js --status [--json]
 *   node tools/micro-one-7day-sprint.js --advance-day [--json]
 *   node tools/micro-one-7day-sprint.js --set-day 3 [--json]
 *   node tools/micro-one-7day-sprint.js --log-failure "description" [--json]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE_PATH = path.join(os.homedir(), '.hermes', 'chief_of_staff', '7day-sprint.json');

const DAYS = [
  {
    day: 1,
    title: 'Pick one repeatable pain',
    doneWhen: 'Workflow key locked: agency-ahls-first-cash (or explicit alternate)',
  },
  {
    day: 2,
    title: 'Minimal agent workflow',
    doneWhen: 'One input → one approval gate → one measurable output wired',
  },
  {
    day: 3,
    title: 'Finish wiring + dry run',
    doneWhen: 'Dry-run produces draft artifacts without sending',
  },
  {
    day: 4,
    title: 'Run on 5 real tasks',
    doneWhen: '5 logged runs with failure modes noted',
  },
  {
    day: 5,
    title: 'Run on 5 more (10 total)',
    doneWhen: '10 logged runs; top 3 failure modes named',
  },
  {
    day: 6,
    title: 'Demo + simple offer',
    doneWhen: 'Short demo script + $149 AHLS / pilot offer one-pager path',
  },
  {
    day: 7,
    title: 'Ask for paid pilots',
    doneWhen: 'Narrow audience share + ask for paid commitment (not feedback theater)',
  },
];

function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    return {
      workflow: 'agency-ahls-first-cash',
      day: 1,
      startedAt: new Date().toISOString(),
      failures: [],
      runs: [],
      notes: 'Episode steal: adopt narrowly, permission carefully, human approval, monetize proven workflow.',
    };
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

function status() {
  const state = loadState();
  const plan = DAYS.find((d) => d.day === state.day) || DAYS[0];
  return {
    ...state,
    plan,
    honesty: 'No fake $3k packaging math. Progress is day counter + logged failures only.',
    statePath: STATE_PATH,
  };
}

function advanceDay() {
  const state = loadState();
  if (state.day >= 7) {
    state.completedAt = state.completedAt || new Date().toISOString();
  } else {
    state.day += 1;
  }
  state.updatedAt = new Date().toISOString();
  saveState(state);
  return status();
}

function setDay(n) {
  const state = loadState();
  state.day = Math.max(1, Math.min(7, Number(n) || 1));
  state.updatedAt = new Date().toISOString();
  saveState(state);
  return status();
}

function logFailure(desc) {
  const state = loadState();
  state.failures.push({ at: new Date().toISOString(), day: state.day, description: String(desc || '').slice(0, 500) });
  state.updatedAt = new Date().toISOString();
  saveState(state);
  return status();
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const print = (o) => console.log(JSON.stringify(o, null, 2));

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage:
  --status [--json]
  --advance-day [--json]
  --set-day N [--json]
  --log-failure "text" [--json]
  --workflow KEY   (stored label only; default agency-ahls-first-cash)`);
    process.exit(0);
  }

  const wfIdx = argv.indexOf('--workflow');
  if (wfIdx >= 0) {
    const state = loadState();
    state.workflow = argv[wfIdx + 1] || state.workflow;
    saveState(state);
  }

  if (argv.includes('--advance-day')) return print(advanceDay());
  if (argv.includes('--set-day')) {
    const i = argv.indexOf('--set-day');
    return print(setDay(argv[i + 1]));
  }
  if (argv.includes('--log-failure')) {
    const i = argv.indexOf('--log-failure');
    return print(logFailure(argv[i + 1]));
  }
  print(status());
}

if (require.main === module) {
  main();
}

module.exports = {
  loadState,
  loadSprintState: status,
  advanceDay,
  setDay,
  logFailure,
  status,
};
