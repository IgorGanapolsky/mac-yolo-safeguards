import { DEAD_RUN_ENDED_DETAIL } from '../utils/deadRunDetection';
import { resolveRunProgressRetryAction } from '../utils/runProgressRetryAction';

const onRetryFailedSend = jest.fn();
const onRetryConnectivity = jest.fn();

function setup(overrides: Record<string, unknown> = {}) {
  return resolveRunProgressRetryAction({
    phase: 'failed',
    detail: 'The model returned no reply text.',
    lastFailedSendText: 'hello, world',
    lastFailedOutboundText: undefined,
    connectivityRunFailure: true,
    macReachable: false,
    onRetryFailedSend,
    onRetryConnectivity,
    ...overrides,
  });
}

describe('resolveRunProgressRetryAction', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('offers Reconnect (not Retry send) while disconnected, even with a failed send', () => {
    // Regression: "retry send when not connected" — must surface Reconnect instead.
    const action = setup({ macReachable: false, connectivityRunFailure: true });
    expect(action).toBe(onRetryConnectivity);
    expect(action).not.toBe(onRetryFailedSend);
  });

  it('offers Reconnect while disconnected for a dead-run-ended detail', () => {
    const action = setup({
      detail: DEAD_RUN_ENDED_DETAIL,
      macReachable: false,
      connectivityRunFailure: true,
    });
    expect(action).toBe(onRetryConnectivity);
    expect(action).not.toBe(onRetryFailedSend);
  });

  it('offers Retry send when connected and the reply was empty', () => {
    const action = setup({ macReachable: true, connectivityRunFailure: false });
    expect(action).toBe(onRetryFailedSend);
  });

  it('offers Retry send when connected and a failed send text is present', () => {
    const action = setup({
      detail: 'Something else went wrong.',
      macReachable: true,
      connectivityRunFailure: false,
    });
    expect(action).toBe(onRetryFailedSend);
  });

  it('offers Reconnect when connected but the detail is itself a connectivity message', () => {
    const action = setup({
      detail: "Can't reach your computer — tap Computer above",
      macReachable: true,
      connectivityRunFailure: true,
    });
    expect(action).toBe(onRetryConnectivity);
  });

  it('returns undefined when connected and nothing is failing', () => {
    const action = setup({
      phase: 'completed',
      detail: undefined,
      lastFailedSendText: null,
      connectivityRunFailure: false,
      macReachable: true,
    });
    expect(action).toBeUndefined();
  });
});
