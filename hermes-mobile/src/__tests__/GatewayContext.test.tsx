import React from 'react';
import { Text } from 'react-native';
import { render, act, fireEvent, waitFor } from '@testing-library/react-native';
import { GatewayProvider, useGateway } from '../context/GatewayContext';
import { storage } from '../services/storage';
import { secureCredentials } from '../services/secureCredentials';
import {
  fetchMobileRelayHealth,
  fetchQueue,
} from '../services/mobileRelayClient';
import { captureThumbgateFeedback } from '../services/thumbgateClient';
import {
  __resetFreeLeashAllowanceForTests,
  consumeFreeLeashApproval,
  refreshFreeLeashWeeklyState,
} from '../utils/freeLeashAllowance';
import { FREE_LEASH_APPROVALS_PER_WEEK } from '../constants/monetization';

jest.mock('../services/storage');
jest.mock('../services/secureCredentials');
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: false })),
  writeAsStringAsync: jest.fn(async () => undefined),
}));
jest.mock('../services/sessionContinuityStorage', () => ({
  clearPendingContinuityHandoff: jest.fn().mockResolvedValue(undefined),
  loadPendingContinuityHandoff: jest.fn().mockResolvedValue(null),
  savePendingContinuityHandoff: jest.fn().mockResolvedValue(undefined),
  loadContinuityChipDismissed: jest.fn().mockResolvedValue(false),
  setContinuityChipDismissed: jest.fn().mockResolvedValue(undefined),
}));
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
jest.mock('../services/gatewayProfiles', () => {
  const actual = jest.requireActual('../services/gatewayProfiles');
  return {
    ...actual,
    gatewayProfiles: {
      load: jest.fn().mockResolvedValue({ profiles: [], activeProfileId: null }),
      save: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    },
    activeProfile: actual.activeProfile,
    migrateLegacyGateway: jest.fn((state) => state),
    upsertDiscoveredProfile: actual.upsertDiscoveredProfile,
    applyHealDiscoveredUrl: actual.applyHealDiscoveredUrl,
    selectProfile: jest.fn((state, id) => actual.selectProfile(state, id)),
    removeProfile: jest.fn((state) => state),
    touchProfileHealth: jest.fn((state) => state),
    dedupeGatewayProfiles: jest.fn((state) => state),
  };
});
jest.mock('../services/thumbgateIap', () => ({
  initializeThumbgateIapListeners: jest.fn(),
  syncThumbgateLeashEntitlement: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../services/mobileRelayClient', () => {
  const actual = jest.requireActual('../services/mobileRelayClient');
  return {
    ...actual,
    fetchMobileRelayHealth: jest.fn(),
    fetchQueue: jest.fn(),
    submitVerdict: jest.fn(),
    completePairing: jest.fn(),
  };
});
jest.mock('../services/hermesGatewayClient', () => ({
  stopRun: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/discover', () => ({
  getPackagerHostIp: jest.fn(() => null),
}));
jest.mock('../services/gatewayDiscovery', () => {
  const actual = jest.requireActual('../services/gatewayDiscovery');
  return {
    ...actual,
    discoverAllGatewaysOnLan: jest.fn().mockResolvedValue({ gateways: [], tailnetProbeHosts: [] }),
    discoverGatewayOnPhoneSubnet: jest.fn().mockResolvedValue(null),
    discoverGatewayViaPairServer: jest.fn().mockResolvedValue(null),
    bootstrapTailnetProbeHostsFromPairServers: jest
      .fn()
      .mockResolvedValue({ tailnetProbeHosts: [], gateways: [] }),
    pairServerHostFromGatewayUrl: actual.pairServerHostFromGatewayUrl,
    resolvePairServerMachineName: jest.fn().mockResolvedValue(null),
    resolvePairServerRelayCode: jest.fn().mockResolvedValue(null),
  };
});

jest.mock('../services/tailnetProbeStorage', () => ({
  tailnetProbeStorage: {
    load: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
    merge: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../services/tailscaleDiscovery', () => {
  const actual = jest.requireActual('../services/tailscaleDiscovery');
  return {
    collectTailnetProbeHosts: jest.fn(() => []),
    discoverTailscaleGateways: jest.fn().mockResolvedValue([]),
    filterNewTailscaleDiscoveries: jest.fn((_profiles, discovered) => discovered),
    tailnetHostsFromDiscoveries: actual.tailnetHostsFromDiscoveries,
  };
});
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
      <Text testID="pending-chat-relay-text">{gateway.pendingChatRelayText ?? ''}</Text>
      <Text testID="transcript-nonce">{gateway.transcriptSyncNonce}</Text>
      <Text testID="last-error">{gateway.lastEventError ?? ''}</Text>
      <Text testID="mobile-token">{gateway.mobileToken}</Text>
      <Text testID="connection-mode">{gateway.settings.connectionMode}</Text>
      <Text testID="gateway-api-key">{gateway.apiKey}</Text>
      <Text testID="profiles-ids">{gateway.gatewayProfiles.map(p => p.id).join(',')}</Text>
      <Text testID="relay-worker-count">{gateway.relayWorkers.length}</Text>
      <Text testID="active-relay-worker-id">{gateway.activeRelayWorkerId ?? ''}</Text>
      <Text
        testID="select-profile"
        onPress={() => {
          const macProfile = gateway.gatewayProfiles.find(
            (profile) =>
              profile.gatewayUrl === 'http://10.2.29.103:8642' ||
              profile.id === 'mac_mac_mini_local',
          );
          if (macProfile) {
            void gateway.selectGatewayProfile(macProfile.id);
          }
        }}
      >
        select
      </Text>
      <Text
        testID="enqueue-text-approval"
        onPress={() =>
          gateway.enqueueTextApproval({
            actionId: 'text_confirm_1',
            toolName: 'chat_confirmation',
            reason: 'Proceed with removing old entries',
            command: 'Proceed',
            approveText: 'Proceed',
            receivedAt: '2026-06-24T15:40:00.000Z',
            source: 'text_nudge',
            allowPermanent: false,
          })
        }
      >
        queue
      </Text>
      <Text
        testID="approve-text-approval"
        onPress={() => {
          void gateway.submitApprovalChoice('text_confirm_1', 'once');
        }}
      >
        approve
      </Text>
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

    const thumbgateIap = jest.requireMock('../services/thumbgateIap');
    thumbgateIap.syncThumbgateLeashEntitlement.mockResolvedValue(true);
    (captureThumbgateFeedback as jest.Mock).mockResolvedValue({ accepted: true });

    (storage.loadGatewaySettings as jest.Mock).mockResolvedValue({
      connectionMode: 'gateway',
      cloudUrl: 'https://hermesmobile-cloud.fly.dev',
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
    (storage.loadLastSelectedProfileId as jest.Mock).mockResolvedValue(null);
    (storage.saveLastSelectedProfileId as jest.Mock).mockResolvedValue(undefined);
    (storage.loadApprovalsCount as jest.Mock).mockResolvedValue(0);
    (storage.incrementApprovalsCount as jest.Mock).mockResolvedValue(1);
    (secureCredentials.saveApiKey as jest.Mock).mockResolvedValue(undefined);
    (fetchMobileRelayHealth as jest.Mock).mockResolvedValue({ ok: true });
    (fetchQueue as jest.Mock).mockResolvedValue({ events: [] });

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

  it('starts without a gateway credential when none was paired or saved', async () => {
    (secureCredentials.loadApiKey as jest.Mock).mockResolvedValue(null);

    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('gateway-api-key').props.children).toBe('');
    });
  });

  it('shows connected (not Reconnecting) when HTTP /health is OK even if the events socket never opens', async () => {
    // The real :8642 gateway exposes NO events WebSocket — the socket errors/closes
    // forever. A reachable /health means chat works, so the app must report
    // connected instead of looping the doomed socket and flashing "Reconnecting…".
    class FailingWebSocket {
      static instances: FailingWebSocket[] = [];
      static OPEN = 1;
      static CLOSED = 3;
      url: string;
      readyState = 3;
      onopen: ((event: unknown) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      send = jest.fn();
      close = jest.fn();
      constructor(url: string) {
        this.url = url;
        FailingWebSocket.instances.push(this);
        // Never fires onopen — mimics a gateway with no WS route (404 on upgrade).
        setTimeout(() => {
          this.onerror?.({});
          this.onclose?.({});
        }, 0);
      }
    }
    (global as unknown as { WebSocket: typeof FailingWebSocket }).WebSocket = FailingWebSocket;

    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });
    // No misleading loopback error when the Mac is actually reachable over HTTP.
    expect(getByTestId('last-error').props.children).toBe('');
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

  it('queues chat confirmation approvals for Leash and relays Proceed once approved', async () => {
    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });

    act(() => {
      fireEvent.press(getByTestId('enqueue-text-approval'));
    });

    await waitFor(() => {
      expect(getByTestId('pending-count').props.children).toBe(1);
    });

    await act(async () => {
      fireEvent.press(getByTestId('approve-text-approval'));
    });

    await waitFor(() => {
      expect(getByTestId('pending-count').props.children).toBe(0);
      expect(getByTestId('pending-chat-relay-text').props.children).toBe('Proceed');
    });

    act(() => {
      fireEvent.press(getByTestId('enqueue-text-approval'));
    });

    expect(getByTestId('pending-count').props.children).toBe(0);
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

  it('uses paired cloud relay without Wi-Fi WebSocket or Pro gating', async () => {
    const thumbgateIap = jest.requireMock('../services/thumbgateIap');
    thumbgateIap.syncThumbgateLeashEntitlement.mockResolvedValue(false);
    (storage.loadGatewaySettings as jest.Mock).mockResolvedValue({
      connectionMode: 'relay',
      cloudUrl: 'https://hermesmobile-cloud.fly.dev',
      gatewayUrl: 'http://10.2.29.103:8642',
      usePortal: false,
      redactPii: true,
      notificationsEnabled: false,
      demoMode: false,
      glanceMode: false,
      safetyMode: false,
      thumbgateCaptureOnDown: true,
      thumbgateCaptureOnUp: false,
      thumbgateApiUrl: 'https://thumbgate.example.com',
      thumbgateProActive: false,
      approvalPolicy: 'balanced',
      analyticsOptOut: false,
      includeToolActivity: true,
    });
    (secureCredentials.loadMobileToken as jest.Mock).mockResolvedValue('mobile-token-1');
    (fetchQueue as jest.Mock).mockResolvedValue({
      workers: [
        {
          id: 'mac-mini',
          hostname: 'Igors-Mac-mini.local',
          project: 'skool_top1percent',
          status: 'online',
        },
      ],
      active_worker_id: 'mac-mini',
      events: [
        {
          id: 'relay_evt_1',
          enqueued_at: Date.UTC(2026, 5, 24, 12, 0, 0),
          reason: 'Approve remote tool call',
          event: {
            tool_name: 'Bash',
            hook_event_name: 'PreToolUse',
            tool_input: { command: 'npm test' },
          },
        },
      ],
    });

    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-state').props.children).toBe('connected');
    });
    await waitFor(() => {
      expect(getByTestId('pending-count').props.children).toBe(1);
    });
    expect(getByTestId('relay-worker-count').props.children).toBe(1);
    expect(getByTestId('active-relay-worker-id').props.children).toBe('mac-mini');

    expect(fetchQueue).toHaveBeenCalledWith(
      'https://hermesmobile-cloud.fly.dev',
      'mobile-token-1',
    );
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('preserves relay mode when selecting a saved machine profile', async () => {
    const gatewayProfilesMock = jest.requireMock('../services/gatewayProfiles');
    gatewayProfilesMock.gatewayProfiles.load.mockResolvedValue({
      profiles: [
        {
          id: 'p2',
          label: 'Mac mini',
          gatewayUrl: 'http://10.2.29.103:8642',
          addedAt: '2026-06-24T12:00:00.000Z',
        },
      ],
      activeProfileId: null,
    });
    (storage.loadGatewaySettings as jest.Mock).mockResolvedValue({
      connectionMode: 'relay',
      cloudUrl: 'https://hermesmobile-cloud.fly.dev',
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
    (secureCredentials.loadMobileToken as jest.Mock).mockResolvedValue('mobile-token-1');
    (secureCredentials.resolveApiKeyForProfile as jest.Mock).mockResolvedValue('sk-profile');

    const { getByTestId } = render(
      <GatewayProvider>
        <Probe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('connection-mode').props.children).toBe('relay');
      expect(getByTestId('profiles-ids').props.children).toContain('mac_10_2_29_103');
    });

    await act(async () => {
      fireEvent.press(getByTestId('select-profile'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(storage.saveGatewaySettings).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionMode: 'relay',
          gatewayUrl: 'http://10.2.29.103:8642',
        }),
      );
    });
  });

  it('selectGatewayProfile upserts synthesized live USB row and switches to loopback', async () => {
    const { synthesizeLiveUsbProfile } = jest.requireActual('../utils/gatewayProfilePicker');
    const gatewayProfilesMock = jest.requireMock('../services/gatewayProfiles');
    gatewayProfilesMock.gatewayProfiles.load.mockResolvedValue({
      profiles: [
        {
          id: 'mac_mini_ts',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini',
          addedAt: '2026-06-28T12:01:00Z',
        },
      ],
      activeProfileId: 'mac_mini_ts',
    });
    (secureCredentials.resolveApiKeyForProfile as jest.Mock).mockResolvedValue('sk-test');

    function UsbSelectProbe() {
      const gateway = useGateway();
      const liveUsb = synthesizeLiveUsbProfile('Igors-MacBook-Pro.local');
      return (
        <>
          <Text testID="loaded">{gateway.isLoaded ? 'yes' : 'no'}</Text>
          <Text testID="active-id">{gateway.activeGatewayProfile?.id ?? ''}</Text>
          <Text testID="gateway-url">{gateway.settings.gatewayUrl}</Text>
          <Text
            testID="select-live-usb"
            onPress={() => {
              void gateway.selectGatewayProfile(liveUsb.id, { ensureProfile: liveUsb });
            }}
          >
            select usb
          </Text>
        </>
      );
    }

    const { getByTestId } = render(
      <GatewayProvider>
        <UsbSelectProbe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('loaded').props.children).toBe('yes');
    });

    await act(async () => {
      fireEvent.press(getByTestId('select-live-usb'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getByTestId('gateway-url').props.children).toBe('http://127.0.0.1:8642');
    });
    expect(gatewayProfilesMock.gatewayProfiles.save).toHaveBeenCalled();
    expect(storage.saveLastSelectedProfileId).toHaveBeenCalled();
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
      cloudUrl: 'https://hermesmobile-cloud.fly.dev',
      gatewayUrl: 'http://127.0.0.1:8642',
      usePortal: false,
      redactPii: true,
      notificationsEnabled: true,
      notificationApprovals: true,
      notificationLiveRunStatus: true,
      notificationCompletion: true,
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
        { categoryEnabled: true },
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

  it('clears run progress notification while app is in foreground', async () => {
    const approvalNotifications = jest.requireMock('../services/approvalNotifications');

    (storage.loadGatewaySettings as jest.Mock).mockResolvedValue({
      connectionMode: 'gateway',
      cloudUrl: 'https://hermesmobile-cloud.fly.dev',
      gatewayUrl: 'http://127.0.0.1:8642',
      usePortal: false,
      redactPii: true,
      notificationsEnabled: true,
      notificationApprovals: true,
      notificationLiveRunStatus: true,
      notificationCompletion: true,
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
      value: 'active',
      configurable: true,
    });

    jest.clearAllMocks();

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          event: 'RUN.STATUS',
          payload: { runId: 'run_fg_1', status: 'working' },
        }),
      });
    });

    await waitFor(() => {
      expect(approvalNotifications.scheduleRunProgressNotification).not.toHaveBeenCalled();
      expect(approvalNotifications.clearRunProgressNotification).toHaveBeenCalled();
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

  it('captures chat output feedback when Leash is unlocked and thumbs-down capture is enabled', async () => {
    (storage.loadGatewaySettings as jest.Mock).mockResolvedValue({
      connectionMode: 'gateway',
      cloudUrl: 'https://hermesmobile-cloud.fly.dev',
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

    function FeedbackProbe() {
      const gateway = useGateway();
      return (
        <>
          <Text testID="feedback-loaded">{gateway.isLoaded ? 'yes' : 'no'}</Text>
          <Text
            testID="submit-chat-output-down"
            onPress={() => {
              void gateway.submitChatOutputFeedback(
                {
                  id: 'asst-42',
                  role: 'assistant',
                  content: 'Try running npm test again.',
                },
                'down',
                { explanation: 'Wrong command suggested' },
              );
            }}
          >
            down
          </Text>
        </>
      );
    }

    const { getByTestId } = render(
      <GatewayProvider>
        <FeedbackProbe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('feedback-loaded').props.children).toBe('yes');
    });

    await act(async () => {
      fireEvent.press(getByTestId('submit-chat-output-down'));
    });

    await waitFor(() => {
      expect(captureThumbgateFeedback).toHaveBeenCalledWith(
        'https://thumbgate.example.com',
        expect.objectContaining({
          signal: 'down',
          whatWentWrong: 'Wrong command suggested',
          tags: expect.arrayContaining(['chat-output', 'thumbs-down']),
        }),
        expect.any(String),
      );
    });
  });

  it('skips chat output feedback capture when Leash is locked', async () => {
    (captureThumbgateFeedback as jest.Mock).mockClear();
    __resetFreeLeashAllowanceForTests();
    await refreshFreeLeashWeeklyState();
    for (let i = 0; i < FREE_LEASH_APPROVALS_PER_WEEK; i += 1) {
      await consumeFreeLeashApproval();
    }
    const thumbgateIap = jest.requireMock('../services/thumbgateIap');
    thumbgateIap.syncThumbgateLeashEntitlement.mockResolvedValue(false);
    (storage.loadGatewaySettings as jest.Mock).mockResolvedValue({
      connectionMode: 'gateway',
      cloudUrl: 'https://hermesmobile-cloud.fly.dev',
      gatewayUrl: 'http://127.0.0.1:8642',
      usePortal: false,
      redactPii: true,
      notificationsEnabled: false,
      demoMode: false,
      glanceMode: false,
      safetyMode: false,
      thumbgateCaptureOnDown: true,
      thumbgateCaptureOnUp: true,
      thumbgateApiUrl: 'https://thumbgate.example.com',
      thumbgateProActive: false,
      developerLeashUnlock: false,
      approvalPolicy: 'balanced',
      analyticsOptOut: false,
      includeToolActivity: true,
    });

    function FeedbackProbe() {
      const gateway = useGateway();
      return (
        <>
          <Text testID="feedback-loaded">{gateway.isLoaded ? 'yes' : 'no'}</Text>
          <Text
            testID="submit-chat-output-up"
            onPress={() => {
              void gateway.submitChatOutputFeedback(
                { id: 'asst-99', role: 'assistant', content: 'Looks good.' },
                'up',
              );
            }}
          >
            up
          </Text>
        </>
      );
    }

    const { getByTestId } = render(
      <GatewayProvider>
        <FeedbackProbe />
      </GatewayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('feedback-loaded').props.children).toBe('yes');
    });

    await act(async () => {
      fireEvent.press(getByTestId('submit-chat-output-up'));
    });

    expect(captureThumbgateFeedback).not.toHaveBeenCalled();
  });
});
