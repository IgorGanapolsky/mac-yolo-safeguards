import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';

type InlineMessageApprovalProps = {
  title?: string;
  busy?: boolean;
  onApprove: () => void;
  onDeny: () => void;
};

/** Tap Approve / Deny on the nudge bubble — no typed phrases. */
export default function InlineMessageApproval({
  title,
  busy = false,
  onApprove,
  onDeny,
}: InlineMessageApprovalProps) {
  return (
    <View style={styles.wrap} testID="inline-message-approval">
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.approveBtn, busy && styles.btnDisabled]}
          onPress={onApprove}
          disabled={busy}
          testID="inline-approval-approve"
          accessibilityLabel="Approve"
        >
          {busy ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={styles.approveText}>Approve</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.denyBtn, busy && styles.btnDisabled]}
          onPress={onDeny}
          disabled={busy}
          testID="inline-approval-deny"
          accessibilityLabel="Deny"
        >
          <Text style={styles.denyText}>Deny</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>Tap — no need to type approval phrases</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.35)',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  denyBtn: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    minHeight: 40,
    justifyContent: 'center',
  },
  approveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  denyText: {
    color: colors.error,
    fontWeight: '800',
    fontSize: 14,
  },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: colors.textMuted,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
