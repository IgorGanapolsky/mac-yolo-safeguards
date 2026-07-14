import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import type { ClarificationOption, ParsedClarification } from '../utils/chatClarification';

type ClarificationPromptCardProps = {
  clarification: ParsedClarification;
  busy?: boolean;
  onSelectOption: (option: ClarificationOption) => void;
};

/** Human-readable multiple-choice prompt from gateway `<clarification>` blocks. */
export default function ClarificationPromptCard({
  clarification,
  busy = false,
  onSelectOption,
}: ClarificationPromptCardProps) {
  const { question, options, partial } = clarification;

  return (
    <View style={styles.wrap} testID="clarification-prompt-card">
      <Text style={styles.kicker}>Hermes needs your choice</Text>
      <Text style={styles.question} testID="clarification-question">
        {question}
      </Text>
      {partial ? (
        <Text style={styles.partialHint} testID="clarification-partial-hint">
          Still loading options… you can also type your answer below.
        </Text>
      ) : null}
      {options.length > 0 ? (
        <View style={styles.options} testID="clarification-options">
          {options.map((option) => (
            <TouchableOpacity
              key={`${option.id}:${option.label}`}
              style={[styles.optionBtn, busy && styles.optionBtnDisabled]}
              onPress={() => onSelectOption(option)}
              disabled={busy}
              testID={`clarification-option-${option.id}`}
              accessibilityRole="button"
              accessibilityLabel={option.label}
            >
              {busy ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.optionText}>{option.label}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <Text style={styles.hint}>Tap an option or type your answer in the composer.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.35)',
    gap: 8,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  question: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    fontWeight: '600',
  },
  partialHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  options: {
    gap: 8,
  },
  optionBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.45)',
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 42,
    justifyContent: 'center',
  },
  optionBtnDisabled: {
    opacity: 0.6,
  },
  optionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  hint: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
