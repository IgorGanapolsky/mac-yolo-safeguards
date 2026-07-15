import {
  consumeStartFreshChatRequest,
  requestStartFreshChat,
  resetStartFreshChatDeepLinkState,
  subscribeStartFreshChatRequest,
} from '../utils/startFreshChatDeepLink';

describe('startFreshChatDeepLink', () => {
  beforeEach(() => {
    resetStartFreshChatDeepLinkState();
  });

  it('request then consume returns true once', () => {
    expect(consumeStartFreshChatRequest()).toBe(false);
    requestStartFreshChat();
    expect(consumeStartFreshChatRequest()).toBe(true);
    expect(consumeStartFreshChatRequest()).toBe(false);
  });

  it('notifies subscribers when requested', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeStartFreshChatRequest(listener);
    requestStartFreshChat();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    requestStartFreshChat();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
