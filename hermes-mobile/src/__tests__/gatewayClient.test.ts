import {
  normalizeGatewayUrl,
  gateBlockedToPending,
  buildGateActionMessage,
  buildEventsWebSocketUrl,
} from '../services/gatewayClient';

function classifyHealth(body: Record<string, unknown>, errorMessage?: string) {
  if (errorMessage) return 'red';
  const status = String(body.status ?? '').toLowerCase();
  const gatewayState = String(body.gateway_state ?? '').toLowerCase();
  if (status === 'ok' && gatewayState === 'running') return 'green';
  if (status === 'ok' || gatewayState === 'running') return 'amber';
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

describe('health classification', () => {
  it('returns green for ok+running', () => {
    expect(classifyHealth({ status: 'ok', gateway_state: 'running' })).toBe('green');
  });
});
