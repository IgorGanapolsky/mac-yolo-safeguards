'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  ThreeTierMemoryEngine,
} = require('../tools/hermes-three-tier-memory.js');

test('ThreeTierMemoryEngine performs full 3-tier lifecycle and distillation', () => {
  const tmpDir = path.join(os.tmpdir(), `test-3tier-mem-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const engine = new ThreeTierMemoryEngine(tmpDir);

  // 1. Tier 1: Log session events
  engine.logSessionEvent({
    agentId: 'agent-chief',
    action: 'audit_check',
    summary: 'Always verify LaunchAgents before reload',
    tags: ['rule', 'promote'],
  });
  engine.logSessionEvent({
    agentId: 'agent-dev',
    action: 'scratch_pad',
    summary: 'Testing temp script',
    tags: ['debug'],
  });

  const history = engine.getHistory();
  assert.equal(history.length, 2);

  // 2. Distiller: Promote tagged events to Tier 2 & Tier 3
  const distRes = engine.distill();
  assert.equal(distRes.promotedCount, 1);
  assert.ok(distRes.promoted[0].summary.includes('Always verify LaunchAgents'));

  // 3. Tier 2: Check MEMORY.md
  const memContent = engine.getWorkspaceMemory();
  assert.ok(memContent.includes('Always verify LaunchAgents before reload'));

  // 4. Tier 3: Recall from knowledge index
  const recalled = engine.recallKnowledge('LaunchAgents reload');
  assert.ok(recalled.length >= 1);
  assert.ok(recalled[0].text.includes('Always verify LaunchAgents'));

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
