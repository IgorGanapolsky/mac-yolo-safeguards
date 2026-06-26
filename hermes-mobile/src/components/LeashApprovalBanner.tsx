import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type LeashApprovalBannerProps = {
  title: string;
  approveLabel?: string;
  onOpenLeash: () => void;
  testID?: string;
};

export default function LeashApprovalBanner({
  title,
  approveLabel = 'Proceed',
  onOpenLeash,
  testID = 'leash-approval-banner',
}: LeashApprovalBannerProps) {
  return (
    <Pressable
      onPress={onOpenLeash}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Open Leash to approve or deny: ${title}`}
    >
      <View style={styles.row}>
        <Text style={styles.kicker}>Leash</Text>
        <Text style={styles.action}>Review →</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.hint}>
        Approve or deny on the Leash tab — faster than typing “{approveLabel}” in chat.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    gap: 4,
  },
  pressed: {
    opacity: 0.88,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  action: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.warning,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
  },
});
