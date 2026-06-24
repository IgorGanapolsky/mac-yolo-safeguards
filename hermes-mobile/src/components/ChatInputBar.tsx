import React, { memo, useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

/** Android multiline fields clip typed glyphs without vertical alignment + font padding fix. */
const androidComposerInputStyle = Platform.select({
  android: {
    textAlignVertical: 'center' as const,
    includeFontPadding: false,
    paddingTop: 8,
    paddingBottom: 8,
  },
  default: {},
});

type ChatInputBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmit: () => void;
  placeholder: string;
  /** Muted styling when empty — button stays tappable so Android does not swallow the first tap. */
  sendMuted: boolean;
  sendLabel?: string;
  onSend: () => void;
  /** Codex-style: square Stop replaces Send while Mac run is active and composer is empty. */
  showStop?: boolean;
  onStop?: () => void;
  stopLabel?: string;
  /** Increment to request keyboard focus (e.g. New chat +). */
  focusNonce?: number;
};

function ChatInputBar({
  value,
  onChangeText,
  onFocus,
  onBlur,
  onSubmit,
  placeholder,
  sendMuted,
  onSend,
  showStop = false,
  onStop,
  focusNonce = 0,
}: ChatInputBarProps) {
  const inputRef = useRef<TextInput>(null);
  const stopMode = showStop && !value.trim();
  const canSend = value.trim().length > 0;

  useEffect(() => {
    if (focusNonce <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [focusNonce]);

  return (
    <View style={styles.shell}>
      <View style={styles.inputBar}>
        <TextInput
          ref={inputRef}
          style={[styles.input, androidComposerInputStyle]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.accent}
          underlineColorAndroid="transparent"
          editable
          multiline
          returnKeyType="send"
          blurOnSubmit={false}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmit}
          testID="chat-input"
        />
        {stopMode ? (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={onStop}
            testID="chat-stop-button"
            accessibilityLabel="Stop run"
          >
            <View style={styles.stopSquare} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendButtonMuted]}
            onPress={onSend}
            testID="chat-send-button"
            accessibilityLabel="Send"
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default memo(ChatInputBar);

const styles = StyleSheet.create({
  shell: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    backgroundColor: 'rgba(11, 15, 25, 0.96)',
    paddingTop: 8,
  },
  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 4,
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: colors.borderLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 0 : 10,
    color: colors.text,
    fontSize: 16,
    lineHeight: Platform.OS === 'android' ? undefined : 22,
    maxHeight: 120,
    minHeight: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonMuted: {
    backgroundColor: 'rgba(79, 70, 229, 0.35)',
  },
  sendIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 22,
    marginTop: -2,
  },
  stopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.error,
  },
});
