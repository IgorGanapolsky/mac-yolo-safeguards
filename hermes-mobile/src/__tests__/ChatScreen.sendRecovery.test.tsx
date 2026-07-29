import React from 'react';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';
import { renderInTabNavigator } from '../testUtils/navigation';

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

describe('ChatScreen outbound send recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('re-submits when the user taps ↑ on a failed send with an empty composer', async () => {
    const { streamSessionChat } = gatewayMocks();
    // First submission never reaches the Mac — the bubble fails and offers ↑.
    streamSessionChat.mockRejectedValueOnce(new Error('Network request failed'));
    const { sendChatMessage } = jest.requireMock('../services/hermesChatClient') as {
      sendChatMessage: jest.Mock;
    };
    sendChatMessage.mockRejectedValueOnce(new Error('Network request failed'));

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
    // Composer is empty again — exactly the state the user taps ↑ in. The blank
    // changeText mirrors a genuinely empty field (the input bar keeps its own
    // draft ref, which must not silently stand in for typed text here).
    await waitFor(() => {
      expect(getByTestId('chat-input').props.value).toBe('');
    });
    await act(async () => {
      fireEvent.changeText(getByTestId('chat-input'), '');
      await Promise.resolve();
    });

    streamSessionChat.mockResolvedValue('recovered reply');
    // BUG 2: the ↑ affordance must issue a real resend, not a silent no-op.
    await act(async () => {
      fireEvent.press(getByTestId('chat-send-button'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(streamSessionChat.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(streamSessionChat.mock.calls[1]?.[2]).toBe(PROMPT);
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
