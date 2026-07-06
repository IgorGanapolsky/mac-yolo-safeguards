import {
  CHAT_SEND_PERFORMANCE_BUDGETS_MS,
  chatSendPerformanceProperties,
  createChatSendPerformanceTracker,
  evaluateChatSendPerformance,
} from '../services/chatSendPerformance';
import { trackProductEvent } from '../services/productAnalytics';

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn(() => Promise.resolve()),
}));

describe('chatSendPerformance', () => {
  beforeEach(() => {
    (trackProductEvent as jest.Mock).mockClear();
  });

  it('evaluates accepted, first response, and completion budget breaches', () => {
    const evaluation = evaluateChatSendPerformance({
      transport: 'fetch-sse',
      messageLength: 18,
      hasSystemMessage: true,
      startedAtMs: 1_000,
      acceptedAtMs: 1_200,
      firstResponseAtMs: 4_000,
      completedAtMs: 20_000,
      status: 'success',
    });

    expect(evaluation.durations.acceptedMs).toBe(200);
    expect(evaluation.durations.firstResponseMs).toBe(3_000);
    expect(evaluation.durations.completedMs).toBe(19_000);
    expect(evaluation.breachedBudgets).toEqual(['first_response', 'completed']);
    expect(CHAT_SEND_PERFORMANCE_BUDGETS_MS.firstResponse).toBe(2_500);
  });

  it('builds content-safe analytics properties', () => {
    const props = chatSendPerformanceProperties({
      transport: 'xhr-sse',
      messageLength: 11,
      hasSystemMessage: false,
      startedAtMs: 0,
      acceptedAtMs: 50,
      firstResponseAtMs: 750,
      completedAtMs: 1_500,
      status: 'success',
    });

    expect(props).toMatchObject({
      transport: 'xhr-sse',
      status: 'success',
      message_length: 11,
      first_response_ms: 750,
      budget_breach_count: 0,
    });
    expect(Object.values(props)).not.toContain('make money faster');
  });

  it('tracks first assistant event and emits one success event', async () => {
    const times = [1_000, 1_050, 1_300, 1_800];
    const tracker = createChatSendPerformanceTracker({
      transport: 'fetch-sse',
      message: 'hello world',
      hasSystemMessage: true,
      now: () => times.shift() ?? 1_800,
    });
    const onEvent = jest.fn();
    const wrapped = tracker.wrapEventHandler(onEvent);

    tracker.markAccepted();
    wrapped({ event: 'assistant.delta', data: { delta: 'hi' } });
    await tracker.trackSuccess();
    await tracker.trackSuccess();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledTimes(1);
    expect(trackProductEvent).toHaveBeenCalledWith(
      'chat_send_performance',
      expect.objectContaining({
        transport: 'fetch-sse',
        status: 'success',
        message_length: 11,
        has_system_message: true,
        accepted_ms: 50,
        first_response_ms: 300,
        completed_ms: 800,
      }),
    );
  });

  it('tracks timeout failures without raw error text', async () => {
    const times = [2_000, 2_050, 18_000];
    const tracker = createChatSendPerformanceTracker({
      transport: 'xhr-sse',
      message: 'sensitive prompt text',
      hasSystemMessage: false,
      now: () => times.shift() ?? 18_000,
    });

    tracker.markAccepted();
    await tracker.trackFailure(new Error('Chat stream exceeded maximum wait time.'));

    expect(trackProductEvent).toHaveBeenCalledWith(
      'chat_send_performance',
      expect.objectContaining({
        transport: 'xhr-sse',
        status: 'timeout',
        message_length: 21,
        accepted_ms: 50,
        completed_ms: 16_000,
        error_kind: 'timeout',
      }),
    );
    expect(Object.keys((trackProductEvent as jest.Mock).mock.calls[0][1])).not.toContain(
      'error_message',
    );
    expect(Object.values((trackProductEvent as jest.Mock).mock.calls[0][1])).not.toContain(
      'sensitive prompt text',
    );
  });
});
