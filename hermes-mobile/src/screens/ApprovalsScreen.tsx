import React from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, View, Text, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import GateApprovalCard from '../components/GateApprovalCard';
import GlassCard from '../components/GlassCard';
import HealthPill from '../components/HealthPill';
import { colors } from '../theme/colors';
import { useGateway } from '../context/GatewayContext';
import {
  formatLeashConnectionDisplay,
  formatListeningOnGatewayLine,
} from '../utils/gatewayEndpoint';
import { buildLeashEmptyExplanation } from '../utils/leashUx';
import { CHAT_APPROVAL_EDIT_PREFIX } from '../services/approvalResolver';
import { fromPendingApproval } from '../utils/approvalNormalize';

type RootTabParamList = {
  Leash: undefined;
  Chat: undefined;
  Ops: undefined;
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
  } = useGateway();

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
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
  }, [autoConnectGateway, refreshHealth, connectEvents]);

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
  const gatewayHealthDetail = health?.gatewayState === 'running'
    ? 'Hermes gateway running on computer'
    : health?.gatewayState
      ? `Gateway ${health.gatewayState}`
      : undefined;

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
        <Text style={styles.title} testID="LEASH">LEASH</Text>
        <Text style={styles.subtitle}>
          {settings.safetyMode || settings.glanceMode
            ? 'ThumbGate safety — approve blocked agent tools'
            : 'Optional safety — only when your computer blocks risky tools'}
        </Text>
        <View style={styles.pillRow}>
          <HealthPill level={healthLevel} detail={gatewayHealthDetail} />
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
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {pendingApprovals.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No pending approvals</Text>
            <Text style={styles.emptyBody}>
              When your coding agent tries a risky tool (rm, git push --force, etc.), the
              approval card appears here.
            </Text>
            <Text style={styles.hintMuted}>{buildLeashEmptyExplanation(settings)}</Text>
            {settings.connectionMode === 'relay' && !isPaired ? (
              <Text style={styles.hintMuted}>
                Relay mode — pair in Settings with your computer approval bridge.
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
                Pair from any computer: node tools/hermes-mobile-pair.js — then Settings → Scan pairing QR.
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

        {recentReclaims.length > 0 && !glance ? (
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

        {lastEventError ? <Text style={styles.errorText}>{lastEventError}</Text> : null}

        <Text
          style={styles.refreshHint}
          onPress={onRefresh}
        >
          Pull down or tap here to refresh connection status
        </Text>
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
    gap: 12,
    marginBottom: 10,
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
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
  refreshHint: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 11,
    color: colors.textMuted,
  },
});
