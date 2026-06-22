import { parseSseChunk, streamSessionChat } from '../services/hermesGatewayClient';

describe('hermesGatewayClient SSE', () => {
  it('parses assistant.delta events from SSE buffer', () => {
    const buffer =
      'event: assistant.delta\ndata: {"delta":"hello"}\n\n' +
      'event: assistant.delta\ndata: {"delta":" world"}\n\n';
    const { events } = parseSseChunk(buffer);
    expect(events.length).toBe(2);
    expect(events[0].event).toBe('assistant.delta');
    expect(events[0].data.delta).toBe('hello');
  });

  it('parses SSE from response.text when getReader is unavailable', async () => {
    const sse =
      'event: assistant.delta\ndata: {"delta":"hello"}\n\n' +
      'event: assistant.completed\ndata: {"content":"hello world"}\n\n';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => sse,
      body: undefined,
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;

    try {
      const onEvent = jest.fn();
      const result = await streamSessionChat(
        'http://127.0.0.1:8642',
        'sess-1',
        'hi',
        null,
        onEvent,
      );
      expect(result).toBe('hello world');
      expect(onEvent).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8642/api/sessions/sess-1/chat/stream',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
