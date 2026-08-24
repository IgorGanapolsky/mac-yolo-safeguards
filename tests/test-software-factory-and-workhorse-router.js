const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODEL_TIERS,
  routeTaskToModelTier,
  verifyTabularIntegrity,
} = require('../tools/solar-pro-workhorse-router.js');

const {
  DEFAULT_HARNESSES,
  WarpSoftwareFactory,
} = require('../tools/warp-software-factory-engine.js');

const {
  compactTerminalOutput,
  createSubagentTaskPacket,
  estimateTokens,
} = require('../tools/token-bleed-interdictor.js');

// --- 1. Solar Pro 4 Workhorse Router Tests ---

test('routeTaskToModelTier selects optimal model tier based on task type and budget', () => {
  // 1. Fast lint check -> Local Tier ($0.00)
  const localDecision = routeTaskToModelTier({ taskType: 'preflight_lint', promptLengthTokens: 2000 });
  assert.equal(localDecision.tier, 'local');
  assert.equal(localDecision.estimatedCostUsd, 0.00);

  // 2. Heavy document extraction (50k tokens) -> Workhorse Tier ($0.03/M)
  const workhorseDecision = routeTaskToModelTier({ taskType: 'document_extraction', promptLengthTokens: 50000 });
  assert.equal(workhorseDecision.tier, 'workhorse');
  assert.equal(workhorseDecision.model, 'solar-pro-4');
  assert.ok(workhorseDecision.estimatedCostUsd < 0.01);

  // 3. Multi-file complex architectural reasoning -> Frontier Tier
  const frontierDecision = routeTaskToModelTier({
    taskType: 'architectural_planning',
    fileCount: 8,
    requiresDeepReasoning: true,
    promptLengthTokens: 10000,
    budgetCeilingUsd: 1.00,
  });
  assert.equal(frontierDecision.tier, 'frontier');
  assert.equal(frontierDecision.model, 'claude-3-7-sonnet');
});

test('verifyTabularIntegrity enforces column presence and row uniformity', () => {
  const validTable = {
    headers: ['id', 'name', 'status'],
    rows: [
      ['1', 'Task A', 'completed'],
      ['2', 'Task B', 'in_progress'],
    ],
  };
  const checkValid = verifyTabularIntegrity(validTable, { requiredColumns: ['id', 'status'], minRowCount: 1 });
  assert.equal(checkValid.valid, true);

  // Missing column
  const missingColTable = {
    headers: ['id', 'description'],
    rows: [['1', 'desc']],
  };
  const checkInvalid = verifyTabularIntegrity(missingColTable, { requiredColumns: ['id', 'status'] });
  assert.equal(checkInvalid.valid, false);
  assert.ok(checkInvalid.errors[0].includes("Missing required column: 'status'"));
});

// --- 2. Warp Software Factory Tests ---

test('WarpSoftwareFactory orchestrates multi-harness sessions and human checkpoints', () => {
  const factory = new WarpSoftwareFactory();
  assert.ok(factory.harnesses.length >= 3);

  // 1. Start session
  const session = factory.startSession({ taskTitle: 'Build Solar Router', harnessId: 'harness-antigravity' });
  assert.ok(session.sessionId.startsWith('fact_sess_'));
  assert.equal(session.status, 'active');

  // 2. Steer session
  const steerResult = factory.steerSession(session.sessionId, 'Prioritize unit test coverage first');
  assert.equal(steerResult.success, true);
  assert.equal(session.status, 'steered');

  // 3. Pause for review checkpoint
  const pauseResult = factory.pauseForReview(session.sessionId, 'Pre-push CI verification');
  assert.equal(pauseResult.status, 'paused_checkpoint');
  assert.ok(pauseResult.checkpointId);

  // 4. Approve checkpoint
  const approveResult = factory.approveCheckpoint(session.sessionId, pauseResult.checkpointId);
  assert.equal(approveResult.status, 'active');

  // 5. Terminal handoff
  const handoff = factory.handoverToInteractiveShell(session.sessionId);
  assert.equal(handoff.status, 'handed_over');

  // 6. Record completed job and get telemetry
  factory.recordJobCompletion({
    harnessId: 'harness-antigravity',
    taskDurationMs: 8000,
    turns: 3,
    costUsd: 0.00,
    prCreated: true,
    ciPassed: true,
  });

  const report = factory.getThroughputRoiReport();
  assert.equal(report.totalJobs, 1);
  assert.equal(report.overallPassRatePct, 100);
});

// --- 3. Token Bleed Interdictor Tests ---

test('compactTerminalOutput and createSubagentTaskPacket prevent token bleed', () => {
  // 1. Compact long log
  const longLog = Array.from({ length: 100 }, (_, i) => `Step ${i}: log message`).join('\n');
  const compacted = compactTerminalOutput(longLog, { maxLines: 15 });
  assert.equal(compacted.compressed, true);
  assert.ok(compacted.tokenSavingsEstimatedPct > 80);
  assert.ok(compacted.compactedText.includes('Omitted'));

  // 2. Small log remains uncompressed
  const shortLog = 'line 1\nline 2\nline 3';
  const shortCompacted = compactTerminalOutput(shortLog, { maxLines: 10 });
  assert.equal(shortCompacted.compressed, false);

  // 3. Subagent minimal task packet
  const packet = createSubagentTaskPacket({
    taskDescription: 'Extract Solar Pro 4 benchmark metrics',
    targetFiles: ['docs/benchmarks.md'],
    constraints: ['Zero hallucinated columns'],
  });
  assert.ok(packet.subagentPacketId.startsWith('pkt_'));
  assert.equal(packet.task, 'Extract Solar Pro 4 benchmark metrics');
  assert.equal(packet.targetFiles.length, 1);

  // 4. Token estimation
  const tokenCount = estimateTokens('This is a test string for token calculation.');
  assert.ok(tokenCount > 0);
});
