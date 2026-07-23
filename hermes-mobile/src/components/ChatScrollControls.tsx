import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  /** Only show when the user has scrolled away from the latest messages. */
  showJumpToBottom: boolean;
  onJumpToBottom: () => void;
  /**
   * @deprecated Jump-to-top was permanent chrome that felt useless in chat.
   * Ignored — kept optional so older call sites do not type-error mid-rebase.
   */
  showJumpToTop?: boolean;
  onJumpToTop?: () => void;
};

/**
 * Single jump-to-latest control (chat industry default).
 * No ↑ stack — native scroll covers "go to oldest"; dual arrows were clutter.
 */
export default function ChatScrollControls({
  showJumpToBottom,
  onJumpToBottom,
}: Props) {
  if (!showJumpToBottom) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        onPress={onJumpToBottom}
        style={styles.button}
        testID="chat-scroll-to-bottom"
        accessibilityRole="button"
        accessibilityLabel="Jump to latest messages"
      >
        <Text style={styles.icon}>↓</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    alignItems: 'center',
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardBgHover,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  icon: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
});
