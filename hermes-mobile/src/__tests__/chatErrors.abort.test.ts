import {
  humanizeChatError,
  isRawAbortMessage,
  USER_RUN_INTERRUPTED_MESSAGE,
} from '../utils/chatErrors';

describe('chatErrors abort humanization', () => {
  it('detects bare Aborted from agent runtimes', () => {
    expect(isRawAbortMessage('Aborted')).toBe(true);
    expect(isRawAbortMessage('aborted')).toBe(true);
    expect(isRawAbortMessage('AbortError')).toBe(true);
    expect(isRawAbortMessage('The operation was aborted')).toBe(true);
    expect(isRawAbortMessage('Something aborted mid-tool with context')).toBe(false);
  });

  it('humanizes Aborted to a clear next step', () => {
    const { message } = humanizeChatError(new Error('Aborted'), 'fallback');
    expect(message).toBe(USER_RUN_INTERRUPTED_MESSAGE);
    expect(message.toLowerCase()).not.toContain('aborted');
  });

  it('humanizes AbortError name without leaking jargon', () => {
    const error = new Error('whatever');
    error.name = 'AbortError';
    const { message } = humanizeChatError(error, 'fallback');
    expect(message).toBe(USER_RUN_INTERRUPTED_MESSAGE);
  });

  it('humanizes short JSON error payloads with Aborted', () => {
    const { message } = humanizeChatError(new Error('{"error":"Aborted"}'), 'fallback');
    expect(message).toBe(USER_RUN_INTERRUPTED_MESSAGE);
  });
});
