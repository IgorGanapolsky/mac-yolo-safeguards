import { useContextSelector } from 'use-context-selector';
import { useMemo } from 'react';
import { GatewayContext, type GatewayContextValue } from '../context/GatewayContext';

function requireGateway(ctx: GatewayContextValue | null): GatewayContextValue {
  if (!ctx) {
    throw new Error('useGatewaySelector must be used within GatewayProvider');
  }
  return ctx;
}

export function useGatewaySelector<T>(selector: (ctx: GatewayContextValue) => T): T {
  return useContextSelector(GatewayContext, (ctx) => selector(requireGateway(ctx)));
}

export function useGatewayConnection() {
  const settings = useGatewaySelector((ctx) => ctx.settings);
  const connectionState = useGatewaySelector((ctx) => ctx.connectionState);
  const apiKey = useGatewaySelector((ctx) => ctx.apiKey);
  const effectiveGatewayUrl = useGatewaySelector((ctx) => ctx.effectiveGatewayUrl);
  const health = useGatewaySelector((ctx) => ctx.health);
  const refreshHealth = useGatewaySelector((ctx) => ctx.refreshHealth);
  const retryGatewayBootstrap = useGatewaySelector((ctx) => ctx.retryGatewayBootstrap);
  const activeGatewayProfile = useGatewaySelector((ctx) => ctx.activeGatewayProfile);
  const gatewayProfiles = useGatewaySelector((ctx) => ctx.gatewayProfiles);
  const selectGatewayProfile = useGatewaySelector((ctx) => ctx.selectGatewayProfile);
  const removeGatewayProfile = useGatewaySelector((ctx) => ctx.removeGatewayProfile);
  const scanForGatewayProfiles = useGatewaySelector((ctx) => ctx.scanForGatewayProfiles);
  const profileScanning = useGatewaySelector((ctx) => ctx.profileScanning);
  const profileScanProgress = useGatewaySelector((ctx) => ctx.profileScanProgress);
  const profileScanResult = useGatewaySelector((ctx) => ctx.profileScanResult);
  const autoConnectGateway = useGatewaySelector((ctx) => ctx.autoConnectGateway);
  const connectEvents = useGatewaySelector((ctx) => ctx.connectEvents);
  const addGatewayProfile = useGatewaySelector((ctx) => ctx.addGatewayProfile);
  const completePair = useGatewaySelector((ctx) => ctx.completePair);
  const saveSettings = useGatewaySelector((ctx) => ctx.saveSettings);
  const wifiConnected = useGatewaySelector((ctx) => ctx.wifiConnected);
  const isPaired = useGatewaySelector((ctx) => ctx.isPaired);
  const tailscaleDiscoveries = useGatewaySelector((ctx) => ctx.tailscaleDiscoveries);
  const tailscaleDiscoveryProbing = useGatewaySelector((ctx) => ctx.tailscaleDiscoveryProbing);
  const tailscaleVpnActive = useGatewaySelector((ctx) => ctx.tailscaleVpnActive);
  const tailnetProbeHostCount = useGatewaySelector((ctx) => ctx.tailnetProbeHostCount);
  const addDiscoveredTailscaleComputer = useGatewaySelector(
    (ctx) => ctx.addDiscoveredTailscaleComputer,
  );
  const probeTailscaleComputers = useGatewaySelector((ctx) => ctx.probeTailscaleComputers);
  const connectionHealAttempt = useGatewaySelector((ctx) => ctx.connectionHealAttempt);
  const connectionHealInFlight = useGatewaySelector((ctx) => ctx.connectionHealInFlight);
  const connectionHealExhausted = useGatewaySelector((ctx) => ctx.connectionHealExhausted);

  return useMemo(
    () => ({
      settings,
      connectionState,
      apiKey,
      effectiveGatewayUrl,
      health,
      refreshHealth,
      retryGatewayBootstrap,
      activeGatewayProfile,
      gatewayProfiles,
      selectGatewayProfile,
      removeGatewayProfile,
      scanForGatewayProfiles,
      profileScanning,
      profileScanProgress,
      profileScanResult,
      autoConnectGateway,
      connectEvents,
      addGatewayProfile,
      completePair,
      saveSettings,
      wifiConnected,
      isPaired,
      tailscaleDiscoveries,
      tailscaleDiscoveryProbing,
      tailscaleVpnActive,
      tailnetProbeHostCount,
      addDiscoveredTailscaleComputer,
      probeTailscaleComputers,
      connectionHealAttempt,
      connectionHealInFlight,
      connectionHealExhausted,
    }),
    [
      settings,
      connectionState,
      apiKey,
      effectiveGatewayUrl,
      health,
      refreshHealth,
      retryGatewayBootstrap,
      activeGatewayProfile,
      gatewayProfiles,
      selectGatewayProfile,
      removeGatewayProfile,
      scanForGatewayProfiles,
      profileScanning,
      profileScanProgress,
      profileScanResult,
      autoConnectGateway,
      connectEvents,
      addGatewayProfile,
      completePair,
      saveSettings,
      wifiConnected,
      isPaired,
      tailscaleDiscoveries,
      tailscaleDiscoveryProbing,
      tailscaleVpnActive,
      tailnetProbeHostCount,
      addDiscoveredTailscaleComputer,
      probeTailscaleComputers,
      connectionHealAttempt,
      connectionHealInFlight,
      connectionHealExhausted,
    ],
  );
}

