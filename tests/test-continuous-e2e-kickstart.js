'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  activeE2eProcessLines,
  maybeKickstartContinuousE2e,
  serviceDomain,
} = require('../tools/continuous-e2e-kickstart');

function fakeSpawn(responses) {
  const calls = [];
  const spawnSync = (command, args) => {
    calls.push({ command, args });
    const key = `${command} ${args.join(' ')}`;
    const response = responses[key];
    if (!response) throw new Error(`unexpected command: ${key}`);
    return { status: 0, stdout: '', stderr: '', ...response };
  };
  return { calls, spawnSync };
}

const uid = '501';
const domain = serviceDomain(uid);

{
  const { calls, spawnSync } = fakeSpawn({
    [`launchctl print ${domain}`]: { stdout: 'state = running\n' },
  });
  const result = maybeKickstartContinuousE2e({ spawnSync, uid });
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'launchagent-running');
  assert.equal(calls.length, 1, 'must not inspect or restart after launchd proves active');
}

{
  const { calls, spawnSync } = fakeSpawn({
    [`launchctl print ${domain}`]: { status: 113, stderr: 'not found' },
    'ps -axo pid=,command=': {
      stdout:
        '999 /bin/bash /private/tmp/other/hermes-mobile/scripts/run-continuous-e2e.sh --once\n',
    },
  });
  const result = maybeKickstartContinuousE2e({ spawnSync, uid });
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'e2e-process-running');
  assert.equal(calls.length, 2, 'cross-worktree process proof must block kickstart');
}

{
  const { calls, spawnSync } = fakeSpawn({});
  const result = maybeKickstartContinuousE2e({
    spawnSync,
    uid,
    blockedReason: 'phone-pipeline-busy',
  });
  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'phone-pipeline-busy');
  assert.equal(calls.length, 0, 'shared phone lease must block before process inspection');
}

{
  const { calls, spawnSync } = fakeSpawn({
    [`launchctl print ${domain}`]: { status: 113, stderr: 'not found' },
    'ps -axo pid=,command=': { stdout: '123 node tools/agent-session-start.js\n' },
    [`launchctl kickstart ${domain}`]: { status: 0 },
  });
  const result = maybeKickstartContinuousE2e({ spawnSync, uid });
  assert.equal(result.triggered, true);
  assert.equal(result.reason, 'started');
  const kick = calls.at(-1);
  assert.deepEqual(kick, { command: 'launchctl', args: ['kickstart', domain] });
  assert(!kick.args.includes('-k'), 'idle session-start must never use destructive kickstart -k');
}

{
  const matches = activeE2eProcessLines(
    [
      '101 /bin/bash /repo/hermes-mobile/scripts/run-e2e.sh .maestro/ship-guard.yaml',
      '102 /usr/local/bin/maestro test .maestro/chat-send-persistence.yaml',
      '103 node /repo/node_modules/.bin/jest',
    ].join('\n'),
  );
  assert.equal(matches.length, 2);
}

{
  const sessionStart = fs.readFileSync(
    path.join(__dirname, '../tools/agent-session-start.js'),
    'utf8',
  );
  assert(sessionStart.includes('maybeKickstartContinuousE2e({'));
  assert(!sessionStart.includes("['kickstart', '-k'"));
}

console.log('continuous E2E kickstart guard: 6 checks passed');
