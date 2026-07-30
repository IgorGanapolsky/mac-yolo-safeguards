import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';
import { renderInTabNavigator } from '../testUtils/navigation';
import { RECONNECT_AUTO_RESEND_MAX_ATTEMPTS } from '../utils/outboundSubmissionLedger';
import {
  PENDING_OUTBOUND_STORAGE_KEY,
  savePendingOutbound,
} from '../utils/pendingOutboundStorage';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file:///cache/retry-proof.png',
        fileName: 'retry-proof.png',
        mimeType: 'image/png',
        fileSize: 68,
      },
    ],
  }),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('aW1hZ2UtYnl0ZXM='),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('../services/productAnalytics', () => ({
  trackProductEvent: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Regression harness for the two device-reported chat send defects (2026-07-25):
 *
 *  BUG 1 — a stalled run auto-recovered by re-POSTing the same prompt, so one
 *          user message produced two submissions (two identical bubbles, and
 *          the Mac ran the instruction twice).
 *  BUG 2 — the failed bubble says "tap ↑ to send again" and tapping ↑ did
 *          nothing, because the composer send handler early-returned on an
 *          empty composer before reaching the retry branch.
 *
 * `connectionState: 'disconnected'` with a green direct-HTTP health probe is the
 * real-world shape that produced BUG 1: the gateway accepts the prompt, but
 * isGatewayLiveForDelivery() is false so the bubble never leaves `pending` and
 * the stuck-outbound sweep marks it "Sent — no reply from computer".
 */

const GATEWAY_URL = 'http://100.94.135.78:8642';

const mockGatewayState: Record<string, unknown> = {
  connectionState: 'disconnected' as string,
  apiKey: 'test-api-key',
  effectiveGatewayUrl: GATEWAY_URL,
  health: {
    ok: true,
    level: 'green' as const,
    hostname: 'Igors-Mac-mini.local',
    directGatewayReachable: true,
    checkedAt: '2026-07-25T00:00:00Z',
    authMismatch: false,
  },
  activeGatewayProfile: {
    id: 'mac_mini',
    label: 'Igors-Mac-mini',
    gatewayUrl: GATEWAY_URL,
    hostname: 'Igors-Mac-mini.local',
    addedAt: '2026-06-18T00:00:00Z',
  },
  gatewayProfiles: [
    {
      id: 'mac_mini',
      label: 'Igors-Mac-mini',
      gatewayUrl: GATEWAY_URL,
      hostname: 'Igors-Mac-mini.local',
      addedAt: '2026-06-18T00:00:00Z',
    },
  ],
  relayWorkers: [],
  activeRelayWorkerId: null,
  isPaired: true,
  selectGatewayProfile: jest.fn().mockResolvedValue(true),
  scanForGatewayProfiles: jest.fn().mockResolvedValue([]),
  profileScanning: false,
  profileScanProgress: null,
  profileScanResult: null,
  autoConnectGateway: jest.fn().mockResolvedValue(GATEWAY_URL),
  pendingApprovals: [],
  submitApprovalChoice: jest.fn(),
  sendGateAction: jest.fn(),
  pendingApprovalEditSeed: null,
  clearApprovalEditSeed: jest.fn(),
  runProgress: null as unknown,
  setRunProgress: jest.fn(),
  setChatStreamProgressActive: jest.fn(),
  submitChatOutputFeedback: jest.fn().mockResolvedValue(true),
  chatOutputFeedbackBusyId: null,
  addGatewayListener: jest.fn(),
  removeGatewayListener: jest.fn(),
  refreshHealth: jest.fn().mockResolvedValue(undefined),
  retryGatewayBootstrap: jest.fn().mockResolvedValue(true),
  removeGatewayProfile: jest.fn().mockResolvedValue(undefined),
  connectEvents: jest.fn(),
  addGatewayProfile: jest.fn().mockResolvedValue(undefined),
  completePair: jest.fn().mockResolvedValue(undefined),
  saveSettings: jest.fn().mockResolvedValue(undefined),
  wifiConnected: true,
  tailscaleDiscoveries: [],
  tailscaleDiscoveryProbing: false,
  addDiscoveredTailscaleComputer: jest.fn().mockResolvedValue(undefined),
  probeTailscaleComputers: jest.fn().mockResolvedValue(undefined),
  connectionHealAttempt: 6,
  connectionHealInFlight: false,
  connectionHealExhausted: true,
  settings: {
    demoMode: false,
    connectionMode: 'gateway' as const,
    gatewayUrl: GATEWAY_URL,
    cloudUrl: 'https://hermesmobile-cloud.fly.dev',
    approvalPolicy: 'balanced' as const,
    includeToolActivity: false,
  },
};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const React = require('react');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn() }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => callback(), [callback]);
    },
  };
});

