import React, { memo, useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import type { ComposerAttachment } from '../types/chatAttachment';
import { composerHasSendableContent } from '../utils/chatAttachments';

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
  /** Block send taps while outbound is in flight (RNTL ignores TouchableOpacity disabled). */
  sendDisabled?: boolean;
  sendLabel?: string;
  onSend: (latestText?: string) => void;
  /** Codex-style: square Stop while Mac run is pending (always visible; Send stays if composer has text). */
  showStop?: boolean;
  onStop?: () => void;
  stopLabel?: string;
  /** Increment to request keyboard focus (e.g. New chat +). */
  focusNonce?: number;
  attachments?: ComposerAttachment[];
  onRemoveAttachment?: (id: string) => void;
  onAttachPress?: () => void;
};

function ChatInputBar({
  value,
  onChangeText,
  onFocus,
  onBlur,
  onSubmit,
  placeholder,
  sendMuted,
  sendDisabled = false,
  onSend,
  showStop = false,
  onStop,
  focusNonce = 0,
  attachments = [],
  onRemoveAttachment,
  onAttachPress,
}: ChatInputBarProps) {
  const inputRef = useRef<TextInput>(null);
  const latestTextRef = useRef(value);
  const hasSendable = composerHasSendableContent(value, attachments)
    || composerHasSendableContent(latestTextRef.current, attachments);
  /** Stop stays visible for the whole pending run; Send stays mounted (muted when empty). */
  const showStopButton = Boolean(showStop && onStop);
  const canSend = hasSendable;

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
      {attachments.length > 0 ? (
        <View style={styles.chipsRow} testID="chat-attachment-chips">
          {attachments.map((attachment) => (
            <View key={attachment.id} style={styles.chip} testID={`chat-attach-chip-${attachment.id}`}>
              <Text style={styles.chipText} numberOfLines={1}>
                {attachment.name}
              </Text>
              <TouchableOpacity
                onPress={() => onRemoveAttachment?.(attachment.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID={`chat-attach-remove-${attachment.id}`}
                accessibilityLabel={`Remove ${attachment.name}`}
              >
                <Text style={styles.chipRemove}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.inputBar}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={onAttachPress}
          disabled={!onAttachPress}
          testID="chat-attach-button"
          accessibilityLabel="Attach file"
        >
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>
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
          autoCorrect={true}
          autoCapitalize="sentences"
          spellCheck={true}
          keyboardType="default"
          textContentType="none"
          smartInsertDelete={true}
          keyboardAppearance="dark"
          importantForAutofill="no"
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
        {showStopButton ? (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={onStop}
            testID="chat-stop-button"
            accessibilityLabel="Stop run"
          >
            <View style={styles.stopSquare} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.sendButton, (sendMuted || !canSend || sendDisabled) && styles.sendButtonMuted]}
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
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  chipText: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 13,
  },
  chipRemove: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '600',
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
  attachButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'android' ? 0 : 2,
  },
  attachIcon: {
    fontSize: 20,
    lineHeight: 22,
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
