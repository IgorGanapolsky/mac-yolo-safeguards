import http from 'http';
import {
  completePairing,
  fetchMobileRelayHealth,
  fetchQueue,
  submitVerdict,
} from '../services/mobileRelayClient';

function installRelayFetch(serverBaseUrl: string) {
  const previousFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.startsWith(serverBaseUrl)) {
      throw new Error(`unexpected fetch url: ${url}`);
    }
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const payload = init?.body ? String(init.body) : '';
      const req = http.request(
        {
          hostname: target.hostname,
          port: target.port,
          path: `${target.pathname}${target.search}`,
          method: init?.method || 'GET',
          headers: init?.headers as Record<string, string> | undefined,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            resolve({
              ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
              status: res.statusCode ?? 500,
              text: async () => raw,
              json: async () => (raw ? JSON.parse(raw) : null),
            } as Response);
          });
        },
      );
      req.on('error', reject);
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  };
  return () => {
    global.fetch = previousFetch;
  };
}

describe('mobileRelayClient against mock relay server', () => {
  let server: http.Server;
  let baseUrl: string;
  let restoreFetch: () => void;
  const mobileToken = 'mobile-test-token';
  const events = new Map<string, Record<string, unknown>>();

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const send = (status: number, body: unknown) => {
        const payload = JSON.stringify(body);
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        });
        res.end(payload);
      };

      if (req.method === 'GET' && url.pathname === '/v1/health') {
        send(200, { ok: true, version: 'mock' });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/pair/complete') {
        let raw = '';
        req.on('data', (chunk) => {
          raw += chunk;
        });
        req.on('end', () => {
          const body = JSON.parse(raw);
          if (body.code === 'MOON-DUST') {
            send(200, { mobile_token: mobileToken });
            return;
          }
          send(400, { error: 'invalid_or_expired_code' });
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/v1/queue') {
        const auth = req.headers.authorization || '';
        if (auth !== `Mobile ${mobileToken}`) {
          send(401, { error: 'unauthorized' });
          return;
        }
        send(200, {
          events: [...events.values()],
          workers: [{ id: 'mac-mini', hostname: 'Mac-mini.local', status: 'online' }],
          active_worker_id: 'mac-mini',
        });
        return;
      }

      if (req.method === 'POST' && url.pathname.startsWith('/v1/verdicts/')) {
        const eventId = decodeURIComponent(url.pathname.slice('/v1/verdicts/'.length));
        events.delete(eventId);
        send(200, { ok: true });
        return;
      }

      send(404, { error: 'not_found' });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('mock server failed to bind');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    events.set('evt_mock', {
      id: 'evt_mock',
      enqueued_at: Date.now(),
      event: {
        tool_name: 'Bash',
        hook_event_name: 'PreToolUse',
        tool_input: { command: 'echo relay mock' },
      },
    });
    restoreFetch = installRelayFetch(baseUrl);
  });

  afterAll(async () => {
    restoreFetch();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('fetches health from mock relay', async () => {
    const health = await fetchMobileRelayHealth(baseUrl);
    expect(health.ok).toBe(true);
    expect(health.version).toBe('mock');
  });

  it('completes pairing and reads queue + verdict', async () => {
    const token = await completePairing(baseUrl, 'MOON-DUST');
    expect(token).toBe(mobileToken);

    const queue = await fetchQueue(baseUrl, token);
    expect(queue.workers?.[0]?.id).toBe('mac-mini');
    expect(queue.events).toHaveLength(1);

    await submitVerdict(baseUrl, token, 'evt_mock', 'allow');
    const queueAfter = await fetchQueue(baseUrl, token);
    expect(queueAfter.events).toHaveLength(0);
  });
});