jest.mock('../hooks/useGatewaySelector', () => ({
  useGatewayConnection: () => mockGatewayState,
  useGatewayRelay: () => ({
    relayWorkers: mockGatewayState.relayWorkers,
    activeRelayWorkerId: mockGatewayState.activeRelayWorkerId,
    isPaired: mockGatewayState.isPaired,
  }),
  useGatewayApprovals: () => ({
    pendingApprovals: mockGatewayState.pendingApprovals,
    submitApprovalChoice: mockGatewayState.submitApprovalChoice,
    sendGateAction: mockGatewayState.sendGateAction,
    pendingApprovalEditSeed: mockGatewayState.pendingApprovalEditSeed,
    clearApprovalEditSeed: mockGatewayState.clearApprovalEditSeed,
    runProgress: mockGatewayState.runProgress,
    setRunProgress: mockGatewayState.setRunProgress,
    setChatStreamProgressActive: mockGatewayState.setChatStreamProgressActive,
    submitChatOutputFeedback: mockGatewayState.submitChatOutputFeedback,
    chatOutputFeedbackBusyId: mockGatewayState.chatOutputFeedbackBusyId,
  }),
  useGatewayChatSync: () => ({
    transcriptSyncNonce: 0,
    pendingChatRelayText: null,
    clearChatRelayText: jest.fn(),
    notificationFocusSessionId: null,
    clearNotificationFocusSession: jest.fn(),
    addGatewayListener: mockGatewayState.addGatewayListener,
    removeGatewayListener: mockGatewayState.removeGatewayListener,
  }),
}));

jest.mock('../context/GatewayContext', () => ({
  useGateway: () => mockGatewayState,
}));

