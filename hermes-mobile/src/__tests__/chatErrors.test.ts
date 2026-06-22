import {
  friendlyMacUnreachableMessage,
  humanizeChatError,
  isConnectivityError,
  isConnectivityMessage,
} from '../utils/chatErrors';

describe('chatErrors', () => {
  it('detects network failures', () => {
    expect(isConnectivityError(new Error('Network request failed'))).toBe(true);
    expect(isConnectivityError(new Error('session_not_found'))).toBe(false);
  });

  it('humanizes connectivity without gateway jargon', () => {
    const result = humanizeChatError(new Error('Failed to fetch'), 'fallback');
    expect(result.kind).toBe('connectivity');
    expect(result.message).toBe(friendlyMacUnreachableMessage());
    expect(result.message.toLowerCase()).not.toContain('gateway');
  });

  it('flags legacy scary banner text as connectivity', () => {
    expect(
      isConnectivityMessage(
        'Failed to connect to your Mac. Make sure the gateway is running and your device is on the same Wi-Fi.',
      ),
    ).toBe(true);
  });
});
