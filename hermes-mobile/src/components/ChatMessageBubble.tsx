import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import InlineMessageApproval from './InlineMessageApproval';

type InlineApprovalHandlers = {
  title?: string;
  busy?: boolean;
  onApprove: () => void;
  onDeny: () => void;
};

type ChatMessageBubbleProps = {
  content: string;
  rawContent?: string;
  truncated?: boolean;
  isUser: boolean;
  timeLabel: string;
  threadLabel?: string;
  /** When true, show a divider above the thread label (not for the first thread in the list). */
  threadDivider?: boolean;
  inlineApproval?: InlineApprovalHandlers;
};

export default function ChatMessageBubble({
  content,
  rawContent,
  truncated = false,
  isUser,
  timeLabel,
  threadLabel,
  threadDivider = false,
  inlineApproval,
}: ChatMessageBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const canExpand =
    truncated &&
    rawContent &&
    (rawContent !== content || content.endsWith('...') || content.endsWith('…'));
  const displayText = expanded && canExpand ? rawContent : content;

  const toggleExpand = () => {
    if (!canExpand) return;
    haptics.selection();
    setExpanded((value) => !value);
  };

  return (
    <View
      style={[styles.bubbleWrapper, isUser ? styles.bubbleUserWrapper : styles.bubbleAssistantWrapper]}
    >
      <TouchableOpacity
        style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}
        onPress={toggleExpand}
        disabled={!canExpand}
        activeOpacity={canExpand ? 0.88 : 1}
        accessibilityRole={canExpand ? 'button' : 'text'}
        accessibilityLabel={
          canExpand
            ? expanded
              ? 'Collapse message'
              : 'Expand truncated message'
            : undefined
        }
      >
        {threadLabel ? (
          <Text style={[styles.threadLabel, threadDivider && styles.threadLabelDivider]}>
            {threadLabel}
          </Text>
        ) : null}
        {displayText.trim().length > 0 ? (
          <Text
            style={[styles.bubbleText, isUser ? styles.bubbleUserText : styles.bubbleAssistantText]}
            selectable={expanded}
          >
            {displayText}
          </Text>
        ) : null}
        {canExpand ? (
          <Text style={[styles.expandHint, isUser ? styles.expandHintUser : styles.expandHintAssistant]}>
            {expanded ? 'Show less' : 'Show more'}
          </Text>
        ) : null}
        {inlineApproval ? (
          <InlineMessageApproval
            title={inlineApproval.title}
            busy={inlineApproval.busy}
            onApprove={inlineApproval.onApprove}
            onDeny={inlineApproval.onDeny}
          />
        ) : null}
        <Text
          style={[styles.bubbleTime, isUser ? styles.bubbleUserTime : styles.bubbleAssistantTime]}
          testID="chat-message-timestamp"
        >
          {timeLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleWrapper: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  bubbleUserWrapper: {
    justifyContent: 'flex-end',
  },
  bubbleAssistantWrapper: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(139, 92, 246, 0.5)',
  },
  bubbleAssistant: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleUserText: {
    color: '#FFFFFF',
  },
  bubbleAssistantText: {
    color: colors.text,
  },
  expandHint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  expandHintUser: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  expandHintAssistant: {
    color: colors.accent,
  },
  threadLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.accent,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  threadLabelDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
    paddingTop: 8,
  },
  bubbleTime: {
    marginTop: 6,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bubbleUserTime: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  bubbleAssistantTime: {
    color: colors.textMuted,
  },
});
