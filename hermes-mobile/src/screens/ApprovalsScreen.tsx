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
import { isDeveloperLeashUnlockAllowed } from '../utils/demoModePolicy';
import { THUMBGATE_PRO_PRICE_LABEL } from '../constants/monetization';
import { colors } from '../theme/colors';
import { useGateway } from '../context/GatewayContext';
import {
  formatLeashConnectionDisplay,
  formatListeningOnGatewayLine,
} from '../utils/gatewayEndpoint';
import { buildLeashEmptyExplanation } from '../utils/leashUx';
import { isThumbgateLeashUnlocked } from '../utils/thumbgateLeash';
import { CHAT_APPROVAL_EDIT_PREFIX } from '../services/approvalResolver';
import { fromPendingApproval } from '../utils/approvalNormalize';

type RootTabParamList = {
  Leash: undefined;
  Chat: undefined;
  Settings: undefined;
};

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
    sessionGreeting,
    effectiveGatewayUrl,
    setApprovalEditSeed,
    patchSettings,
    injectSmokeApproval,
  } = useGateway();

  const leashUnlocked = isThumbgateLeashUnlocked(settings);
  const showTesterUnlock = isDeveloperLeashUnlockAllowed();

  const unlockThumbgateLeash = React.useCallback(async () => {
    await patchSettings({ thumbgateProActive: true, developerLeashUnlock: true });
  }, [patchSettings]);

  // Developer backdoor: press-and-hold the title for 8s to unlock Pro. Uses an
  // explicit press-in/press-out timer instead of `delayLongPress`, which the
  // Android long-press recognizer cancels on the slightest finger movement.
  const leashUnlockHoldRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startLeashUnlockHold = React.useCallback(() => {
    if (leashUnlocked) {
      return;
    }
    if (leashUnlockHoldRef.current) {
      clearTimeout(leashUnlockHoldRef.current);
    }
    leashUnlockHoldRef.current = setTimeout(() => {
      leashUnlockHoldRef.current = null;
      void unlockThumbgateLeash();
      Alert.alert('Developer unlock', 'ThumbGate Leash Pro enabled on this device.');
    }, 8000);
  }, [leashUnlocked, unlockThumbgateLeash]);
  const cancelLeashUnlockHold = React.useCallback(() => {
    if (leashUnlockHoldRef.current) {
      clearTimeout(leashUnlockHoldRef.current);
      leashUnlockHoldRef.current = null;
    }
  }, []);

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    if (!leashUnlocked || refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      await autoConnectGateway();
      await refreshHealth();
      connectEvents();
    } catch (e) {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [autoConnectGateway, connectEvents, leashUnlocked, refreshHealth, refreshing]);

  useFocusEffect(
    React.useCallback(() => {
      if (!leashUnlocked || connectionState === 'connected' || connectionState === 'demo') {
        return;
      }
      void onRefresh();
    }, [connectionState, leashUnlocked, onRefresh]),
  );

  const glance = !presentation.visualsOn;
  const stackApproval = glance ? pendingApprovals[0] : undefined;
  const stackedCount = pendingApprovals.length;

  const healthLevel = health?.level ?? 'unknown';
  const connectionDisplay = formatLeashConnectionDisplay({
    connectionMode: settings.connectionMode,
    connectionState,
    gatewayUrl: effectiveGatewayUrl,
    health,
    isPaired,
  });
  const gatewayHealthDetail = (() => {
    if (settings.connectionMode === 'relay' && health?.gatewayState === 'unpaired') {
      return health?.directGatewayReachable
        ? 'Direct link OK · relay not paired'
        : 'Relay not paired';
    }
    if (health?.gatewayState === 'running') {
      return 'Hermes gateway running on computer';
    }
    if (health?.gatewayState) {
      return `Gateway ${health.gatewayState}`;
    }
    return undefined;
  })();

  const handleApprovalEdit = (approval: typeof pendingApprovals[number]) => {
    if (settings.glanceMode) {
      Alert.alert(
        'Edit in Chat',
        'Turn off Glance mode in Settings to edit plans in the Chat tab.',
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="THUMBGATE_LEASH"
          accessible={true}
          activeOpacity={1}
          hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }}
          onPressIn={startLeashUnlockHold}
          onPressOut={cancelLeashUnlockHold}
        >
          <Text style={styles.title}>THUMBGATE LEASH</Text>
        </TouchableOpacity>
        <Text style={styles.subtitle}>
          {leashUnlocked
            ? settings.safetyMode || settings.glanceMode
              ? 'Approval-first Leash — approve blocked agent tools'
              : 'Approve blocked agent tools from your phone'
            : `Paid add-on (${THUMBGATE_PRO_PRICE_LABEL}) via ${Platform.OS === 'ios' ? 'App Store' : 'Google Play'}`}
        </Text>
        {leashUnlocked ? (
          <>
            <View style={styles.pillRow}>
              <HealthPill level={healthLevel} detail={gatewayHealthDetail} />
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
              <Text style={styles.connectionHeadline}>{connectionDisplay.headline}</Text>
              {connectionDisplay.machineName ? (
                <Text style={styles.connectionDetail}>
                  Machine: <Text style={styles.connectionValue}>{connectionDisplay.machineName}</Text>
                </Text>
              ) : null}
              {connectionDisplay.lanIp ? (
                <Text style={styles.connectionDetail}>
                  IP: <Text style={styles.connectionValue}>{connectionDisplay.lanIp}</Text>
                </Text>
              ) : null}
              {connectionDisplay.footnote ? (
                <Text style={styles.connectionFootnote}>{connectionDisplay.footnote}</Text>
              ) : null}
            </View>
            {sessionGreeting ? (
              <Text style={styles.greeting} accessibilityRole="text">
                {sessionGreeting}
              </Text>
            ) : null}
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
        {leashUnlocked ? (
          <View testID="leash-pull-hint" accessible={true}>
            <Text style={styles.pullHint}>
              Tap Refresh above to recheck Hermes Relay or the selected direct machine.
            </Text>
          </View>
        ) : null}
        {!leashUnlocked ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>A firewall for your AI coding agent</Text>
            <Text style={styles.emptyBody}>
              Every risky move your agent makes on your computer — deletes, force-pushes, deploys,
              runaway API calls, browser clicks — stops at your phone. Approve or block it with one
              thumb. Hermes chat stays free.
            </Text>
            <Text style={styles.emptyBody}>
              • Block a destructive command before it runs — not in the postmortem.
            </Text>
            <Text style={styles.emptyBody}>
              • Stop a runaway agent before it burns your API budget.
            </Text>
            <Text style={styles.emptyBody}>
              • Decide once — ThumbGate remembers and enforces it forever.
            </Text>
            <Text style={styles.emptyBody}>
              $19/mo — about $0.63 a day. One blocked mistake pays for a year.
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
            <Text style={styles.emptyBody}>
              When your coding agent tries a risky tool (rm, git push --force, etc.) or asks
              “confirm you want to proceed” in chat, the approval card appears here — approve,
              deny, or thumbs up/down with ThumbGate memory.
            </Text>
            <Text style={styles.hintMuted}>{buildLeashEmptyExplanation(settings)}</Text>
            {settings.connectionMode === 'relay' && !isPaired ? (
              <Text style={styles.hintMuted}>
                Relay mode — pair in Settings with your Hermes desktop bridge.
              </Text>
            ) : settings.connectionMode === 'relay' && connectionState === 'connected' ? (
              <Text style={styles.hintMuted}>
                {formatListeningOnGatewayLine(
                  effectiveGatewayUrl,
                  health,
                  '— waiting for blocked commands.',
                )}
              </Text>
            ) : settings.connectionMode === 'gateway' ? (
              <Text style={styles.hintMuted}>
                Local fallback: run node tools/hermes-mobile-pair.js on a machine, then Settings → Scan pairing QR.
              </Text>
            ) : null}

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
              onApprove={() => resolveApproval(stackApproval.actionId, 'approve', stackApproval)}
              onReject={() => resolveApproval(stackApproval.actionId, 'reject', stackApproval)}
              onChoice={(choice) =>
                submitApprovalChoice(stackApproval.actionId, choice, stackApproval)
              }
              onEdit={() => handleApprovalEdit(stackApproval)}
            />
            {stackedCount > 1 ? (
              <Text style={styles.stackHint}>
                {stackedCount - 1} more approval{stackedCount > 2 ? 's' : ''} queued — resolve top item first
              </Text>
            ) : null}
          </>
        ) : (
          pendingApprovals.map((approval) => (
            <GateApprovalCard
              key={approval.actionId}
              approval={approval}
              approvalPolicy={settings.approvalPolicy}
              thumbgateCaptureOnDown={settings.thumbgateCaptureOnDown}
              thumbgateCaptureOnUp={settings.thumbgateCaptureOnUp}
              onApprove={() => resolveApproval(approval.actionId, 'approve', approval)}
              onReject={() => resolveApproval(approval.actionId, 'reject', approval)}
              onChoice={(choice) => submitApprovalChoice(approval.actionId, choice, approval)}
              onEdit={() => handleApprovalEdit(approval)}
            />
          ))
        )}

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
            <Text style={styles.sectionTitle}>Pro options</Text>
            {showTesterUnlock ? (
              <>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    injectSmokeApproval();
                  }}
                  testID="leash-smoke-test"
                >
                  <Text style={styles.secondaryButtonText}>Preview approval card (developer)</Text>
                </TouchableOpacity>
                <Text style={styles.hintMuted}>
                  Developer-only: injects a fake blocked-command card here. Does not touch your relay
                  or computer.
                </Text>
              </>
            ) : null}
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
                <Text style={styles.switchLabel}>Prioritize Leash on launch</Text>
                <Text style={styles.switchDesc}>Open Leash first when approval-first mode is enabled</Text>
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
                <Text style={styles.switchLabel}>Glanceable approvals</Text>
                <Text style={styles.switchDesc}>Stack UI, larger targets, spoken status on connect</Text>
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

        {leashUnlocked && lastEventError ? <Text style={styles.errorText}>{lastEventError}</Text> : null}

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
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  headerRefreshBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 92,
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
    gap: 3,
  },
  connectionHeadline: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '800',
  },
  connectionDetail: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  connectionValue: {
    color: colors.text,
    fontWeight: '700',
  },
  connectionFootnote: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: 2,
  },
  greeting: {
    marginTop: 10,
    fontSize: 12,
    color: colors.secondary,
    lineHeight: 17,
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
  },
  pullHint: {
    marginHorizontal: 20,
    marginBottom: 10,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyCard: {
    marginHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  hint: {
    marginTop: 16,
    fontSize: 12,
    color: colors.accent,
    fontWeight: '700',
  },
  hintMuted: {
    marginTop: 12,
    fontSize: 11,
    color: colors.textMuted,
  },
  reclaimCard: {
    marginHorizontal: 16,
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
