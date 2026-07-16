import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import ChatFormattedText from './ChatFormattedText';
import { formatExpandedMessageContent, prepareMessageForChatDisplay } from '../utils/chatMessageDisplay';
import InlineMessageApproval from './InlineMessageApproval';
import ClarificationPromptCard from './ClarificationPromptCard';
import type { ClarificationOption, ParsedClarification } from '../utils/chatClarification';
import {
  outboundDeliveryLabel,
  outboundPendingAgeMs,
  type OutboundDeliveryStatus,
} from '../utils/outboundDeliveryStatus';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';
import ElapsedSince from './ElapsedSince';
import { formatElapsedDuration } from '../utils/formatElapsedDuration';
import type { PromptReplyElapsedState } from '../utils/promptReplyElapsed';

type InlineApprovalHandlers = {
  title?: string;
  busy?: boolean;
  onApprove: () => void;
  onDeny: () => void;
};

type OutputFeedbackHandlers = {
  busy?: boolean;
  selected?: 'up' | 'down';
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onAddDetails?: () => void;
};

type ChatMessageBubbleProps = {
  messageId?: string;
  content: string;
  rawContent?: string;
  gatewayContent?: string;
  truncated?: boolean;
  isUser: boolean;
  timeLabel: string;
  threadLabel?: string;
  /** When true, show a divider above the thread label (not for the first thread in the list). */
  threadDivider?: boolean;
  inlineApproval?: InlineApprovalHandlers;
  clarification?: {
    prompt: ParsedClarification;
    busy?: boolean;
    onSelectOption: (option: ClarificationOption) => void;
  };
  outputFeedback?: OutputFeedbackHandlers;
  /** Screen-level handler — Modal must not live inside inverted FlatList cells. */
  onShowDetail?: (body: string) => void;
  outboundStatus?: OutboundDeliveryStatus;
  outboundFailureReason?: string;
  /** ISO / epoch when the optimistic bubble was created — drives 3s ack copy. */
  outboundCreatedAt?: string | number | null;
  connectionState?: LeashConnectionState;
  macHttpOk?: boolean;
  leashUnlocked?: boolean;
  onFeedback?: (signal: 'up' | 'down') => void;
  promptReplyElapsed?: PromptReplyElapsedState;
};

function hasMeaningfulExpansion(preview: string, expanded: string): boolean {
  if (!expanded.trim()) {
    return false;
  }
  if (expanded.length > preview.length + 16) {
    return true;
  }
  if (expanded !== preview) {
    return true;
  }
  return preview.endsWith('…') || preview.endsWith('...');
}

