import {
  deriveConnectionState,
  describeConnectionReason,
  isForwardProgress,
  shouldTreatAsDisconnected,
  stageIndex,
  type ConnectionProbeInput,
} from '../utils/connectionStateMachine';

function probe(overrides: Partial<ConnectionProbeInput> = {}): ConnectionProbeInput {
  return {
    usbDetected: true,
    portReachable: true,
    authOk: true,
    eventSocketConnected: true,
    ...overrides,
  };
}

describe('connectionStateMachine', () => {
  it('reports usb_missing when no transport is detected', () => {
    const result = deriveConnectionState(probe({ usbDetected: false }));
    expect(result.stage).toBe('usb_missing');
    expect(result.reasonCode).toBe('usb_missing');
    expect(result.connected).toBe(false);
  });

  it('reports port_closed when usb is present but the gateway port does not respond', () => {
    const result = deriveConnectionState(probe({ portReachable: false }));
    expect(result.stage).toBe('port_closed');
    expect(result.reasonCode).toBe('port_closed');
    expect(result.connected).toBe(false);
  });

  it('reports auth_failed when the port answers but the key does not authenticate', () => {
    const result = deriveConnectionState(probe({ authOk: false }));
    expect(result.stage).toBe('auth_failed');
    expect(result.reasonCode).toBe('auth_failed');
    expect(result.connected).toBe(false);
  });

  it('is connected when usb/port/auth all pass, even if the event socket is down', () => {
    const result = deriveConnectionState(probe({ eventSocketConnected: false }));
    expect(result.stage).toBe('connected');
    expect(result.connected).toBe(true);
    expect(result.eventSocketDegraded).toBe(true);
    expect(result.reasonCode).toBe('event_socket_optional');
  });

  it('never treats an event-socket-only failure as disconnected (the core recurrence bug)', () => {
    const result = deriveConnectionState(probe({ eventSocketConnected: false }));
    expect(shouldTreatAsDisconnected(result)).toBe(false);
  });

  it('is fully connected with no reason code when everything including the event socket is healthy', () => {
    const result = deriveConnectionState(probe());
    expect(result.stage).toBe('connected');
    expect(result.reasonCode).toBeNull();
    expect(result.eventSocketDegraded).toBe(false);
    expect(shouldTreatAsDisconnected(result)).toBe(false);
  });

  it('evaluates stages in strict priority order — usb_missing wins over other failures', () => {
    const result = deriveConnectionState(
      probe({ usbDetected: false, portReachable: false, authOk: false }),
    );
    expect(result.stage).toBe('usb_missing');
  });

  it('describes each reason code with human copy, never raw codes', () => {
    expect(describeConnectionReason('usb_missing')).toMatch(/cable/i);
    expect(describeConnectionReason('port_closed')).toMatch(/port/i);
    expect(describeConnectionReason('auth_failed')).toMatch(/key/i);
    expect(describeConnectionReason('event_socket_optional')).toMatch(/connected/i);
    expect(describeConnectionReason(null)).toBe('Connected.');
  });

  it('orders stages so forward progress can be detected for transition logging', () => {
    expect(stageIndex('usb_missing')).toBeLessThan(stageIndex('port_closed'));
    expect(stageIndex('port_closed')).toBeLessThan(stageIndex('auth_failed'));
    expect(stageIndex('auth_failed')).toBeLessThan(stageIndex('connected'));
    expect(isForwardProgress('usb_missing', 'connected')).toBe(true);
    expect(isForwardProgress('connected', 'usb_missing')).toBe(false);
    expect(isForwardProgress('auth_failed', 'auth_failed')).toBe(true);
  });
});
