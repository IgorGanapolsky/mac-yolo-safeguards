import {
  RUN_STALE_AUTO_FAIL_MS,
  RUN_STALE_IDLE_MS,
  RUN_STALE_WARN_MS,
  classifyRunStale,
  isMeaningfulRunProgressChange,
  isTerminalGatewayRunStatus,
  msUntilRunStaleAutoFail,
  runStaleHint,
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

  it('recognizes terminal gateway run statuses', () => {
    expect(isTerminalGatewayRunStatus('completed')).toBe(true);
    expect(isTerminalGatewayRunStatus('running')).toBe(false);
    expect(isTerminalGatewayRunStatus('stopping')).toBe(true);
  });
});
