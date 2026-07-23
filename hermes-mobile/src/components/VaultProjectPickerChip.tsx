import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type VaultProjectPickerChipProps = {
  projectName?: string;
  handoffSummary?: string;
  onPress?: () => void;
};

export default function VaultProjectPickerChip({
  projectName,
  handoffSummary,
  onPress,
}: VaultProjectPickerChipProps) {
  const label = projectName?.trim() || 'Project lane (optional)';
  const hint = handoffSummary?.trim();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.chip,
        onPress && pressed && styles.chipPressed,
      ]}
      testID="vault-project-picker-chip"
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={projectName ? `Project ${projectName}` : 'Optional project lane'}
      accessibilityHint="Opens the Obsidian vault project picker"
    >
      <Text style={styles.icon}>📁</Text>
      <View style={styles.textBlock}>
        <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
          {label}
          {onPress ? ' ▾' : ''}
        </Text>
        {hint ? (
          <Text style={styles.hint} numberOfLines={1} ellipsizeMode="tail" testID="vault-project-handoff-hint">
            {hint}
          </Text>
        ) : !projectName ? (
          <Text style={styles.hint} numberOfLines={1} testID="vault-project-optional-hint">
            Optional — tells ThumbGate which folder on your Mac to use
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  chipPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  icon: {
    fontSize: 13,
    width: 18,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  hint: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
  },
});
