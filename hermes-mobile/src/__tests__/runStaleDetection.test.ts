import {
  MEGA_SESSION_RUN_STALE_AUTO_FAIL_MS,
  RUN_STALE_AUTO_FAIL_MS,
  RUN_STALE_IDLE_MS,
  RUN_STALE_WARN_MS,
  RUN_STREAM_IDLE_FAIL_MS,
  classifyRunStale,
  isMeaningfulRunProgressChange,
  isTerminalGatewayRunStatus,
  msUntilNoTokenFail,
  msUntilRunStaleAutoFail,
  msUntilStreamIdleFail,
  runStaleHint,
  shouldAutoClearStalledRun,
  shouldFailRunAwaitingFirstToken,
  shouldFailRunForStreamIdle,
  stampRunProgressActivity,
} from '../utils/runStaleDetection';
import type { RunProgressState } from '../types/chatDisplay';

function baseProgress(overrides: Partial<RunProgressState> = {}): RunProgressState {
  return {
    phase: 'working',
    startedAtMs: 0,
    detail: 'Agent working…',
    ...overrides,
  };
}

describe('runStaleDetection', () => {
  it('classifies long runs after warn threshold', () => {
    expect(classifyRunStale(baseProgress(), RUN_STALE_WARN_MS + 1)).toBe('long');
    expect(runStaleHint('long')).toContain('Taking longer than expected');
  });

  it('classifies idle runs when detail has not changed', () => {
    const progress = baseProgress({
      startedAtMs: 100_000,
      lastProgressAtMs: 100_000,
    });
    expect(classifyRunStale(progress, 100_000 + RUN_STALE_IDLE_MS + 1)).toBe('idle');
    expect(runStaleHint('idle')).toContain('No progress updates');
  });

  it('classifies expired runs after auto-fail threshold', () => {
    expect(classifyRunStale(baseProgress(), RUN_STALE_AUTO_FAIL_MS + 1)).toBe('expired');
  });

  it('does not treat token-only updates as meaningful progress', () => {
    const prev = baseProgress({ detail: 'running bash', lastProgressAtMs: 50_000 });
    const next = { ...prev, inputTokens: 100, outputTokens: 20 };
    expect(isMeaningfulRunProgressChange(prev, next)).toBe(false);
    expect(stampRunProgressActivity(prev, next, 200_000).lastProgressAtMs).toBe(50_000);
  });

  it('stamps lastProgressAtMs on detail change', () => {
    const prev = baseProgress({ detail: 'running bash', lastProgressAtMs: 50_000 });
    const next = { ...prev, detail: 'compiling project' };
    expect(stampRunProgressActivity(prev, next, 200_000).lastProgressAtMs).toBe(200_000);
  });

  it('computes ms until auto-fail', () => {
    const progress = baseProgress({ startedAtMs: 1_000 });
    expect(msUntilRunStaleAutoFail(progress, 1_000 + 60_000)).toBe(RUN_STALE_AUTO_FAIL_MS - 60_000);
  });

  it('fails runs with zero output tokens after 45s', () => {
    const progress = baseProgress({ startedAtMs: 1_000, outputTokens: 0 });
    expect(shouldFailRunAwaitingFirstToken(progress, 1_000 + 44_999)).toBe(false);
    expect(shouldFailRunAwaitingFirstToken(progress, 1_000 + 45_000)).toBe(true);
    expect(msUntilNoTokenFail(progress, 1_000 + 15_000)).toBe(30_000);
  });

  it('does not fail awaiting-first-token once output tokens arrive', () => {
    const progress = baseProgress({ startedAtMs: 0, outputTokens: 3 });
    expect(shouldFailRunAwaitingFirstToken(progress, 120_000)).toBe(false);
  });

  it('recognizes terminal gateway run statuses', () => {
    expect(isTerminalGatewayRunStatus('completed')).toBe(true);
    expect(isTerminalGatewayRunStatus('running')).toBe(false);
    expect(isTerminalGatewayRunStatus('stopping')).toBe(true);
  });

  it('uses shorter auto-fail for mega sessions', () => {
    const session = { input_tokens: 4_900_000, output_tokens: 20_000 };
    expect(classifyRunStale(baseProgress(), MEGA_SESSION_RUN_STALE_AUTO_FAIL_MS + 1, session)).toBe(
      'expired',
    );
    expect(msUntilRunStaleAutoFail(baseProgress({ startedAtMs: 1_000 }), 60_000, session)).toBe(
      MEGA_SESSION_RUN_STALE_AUTO_FAIL_MS - 59_000,
    );
    expect(msUntilRunStaleAutoFail(baseProgress({ startedAtMs: 1_000 }), 60_000)).toBe(
      RUN_STALE_AUTO_FAIL_MS - 59_000,
    );
  });

  it('fails when stream progress goes idle', () => {
    const progress = baseProgress({
      startedAtMs: 0,
      lastProgressAtMs: 0,
    });
    expect(shouldFailRunForStreamIdle(progress, RUN_STREAM_IDLE_FAIL_MS + 61_000)).toBe(true);
    expect(msUntilStreamIdleFail(progress, 30_000)).toBeGreaterThan(0);
  });

  it('auto-clears stalled runs without babysitting Stop (no-token / idle / expired)', () => {
    expect(shouldAutoClearStalledRun(null)).toBe(false);
    expect(shouldAutoClearStalledRun(baseProgress({ phase: 'completed' }), 120_000)).toBe(false);

    const awaiting = baseProgress({ startedAtMs: 0, outputTokens: 0 });
    expect(shouldAutoClearStalledRun(awaiting, 90_000)).toBe(true);

    const idle = baseProgress({
      startedAtMs: 0,
      lastProgressAtMs: 0,
      outputTokens: 5,
    });
    expect(shouldAutoClearStalledRun(idle, RUN_STREAM_IDLE_FAIL_MS + 61_000)).toBe(true);

    expect(shouldAutoClearStalledRun(baseProgress(), RUN_STALE_AUTO_FAIL_MS + 1)).toBe(true);
  });
});
