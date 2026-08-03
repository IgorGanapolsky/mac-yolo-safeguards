import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  captureThumbgateFeedback,
  enqueueOfflineThumbgateFeedback,
  flushOfflineThumbgateFeedback,
} from '../services/thumbgateClient';

describe('captureThumbgateFeedback', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('posts capture payload and returns accepted only on server success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accepted: true, feedbackId: 'fb_1' }),
    } as unknown as Response);

    const result = await captureThumbgateFeedback(
      'https://thumbgate.example.com',
      {
        signal: 'down',
        context: 'Leash rejected rm',
        whatWentWrong: 'too risky',
      },
      'sk-thumb',
    );

    expect(result.accepted).toBe(true);
    expect(result.feedbackId).toBe('fb_1');
    expect(result.queuedOffline).toBeFalsy();
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://thumbgate.example.com/v1/feedback/capture');
    expect(options.headers.Authorization).toBe('Bearer sk-thumb');
  });

  it('queues offline on network failure without claiming accepted', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await captureThumbgateFeedback(
      'https://thumbgate.app',
      {
        signal: 'down',
        context: 'Failed tool execution context',
        whatWentWrong: 'Tool errored',
      },
      'sk-thumb',
    );

    expect(result.accepted).toBe(false);
    expect(result.queuedOffline).toBe(true);

    const raw = await AsyncStorage.getItem('@thumbgate_offline_feedback_queue');
    const queue = JSON.parse(raw || '[]');
    expect(queue).toHaveLength(1);
    expect(queue[0].signal).toBe('down');
  });

  it('does not offline-queue unauthorized responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: 'A valid API key is required' }),
    } as unknown as Response);

    const result = await captureThumbgateFeedback(
      'https://thumbgate.app',
      { signal: 'up', context: 'probe' },
      null,
    );

    expect(result.accepted).toBe(false);
    expect(result.queuedOffline).toBeFalsy();
    expect(result.status).toBe(401);
    const raw = await AsyncStorage.getItem('@thumbgate_offline_feedback_queue');
    expect(raw).toBeNull();
  });

  it('flushes queued offline feedback when key + network available', async () => {
    await enqueueOfflineThumbgateFeedback({
      signal: 'up',
      context: 'Successful execution context',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ accepted: true, feedbackId: 'fb_123' }),
    } as unknown as Response);

    expect(await flushOfflineThumbgateFeedback('https://thumbgate.app', null)).toBe(0);

    const count = await flushOfflineThumbgateFeedback('https://thumbgate.app', 'sk-test');
    expect(count).toBe(1);

    const raw = await AsyncStorage.getItem('@thumbgate_offline_feedback_queue');
    expect(raw).toBeNull();
  });

  it('normalizes trailing slash on base URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accepted: true }),
    } as unknown as Response);

    await captureThumbgateFeedback(
      'https://thumbgate.example.com/',
      { signal: 'down', context: 'test' },
      'sk',
    );

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://thumbgate.example.com/v1/feedback/capture');
  });
});
