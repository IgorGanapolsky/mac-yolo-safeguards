import React, { useState, useEffect } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

type FeedbackPromptModalProps = {
  visible: boolean;
  signal: 'up' | 'down';
  onClose: () => void;
  onSubmit: (explanation?: string) => void;
};

export default function FeedbackPromptModal({
  visible,
  signal,
  onClose,
  onSubmit,
}: FeedbackPromptModalProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) {
      setText('');
    }
  }, [visible]);

  const trimmed = text.trim();
  const placeholder =
    signal === 'up'
      ? 'e.g., correct response, fast output, helpful context…'
      : 'e.g., wrong answer, hallucination, missing approval card…';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} accessibilityLabel="Skip feedback details" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <SafeAreaView style={styles.sheet} edges={['bottom']} testID="feedback-prompt-modal">
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                Add details (optional)
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                testID="feedback-prompt-close"
              >
                <Text style={styles.closeLabel}>Skip</Text>
              </Pressable>
            </View>

            <View style={styles.body}>
              <Text style={styles.subtitle}>
                {signal === 'up'
                  ? 'Thanks — we saved your thumbs up to cloud memory. Add context to help Hermes learn from this output.'
                  : 'Thanks — we saved your thumbs down to cloud memory. Add context to improve future outputs.'}
              </Text>

              <TextInput
                style={styles.input}
                multiline
                numberOfLines={4}
                maxLength={500}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                value={text}
                onChangeText={setText}
                autoFocus
                testID="feedback-prompt-input"
              />

              <View style={styles.actions}>
                <Pressable
                  style={[styles.button, styles.skipButton]}
                  onPress={onClose}
                  accessibilityRole="button"
                  testID="feedback-prompt-skip"
                >
                  <Text style={styles.skipButtonText}>Skip</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.button,
                    styles.submitButton,
                    !trimmed && styles.submitButtonDisabled,
                  ]}
                  onPress={() => onSubmit(trimmed || undefined)}
                  disabled={!trimmed}
                  accessibilityRole="button"
                  testID="feedback-prompt-submit"
                >
                  <Text style={[styles.submitButtonText, !trimmed && styles.submitButtonTextDisabled]}>
                    Submit
                  </Text>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  backdropTap: {
    flex: 1,
  },
  keyboardAvoid: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.backgroundStart,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.3,
  },
  closeLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
  },
  body: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    paddingBottom: 28,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  input: {
    height: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  skipButtonText: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 13,
  },
  submitButton: {
    backgroundColor: colors.accent,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  submitButtonTextDisabled: {
    color: '#0B0F19',
  },
});
