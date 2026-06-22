import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import GlassCard from './GlassCard';
import { colors } from '../theme/colors';
import type { ApprovalChoice, ApprovalPolicy, HermesApprovalRequest } from '../types/approval';
import { choicesForRequest } from '../types/approval';
import { haptics } from '../services/haptics';

export type HermesApprovalVariant = 'chat' | 'leash';

type HermesApprovalCardProps = {
  approval: HermesApprovalRequest;
  variant?: HermesApprovalVariant;
  glance?: boolean;
  busy?: boolean;
  undoSecondsLeft?: number;
  approvalPolicy?: ApprovalPolicy;
  thumbgateCaptureOnDown?: boolean;
  thumbgateCaptureOnUp?: boolean;
  onChoice: (choice: ApprovalChoice) => void;
  onEdit?: () => void;
  onUndo?: () => void;
};

const CHOICE_LABELS: Record<ApprovalChoice, string> = {
  once: 'Allow once',
  session: 'Allow session',
  always: 'Allow always',
  deny: 'Deny',
};

export default function HermesApprovalCard({
  approval,
  variant = 'leash',
  glance = false,
  busy = false,
  undoSecondsLeft = 0,
  thumbgateCaptureOnDown = true,
  thumbgateCaptureOnUp = false,
  approvalPolicy = 'balanced',
  onChoice,
  onEdit,
  onUndo,
}: HermesApprovalCardProps) {
  if (undoSecondsLeft > 0 && onUndo) {
    return (
      <View style={styles.undoBar} testID="approval-undo">
        <Text style={styles.undoText}>Approval sent</Text>
        <TouchableOpacity onPress={onUndo} testID="approval-undo-button">
          <Text style={styles.undoButton}>Undo ({undoSecondsLeft}s)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const choices = choicesForRequest(approval, approvalPolicy);
  const primaryChoices = choices.filter((c) => c === 'once' || c === 'deny');
  const tierChoices = choices.filter((c) => c === 'session' || c === 'always');
  const isLeash = variant === 'leash';
  const showThumbs = isLeash && !glance;
  const riskTier = approval.riskTier ?? 'medium';
  const riskLabel =
    riskTier === 'high' ? 'HIGH RISK' : riskTier === 'medium' ? 'MEDIUM' : 'LOW RISK';

  const handleChoice = (choice: ApprovalChoice) => {
    if (choice === 'deny') {
      haptics.warning();
    } else {
      haptics.success();
    }
    onChoice(choice);
  };

  const commandPreview = approval.command?.trim().slice(0, 400) ?? '';
  const downHint = thumbgateCaptureOnDown
    ? 'Block + remember in ThumbGate'
    : 'Block this command';
  const upHint = thumbgateCaptureOnUp
    ? 'Allow once + ThumbGate capture'
    : 'Allow this command once';

  const inner = (
  <>
    <View style={styles.headerRow}>
      <Text style={styles.badge}>
        {approval.source === 'text_nudge' ? 'AGENT PROPOSAL' : 'THUMBGATE · BLOCKED'}
      </Text>
      <View style={styles.headerBadges}>
        <Text
          style={[
            styles.riskBadge,
            riskTier === 'high' && styles.riskHigh,
            riskTier === 'medium' && styles.riskMedium,
          ]}
        >
          {riskLabel}
        </Text>
        {approval.toolName ? (
          <Text style={[styles.toolName, glance && styles.glanceToolName]}>
            {approval.toolName}
          </Text>
        ) : null}
      </View>
    </View>

    <Text
      style={[styles.reason, glance && styles.glanceReason]}
      numberOfLines={glance ? 2 : undefined}
    >
      {approval.title}
    </Text>

    {commandPreview && !glance ? (
      <View style={styles.commandBox}>
        <Text style={styles.commandLabel}>Command</Text>
        <Text style={styles.commandText}>{commandPreview}</Text>
      </View>
    ) : null}

    {!glance && approval.workspacePath ? (
      <Text style={styles.meta}>Workspace: {approval.workspacePath}</Text>
    ) : null}

    {!glance && approval.rollbackHint && riskTier !== 'low' ? (
      <Text style={styles.rollbackHint}>{approval.rollbackHint}</Text>
    ) : null}

    {showThumbs ? (
      <Text style={styles.thumbgateHint}>
        ThumbGate Leash — thumbs down to block, thumbs up to allow once.
      </Text>
    ) : null}

    {showThumbs ? (
      <View style={[styles.actions, glance && styles.glanceActions]}>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton, glance && styles.glanceButton]}
          onPress={() => handleChoice('deny')}
          disabled={busy}
          activeOpacity={0.85}
          testID="leash-thumbs-down"
        >
          <Text style={styles.rejectEmoji}>👎</Text>
          <Text style={styles.rejectText}>Thumbs down</Text>
          <Text style={styles.actionSubtext}>{downHint}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.approveButton, glance && styles.glanceButton]}
          onPress={() => handleChoice('once')}
          disabled={busy}
          activeOpacity={0.85}
          testID="leash-thumbs-up"
        >
          <Text style={styles.approveEmoji}>👍</Text>
          <Text style={styles.approveText}>Thumbs up</Text>
          <Text style={styles.actionSubtext}>{upHint}</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <View style={styles.chatActions}>
        {primaryChoices.map((choice) => (
          <TouchableOpacity
            key={choice}
            style={[
              choice === 'once' ? styles.chatApproveBtn : styles.chatDenyBtn,
              busy && styles.btnDisabled,
            ]}
            onPress={() => handleChoice(choice)}
            disabled={busy}
            testID={choice === 'once' ? 'approval-allow-once' : 'approval-deny'}
          >
            {busy && choice === 'once' ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text
                style={choice === 'once' ? styles.chatApproveText : styles.chatDenyText}
              >
                {choice === 'once' ? 'Approve' : 'Deny'}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    )}

    {tierChoices.length > 0 && !glance && !showThumbs ? (
      <View style={styles.tierRow}>
        {tierChoices.map((choice) => (
          <TouchableOpacity
            key={choice}
            style={[styles.tierBtn, busy && styles.btnDisabled]}
            onPress={() => handleChoice(choice)}
            disabled={busy}
            testID={`approval-${choice}`}
          >
            <Text style={styles.tierText}>{CHOICE_LABELS[choice]}</Text>
          </TouchableOpacity>
        ))}
      </View>
    ) : null}

    {onEdit && !glance ? (
      <TouchableOpacity
        style={styles.editBtn}
        onPress={onEdit}
        disabled={busy}
        testID="approval-edit"
      >
        <Text style={styles.editText}>Edit plan before approving</Text>
      </TouchableOpacity>
    ) : null}
  </>
  );

  if (variant === 'chat') {
    return (
      <View style={styles.chatBar} testID="hermes-approval-card">
        {inner}
      </View>
    );
  }

  return (
    <GlassCard style={[styles.card, glance && styles.glanceCard]} testID="hermes-approval-card">
      {inner}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  chatBar: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    gap: 6,
  },
  card: {
    borderColor: colors.gateBlocked,
    marginHorizontal: 16,
  },
  glanceCard: {
    marginHorizontal: 12,
    borderWidth: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskBadge: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  riskHigh: {
    color: colors.error,
  },
  riskMedium: {
    color: colors.warning,
  },
  rollbackHint: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: 10,
    fontStyle: 'italic',
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
  glanceToolName: {
    fontSize: 14,
  },
  reason: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  glanceReason: {
    fontSize: 16,
    lineHeight: 22,
  },
  thumbgateHint: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: 10,
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
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  meta: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
  },
  glanceActions: {
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  glanceButton: {
    paddingVertical: 16,
    borderRadius: 16,
  },
  rejectButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: colors.error,
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  rejectEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  approveEmoji: {
    fontSize: 22,
    marginBottom: 4,
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
  actionSubtext: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 12,
    paddingHorizontal: 4,
  },
  chatActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  chatApproveBtn: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chatApproveText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  chatDenyBtn: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  chatDenyText: {
    color: colors.error,
    fontWeight: '800',
    fontSize: 14,
  },
  tierRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  tierBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.textMuted,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  tierText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  editBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 6,
  },
  editText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  undoBar: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  undoText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  undoButton: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
});
