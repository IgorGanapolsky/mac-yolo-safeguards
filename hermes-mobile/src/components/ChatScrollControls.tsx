import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  showJumpToBottom: boolean;
  showJumpToTop: boolean;
  onJumpToBottom: () => void;
  onJumpToTop: () => void;
};

export default function ChatScrollControls({
  showJumpToBottom,
  showJumpToTop,
  onJumpToBottom,
  onJumpToTop,
}: Props) {
  if (!showJumpToBottom && !showJumpToTop) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      {showJumpToTop ? (
        <Pressable
          onPress={onJumpToTop}
          style={styles.button}
          testID="chat-scroll-to-top"
          accessibilityRole="button"
          accessibilityLabel="Scroll to top"
        >
          <Text style={styles.icon}>↑</Text>
        </Pressable>
      ) : null}
      {showJumpToBottom ? (
        <Pressable
          onPress={onJumpToBottom}
          style={[styles.button, showJumpToTop ? styles.buttonStacked : null]}
          testID="chat-scroll-to-bottom"
          accessibilityRole="button"
          accessibilityLabel="Scroll to bottom"
        >
          <Text style={styles.icon}>↓</Text>
        </Pressable>
      ) : null}
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
  buttonStacked: {
    marginTop: 8,
  },
  icon: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
});