function ChatMessageBubble({
  messageId,
  content,
  rawContent,
  gatewayContent,
  truncated,
  isUser,
  timeLabel,
  threadLabel,
  threadDivider = false,
  inlineApproval,
  clarification,
  outputFeedback,
  onShowDetail,
  outboundStatus,
  outboundFailureReason,
  outboundCreatedAt,
  connectionState = 'demo',
  macHttpOk = true,
  promptReplyElapsed,
}: ChatMessageBubbleProps) {
  const [ackNowMs, setAckNowMs] = useState(() => Date.now());
  const needsAckTick =
    isUser && (outboundStatus === 'pending' || outboundStatus === 'sent') && Boolean(outboundCreatedAt);

  useEffect(() => {
    if (!needsAckTick) {
      return;
    }
    setAckNowMs(Date.now());
    const timer = setInterval(() => setAckNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [needsAckTick, outboundCreatedAt, outboundStatus]);

  const pendingAgeMs = useMemo(
    () => (needsAckTick ? outboundPendingAgeMs(outboundCreatedAt, ackNowMs) : 0),
    [needsAckTick, outboundCreatedAt, ackNowMs],
  );

  const deliveryLabel = useMemo(() => {
    if (!outboundStatus) {
      return null;
    }
    return outboundDeliveryLabel(outboundStatus, {
      connectionState,
      macHttpOk,
      failureReason: outboundFailureReason,
      pendingAgeMs,
    });
  }, [outboundStatus, connectionState, macHttpOk, outboundFailureReason, pendingAgeMs]);

  const resolved = useMemo(() => {
    if (rawContent !== undefined && truncated !== undefined) {
      return { content, rawContent, truncated };
    }
    const fallbackRaw = gatewayContent ?? content;
    return prepareMessageForChatDisplay(fallbackRaw);
  }, [content, rawContent, gatewayContent, truncated]);

  const expandedContent = useMemo(() => {
    if (gatewayContent?.trim()) {
      return formatExpandedMessageContent(gatewayContent);
    }
    return resolved.rawContent?.trim() || resolved.content;
  }, [gatewayContent, resolved.rawContent, resolved.content]);

  const canExpand = resolved.truncated && hasMeaningfulExpansion(resolved.content, expandedContent);

  const openDetails = () => {
    if (!canExpand || !onShowDetail) {
      return;
    }
    haptics.selection();
    onShowDetail(expandedContent);
  };

  return (
    <View
      style={[styles.bubbleWrapper, isUser ? styles.bubbleUserWrapper : styles.bubbleAssistantWrapper]}
      testID={isUser ? 'chat-message-user' : 'chat-message-assistant'}
      accessibilityLabel={messageId ? `message-${messageId}` : undefined}
    >
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {threadLabel ? (
            <Text style={[styles.threadLabel, threadDivider && styles.threadLabelDivider]}>
              {threadLabel}
            </Text>
          ) : null}
          {resolved.content.trim().length > 0 ? (
            <ChatFormattedText
              text={resolved.content}
              style={[styles.bubbleText, isUser ? styles.bubbleUserText : styles.bubbleAssistantText]}
              variant={isUser ? 'user' : 'assistant'}
              selectable
              testID="chat-message-body"
            />
          ) : null}
          {canExpand ? (
            <Pressable
              onPress={openDetails}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Show full message detail"
              testID="chat-message-expand"
              style={({ pressed }) => [styles.expandPressable, pressed && styles.expandPressablePressed]}
            >
              <Text style={[styles.expandHint, isUser ? styles.expandHintUser : styles.expandHintAssistant]}>
                Show more
              </Text>
            </Pressable>
          ) : null}
          {inlineApproval ? (
            <InlineMessageApproval
              title={inlineApproval.title}
              busy={inlineApproval.busy}
              onApprove={inlineApproval.onApprove}
              onDeny={inlineApproval.onDeny}
            />
          ) : null}
          {clarification ? (
            <ClarificationPromptCard
              clarification={clarification.prompt}
              busy={clarification.busy}
              onSelectOption={clarification.onSelectOption}
            />
          ) : null}
          {!isUser && outputFeedback ? (
            <View style={styles.feedbackRow} testID="chat-output-feedback">
              <Pressable
                onPress={() => {
                  haptics.selection();
                  outputFeedback.onThumbsUp();
                }}
                disabled={outputFeedback.busy}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityState={{ selected: outputFeedback.selected === 'up' }}
                accessibilityLabel="Mark Hermes output useful"
                testID="chat-output-thumbs-up"
                style={({ pressed }) => [
                  styles.feedbackButton,
                  outputFeedback.selected === 'up' && styles.feedbackButtonSelected,
                  pressed && styles.feedbackButtonPressed,
                  outputFeedback.busy && styles.feedbackButtonDisabled,
                ]}
              >
                <Text style={styles.feedbackIcon}>👍</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  haptics.selection();
                  outputFeedback.onThumbsDown();
                }}
                disabled={outputFeedback.busy}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityState={{ selected: outputFeedback.selected === 'down' }}
                accessibilityLabel="Mark Hermes output unhelpful"
                testID="chat-output-thumbs-down"
                style={({ pressed }) => [
                  styles.feedbackButton,
                  outputFeedback.selected === 'down' && styles.feedbackButtonSelectedDown,
                  pressed && styles.feedbackButtonPressed,
                  outputFeedback.busy && styles.feedbackButtonDisabled,
                ]}
              >
                <Text style={styles.feedbackIcon}>👎</Text>
              </Pressable>
              {outputFeedback.selected && outputFeedback.onAddDetails ? (
                <Pressable
                  onPress={outputFeedback.onAddDetails}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Add feedback details"
                  testID="chat-output-add-details"
                  style={({ pressed }) => [
                    styles.addDetailsButton,
                    pressed && styles.feedbackButtonPressed,
                  ]}
                >
                  <Text style={styles.addDetailsText}>Add details</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {isUser && promptReplyElapsed?.mode === 'live' ? (
            <ElapsedSince
              sinceMs={promptReplyElapsed.sinceMs}
              prominent
              prefix="Waiting"
              testID="chat-prompt-elapsed-live"
            />
          ) : null}
          <View
            style={[
              styles.timeRow,
              isUser && outboundStatus === 'failed' && styles.timeRowFailed,
            ]}
          >
            {isUser && outboundStatus && deliveryLabel ? (
              <Text
                style={[
                  styles.deliveryMark,
                  outboundStatus === 'failed' && styles.deliveryFailed,
                  outboundStatus === 'sent' &&
                    deliveryLabel.startsWith('✓') &&
                    styles.deliverySent,
                ]}
                numberOfLines={outboundStatus === 'failed' ? 3 : 1}
                testID={`chat-outbound-${outboundStatus}`}
              >
                {deliveryLabel}
              </Text>
            ) : null}
            <Text
              style={[
                styles.bubbleTime,
                isUser ? styles.bubbleUserTime : styles.bubbleAssistantTime,
                isUser && outboundStatus === 'failed' && styles.bubbleTimeBelowDelivery,
              ]}
              testID="chat-message-timestamp"
            >
              {`${timeLabel}${
                isUser && promptReplyElapsed?.mode === 'frozen'
                  ? ` · ${formatElapsedDuration(promptReplyElapsed.durationSec)}`
                  : ''
              }`}
            </Text>
          </View>
        </View>
    </View>
  );
}

export default React.memo(ChatMessageBubble);

const styles = StyleSheet.create({
  bubbleWrapper: {
    marginBottom: 16,
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  bubbleUserWrapper: {
    justifyContent: 'flex-end',
  },
  bubbleAssistantWrapper: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '92%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  bubbleUser: {
    backgroundColor: colors.userBubble,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  bubbleAssistant: {
    maxWidth: '100%',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 24,
  },
  bubbleUserText: {
    color: colors.userBubbleText,
  },
  bubbleAssistantText: {
    color: colors.text,
  },
  expandPressable: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 4,
    paddingRight: 8,
  },
  expandPressablePressed: {
    opacity: 0.7,
  },
  expandHint: {
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
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  timeRowFailed: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 8,
    marginBottom: 2,
    flexShrink: 0,
  },
  feedbackButton: {
    minWidth: 34,
    minHeight: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  feedbackButtonPressed: {
    opacity: 0.72,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
  },
  feedbackButtonDisabled: {
    opacity: 0.45,
  },
  feedbackButtonSelected: {
    borderColor: 'rgba(34, 211, 238, 0.9)',
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
  },
  feedbackButtonSelectedDown: {
    borderColor: 'rgba(248, 113, 113, 0.9)',
    backgroundColor: 'rgba(248, 113, 113, 0.18)',
  },
  addDetailsButton: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDetailsText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(34, 211, 238, 0.95)',
  },
  feedbackIcon: {
    fontSize: 16,
  },
  deliveryMark: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.65)',
    flexShrink: 1,
    maxWidth: '100%',
    textAlign: 'right',
  },
  deliverySent: {
    color: colors.success,
  },
  deliveryFailed: {
    color: colors.error,
  },
  bubbleUserTime: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  bubbleTimeBelowDelivery: {
    alignSelf: 'flex-end',
  },
  bubbleAssistantTime: {
    color: colors.textMuted,
  },
});
