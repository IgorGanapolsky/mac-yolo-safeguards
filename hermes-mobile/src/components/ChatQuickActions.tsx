import React, { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export type ChatQuickAction = {
  id: string;
  label: string;
  detail: string;
  prompt: string;
  dismissible?: boolean;
};

type ChatQuickActionsProps = {
  actions: ChatQuickAction[];
  onSelect: (action: ChatQuickAction) => void;
  onDismiss?: (action: ChatQuickAction) => void;
};

function ChatQuickActions({ actions, onSelect, onDismiss }: ChatQuickActionsProps) {
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
        {actions.map((action, index) => (
          <View
            key={action.id}
            style={[styles.chipContainer, index < actions.length - 1 && styles.chipSpacing]}
          >
            <Pressable
              onPress={() => onSelect(action)}
              style={({ pressed }) => [styles.chipPressable, pressed && styles.chipPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Reuse prompt: ${action.label}`}
              accessibilityHint="Loads this prompt into the message field"
              hitSlop={8}
              testID={`chat-quick-action-${action.id}`}
            >
              <Text style={styles.label} numberOfLines={1}>
                {action.label}
              </Text>
              <Text style={styles.detail} numberOfLines={1}>
                {action.detail}
              </Text>
            </Pressable>
            {onDismiss ? (
              <Pressable
                onPress={() => onDismiss(action)}
                style={({ pressed }) => [styles.dismissBtn, pressed && styles.dismissBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Dismiss ${action.label}`}
                hitSlop={10}
                testID={`chat-quick-action-dismiss-${action.id}`}
              >
                <Text style={styles.dismissText}>×</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default memo(ChatQuickActions);

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  content: {
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    maxWidth: 280,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    overflow: 'hidden',
  },
  chipSpacing: {
    marginRight: 8,
  },
  chipPressable: {
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  chipPressed: {
    backgroundColor: colors.cardBgHover,
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    color: colors.text,
  },
  detail: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  dismissBtn: {
    minWidth: 36,
    minHeight: 36,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.08)',
  },
  dismissBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  dismissText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textMuted,
    lineHeight: 18,
  },
});
