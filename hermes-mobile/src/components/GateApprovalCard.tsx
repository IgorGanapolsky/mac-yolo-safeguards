import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import GlassCard from './GlassCard';
import { colors } from '../theme/colors';
import type { PendingApproval } from '../types/gateway';
import { haptics } from '../services/haptics';

interface GateApprovalCardProps {
  approval: PendingApproval;
  onApprove: () => void;
  onReject: () => void;
}

export default function GateApprovalCard({ approval, onApprove, onReject }: GateApprovalCardProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.badge}>GATE BLOCKED</Text>
        <Text style={styles.toolName}>{approval.toolName}</Text>
      </View>
      <Text style={styles.reason}>{approval.reason}</Text>
      {approval.command ? (
        <View style={styles.commandBox}>
          <Text style={styles.commandLabel}>Command</Text>
          <Text style={styles.commandText}>{approval.command}</Text>
        </View>
      ) : null}
      {approval.workspacePath ? (
        <Text style={styles.meta}>Workspace: {approval.workspacePath}</Text>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => {
            haptics.warning();
            onReject();
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.rejectText}>REJECT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.approveButton]}
          onPress={() => {
            haptics.success();
            onApprove();
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.approveText}>APPROVE OVERRIDE</Text>
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: colors.gateBlocked,
    marginHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.gateBlocked,
    letterSpacing: 1,
  },
  toolName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  reason: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  commandBox: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  commandLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    marginBottom: 4,
  },
  commandText: {
    fontSize: 12,
    color: colors.text,
    fontFamily: 'Menlo',
  },
  meta: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  rejectButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: colors.error,
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  rejectText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.error,
    letterSpacing: 0.5,
  },
  approveText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0.5,
  },
});
