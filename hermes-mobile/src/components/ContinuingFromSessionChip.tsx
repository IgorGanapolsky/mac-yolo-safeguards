import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import {
  CONTINUITY_CHIP_AUTO_DISMISS_MS,
  CONTINUITY_CHIP_LABEL,
} from '../utils/sessionContinuityHandoff';

type Props = {
  visible?: boolean;
  onDismiss?: () => void;
  label?: string;
  /** Override auto-dismiss window (tests). */
  autoDismissMs?: number;
};

/**
 * Ephemeral continuity hint. Prefer seamless (visible=false).
 * When shown, auto-dismisses after ~2.5s — never sticky until manual Dismiss.
 */
export default function ContinuingFromSessionChip({
  visible = false,
  onDismiss,
  label = CONTINUITY_CHIP_LABEL,
  autoDismissMs = CONTINUITY_CHIP_AUTO_DISMISS_MS,
}: Props) {
  useEffect(() => {
    if (!visible || !onDismiss) {
      return;
    }
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [visible, onDismiss, autoDismissMs]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.wrap} testID="continuing-from-session-chip">
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss continuing from last session"
          hitSlop={8}
          testID="continuing-from-session-chip-dismiss"
          style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
        >
          <Text style={styles.dismissText}>Dismiss</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  label: {
    flex: 1,
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  dismiss: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dismissPressed: {
    opacity: 0.7,
  },
  dismissText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
