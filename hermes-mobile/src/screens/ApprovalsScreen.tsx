import React from 'react';
import { StyleSheet, ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GateApprovalCard from '../components/GateApprovalCard';
import GlassCard from '../components/GlassCard';
import HealthPill from '../components/HealthPill';
import { colors } from '../theme/colors';
import { useGateway } from '../context/GatewayContext';

export default function ApprovalsScreen() {
  const {
    health,
    connectionState,
    pendingApprovals,
    recentReclaims,
    lastEventError,
    refreshHealth,
    resolveApproval,
    injectDemoApproval,
  } = useGateway();

  const healthLevel = health?.level ?? 'unknown';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>HERMES MOBILE</Text>
        <Text style={styles.subtitle}>ThumbGate approvals & gateway health</Text>
        <View style={styles.pillRow}>
          <HealthPill
            level={healthLevel}
            detail={health?.gatewayState ? `state=${health.gatewayState}` : undefined}
          />
          <Text style={styles.connection}>WS: {connectionState}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {pendingApprovals.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No pending approvals</Text>
            <Text style={styles.emptyBody}>
              When ThumbGate blocks a dangerous tool call, the card appears here for approve/reject.
            </Text>
            <Text style={styles.hint} onPress={injectDemoApproval}>
              Tap to inject demo GATE.BLOCKED event
            </Text>
          </GlassCard>
        ) : (
          pendingApprovals.map((approval) => (
            <GateApprovalCard
              key={approval.actionId}
              approval={approval}
              onApprove={() => resolveApproval(approval.actionId, 'approve')}
              onReject={() => resolveApproval(approval.actionId, 'reject')}
            />
          ))
        )}

        {recentReclaims.length > 0 ? (
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

        <Text style={styles.refreshHint} onPress={() => refreshHealth()}>
          Pull health probe again
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
  },
  connection: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
  },
  scrollContent: {
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
