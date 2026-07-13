import { Platform } from 'react-native';
import {
  CHAT_STREAM_FIRST_BYTE_MS,
  extractCapabilitiesModel,
  extractForkedSessionId,
  forkSession,
  parseSseChunk,
  streamSessionChat,
} from '../services/hermesGatewayClient';

describe('extractForkedSessionId', () => {
  it('reads session.id from the current gateway fork payload', () => {
    expect(
      extractForkedSessionId({
        object: 'hermes.session',
        session: { id: 'api_1783979315_d5abef4c', title: 'make money today #8' },
      }),
    ).toBe('api_1783979315_d5abef4c');
  });

  it('falls back to top-level session_id for older shapes', () => {
    expect(extractForkedSessionId({ session_id: 'legacy_fork_1' })).toBe('legacy_fork_1');
  });

  it('returns null when no id is present', () => {
    expect(extractForkedSessionId({ object: 'hermes.session', session: {} })).toBeNull();
    expect(extractForkedSessionId(null)).toBeNull();
  });
});

describe('forkSession', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('normalizes gateway session.id into session_id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        object: 'hermes.session',
        session: { id: 'api_forked_abc', title: 'Chat #2' },
      }),
    }) as typeof fetch;

    await expect(forkSession('http://127.0.0.1:8642', 'api_source', 'sk-test')).resolves.toEqual({
      session_id: 'api_forked_abc',
    });
  });
});

describe('extractCapabilitiesModel', () => {
  it('returns the real model from the model field', () => {
    expect(extractCapabilitiesModel({ object: 'capabilities', model: 'qwen3:8b-64k' })).toBe(
      'qwen3:8b-64k',
    );
  });

  it('skips the hermes-agent platform label and falls back to default_model', () => {
    expect(
      extractCapabilitiesModel({
        object: 'capabilities',
        model: 'hermes-agent',
        default_model: 'glm-coding',
      }),
    ).toBe('glm-coding');
  });

  it('reads llm when model and default_model are platform labels', () => {
    expect(
      extractCapabilitiesModel({
        object: 'capabilities',
        model: 'hermes',
        default_model: 'gateway',
        llm: 'google/gemini-2.5-flash',
      }),
    ).toBe('google/gemini-2.5-flash');
  });

  it('reads the first real entry from a models list (string or object shapes)', () => {
    expect(
      extractCapabilitiesModel({ object: 'capabilities', models: ['hermes-agent', 'qwen3:8b-64k'] }),
    ).toBe('qwen3:8b-64k');
    expect(
      extractCapabilitiesModel({
        object: 'capabilities',
        model: 'hermes-agent',
        models: [{ id: 'glm-coding' }],
      }),
    ).toBe('glm-coding');
    expect(
      extractCapabilitiesModel({ object: 'capabilities', models: [{ name: 'qwen2.5:3b-64k' }] }),
    ).toBe('qwen2.5:3b-64k');
  });

  it('returns null when only the platform label is knowable', () => {
    expect(extractCapabilitiesModel({ object: 'capabilities', model: 'hermes-agent' })).toBeNull();
    expect(extractCapabilitiesModel(null)).toBeNull();
    expect(extractCapabilitiesModel({ object: 'capabilities' })).toBeNull();
  });
});

describe('hermesGatewayClient SSE', () => {
  const originalOs = Platform.OS;

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

  it('detaches native XHR after first-byte wait when HTTP already accepted', async () => {
    Platform.OS = 'android';
    jest.useFakeTimers();

    class SlowXHR {
      responseText = '';
      status = 200;
      readyState = 0;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onreadystatechange: (() => void) | null = null;
      onabort: (() => void) | null = null;
      aborted = false;

      open() {}
      setRequestHeader() {}
      send() {
        this.readyState = 2;
        this.onreadystatechange?.();
      }
      abort() {
        this.aborted = true;
        this.onabort?.();
      }
    }

    const originalXhr = global.XMLHttpRequest;
    const xhrInstance = new SlowXHR();
    global.XMLHttpRequest = jest.fn(() => xhrInstance) as unknown as typeof XMLHttpRequest;

    try {
      const onStreamAccepted = jest.fn();
      const streamPromise = streamSessionChat(
        'http://127.0.0.1:8642',
        'sess-slow',
        'hi',
        'sk-test',
        undefined,
        undefined,
        onStreamAccepted,
      );
      await Promise.resolve();
      expect(onStreamAccepted).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(CHAT_STREAM_FIRST_BYTE_MS + 1_000);
      await expect(streamPromise).resolves.toBe('');
      expect(xhrInstance.aborted).toBe(false);
    } finally {
      jest.useRealTimers();
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

describe('toolset config/env client', () => {
  it('GETs toolset config and PUTs env without echoing secrets', async () => {
    const { getToolsetConfig, saveToolsetEnv } = require('../services/hermesGatewayClient');
    const originalFetch = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'x_search',
          providers: [
            {
              name: 'xAI API key',
              env_vars: [{ key: 'XAI_API_KEY', is_set: false }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          name: 'x_search',
          saved: ['XAI_API_KEY'],
          is_set: { XAI_API_KEY: true },
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    try {
      const config = await getToolsetConfig('http://127.0.0.1:8642', 'x_search', 'sk-test');
      expect(config.name).toBe('x_search');
      expect(config.providers?.[0].env_vars?.[0].is_set).toBe(false);

      const saved = await saveToolsetEnv(
        'http://127.0.0.1:8642',
        'x_search',
        { XAI_API_KEY: 'xai-secret' },
        'sk-test',
      );
      expect(saved.saved).toEqual(['XAI_API_KEY']);
      expect(JSON.stringify(saved)).not.toContain('xai-secret');
      expect(fetchMock.mock.calls[1][0]).toContain('/v1/toolsets/x_search/env');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
