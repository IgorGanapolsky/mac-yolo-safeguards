import {
  normalizeGatewayUrl,
  gateBlockedToPending,
  buildGateActionMessage,
  buildEventsWebSocketUrl,
  fetchGatewayHealth,
  parseGatewayEvent,
  parseReclaimEvent,
} from '../services/gatewayClient';

function classifyHealth(body: Record<string, unknown>, errorMessage?: string) {
  if (errorMessage) return 'red';
  const status = String(body.status ?? '').toLowerCase();
  const gatewayState = String(body.gateway_state ?? '').toLowerCase();
  if (status === 'ok') {
    if (!gatewayState || gatewayState === 'running') return 'green';
    return 'amber';
  }
  if (gatewayState === 'running') return 'amber';
  return 'red';
}

describe('normalizeGatewayUrl', () => {
  it('strips /v1 and /health suffixes', () => {
    const result = normalizeGatewayUrl('https://tunnel.example.com/v1/health');
    expect(result.httpBase).toBe('https://tunnel.example.com');
    expect(result.wsBase).toBe('wss://tunnel.example.com');
  });

  it('converts http to ws scheme', () => {
    const result = normalizeGatewayUrl('http://127.0.0.1:8642');
    expect(result.wsBase).toBe('ws://127.0.0.1:8642');
  });
});

describe('gateBlockedToPending', () => {
  it('maps GATE.BLOCKED events to pending approvals', () => {
    const pending = gateBlockedToPending({
      event: 'GATE.BLOCKED',
      timestamp: '2026-06-15T12:00:00.000Z',
      payload: {
        actionId: 'act_1',
        toolName: 'run_command',
        reason: 'blocked',
        command: 'rm -rf /',
      },
    });
    expect(pending?.actionId).toBe('act_1');
    expect(pending?.toolName).toBe('run_command');
  });
});

describe('buildGateActionMessage', () => {
  it('builds GATE.ACTION payload', () => {
    const msg = buildGateActionMessage('act_1', 'approve');
    expect(msg.event).toBe('GATE.ACTION');
    expect(msg.payload?.actionId).toBe('act_1');
    expect(msg.payload?.decision).toBe('approve');
  });
});

describe('buildEventsWebSocketUrl', () => {
  it('targets /v1/events on ws scheme', () => {
    expect(buildEventsWebSocketUrl('http://localhost:8642')).toBe(
      'ws://localhost:8642/v1/events',
    );
  });
});

describe('parseGatewayEvent', () => {
  it('returns null for invalid JSON', () => {
    expect(parseGatewayEvent('not-json')).toBeNull();
  });

  it('parses valid events', () => {
    const event = parseGatewayEvent(JSON.stringify({ event: 'TRANSCRIPT.UPDATED', payload: {} }));
    expect(event?.event).toBe('TRANSCRIPT.UPDATED');
  });
});

describe('parseReclaimEvent', () => {
  it('maps RECLAIM.FIRED payloads', () => {
    const reclaim = parseReclaimEvent({
      event: 'RECLAIM.FIRED',
      payload: { target: 'simulator', reason: 'runaway' },
    });
    expect(reclaim?.target).toBe('simulator');
  });
});

describe('fetchGatewayHealth', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('returns green snapshot for ok+running', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        gateway_state: 'running',
        hostname: 'mac',
        local_ip: '10.0.0.1',
      }),
    });

    const health = await fetchGatewayHealth('http://127.0.0.1:8642', 'sk-key');
    expect(health.level).toBe('green');
    expect(health.hostname).toBe('mac');
  });

  it('returns green for hermes-agent /health without gateway_state', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        platform: 'hermes-agent',
        hostname: 'mac',
        local_ip: '192.168.12.208',
      }),
    });

    const health = await fetchGatewayHealth('http://192.168.12.208:8642');
    expect(health.level).toBe('green');
    expect(health.localIp).toBe('192.168.12.208');
  });

  it('returns red on HTTP error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    const health = await fetchGatewayHealth('http://127.0.0.1:8642');
    expect(health.level).toBe('red');
    expect(health.errorMessage).toContain('503');
  });
});

describe('health classification', () => {
  it('returns green for ok alone', () => {
    expect(classifyHealth({ status: 'ok' })).toBe('green');
  });

  it('returns green for ok+running', () => {
    expect(classifyHealth({ status: 'ok', gateway_state: 'running' })).toBe('green');
  });
});
