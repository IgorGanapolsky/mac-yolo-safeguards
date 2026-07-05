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
  onSubmit: (latestText?: string) => void;
  placeholder: string;
  /** Muted styling when empty — button stays tappable so Android does not swallow the first tap. */
  sendMuted: boolean;
  sendLabel?: string;
  onSend: (latestText?: string) => void;
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
  const latestTextRef = useRef(value);
  const stopMode = showStop && !value.trim();
  const canSend = value.trim().length > 0 || latestTextRef.current.trim().length > 0;

  useEffect(() => {
    if (value.trim() || !latestTextRef.current.trim()) {
      latestTextRef.current = value;
    }
  }, [value]);

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
          onChangeText={(text) => {
            latestTextRef.current = text;
            onChangeText(text);
          }}
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
          onBlur={() => {
            onBlur();
          }}
          onEndEditing={(event) => {
            const endedText = event.nativeEvent.text;
            if (endedText.trim() || !latestTextRef.current.trim()) {
              latestTextRef.current = endedText;
            }
          }}
          onSubmitEditing={(event) => {
            latestTextRef.current = event.nativeEvent.text;
            onSubmit(event.nativeEvent.text);
          }}
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
            onPress={() => {
              const latest = latestTextRef.current;
              latestTextRef.current = '';
              onSend(latest);
            }}
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
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingBottom: 2,
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: colors.composerSurface,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 6,
    minHeight: 52,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 0 : 8,
    color: colors.text,
    fontSize: 16,
    lineHeight: Platform.OS === 'android' ? undefined : 22,
    maxHeight: 120,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonMuted: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  sendIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.backgroundStart,
    lineHeight: 20,
    marginTop: -1,
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
