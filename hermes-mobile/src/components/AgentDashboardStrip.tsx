import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { AgentDashboardStats } from '../utils/agentDashboardStats';

type AgentDashboardStripProps = {
  stats: AgentDashboardStats;
  activeRunLabel?: string | null;
};

export default function AgentDashboardStrip({ stats, activeRunLabel }: AgentDashboardStripProps) {
  return (
    <View style={styles.wrap} testID="agent-dashboard-strip">
      <Text style={styles.title}>Agent dashboard</Text>
      <View style={styles.row}>
        <View style={styles.stat} testID="agent-dashboard-connection">
          <Text style={styles.statValue} numberOfLines={1}>
            {stats.connectionLabel}
          </Text>
          <Text style={styles.statLabel}>Link</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat} testID="agent-dashboard-tools">
          <Text style={styles.statValue}>{stats.toolCount}</Text>
          <Text style={styles.statLabel}>Tools</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat} testID="agent-dashboard-runs">
          <Text style={styles.statValue}>{stats.cronJobCount}</Text>
          <Text style={styles.statLabel}>Cron</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat} testID="agent-dashboard-skills">
          <Text style={styles.statValue}>{stats.skillCount}</Text>
          <Text style={styles.statLabel}>Skills</Text>
        </View>
      </View>
      {stats.gatewayModel ? (
        <Text style={styles.modelLine} testID="agent-dashboard-model" numberOfLines={2}>
          Model on computer: {stats.gatewayModel}
        </Text>
      ) : null}
      {activeRunLabel ? (
        <Text style={styles.activeRun} testID="agent-dashboard-active-run" numberOfLines={2}>
          Active: {activeRunLabel}
        </Text>
      ) : null}
      {stats.hostname ? (
        <Text style={styles.hostLine} numberOfLines={1}>
          {stats.hostname}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 6,
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 2,
  },
  modelLine: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: 'monospace',
  },
  activeRun: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.warning,
  },
  hostLine: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
