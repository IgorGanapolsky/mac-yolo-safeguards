import { Platform } from 'react-native';
import { parseSseChunk, streamSessionChat } from '../services/hermesGatewayClient';
import { trackProductEvent } from '../services/productAnalytics';

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn(() => Promise.resolve()),
}));

describe('hermesGatewayClient SSE', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    (trackProductEvent as jest.Mock).mockClear();
  });

  afterEach(() => {
    Platform.OS = originalOs;
  });

  it('parses assistant.delta events from SSE buffer', () => {
    const buffer =
      'event: assistant.delta\ndata: {"delta":"hello"}\n\n' +
      'event: assistant.delta\ndata: {"delta":" world"}\n\n';
    const { events } = parseSseChunk(buffer);
    expect(events.length).toBe(2);
    expect(events[0].event).toBe('assistant.delta');
    expect(events[0].data.delta).toBe('hello');
  });

  it('parses SSE from fetch on web when getReader is unavailable', async () => {
    Platform.OS = 'web';
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
      const onStreamAccepted = jest.fn();
      const result = await streamSessionChat(
        'http://127.0.0.1:8642',
        'sess-1',
        'hi',
        null,
        onEvent,
        undefined,
        onStreamAccepted,
      );
      expect(result).toBe('hello world');
      expect(onEvent).toHaveBeenCalled();
      expect(onStreamAccepted).toHaveBeenCalledTimes(1);
      expect(trackProductEvent).toHaveBeenCalledWith(
        'chat_send_performance',
        expect.objectContaining({
          transport: 'fetch-sse',
          status: 'success',
          message_length: 2,
          has_system_message: false,
        }),
      );
      expect(Object.values((trackProductEvent as jest.Mock).mock.calls[0][1])).not.toContain('hi');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8642/api/sessions/sess-1/chat/stream',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reconciles assistant text from run.completed messages', async () => {
    Platform.OS = 'web';
    const sse =
      'event: assistant.completed\ndata: {"content":""}\n\n' +
      'event: run.completed\ndata: {"messages":[{"role":"assistant","content":"from transcript"}]}\n\n';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => sse,
      body: undefined,
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;

    try {
      const result = await streamSessionChat('http://127.0.0.1:8642', 'sess-1', 'hi', null);
      expect(result).toBe('from transcript');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('streams incrementally via XMLHttpRequest on native', async () => {
    Platform.OS = 'android';
    const sse =
      'event: assistant.delta\ndata: {"delta":"ping"}\n\n' +
      'event: assistant.completed\ndata: {"content":"pong"}\n\n';

    class MockXHR {
      responseText = '';
      status = 200;
      readyState = 0;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onreadystatechange: (() => void) | null = null;
      onabort: (() => void) | null = null;

      open() {}
      setRequestHeader() {}
      send() {
        queueMicrotask(() => {
          this.readyState = 2;
          this.onreadystatechange?.();
          this.responseText = sse;
          this.onprogress?.();
          this.onload?.();
        });
      }
      abort() {
        this.onabort?.();
      }
    }

    const originalXhr = global.XMLHttpRequest;
    global.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;

    try {
      const onEvent = jest.fn();
      const onStreamAccepted = jest.fn();
      const result = await streamSessionChat(
        'http://127.0.0.1:8642',
        'sess-native',
        'hi',
        'sk-test',
        onEvent,
        undefined,
        onStreamAccepted,
      );
      expect(result).toBe('pong');
      expect(onEvent).toHaveBeenCalled();
      expect(onStreamAccepted).toHaveBeenCalledTimes(1);
    } finally {
      global.XMLHttpRequest = originalXhr;
    }
  });

  it('surfaces run.failed from SSE as an error when no assistant text arrived', async () => {
    Platform.OS = 'web';
    const sse = 'event: run.failed\ndata: {"error":"Connection error."}\n\n';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => sse,
      body: undefined,
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;

    try {
      await expect(
        streamSessionChat('http://127.0.0.1:8642', 'sess-1', 'hi', null),
      ).rejects.toThrow('Connection error.');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
