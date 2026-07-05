import {
  WAITING_FOR_PRIOR_CHAT_DETAIL,
  filterLiveGatewayRunIds,
  isWaitingForPriorChatDetail,
  reconcileStaleActiveRunProgress,
  releaseMacOperatorSlot,
  retryOnSessionInUse,
} from '../utils/chatSessionRecovery';
import * as hermesGatewayClient from '../services/hermesGatewayClient';

jest.mock('../services/hermesGatewayClient', () => ({
  getRunStatus: jest.fn(),
  stopRun: jest.fn(),
}));

const getRunStatus = hermesGatewayClient.getRunStatus as jest.MockedFunction<
  typeof hermesGatewayClient.getRunStatus
>;
const stopRun = hermesGatewayClient.stopRun as jest.MockedFunction<
  typeof hermesGatewayClient.stopRun
>;

describe('isWaitingForPriorChatDetail', () => {
  it('matches the waiting banner copy', () => {
    expect(isWaitingForPriorChatDetail(WAITING_FOR_PRIOR_CHAT_DETAIL)).toBe(true);
    expect(isWaitingForPriorChatDetail('Delivering your message…')).toBe(false);
  });
});

describe('filterLiveGatewayRunIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('drops 404 and terminal runs', async () => {
    getRunStatus.mockImplementation(async (_url, runId) => {
      if (runId === 'gone') {
        return null;
      }
      if (runId === 'done') {
        return { run_id: 'done', status: 'completed' };
      }
      return { run_id: 'live', status: 'running' };
    });

    const live = await filterLiveGatewayRunIds('http://mac:8642', 'key', [
      'gone',
      'done',
      'live',
    ]);
    expect(live).toEqual(['live']);
  });
});

describe('reconcileStaleActiveRunProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears banner when tracked run id is terminal on gateway', async () => {
    getRunStatus.mockResolvedValue({ run_id: 'r1', status: 'stopped' });
    const action = await reconcileStaleActiveRunProgress(
      'http://mac:8642',
      'key',
      { phase: 'working', startedAtMs: Date.now(), runId: 'r1' },
      ['r1'],
    );
    expect(action).toBe('clear');
  });

  it('clears waiting banner when no live runs are known', async () => {
    getRunStatus.mockResolvedValue(null);
    const action = await reconcileStaleActiveRunProgress(
      'http://mac:8642',
      'key',
      {
        phase: 'sending',
        startedAtMs: Date.now(),
        detail: WAITING_FOR_PRIOR_CHAT_DETAIL,
      },
      [],
    );
    expect(action).toBe('clear');
  });

  it('keeps banner when gateway reports a live run', async () => {
    getRunStatus.mockResolvedValue({ run_id: 'r1', status: 'running' });
    const action = await reconcileStaleActiveRunProgress(
      'http://mac:8642',
      'key',
      { phase: 'working', startedAtMs: Date.now(), runId: 'r1' },
      ['r1'],
    );
    expect(action).toBe('keep');
  });
});

describe('releaseMacOperatorSlot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    stopRun.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips stop for dead runs', async () => {
    getRunStatus.mockResolvedValue(null);
    const result = await releaseMacOperatorSlot('http://mac:8642', 'key', ['dead']);
    expect(stopRun).not.toHaveBeenCalled();
    expect(result.stoppedLiveRuns).toBe(0);
  });

  it('stops only live runs', async () => {
    getRunStatus.mockImplementation(async (_url, runId) =>
      runId === 'live' ? { run_id: 'live', status: 'running' } : null,
    );
    const promise = releaseMacOperatorSlot('http://mac:8642', 'key', ['dead', 'live']);
    await jest.runAllTimersAsync();
    await promise;
    expect(stopRun).toHaveBeenCalledTimes(1);
    expect(stopRun).toHaveBeenCalledWith('http://mac:8642', 'live', 'key');
  });
});

describe('retryOnSessionInUse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    getRunStatus.mockResolvedValue(null);
    stopRun.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not signal waiting when gateway has no live run to stop', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('session already in use'))
      .mockResolvedValueOnce('ok');
    const onWaiting = jest.fn();

    const promise = retryOnSessionInUse(
      'http://mac:8642',
      'key',
      () => [],
      fn,
      onWaiting,
    );
    await jest.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(onWaiting).toHaveBeenCalledWith({ hasLiveRun: false });
    expect(stopRun).not.toHaveBeenCalled();
  });

  it('signals waiting and stops when a live run blocks the session', async () => {
    getRunStatus.mockResolvedValue({ run_id: 'live', status: 'running' });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('session already in use'))
      .mockResolvedValueOnce('ok');
    const onWaiting = jest.fn();

    const promise = retryOnSessionInUse(
      'http://mac:8642',
      'key',
      () => ['live'],
      fn,
      onWaiting,
    );
    await jest.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(onWaiting).toHaveBeenCalledWith({ hasLiveRun: true });
    expect(stopRun).toHaveBeenCalledWith('http://mac:8642', 'live', 'key');
  });
});
