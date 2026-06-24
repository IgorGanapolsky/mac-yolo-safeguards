import React, { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export type ChatQuickAction = {
  id: string;
  label: string;
  detail: string;
  prompt: string;
};

type ChatQuickActionsProps = {
  actions: ChatQuickAction[];
  onSelect: (action: ChatQuickAction) => void;
};

function ChatQuickActions({ actions, onSelect }: ChatQuickActionsProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap} testID="chat-quick-actions">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {actions.map((action) => (
          <Pressable
            key={action.id}
            onPress={() => onSelect(action)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}: ${action.detail}`}
            testID={`chat-quick-action-${action.id}`}
          >
            <Text style={styles.label}>{action.label}</Text>
            <Text style={styles.detail} numberOfLines={1}>
              {action.detail}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default memo(ChatQuickActions);

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
  },
  content: {
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    minWidth: 92,
    maxWidth: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipPressed: {
    opacity: 0.82,
    backgroundColor: colors.cardBgHover,
  },
  label: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  detail: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
