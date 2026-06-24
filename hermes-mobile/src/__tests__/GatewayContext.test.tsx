import React from 'react';
import { Text } from 'react-native';
import { render, act, waitFor } from '@testing-library/react-native';
import { GatewayProvider, useGateway } from '../context/GatewayContext';
import { storage } from '../services/storage';
import { secureCredentials } from '../services/secureCredentials';

jest.mock('../services/storage');
jest.mock('../services/secureCredentials');
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('../services/approvalNotifications', () => ({
  initApprovalNotifications: jest.fn().mockResolvedValue(undefined),
  requestApprovalNotificationPermission: jest.fn().mockResolvedValue(undefined),
  parseApprovalNotificationResponse: jest.fn(),
  parseHermesNotificationResponse: jest.fn(),
  scheduleApprovalNotification: jest.fn().mockResolvedValue(undefined),
  scheduleRunProgressNotification: jest.fn().mockResolvedValue(undefined),
  scheduleRunCompletedNotification: jest.fn().mockResolvedValue(undefined),
  clearRunProgressNotification: jest.fn().mockResolvedValue(undefined),
  scheduleRunStallNotification: jest.fn().mockResolvedValue(undefined),
  cancelRunStallNotification: jest.fn().mockResolvedValue(undefined),
  syncHermesNotificationBadge: jest.fn().mockResolvedValue(undefined),
  dismissApprovalNotifications: jest.fn().mockResolvedValue(undefined),
  dismissApprovalNotification: jest.fn().mockResolvedValue(undefined),
  syncSmartApprovalNotifications: jest.fn().mockResolvedValue(undefined),
  addApprovalNotificationResponseListener: jest.fn().mockResolvedValue({ remove: jest.fn() }),
}));
jest.mock('../services/gatewayProfiles', () => ({
  gatewayProfiles: {
    load: jest.fn().mockResolvedValue({ profiles: [], activeProfileId: null }),
    save: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  },
  activeProfile: jest.fn(() => null),
  migrateLegacyGateway: jest.fn((state) => state),
  upsertDiscoveredProfile: jest.fn((state, discovered, makeActive) => ({
    profiles: [...state.profiles, { id: 'p1', label: 'Mac', gatewayUrl: discovered.gatewayUrl, addedAt: '' }],
    activeProfileId: makeActive ? 'p1' : state.activeProfileId,
  })),
  selectProfile: jest.fn((state, id) => ({ ...state, activeProfileId: id })),
  removeProfile: jest.fn((state) => state),
  touchProfileHealth: jest.fn((state) => state),
  dedupeGatewayProfiles: jest.fn((state) => state),
}));
jest.mock('../services/thumbgateIap', () => ({
  initializeThumbgateIapListeners: jest.fn(),
  syncThumbgateLeashEntitlement: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../services/mobileRelayClient');
jest.mock('../services/hermesGatewayClient', () => ({
  stopRun: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/discover', () => ({
  getPackagerHostIp: jest.fn(() => null),
}));
jest.mock('../services/signOfLife', () => ({
  emitSignOfLife: jest.fn(),
}));
jest.mock('../services/thumbgateClient', () => ({
  captureThumbgateFeedback: jest.fn().mockResolvedValue({ accepted: true }),
}));
jest.mock('../services/haptics', () => ({
  haptics: {
    light: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  url: string;
  readyState = 1;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  send = jest.fn();
  close = jest.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen({});
    }, 0);
  }
}

function Probe() {
  const gateway = useGateway();
  return (
    <>
      <Text testID="connection-state">{gateway.connectionState}</Text>
      <Text testID="pending-count">{gateway.pendingApprovals.length}</Text>
      <Text testID="transcript-nonce">{gateway.transcriptSyncNonce}</Text>
    </>
  );
}

function ProgressProbe() {
  const gateway = useGateway();
  return (
    <>
      <Text testID="connection-state">{gateway.connectionState}</Text>
      <Text testID="run-progress-detail">{gateway.runProgress?.detail ?? 'none'}</Text>
      <Text
        testID="chat-stream-lock"
        onPress={() => gateway.setChatStreamProgressActive(true)}
      >
        lock
      </Text>
      <Text
        testID="chat-stream-unlock"
        onPress={() => gateway.setChatStreamProgressActive(false)}
      >
        unlock
      </Text>
      <Text
        testID="seed-progress"
        onPress={() =>
          gateway.setRunProgress({
            phase: 'sending',
            startedAtMs: Date.now(),
            detail: 'Sending to your computer…',
          })
        }
      >
        seed
      </Text>
    </>
  );
}

describe('GatewayProvider', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    (storage.loadGatewaySettings as jest.Mock).mockResolvedValue({
      connectionMode: 'gateway',
      cloudUrl: 'https://hermes-mobile-cloud.fly.dev',
      gatewayUrl: 'http://127.0.0.1:8642',
      usePortal: false,
      redactPii: true,
      notificationsEnabled: false,
      demoMode: false,
      glanceMode: false,
      safetyMode: false,
      thumbgateCaptureOnDown: true,
      thumbgateCaptureOnUp: false,
      thumbgateApiUrl: 'https://thumbgate.example.com',
      thumbgateProActive: true,
      approvalPolicy: 'balanced',
      analyticsOptOut: false,
      includeToolActivity: true,
    });
    (secureCredentials.loadApiKey as jest.Mock).mockResolvedValue('sk-test');
    (secureCredentials.loadThumbgateApiKey as jest.Mock).mockResolvedValue('');
    (secureCredentials.loadMobileToken as jest.Mock).mockResolvedValue('');
    (storage.saveGatewaySettings as jest.Mock).mockResolvedValue(undefined);
    (storage.loadLastGatewayLanIp as jest.Mock).mockResolvedValue(null);
    (storage.saveLastGatewayLanIp as jest.Mock).mockResolvedValue(undefined);
    (secureCredentials.saveApiKey as jest.Mock).mockResolvedValue(undefined);

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', gateway_state: 'running', pid: 1 }),
      }),
    ) as jest.Mock;
  });

  it('connects gateway websocket after load', async () => {
    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });
    expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    expect(MockWebSocket.instances[MockWebSocket.instances.length - 1].url).toContain('/v1/events');
  });

  it('queues GATE.BLOCKED from websocket', async () => {
    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: 'GATE.BLOCKED',
          timestamp: '2026-06-18T12:00:00.000Z',
          payload: {
            actionId: 'act_ws_1',
            toolName: 'run_command',
            reason: 'blocked',
            command: 'rm -rf /',
          },
        }),
      });
    });

    await waitFor(() => {
      expect(getByTestId('pending-count').props.children).toBe(1);
    });
  });

  it('bumps transcript nonce on TRANSCRIPT.UPDATED', async () => {
    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: 'TRANSCRIPT.UPDATED',
          payload: { sessionId: 'sess_1' },
        }),
      });
    });

    await waitFor(() => {
      expect(getByTestId('transcript-nonce').props.children).toBe(1);
    });
  });

  it('automatically resolves and approves GATE.BLOCKED smoke messages via WebSocket', async () => {
    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: 'GATE.BLOCKED',
          timestamp: '2026-06-18T12:00:00.000Z',
          payload: {
            actionId: 'smoke_1',
            toolName: 'run_command',
            reason: 'Reply with exactly CODEX-RUNTIME-OK',
          },
        }),
      });
    });

    await waitFor(() => {
      expect(getByTestId('pending-count').props.children).toBe(0);
    });

    expect(ws.send).toHaveBeenCalled();
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData.event).toBe('GATE.ACTION');
    expect(sentData.payload.actionId).toBe('smoke_1');
    expect(sentData.payload.decision).toBe('approve');
  });

  it('handles stop_run action from notifications and calls stopRun API', async () => {
    const approvalNotifications = jest.requireMock('../services/approvalNotifications');
    const hermesGatewayClient = jest.requireMock('../services/hermesGatewayClient');

    approvalNotifications.parseHermesNotificationResponse.mockReturnValue({
      kind: 'stop_run',
      runId: 'run_123',
    });

    render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(approvalNotifications.addApprovalNotificationResponseListener).toHaveBeenCalled();
    });

    const listenerCallback = approvalNotifications.addApprovalNotificationResponseListener.mock.calls[0][0];

    await act(async () => {
      await listenerCallback({ actionIdentifier: 'stop_run' });
    });

    expect(hermesGatewayClient.stopRun).toHaveBeenCalledWith(
      expect.any(String),
      'run_123',
      expect.any(String),
    );
  });

  it('schedules run stall notification when run progress starts and cancels it when run completes', async () => {
    const approvalNotifications = jest.requireMock('../services/approvalNotifications');

    (storage.loadGatewaySettings as jest.Mock).mockResolvedValue({
      connectionMode: 'gateway',
      cloudUrl: 'https://hermes-mobile-cloud.fly.dev',
      gatewayUrl: 'http://127.0.0.1:8642',
      usePortal: false,
      redactPii: true,
      notificationsEnabled: true,
      demoMode: false,
      glanceMode: false,
      thumbgateCaptureOnDown: true,
      thumbgateCaptureOnUp: false,
      thumbgateApiUrl: 'https://thumbgate.example.com',
    });

    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    const { AppState } = require('react-native');
    const originalCurrentState = AppState.currentState;
    Object.defineProperty(AppState, 'currentState', {
      value: 'background',
      configurable: true,
    });

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: 'RUN.STATUS',
          payload: {
            runId: 'run_watchdog_1',
            status: 'working',
          },
        }),
      });
    });

    await waitFor(() => {
      expect(approvalNotifications.scheduleRunStallNotification).toHaveBeenCalledWith(
        'run_watchdog_1',
        undefined,
      );
    });

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: 'RUN.COMPLETED',
          payload: {
            runId: 'run_watchdog_1',
          },
        }),
      });
    });

    await waitFor(() => {
      expect(approvalNotifications.cancelRunStallNotification).toHaveBeenCalled();
    });

    Object.defineProperty(AppState, 'currentState', {
      value: originalCurrentState,
      configurable: true,
    });
  });

  it('does not clear run progress on run.completed while chat stream owns the banner', async () => {
    const { getByTestId } = render(
      <GatewayProvider>
        <ProgressProbe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    act(() => {
      getByTestId('seed-progress').props.onPress();
      getByTestId('chat-stream-lock').props.onPress();
    });

    await waitFor(() => {
      expect(getByTestId('run-progress-detail').props.children).toBe('Sending to your computer…');
    });

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: 'run.completed',
          payload: { session_id: 'sess_tg_1' },
        }),
      });
    });

    expect(getByTestId('run-progress-detail').props.children).toBe('Sending to your computer…');
  });

  it('clears run progress on run.completed when chat stream lock is off', async () => {
    const { getByTestId } = render(
      <GatewayProvider>
        <ProgressProbe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    act(() => {
      getByTestId('seed-progress').props.onPress();
      getByTestId('chat-stream-unlock').props.onPress();
    });

    await waitFor(() => {
      expect(getByTestId('run-progress-detail').props.children).toBe('Sending to your computer…');
    });

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: 'run.completed',
          payload: { session_id: 'sess_tg_1' },
        }),
      });
    });

    await waitFor(() => {
      expect(getByTestId('run-progress-detail').props.children).toBe('none');
    });
  });
});
