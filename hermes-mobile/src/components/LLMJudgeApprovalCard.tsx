import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { LLMJudgeAssessment } from '../types/grokBot';

interface LLMJudgeApprovalCardProps {
  assessment: LLMJudgeAssessment;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onEdit?: (id: string) => void;
}

export const LLMJudgeApprovalCard: React.FC<LLMJudgeApprovalCardProps> = ({
  assessment,
  onApprove,
  onDeny,
  onEdit,
}) => {
  const isHighRisk = assessment.riskTier === 'high';
  const isMediumRisk = assessment.riskTier === 'medium';

  const riskBadgeStyle = isHighRisk
    ? styles.riskBadgeHigh
    : isMediumRisk
    ? styles.riskBadgeMedium
    : styles.riskBadgeLow;

  const riskTextStyle = isHighRisk
    ? styles.riskTextHigh
    : isMediumRisk
    ? styles.riskTextMedium
    : styles.riskTextLow;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <Text style={styles.titleIcon}>⚖️</Text>
          <View>
            <Text style={styles.headerTitle}>LLM Judge Decision Gate</Text>
            <Text style={styles.toolNameText}>
              Tool: <Text style={styles.toolCode}>{assessment.toolName}</Text>
            </Text>
          </View>
        </View>

        <View style={[styles.riskBadge, riskBadgeStyle]}>
          <Text style={[styles.riskText, riskTextStyle]}>
            {assessment.riskTier.toUpperCase()} RISK ({assessment.riskScore}/100)
          </Text>
        </View>
      </View>

      {/* Rationale */}
      <View style={styles.rationaleBox}>
        <Text style={styles.rationaleText}>{assessment.rationale}</Text>
      </View>

      {/* Proposed Command / Resource */}
      {assessment.command && (
        <View style={styles.codeBlock}>
          <Text style={styles.codeBlockLabel}>PROPOSED ACTION:</Text>
          <Text style={styles.codeText} numberOfLines={4}>
            {assessment.command}
          </Text>
        </View>
      )}

      {/* Invariants Audit */}
      <View style={styles.invariantsContainer}>
        {assessment.invariantsViolated.map((v, i) => (
          <View key={`violation-${i}`} style={styles.invariantRow}>
            <Text style={styles.violationIcon}>❌</Text>
            <Text style={styles.violationText}>{v}</Text>
          </View>
        ))}
        {assessment.invariantsPassed.map((p, i) => (
          <View key={`pass-${i}`} style={styles.invariantRow}>
            <Text style={styles.passIcon}>✓</Text>
            <Text style={styles.passText}>{p}</Text>
          </View>
        ))}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.button, styles.denyButton]}
          onPress={() => onDeny(assessment.id)}
          accessibilityRole="button"
          accessibilityLabel="Deny proposed action"
        >
          <Text style={styles.denyButtonText}>Deny Action</Text>
        </Pressable>

        {onEdit && (
          <Pressable
            style={[styles.button, styles.editButton]}
            onPress={() => onEdit(assessment.id)}
            accessibilityRole="button"
            accessibilityLabel="Edit command"
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.button, styles.approveButton]}
          onPress={() => onApprove(assessment.id)}
          accessibilityRole="button"
          accessibilityLabel="Approve proposed action"
        >
          <Text style={styles.approveButtonText}>Allow Once</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#161B26',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 14,
    marginVertical: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  toolNameText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  toolCode: {
    color: colors.accent,
    fontFamily: 'monospace',
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  riskBadgeHigh: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  riskBadgeMedium: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  riskBadgeLow: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  riskText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  riskTextHigh: {
    color: '#F87171',
  },
  riskTextMedium: {
    color: '#FBBF24',
  },
  riskTextLow: {
    color: '#34D399',
  },
  rationaleBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  rationaleText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  codeBlock: {
    backgroundColor: '#0D1117',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  codeBlockLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#E6EDF3',
    lineHeight: 16,
  },
  invariantsContainer: {
    marginTop: 10,
    gap: 4,
  },
  invariantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  violationIcon: {
    fontSize: 11,
  },
  violationText: {
    fontSize: 11,
    color: '#FCA5A5',
    fontWeight: '500',
  },
  passIcon: {
    fontSize: 12,
    color: '#34D399',
    fontWeight: '700',
  },
  passText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denyButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  denyButtonText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
  editButton: {
    flex: 0.6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  editButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  approveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default LLMJudgeApprovalCard;