export function useGatewayRelay() {
  const relayWorkers = useGatewaySelector((ctx) => ctx.relayWorkers);
  const activeRelayWorkerId = useGatewaySelector((ctx) => ctx.activeRelayWorkerId);
  const isPaired = useGatewaySelector((ctx) => ctx.isPaired);
  const mobileToken = useGatewaySelector((ctx) => ctx.mobileToken);

  return useMemo(
    () => ({
      relayWorkers,
      activeRelayWorkerId,
      isPaired,
      mobileToken,
    }),
    [relayWorkers, activeRelayWorkerId, isPaired, mobileToken],
  );
}

export function useGatewayApprovals() {
  const pendingApprovals = useGatewaySelector((ctx) => ctx.pendingApprovals);
  const submitApprovalChoice = useGatewaySelector((ctx) => ctx.submitApprovalChoice);
  const sendGateAction = useGatewaySelector((ctx) => ctx.sendGateAction);
  const pendingApprovalEditSeed = useGatewaySelector((ctx) => ctx.pendingApprovalEditSeed);
  const clearApprovalEditSeed = useGatewaySelector((ctx) => ctx.clearApprovalEditSeed);
  const runProgress = useGatewaySelector((ctx) => ctx.runProgress);
  const setRunProgress = useGatewaySelector((ctx) => ctx.setRunProgress);
  const setChatStreamProgressActive = useGatewaySelector(
    (ctx) => ctx.setChatStreamProgressActive,
  );
  const submitChatOutputFeedback = useGatewaySelector((ctx) => ctx.submitChatOutputFeedback);
  const chatOutputFeedbackBusyId = useGatewaySelector((ctx) => ctx.chatOutputFeedbackBusyId);

  return useMemo(
    () => ({
      pendingApprovals,
      submitApprovalChoice,
      sendGateAction,
      pendingApprovalEditSeed,
      clearApprovalEditSeed,
      runProgress,
      setRunProgress,
      setChatStreamProgressActive,
      submitChatOutputFeedback,
      chatOutputFeedbackBusyId,
    }),
    [
      pendingApprovals,
      submitApprovalChoice,
      sendGateAction,
      pendingApprovalEditSeed,
      clearApprovalEditSeed,
      runProgress,
      setRunProgress,
      setChatStreamProgressActive,
      submitChatOutputFeedback,
      chatOutputFeedbackBusyId,
    ],
  );
}

export function useGatewayChatSync() {
  const transcriptSyncNonce = useGatewaySelector((ctx) => ctx.transcriptSyncNonce);
  const pendingChatRelayText = useGatewaySelector((ctx) => ctx.pendingChatRelayText);
  const clearChatRelayText = useGatewaySelector((ctx) => ctx.clearChatRelayText);
  const notificationFocusSessionId = useGatewaySelector((ctx) => ctx.notificationFocusSessionId);
  const clearNotificationFocusSession = useGatewaySelector(
    (ctx) => ctx.clearNotificationFocusSession,
  );
  const addGatewayListener = useGatewaySelector((ctx) => ctx.addGatewayListener);
  const removeGatewayListener = useGatewaySelector((ctx) => ctx.removeGatewayListener);

  return useMemo(
    () => ({
      transcriptSyncNonce,
      pendingChatRelayText,
      clearChatRelayText,
      notificationFocusSessionId,
      clearNotificationFocusSession,
      addGatewayListener,
      removeGatewayListener,
    }),
    [
      transcriptSyncNonce,
      pendingChatRelayText,
      clearChatRelayText,
      notificationFocusSessionId,
      clearNotificationFocusSession,
      addGatewayListener,
      removeGatewayListener,
    ],
  );
}
