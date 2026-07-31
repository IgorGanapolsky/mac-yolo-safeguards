import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  captureThumbgateFeedback,
  enqueueOfflineThumbgateFeedback,
  flushOfflineThumbgateFeedback,
} from '../services/thumbgateClient';

describe('thumbgateClient offline queueing & flush', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('enqueues feedback to AsyncStorage on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await captureThumbgateFeedback('https://thumbgate.app', {
      signal: 'down',
      context: 'Failed tool execution context',
      whatWentWrong: 'Tool errored',
    });

    expect(result.accepted).toBe(true);
    expect(result.queuedOffline).toBe(true);

    const raw = await AsyncStorage.getItem('@thumbgate_offline_feedback_queue');
    const queue = JSON.parse(raw || '[]');
    expect(queue).toHaveLength(1);
    expect(queue[0].signal).toBe('down');
    expect(queue[0].context).toBe('Failed tool execution context');
  });

  it('flushes queued offline feedback when network becomes available', async () => {
    await enqueueOfflineThumbgateFeedback({
      signal: 'up',
      context: 'Successful execution context',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ accepted: true, feedbackId: 'fb_123' })),
    } as unknown as Response);

    const count = await flushOfflineThumbgateFeedback('https://thumbgate.app');
    expect(count).toBe(1);

    const raw = await AsyncStorage.getItem('@thumbgate_offline_feedback_queue');
    expect(raw).toBeNull();
  });
});