jest.mock('../services/secureCredentials', () => ({
  secureCredentials: {
    loadApiKey: jest.fn().mockResolvedValue('test-api-key'),
    saveApiKey: jest.fn().mockResolvedValue(true),
    loadMobileToken: jest.fn().mockResolvedValue('test-token'),
    saveMobileToken: jest.fn().mockResolvedValue(true),
    clearMobileToken: jest.fn().mockResolvedValue(true),
    resolveApiKeyForProfile: jest.fn().mockResolvedValue('test-api-key'),
    saveProfileApiKey: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/gatewayClient', () => {
  const actual = jest.requireActual('../services/gatewayClient');
  return {
    ...actual,
    fetchGatewayHealth: jest.fn().mockResolvedValue({
      level: 'green',
      checkedAt: '2026-07-25T00:00:00Z',
      directGatewayReachable: true,
      authMismatch: false,
    }),
  };
});

jest.mock('../services/storage', () => ({
  storage: {
    loadGatewaySettings: jest.fn().mockResolvedValue({
      demoMode: false,
      connectionMode: 'gateway',
      gatewayUrl: 'http://100.94.135.78:8642',
      cloudUrl: 'https://hermesmobile-cloud.fly.dev',
    }),
    saveGatewaySettings: jest.fn().mockResolvedValue(true),
    loadRecentPrompts: jest.fn().mockResolvedValue([]),
    saveRecentPrompt: jest.fn().mockResolvedValue(undefined),
    removeRecentPrompt: jest.fn().mockResolvedValue(undefined),
    clearRecentPrompts: jest.fn().mockResolvedValue(undefined),
    loadDismissedPrompts: jest.fn().mockResolvedValue([]),
    saveDismissedPrompt: jest.fn().mockResolvedValue(undefined),
    clearDismissedPrompts: jest.fn().mockResolvedValue(undefined),
    loadDismissedSessionIds: jest.fn().mockResolvedValue([]),
    addDismissedSessionIds: jest.fn().mockResolvedValue(undefined),
    removeDismissedSessionIds: jest.fn().mockResolvedValue(undefined),
    clearDismissedSessionIds: jest.fn().mockResolvedValue(undefined),
    loadHideCronSessions: jest.fn().mockResolvedValue(false),
    setHideCronSessions: jest.fn().mockResolvedValue(undefined),
    loadHideAutomationSessions: jest.fn().mockResolvedValue(false),
    setHideAutomationSessions: jest.fn().mockResolvedValue(undefined),
    saveLastSelectedProfileId: jest.fn().mockResolvedValue(undefined),
    loadLastSelectedProfileId: jest.fn().mockResolvedValue(null),
    loadApprovalsCount: jest.fn().mockResolvedValue(0),
    incrementApprovalsCount: jest.fn().mockResolvedValue(1),
    saveLastSessionForComputer: jest.fn().mockResolvedValue(undefined),
    loadLastSessionForComputer: jest.fn().mockResolvedValue(null),
    clearLastSessionForComputer: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/haptics', () => ({
  haptics: {
    light: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    heavy: jest.fn(),
  },
}));

jest.mock('../services/chatProjects', () => {
  const actual = jest.requireActual('../services/chatProjects');
  return {
    ...actual,
    chatProjects: {
      load: jest.fn().mockResolvedValue({
        projects: [],
        sessionProjectMap: {},
        sessionLabels: {},
        activeProjectId: null,
      }),
      save: jest.fn().mockResolvedValue(undefined),
      addProject: jest.fn(),
    },
    bindSessionToProject: jest.fn((state) => state),
    pinSessionLabel: jest.fn((state) => state),
    projectNameForSession: jest.fn(() => null),
    setActiveProject: jest.fn((state) => state),
    setActiveSession: actual.setActiveSession,
  };
});

jest.mock('../services/vaultProjects', () => ({
  fetchVaultProjectCatalog: jest.fn().mockResolvedValue(null),
  fetchVaultProjectCatalogFromHost: jest.fn().mockResolvedValue(null),
  VAULT_PROJECTS_PATH: '/vault-projects.json',
}));

jest.mock('../services/hermesGatewayClient', () => ({
  HermesGatewayApiError: class HermesGatewayApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  deleteSession: jest.fn().mockResolvedValue(undefined),
  clearAllSessions: jest.fn().mockResolvedValue(undefined),
  getCapabilities: jest.fn().mockResolvedValue({ features: {} }),
  forkSession: jest.fn(),
  stopRun: jest.fn(),
  releaseMacOperatorSlot: jest.fn().mockResolvedValue(undefined),
  streamSessionChat: jest.fn(),
  getObsidianProjects: jest.fn().mockResolvedValue([]),
  getObsidianAgents: jest.fn().mockResolvedValue([]),
}));

jest.mock('../services/hermesChatClient', () => ({
  listSessions: jest
    .fn()
    .mockResolvedValue([
      { id: 'session-1', title: 'Test Session', last_active_at: '2026-07-25T00:00:00Z' },
    ]),
  createSession: jest.fn().mockResolvedValue({ id: 'session-1', title: 'New chat' }),
  createSessionWithUniqueTitle: jest
    .fn()
    .mockResolvedValue({ id: 'session-1', title: 'New chat' }),
  listMessages: jest.fn().mockResolvedValue([]),
  sendChatMessage: jest.fn().mockResolvedValue({ assistantText: 'ok', raw: {} }),
  updateSessionTitle: jest.fn().mockResolvedValue({ id: 'session-1', title: 'Updated' }),
  getSession: jest.fn().mockResolvedValue(null),
}));

const PROMPT = 'Do it now';

function gatewayMocks() {
  return jest.requireMock('../services/hermesGatewayClient') as {
    streamSessionChat: jest.Mock;
  };
}

async function renderChat() {
  const view = renderInTabNavigator(ChatScreen, 'Chat');
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(view.getByTestId('chat-screen-header')).toBeTruthy();
  });
  return view;
}

/** Drive fake timers forward in slices so queued promise chains settle. */
async function advance(ms: number, slices = 8) {
  const step = Math.ceil(ms / slices);
  for (let index = 0; index < slices; index += 1) {
    await act(async () => {
      jest.advanceTimersByTime(step);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

/**
 * Point the mocked gateway at a reachable / unreachable Mac.
 *
 * `socket` is separate on purpose: direct HTTP up + relay socket down is the
 * real shape that leaves a gateway-ACCEPTED prompt sitting on `pending`.
 */
function setLinkState(input: { httpOk: boolean; socket?: string }) {
  mockGatewayState.connectionState =
    input.socket ?? (input.httpOk ? 'connected' : 'disconnected');
  mockGatewayState.health = {
    ok: input.httpOk,
    level: input.httpOk ? 'green' : 'red',
    hostname: 'Igors-Mac-mini.local',
    directGatewayReachable: input.httpOk,
    checkedAt: '2026-07-29T00:00:00Z',
    authMismatch: false,
  };
  // Keep the silent-heal window open so the composer is not replaced by the
  // connection-help panel while the link is down.
  mockGatewayState.connectionHealAttempt = 1;
  mockGatewayState.connectionHealInFlight = false;
  mockGatewayState.connectionHealExhausted = false;
}

/** mockGatewayState is a stable object — nudge React so effects observe the change. */
async function flushLinkChange(view: { getByTestId: (id: string) => unknown }) {
  for (const value of [' ', '']) {
    await act(async () => {
      fireEvent.changeText(view.getByTestId('chat-input') as never, value);
      await Promise.resolve();
    });
  }
}

describe('ChatScreen outbound send recovery', () => {
  // Full ChatScreen renders driven across simulated minutes of fake time; these
  // are comfortably fast alone but can exceed the 30s default when jest workers
  // are saturated by the rest of the suite.
  jest.setTimeout(90_000);

  beforeEach(async () => {
    jest.clearAllMocks();
    const { streamSessionChat } = gatewayMocks();
    streamSessionChat.mockReset();
    const chatClient = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      createSessionWithUniqueTitle: jest.Mock;
      listMessages: jest.Mock;
      sendChatMessage: jest.Mock;
    };
    chatClient.listSessions.mockResolvedValue([
      { id: 'session-1', title: 'Test Session', last_active_at: '2026-07-25T00:00:00Z' },
    ]);
    chatClient.createSessionWithUniqueTitle.mockResolvedValue({
      id: 'session-1',
      title: 'New chat',
    });
    chatClient.listMessages.mockResolvedValue([]);
    chatClient.sendChatMessage.mockResolvedValue({ assistantText: 'ok', raw: {} });
    // A test that leaves a FAILED bubble persists it; the next render would
    // hydrate that snapshot and inherit a retryable turn it never created.
    await AsyncStorage.removeItem(PENDING_OUTBOUND_STORAGE_KEY);
    // setLinkState mutates the shared mock object — restore the suite baseline so
    // link-flap tests cannot leak a red health probe into their neighbours.
    mockGatewayState.connectionState = 'disconnected';
    mockGatewayState.health = {
      ok: true,
      level: 'green',
      hostname: 'Igors-Mac-mini.local',
      directGatewayReachable: true,
      checkedAt: '2026-07-25T00:00:00Z',
      authMismatch: false,
    };
    mockGatewayState.connectionHealAttempt = 6;
    mockGatewayState.connectionHealInFlight = false;
    mockGatewayState.connectionHealExhausted = true;
    mockGatewayState.runProgress = null;
    mockGatewayState.setRunProgress = jest.fn((value: unknown) => {
      mockGatewayState.runProgress =
        typeof value === 'function'
          ? (value as (prev: unknown) => unknown)(mockGatewayState.runProgress)
          : value;
    });
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it('produces exactly ONE gateway submission when a delivered run stalls and auto-recovers', async () => {
    jest.useFakeTimers();
    const { streamSessionChat } = gatewayMocks();
    // Gateway accepts the prompt (the Mac has it), then the run never answers.
    streamSessionChat.mockImplementation(
      (
        _url: string,
        _sessionId: string,
        _message: unknown,
        _apiKey: string,
        _onEvent: unknown,
        _systemMessage: unknown,
        onStreamAccepted?: () => void,
      ) => {
        onStreamAccepted?.();
        return new Promise<string>(() => {});
      },
    );

    const { getByTestId } = await renderChat();
    await waitFor(() => {
      expect(getByTestId('chat-input')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), PROMPT);
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(streamSessionChat).toHaveBeenCalledTimes(1);
    });

    // Past the stuck-outbound sweep (2 min) plus the stall auto-recovery delay.
    await advance(150_000, 30);

    // BUG 1: recovery must RESUME the accepted run, not submit it again.
    expect(streamSessionChat).toHaveBeenCalledTimes(1);
    const bodies = streamSessionChat.mock.calls.map((call) => call[2]);
    expect(bodies).toEqual([PROMPT]);
  });

  it('keeps the accepted ledger record when the first send creates its session', async () => {
    jest.useFakeTimers();
    const { streamSessionChat } = gatewayMocks();
    const chatClient = jest.requireMock('../services/hermesChatClient') as {
      listSessions: jest.Mock;
      createSessionWithUniqueTitle: jest.Mock;
    };
    chatClient.listSessions.mockResolvedValue([]);
    chatClient.createSessionWithUniqueTitle.mockResolvedValue({
      id: 'created-session',
      title: 'Do it now',
    });
    streamSessionChat.mockImplementation(
      (
        _url: string,
        sessionId: string,
        _message: unknown,
        _apiKey: string,
        _onEvent: unknown,
        _systemMessage: unknown,
        onStreamAccepted?: () => void,
      ) => {
        expect(sessionId).toBe('created-session');
        onStreamAccepted?.();
        return new Promise<string>(() => {});
      },
    );

    const { getByTestId } = await renderChat();
    await waitFor(() => {
      expect(getByTestId('chat-input')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), PROMPT);
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(streamSessionChat).toHaveBeenCalledTimes(1);
    });

    await advance(150_000, 30);

    expect(streamSessionChat).toHaveBeenCalledTimes(1);
  });

  it('re-submits when the user taps ↑ on a failed send with an empty composer', async () => {
    const { streamSessionChat } = gatewayMocks();
    streamSessionChat.mockResolvedValue('recovered reply');

    /**
     * Seed the exact user-visible situation instead of racing a live send to it:
     * the app opens on a thread whose last turn is a red failed bubble.
     *
     * The failure is Stop-shaped on purpose — the one class NO automatic path
     * touches (not a stall marker, not auto-resendable, and no reconnect edge),
     * so any submission here is attributable to the ↑ tap alone.
     */
    await savePendingOutbound('session-1', {
      messages: [
        {
          id: 'user-seeded-1',
          role: 'user',
          content: PROMPT,
          created_at: '2026-07-29T00:00:00Z',
          outboundStatus: 'failed',
          outboundFailureReason: 'Stopped before finishing — tap ↑ to try again',
        },
      ],
      pinnedText: null,
      pinnedStatus: 'failed',
    });

    setLinkState({ httpOk: true });
    const view = await renderChat();
    await waitFor(() => {
      expect(view.getByTestId('chat-input')).toBeTruthy();
    });
    // Hydration restored the failed turn — this is what ↑ acts on.
    await waitFor(() => {
      expect(view.getByTestId('chat-outbound-failed')).toBeTruthy();
    });
    expect(streamSessionChat).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(view.getByTestId('chat-input'), '');
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(streamSessionChat).toHaveBeenCalledTimes(1);
    });
    expect(streamSessionChat.mock.calls[0]?.[2]).toBe(PROMPT);
  });

  it('retries the exact image payload once and emits content-free outcome telemetry', async () => {
    const { streamSessionChat } = gatewayMocks();
    streamSessionChat
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce('recovered reply');
    const { sendChatMessage } = jest.requireMock('../services/hermesChatClient') as {
      sendChatMessage: jest.Mock;
    };
    sendChatMessage.mockRejectedValueOnce(new Error('Network request failed'));
    const { trackProductEvent } = jest.requireMock('../services/productAnalytics') as {
      trackProductEvent: jest.Mock;
    };

    const { getByTestId } = await renderChat();
    await waitFor(() => {
      expect(getByTestId('chat-input')).toBeTruthy();
    });

    fireEvent.press(getByTestId('chat-attach-button'));
    await waitFor(() => {
      expect(getByTestId('attach-picker-photos')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId('attach-picker-photos'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId('chat-attachment-chips')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), PROMPT);
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(streamSessionChat).toHaveBeenCalledTimes(1);
    });
    const originalPayload = streamSessionChat.mock.calls[0]?.[2];
    expect(originalPayload).toEqual([
      { type: 'text', text: PROMPT },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=' },
      },
    ]);
    await waitFor(() => {
      expect(getByTestId('chat-input').props.value).toBe('');
    });

    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), '');
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(streamSessionChat).toHaveBeenCalledTimes(2);
    });
    expect(streamSessionChat.mock.calls[1]?.[2]).toEqual(originalPayload);
    expect(streamSessionChat).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(trackProductEvent).toHaveBeenCalledWith('chat_failed_send_retry', {
        outcome: 'accepted',
        attachment_count: 1,
        payload_source: 'envelope',
        requires_reattach: false,
      });
    });
    expect(JSON.stringify(trackProductEvent.mock.calls)).not.toMatch(
      /Do it now|retry-proof\.png|file:|image\/png/i,
    );
  });

  /**
   * Device verdict 2026-07-29: "tap to resend does absolutely nothing!!! Just
   * have it done automatically on reconnection."
   */
  it('auto-resends a never-accepted prompt on reconnection, exactly once, with no tap', async () => {
    jest.useFakeTimers();
    const { streamSessionChat } = gatewayMocks();
    streamSessionChat.mockResolvedValue('reply after reconnect');

    setLinkState({ httpOk: false });
    const view = await renderChat();
    await waitFor(() => {
      expect(view.getByTestId('chat-input')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(view.getByTestId('chat-input'), PROMPT);
      fireEvent.press(view.getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    // Mac unreachable: nothing was ever handed to the gateway.
    expect(streamSessionChat).not.toHaveBeenCalled();

    setLinkState({ httpOk: true });
    await flushLinkChange(view);
    await advance(6_000, 12);

    // No tap happened anywhere in this test.
    expect(streamSessionChat).toHaveBeenCalledTimes(1);
    expect(streamSessionChat.mock.calls[0]?.[2]).toBe(PROMPT);
  });

  it('does not fan out copies when the gateway flaps during the reconnect window', async () => {
    jest.useFakeTimers();
    const { streamSessionChat } = gatewayMocks();
    // Every auto-resend attempt fails again — the budget, not luck, must bound it.
    streamSessionChat.mockRejectedValue(new Error('Network request failed'));
    const { sendChatMessage } = jest.requireMock('../services/hermesChatClient') as {
      sendChatMessage: jest.Mock;
    };
    sendChatMessage.mockRejectedValue(new Error('Network request failed'));

    setLinkState({ httpOk: false });
    const view = await renderChat();
    await waitFor(() => {
      expect(view.getByTestId('chat-input')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(view.getByTestId('chat-input'), PROMPT);
      fireEvent.press(view.getByTestId('chat-send-button'));
      await Promise.resolve();
    });
    expect(streamSessionChat).not.toHaveBeenCalled();

    // Igor's mini: its watchdog SIGTERMs the gateway on a ~60s cadence during a
    // slow start, so reconnect edges arrive in bursts.
    const flapOnce = async (upMs: number, downMs: number) => {
      setLinkState({ httpOk: true });
      await flushLinkChange(view);
      await advance(upMs, 3);
      setLinkState({ httpOk: false });
      await flushLinkChange(view);
      await advance(downMs, 1);
    };

    // Six edges inside a single cooldown window.
    for (let flap = 0; flap < 6; flap += 1) {
      await flapOnce(1_300, 200);
    }
    expect(streamSessionChat).toHaveBeenCalledTimes(1);

    // Keep flapping well past the cooldown: the attempt cap bounds the episode,
    // so the count can never track the number of reconnect edges.
    for (let flap = 0; flap < 6; flap += 1) {
      await flapOnce(6_000, 1_000);
    }
    expect(streamSessionChat.mock.calls.length).toBeLessThanOrEqual(
      RECONNECT_AUTO_RESEND_MAX_ATTEMPTS,
    );
    expect(
      new Set(streamSessionChat.mock.calls.map((call) => call[2])),
    ).toEqual(new Set([PROMPT]));
  });

  it('resumes — never resends — an ACCEPTED stalled prompt across rapid reconnect flaps', async () => {
    jest.useFakeTimers();
    const { streamSessionChat } = gatewayMocks();
    // Gateway takes the prompt (the Mac has it) and the run then goes silent.
    streamSessionChat.mockImplementation(
      (
        _url: string,
        _sessionId: string,
        _message: unknown,
        _apiKey: string,
        _onEvent: unknown,
        _systemMessage: unknown,
        onStreamAccepted?: () => void,
      ) => {
        onStreamAccepted?.();
        return new Promise<string>(() => {});
      },
    );

    // Direct HTTP up, relay socket down: delivery status stays `pending` even
    // though the gateway accepted — the shape that produced the duplicate run.
    setLinkState({ httpOk: true, socket: 'disconnected' });
    const view = await renderChat();
    await waitFor(() => {
      expect(view.getByTestId('chat-input')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(view.getByTestId('chat-input'), PROMPT);
      fireEvent.press(view.getByTestId('chat-send-button'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(streamSessionChat).toHaveBeenCalledTimes(1);
    });

    // Stuck-outbound sweep marks the delivered turn "Sent — no reply from computer".
    await advance(150_000, 30);

    for (let flap = 0; flap < 4; flap += 1) {
      setLinkState({ httpOk: false });
      await flushLinkChange(view);
      await advance(1_500, 2);
      setLinkState({ httpOk: true, socket: 'disconnected' });
      await flushLinkChange(view);
      await advance(4_000, 4);
    }

    // The Mac already had it: every recovery must be a resume, never a resend.
    expect(streamSessionChat).toHaveBeenCalledTimes(1);
    expect(streamSessionChat.mock.calls.map((call) => call[2])).toEqual([PROMPT]);
  });

  it('never auto-resends a failure that arrives on a link that never went down', async () => {
    jest.useFakeTimers();
    const { streamSessionChat } = gatewayMocks();
    // Link is healthy the whole time; the run is aborted the way Stop aborts it.
    streamSessionChat.mockRejectedValue(new Error('AbortError'));
    const { sendChatMessage } = jest.requireMock('../services/hermesChatClient') as {
      sendChatMessage: jest.Mock;
    };
    sendChatMessage.mockRejectedValue(new Error('AbortError'));

    setLinkState({ httpOk: true });
    const view = await renderChat();
    await waitFor(() => {
      expect(view.getByTestId('chat-input')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(view.getByTestId('chat-input'), PROMPT);
      fireEvent.press(view.getByTestId('chat-send-button'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(streamSessionChat).toHaveBeenCalledTimes(1);
    });

    // Plenty of time for a debounce + cooldown to elapse. There was no
    // disconnect, so there is no reconnect to act on — and resending here would
    // silently undo the user's Stop.
    await advance(40_000, 10);
    expect(streamSessionChat).toHaveBeenCalledTimes(1);
  });

  it('keeps ↑ a genuine no-op when there is nothing typed and nothing to retry', async () => {
    const { streamSessionChat } = gatewayMocks();
    const { getByTestId } = await renderChat();
    await waitFor(() => {
      expect(getByTestId('chat-input')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    expect(streamSessionChat).not.toHaveBeenCalled();
  });
});
