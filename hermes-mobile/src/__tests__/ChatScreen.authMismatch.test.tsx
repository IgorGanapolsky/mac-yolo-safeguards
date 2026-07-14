import React from 'react';
import { act, waitFor } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';
import { renderInTabNavigator } from '../testUtils/navigation';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';

const mockGatewayState = {
  connectionState: 'connected' as const,
  apiKey: 'wrong-laptop-key',
  effectiveGatewayUrl: 'http://100.94.135.78:8642',
  health: {
    ok: true,
    level: 'green' as const,
    hostname: 'Igors-Mac-mini.local',
    directGatewayReachable: true,
    checkedAt: '2026-07-14T00:00:00Z',
    authMismatch: true,
  },
  activeGatewayProfile: {
    id: 'mac_mini',
    label: 'Igors-Mac-mini',
    gatewayUrl: 'http://100.94.135.78:8642',
    hostname: 'Igors-Mac-mini.local',
    addedAt: '2026-06-18T00:00:00Z',
  },
  gatewayProfiles: [
    {
      id: 'mac_mini',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini.local',
      addedAt: '2026-06-18T00:00:00Z',
    },
  ],
  relayWorkers: [],
  activeRelayWorkerId: null,
  isPaired: false,
  selectGatewayProfile: jest.fn().mockResolvedValue(undefined),
  scanForGatewayProfiles: jest.fn().mockResolvedValue([]),
  profileScanning: false,
  profileScanProgress: null,
  profileScanResult: null,
  autoConnectGateway: jest.fn().mockResolvedValue('http://100.94.135.78:8642'),
  pendingApprovals: [],
  submitApprovalChoice: jest.fn(),
  sendGateAction: jest.fn(),
  pendingApprovalEditSeed: null,
  clearApprovalEditSeed: jest.fn(),
  runProgress: null,
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
    gatewayUrl: 'http://100.94.135.78:8642',
    cloudUrl: 'https://hermesmobile-cloud.fly.dev',
    approvalPolicy: 'balanced' as const,
    includeToolActivity: true,
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
    loadApiKey: jest.fn().mockResolvedValue('wrong-laptop-key'),
    saveApiKey: jest.fn().mockResolvedValue(true),
    loadMobileToken: jest.fn().mockResolvedValue('test-token'),
    saveMobileToken: jest.fn().mockResolvedValue(true),
    clearMobileToken: jest.fn().mockResolvedValue(true),
  },
}));

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
  },
}));

jest.mock('../services/haptics', () => ({
  haptics: { light: jest.fn(), selection: jest.fn(), success: jest.fn(), warning: jest.fn(), heavy: jest.fn() },
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
  streamSessionChat: jest.fn(),
  getObsidianProjects: jest.fn().mockResolvedValue([]),
  getObsidianAgents: jest.fn().mockResolvedValue([]),
}));

jest.mock('../services/hermesChatClient', () => ({
  listSessions: jest.fn().mockResolvedValue([]),
  createSession: jest.fn().mockResolvedValue({ id: 'session-1', title: 'New chat' }),
  createSessionWithUniqueTitle: jest.fn().mockResolvedValue({ id: 'session-1', title: 'New chat' }),
  listMessages: jest.fn().mockResolvedValue([]),
  sendChatMessage: jest.fn().mockResolvedValue({ assistantText: 'ok', raw: {} }),
  updateSessionTitle: jest.fn().mockResolvedValue({ id: 'session-1', title: 'Updated' }),
  getSession: jest.fn().mockResolvedValue(null),
}));

async function renderAuthMismatchChat() {
  const view = renderInTabNavigator(ChatScreen, 'Chat');
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(view.getByTestId('chat-screen-header')).toBeTruthy();
  });
  return view;
}

describe('ChatScreen authMismatch header', () => {
  it('shows wrong-key repair header instead of Connected when health is green but auth mismatches', async () => {
    const { getByTestId } = await renderAuthMismatchChat();
    const link = getByTestId('chat-context-link').props.children;
    expect(link).toContain(GATEWAY_AUTH_REPAIR_HEADER);
    expect(link).not.toContain('Connected');
  });

  it('does not treat authMismatch health as mac HTTP reachable in header wiring', async () => {
    const { getByTestId } = await renderAuthMismatchChat();
    expect(getByTestId('chat-context-link').props.children).toBe(GATEWAY_AUTH_REPAIR_HEADER);
  });
});
