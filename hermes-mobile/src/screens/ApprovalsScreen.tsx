import React from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View,
  Text,
  RefreshControl,
  Alert,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import GateApprovalCard from '../components/GateApprovalCard';
import GlassCard from '../components/GlassCard';
import HealthPill from '../components/HealthPill';
import ProUpgradeCard from '../components/ProUpgradeCard';
import ThumbGatePromoCard from '../components/ThumbGatePromoCard';
import LeashCommonToolsSection from '../components/LeashCommonToolsSection';
import { isDeveloperLeashUnlockAllowed } from '../utils/demoModePolicy';
import { thumbgateProPriceLabel } from '../constants/monetization';
import { colors } from '../theme/colors';
import { useGateway } from '../context/GatewayContext';
import {
  resolveCalmConnectionStatus,
  resolveLeashHealthDetail,
  shouldSurfaceLeashEventError,
  isMacDirectReachable,
} from '../utils/connectionStatusContract';
import { formatLeashConnectionDisplay } from '../utils/gatewayEndpoint';
import { buildLeashEmptyExplanation } from '../utils/leashUx';
import { hasThumbgateLeashPro, isThumbgateLeashUnlocked } from '../utils/thumbgateLeash';
import type { GatewayHealthLevel } from '../types/gateway';
import { CHAT_APPROVAL_EDIT_PREFIX } from '../services/approvalResolver';
import { fromPendingApproval } from '../utils/approvalNormalize';
import {
  loadLeashDecisionHistory,
  recordLeashDecision,
  type LeashDecisionRecord,
} from '../services/leashDecisionHistory';
import { PENDING_APPROVALS_RENDER_CAP } from '../utils/pendingApprovalsCap';
import { resolveLeashThumbGatePromoSurface } from '../utils/thumbgatePromoCopy';

type RootTabParamList = {
  Leash: undefined;
  Chat: undefined;
  Settings: undefined;
};

const REFRESH_SPINNER_TIMEOUT_MS = 12000;

function formatDecisionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ApprovalsScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const {
    health,
    connectionState,
    pendingApprovals,
    recentReclaims,
    lastEventError,
    refreshHealth,
    resolveApproval,
    submitApprovalChoice,
    connectEvents,
    autoConnectGateway,
    settings,
    isPaired,
    presentation,
    effectiveGatewayUrl,
    setApprovalEditSeed,
    patchSettings,
    injectSmokeApproval,
    storeLeashPreviewActive,
  } = useGateway();

  const leashUnlocked = isThumbgateLeashUnlocked(settings) || storeLeashPreviewActive;
  const showTesterUnlock = isDeveloperLeashUnlockAllowed();

  const unlockThumbgateLeash = React.useCallback(async () => {
    await patchSettings({ thumbgateProActive: true, developerLeashUnlock: true });
  }, [patchSettings]);

  const [refreshing, setRefreshing] = React.useState(false);
  const [decisionHistory, setDecisionHistory] = React.useState<LeashDecisionRecord[]>([]);
  const refreshingRef = React.useRef(false);
  const refreshPromiseRef = React.useRef<Promise<void> | null>(null);
  const connectionStateRef = React.useRef(connectionState);

  React.useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  const runRefresh = React.useCallback(async (): Promise<void> => {
    if (!leashUnlocked) {
      return Promise.resolve();
    }
    if (refreshingRef.current) {
      return refreshPromiseRef.current || Promise.resolve();
    }
    refreshingRef.current = true;
    const promise = (async () => {
      try {
        await autoConnectGateway();
        await refreshHealth();
        connectEvents();
      } catch (e) {
        // Swallow: the HealthPill already reflects the real connection state.
      } finally {
        refreshingRef.current = false;
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = promise;
    return promise;
  }, [autoConnectGateway, connectEvents, leashUnlocked, refreshHealth]);

  const onRefresh = React.useCallback(async () => {
    if (!leashUnlocked) {
      return;
    }
    setRefreshing(true);
    let spinnerTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        runRefresh(),
        new Promise<void>((resolve) => {
          spinnerTimeout = setTimeout(resolve, REFRESH_SPINNER_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (spinnerTimeout) {
        clearTimeout(spinnerTimeout);
      }
      setRefreshing(false);
    }
  }, [leashUnlocked, runRefresh]);

  useFocusEffect(
    React.useCallback(() => {
      if (!leashUnlocked || connectionStateRef.current === 'connected' || connectionStateRef.current === 'demo') {
        return;
      }
      void runRefresh();
    }, [leashUnlocked, runRefresh]),
  );

  const reloadDecisionHistory = React.useCallback(async () => {
    setDecisionHistory(await loadLeashDecisionHistory());
  }, []);

  // Chat inline approvals write to the same store — refresh on every focus so
  // decisions made in the Chat tab show up here.
  useFocusEffect(
    React.useCallback(() => {
      void reloadDecisionHistory();
    }, [reloadDecisionHistory]),
  );

  React.useEffect(() => {
    void reloadDecisionHistory();
  }, [reloadDecisionHistory, pendingApprovals.length]);

  const recordScreenDecision = React.useCallback(
    (approval: typeof pendingApprovals[number], decision: 'approved' | 'denied') => {
      void recordLeashDecision({
        actionId: approval.actionId,
        decision,
        title: approval.reason || approval.command || approval.toolName || '',
        command: approval.command,
        toolName: approval.toolName,
        source: 'leash',
      }).then(reloadDecisionHistory);
    },
    [reloadDecisionHistory],
  );

  // Force stack layout for huge queues so Leash never mounts thousands of cards
  // (badge flood / WS replay) and spin forever.
  const glance = !presentation.visualsOn || pendingApprovals.length > PENDING_APPROVALS_RENDER_CAP;
  const stackApproval = glance ? pendingApprovals[0] : undefined;
  const stackedCount = pendingApprovals.length;
  const visibleApprovals = glance
    ? []
    : pendingApprovals.slice(0, PENDING_APPROVALS_RENDER_CAP);
  const leashPromoSurface = leashUnlocked
    ? resolveLeashThumbGatePromoSurface({
        connectionState,
        pendingApprovalsCount: pendingApprovals.length,
      })
    : null;

  const calmStatus = resolveCalmConnectionStatus({ health });
  const healthLevel: GatewayHealthLevel =
    calmStatus.status === 'connected'
      ? 'green'
      : calmStatus.status === 'needs_attention'
        ? 'amber'
        : calmStatus.status === 'checking'
          ? 'unknown'
          : 'red';
  const connectionDisplay = formatLeashConnectionDisplay({
    connectionMode: settings.connectionMode,
    connectionState,
    gatewayUrl: effectiveGatewayUrl,
    health,
    isPaired,
  });
  const gatewayHealthDetail = resolveLeashHealthDetail({
    connectionMode: settings.connectionMode,
    isPaired,
    health,
  });
  const macDirectOk = isMacDirectReachable(health);
  const connectionLine = connectionDisplay.machineName
    ? connectionDisplay.headline.includes(connectionDisplay.machineName)
      ? connectionDisplay.headline
      : `${connectionDisplay.headline} · ${connectionDisplay.machineName}`
    : connectionDisplay.headline;
  // Optional approvals footnote only — never a contradictory "not paired" banner when Mac is up.
  const showConnectionAction =
    Boolean(connectionDisplay.footnote) &&
    !macDirectOk &&
    (connectionState !== 'connected' && connectionState !== 'demo'
      ? true
      : settings.connectionMode === 'relay' && !isPaired);
  const surfaceEventError = shouldSurfaceLeashEventError({
    lastEventError,
    health,
  });

  const handleApprovalEdit = (approval: typeof pendingApprovals[number]) => {
    if (settings.glanceMode) {
      Alert.alert(
        'Edit in Chat',
        'Turn off Quick-approve layout on Leash in Settings to edit plans in the Chat tab.',
      );
      return;
    }
    const request = fromPendingApproval(approval, settings.approvalPolicy);
    const seed =
      request.command || request.title || request.approveText || approval.reason || '';
    setApprovalEditSeed(`${CHAT_APPROVAL_EDIT_PREFIX}${seed}`);
    navigation.navigate('Chat');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View testID="THUMBGATE_LEASH" accessible={true} collapsable={false}>
          <Text style={styles.title}>THUMBGATE LEASH</Text>
        </View>
        <Text style={styles.subtitle}>
          {leashUnlocked
            ? settings.safetyMode || settings.glanceMode
              ? 'Approve blocked agent tools — from lock screen (Approve / Deny) or cards below'
              : 'Approve blocked tools from your phone — tap notifications on lock screen'
            : `Paid add-on (${thumbgateProPriceLabel()}) via ${Platform.OS === 'ios' ? 'App Store' : 'Google Play'}`}
        </Text>
        {leashUnlocked ? (
          <>
            <View style={styles.pillRow} testID="leash-header-pill-row">
              <View style={styles.pillSlot}>
                <HealthPill level={healthLevel} label={calmStatus.label} detail={gatewayHealthDetail} />
              </View>
              <TouchableOpacity
                style={[styles.headerRefreshBtn, refreshing && styles.headerRefreshBtnDisabled]}
                onPress={() => void onRefresh()}
                disabled={refreshing}
                testID="leash-header-refresh"
                accessibilityRole="button"
                accessibilityLabel="Refresh connection status"
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={colors.secondary} />
                ) : (
                  <Text style={styles.headerRefreshText}>↻ Refresh</Text>
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.connectionBlock} testID="leash-connection-status">
              <Text style={styles.connectionHeadline} numberOfLines={2}>
                {connectionLine}
              </Text>
              {showConnectionAction && connectionDisplay.footnote ? (
                <Text style={styles.connectionFootnote} numberOfLines={2}>
                  {connectionDisplay.footnote}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical={true}
        overScrollMode="always"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          leashUnlocked ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        {/*
          Paid upgrade surface — always first for non-Pro so fresh free users and Maestro
          find pro-upgrade-card without scrolling past toggles/history.
          Locked path embeds the card in the empty state below instead (same testIDs).
        */}
        {!hasThumbgateLeashPro(settings) && leashUnlocked ? (
          <GlassCard style={styles.emptyCard} testID="leash-pro-upsell-card">
            <Text style={styles.emptyTitle}>Upgrade for unlimited Leash</Text>
            <Text style={styles.emptyBody}>
              Free tier includes limited weekly approvals. Unlock for unlimited mobile approvals
              and full ThumbGate Pro gates.
            </Text>
            <ProUpgradeCard
              onUnlocked={unlockThumbgateLeash}
              onTesterUnlock={showTesterUnlock ? unlockThumbgateLeash : undefined}
            />
          </GlassCard>
        ) : null}
        {!leashUnlocked ? (
          <GlassCard style={styles.emptyCard} testID="leash-pro-upsell-card">
            <Text style={styles.emptyTitle}>ThumbGate Leash is a Pro feature</Text>
            <Text style={styles.emptyBody}>
              When your coding agent hits a risky command on your computer, the approval card appears
              here so you can approve or reject from your phone — with ThumbGate memory gates behind
              every decision.
            </Text>
            <ProUpgradeCard
              onUnlocked={unlockThumbgateLeash}
              onTesterUnlock={showTesterUnlock ? unlockThumbgateLeash : undefined}
            />
          </GlassCard>
        ) : pendingApprovals.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <View testID="no-pending-approvals" accessible={true} collapsable={false}>
              <Text style={styles.emptyTitle}>No pending approvals</Text>
            </View>
            <Text style={styles.emptyBody} testID="leash-empty-body">
              {buildLeashEmptyExplanation(settings)}
            </Text>
          </GlassCard>
        ) : glance && stackApproval ? (
          <>
            <GateApprovalCard
              key={stackApproval.actionId}
              approval={stackApproval}
              glance
              approvalPolicy={settings.approvalPolicy}
              thumbgateCaptureOnDown={settings.thumbgateCaptureOnDown}
              thumbgateCaptureOnUp={settings.thumbgateCaptureOnUp}
              onApprove={() => {
                recordScreenDecision(stackApproval, 'approved');
                resolveApproval(stackApproval.actionId, 'approve', stackApproval);
              }}
              onReject={() => {
                recordScreenDecision(stackApproval, 'denied');
                resolveApproval(stackApproval.actionId, 'reject', stackApproval);
              }}
              onChoice={(choice) => {
                recordScreenDecision(stackApproval, choice === 'deny' ? 'denied' : 'approved');
                void submitApprovalChoice(stackApproval.actionId, choice, stackApproval);
              }}
              onEdit={() => handleApprovalEdit(stackApproval)}
            />
            {stackedCount > 1 ? (
              <Text style={styles.stackHint} testID="leash-stacked-overflow">
                {stackedCount - 1} more approval{stackedCount - 1 === 1 ? '' : 's'} queued — resolve
                top item first
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {visibleApprovals.map((approval) => (
              <GateApprovalCard
                key={approval.actionId}
                approval={approval}
                approvalPolicy={settings.approvalPolicy}
                thumbgateCaptureOnDown={settings.thumbgateCaptureOnDown}
                thumbgateCaptureOnUp={settings.thumbgateCaptureOnUp}
                onApprove={() => {
                  recordScreenDecision(approval, 'approved');
                  resolveApproval(approval.actionId, 'approve', approval);
                }}
                onReject={() => {
                  recordScreenDecision(approval, 'denied');
                  resolveApproval(approval.actionId, 'reject', approval);
                }}
                onChoice={(choice) => {
                  recordScreenDecision(approval, choice === 'deny' ? 'denied' : 'approved');
                  void submitApprovalChoice(approval.actionId, choice, approval);
                }}
                onEdit={() => handleApprovalEdit(approval)}
              />
            ))}
            {pendingApprovals.length > visibleApprovals.length ? (
              <Text style={styles.stackHint} testID="leash-list-overflow">
                Showing {visibleApprovals.length} of {pendingApprovals.length} — turn on Quick-approve
                layout to clear the queue faster
              </Text>
            ) : null}
          </>
        )}

        {leashPromoSurface ? (
          <ThumbGatePromoCard surface={leashPromoSurface} style={styles.emptyCard} />
        ) : null}

        {leashUnlocked && decisionHistory.length > 0 ? (
          <GlassCard style={styles.historyCard} testID="leash-decision-history">
            <Text style={styles.sectionTitle}>Recent decisions</Text>
            <Text style={styles.historyHint}>
              Includes approvals made from Chat bubbles and this Leash tab.
            </Text>
            {decisionHistory.slice(0, 10).map((item) => (
              <View
                key={`${item.actionId}-${item.decidedAt}`}
                style={styles.historyRow}
                testID={`leash-decision-${item.actionId}`}
              >
                <Text
                  style={[
                    styles.historyDecision,
                    item.decision === 'approved'
                      ? styles.historyApproved
                      : styles.historyDenied,
                  ]}
                >
                  {item.decision === 'approved' ? '✓ Approved' : '✕ Denied'}
                </Text>
                <View style={styles.historyBodyCol}>
                  <Text style={styles.historyTitle} numberOfLines={2}>
                    {item.title || item.command || item.toolName || 'Agent action'}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {item.source === 'chat' ? 'From Chat' : 'From Leash'} ·{' '}
                    {formatDecisionTime(item.decidedAt)}
                  </Text>
                </View>
              </View>
            ))}
          </GlassCard>
        ) : null}

        {leashUnlocked && recentReclaims.length > 0 && !glance ? (
          <GlassCard style={styles.reclaimCard}>
            <Text style={styles.sectionTitle}>Recent YOLO reclaims</Text>
            {recentReclaims.slice(0, 5).map((item, index) => (
              <Text key={`${item.target}-${index}`} style={styles.reclaimLine}>
                • {item.target}
                {item.rssReclaimedMb ? ` (~${item.rssReclaimedMb}MB)` : ''}
                {item.triggerCondition ? ` — ${item.triggerCondition}` : ''}
              </Text>
            ))}
          </GlassCard>
        ) : null}

        {leashUnlocked ? (
          <GlassCard style={styles.leashSettingsCard}>
            <Text style={styles.sectionTitle}>Leash options</Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                injectSmokeApproval();
              }}
              testID="leash-smoke-test"
            >
              <Text style={styles.secondaryButtonText}>Preview approval card (smoke test)</Text>
            </TouchableOpacity>
            <Text style={styles.hintMuted}>
              Injects a fake blocked-command card here. Does not touch your relay or computer.
            </Text>
            <LeashCommonToolsSection
              approvalRequiredIds={settings.leashApprovalRequiredToolIds ?? []}
              customTools={settings.leashCustomTools ?? []}
              onChangeApprovalRequiredIds={(next) => {
                void patchSettings({ leashApprovalRequiredToolIds: next });
              }}
              onChangeCustomTools={(next) => {
                void patchSettings({ leashCustomTools: next });
              }}
            />
            <View style={styles.switchRow}>
              <View style={styles.switchLabelCol}>
                <Text style={styles.switchLabel}>Thumbs down → remember block</Text>
                <Text style={styles.switchDesc}>Capture to ThumbGate when you reject a tool</Text>
              </View>
              <Switch
                value={settings.thumbgateCaptureOnDown}
                onValueChange={(val) => {
                  void patchSettings({ thumbgateCaptureOnDown: val });
                }}
                trackColor={{ false: '#1F2937', true: colors.primary }}
                thumbColor={settings.thumbgateCaptureOnDown ? '#ffffff' : '#9CA3AF'}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabelCol}>
                <Text style={styles.switchLabel}>Thumbs up → record approval</Text>
                <Text style={styles.switchDesc}>Optional positive signal when you allow a tool</Text>
              </View>
              <Switch
                value={settings.thumbgateCaptureOnUp}
                onValueChange={(val) => {
                  void patchSettings({ thumbgateCaptureOnUp: val });
                }}
                trackColor={{ false: '#1F2937', true: colors.primary }}
                thumbColor={settings.thumbgateCaptureOnUp ? '#ffffff' : '#9CA3AF'}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabelCol}>
                <Text style={styles.switchLabel}>Approval-first mode</Text>
                <Text style={styles.switchDesc}>
                  Prioritize lock-screen approval alerts. Hermes tab still opens on launch.
                </Text>
              </View>
              <Switch
                value={settings.safetyMode}
                onValueChange={(val) => {
                  void patchSettings({ safetyMode: val });
                }}
                testID="safety-mode-switch"
                trackColor={{ false: '#1F2937', true: colors.primary }}
                thumbColor={settings.safetyMode ? '#ffffff' : '#9CA3AF'}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabelCol}>
                <Text style={styles.switchLabel}>Quick-approve layout</Text>
                <Text style={styles.switchDesc}>
                  One approval at a time with bigger buttons. Hides diffs and thumbs. Announces
                  connection status with VoiceOver. This only changes the Leash screen — not push
                  alerts (see Settings → Smart notifications).
                </Text>
              </View>
              <Switch
                value={settings.glanceMode}
                onValueChange={(val) => {
                  void patchSettings({ glanceMode: val });
                }}
                testID="glance-mode-switch"
                trackColor={{ false: '#1F2937', true: colors.primary }}
                thumbColor={settings.glanceMode ? '#ffffff' : '#9CA3AF'}
              />
            </View>
          </GlassCard>
        ) : null}

        {leashUnlocked && surfaceEventError && lastEventError ? (
          <Text style={styles.errorText} testID="leash-event-error">
            {lastEventError}
          </Text>
        ) : null}

        {leashUnlocked ? (
          <TouchableOpacity
            style={[styles.refreshButton, refreshing && styles.refreshButtonDisabled]}
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh Leash connection status"
            testID="leash-refresh-status"
          >
            <Text style={styles.refreshButtonText}>
              {refreshing ? 'Refreshing connection…' : 'Tap to refresh connection'}
            </Text>
          </TouchableOpacity>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundStart,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 8,
    marginBottom: 10,
  },
  pillSlot: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  headerRefreshBtn: {
    flexShrink: 0,
    alignSelf: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 92,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRefreshBtnDisabled: {
    opacity: 0.65,
  },
  headerRefreshText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.secondary,
  },
  connectionBlock: {
    gap: 2,
  },
  connectionHeadline: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '700',
  },
  connectionFootnote: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: 2,
  },
  stackHint: {
    marginHorizontal: 20,
    marginTop: 8,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
    paddingTop: 4,
  },
  emptyCard: {
    marginHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  hintMuted: {
    marginTop: 12,
    fontSize: 11,
    color: colors.textMuted,
  },
  reclaimCard: {
    marginHorizontal: 16,
  },
  historyCard: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  historyHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 10,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  historyDecision: {
    fontSize: 12,
    fontWeight: '800',
    minWidth: 84,
  },
  historyApproved: {
    color: colors.success,
  },
  historyDenied: {
    color: colors.error,
  },
  historyBodyCol: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  historyMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  leashSettingsCard: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  secondaryButton: {
    marginTop: 8,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  switchLabelCol: {
    flex: 1,
    paddingRight: 16,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  switchDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  reclaimLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  errorText: {
    marginHorizontal: 16,
    marginTop: 8,
    fontSize: 11,
    color: colors.error,
  },
  refreshButton: {
    marginTop: 16,
    marginHorizontal: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  refreshButtonDisabled: {
    opacity: 0.62,
  },
  refreshButtonText: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
  },
});
