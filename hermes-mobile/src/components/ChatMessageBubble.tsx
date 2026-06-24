import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import { formatExpandedMessageContent, prepareMessageForChatDisplay } from '../utils/chatMessageDisplay';
import InlineMessageApproval from './InlineMessageApproval';
import {
  outboundDeliveryLabel,
  type OutboundDeliveryStatus,
} from '../utils/outboundDeliveryStatus';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';

type InlineApprovalHandlers = {
  title?: string;
  busy?: boolean;
  onApprove: () => void;
  onDeny: () => void;
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
  /** Screen-level handler — Modal must not live inside inverted FlatList cells. */
  onShowDetail?: (body: string) => void;
  outboundStatus?: OutboundDeliveryStatus;
  outboundFailureReason?: string;
  connectionState?: LeashConnectionState;
  macHttpOk?: boolean;
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

export default function ChatMessageBubble({
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
  onShowDetail,
  outboundStatus,
  outboundFailureReason,
  connectionState = 'demo',
  macHttpOk = true,
}: ChatMessageBubbleProps) {
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
            <Text
              style={[styles.bubbleText, isUser ? styles.bubbleUserText : styles.bubbleAssistantText]}
              selectable={false}
            >
              {resolved.content}
            </Text>
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
          <View style={styles.timeRow}>
            {isUser && outboundStatus ? (
              <Text
                style={[
                  styles.deliveryMark,
                  outboundStatus === 'failed' && styles.deliveryFailed,
                  outboundStatus === 'sent' &&
                    outboundDeliveryLabel(outboundStatus, {
                      connectionState,
                      macHttpOk,
                      failureReason: outboundFailureReason,
                    }).startsWith('✓') &&
                    styles.deliverySent,
                ]}
                testID={`chat-outbound-${outboundStatus}`}
              >
                {outboundDeliveryLabel(outboundStatus, {
                  connectionState,
                  macHttpOk,
                  failureReason: outboundFailureReason,
                })}
              </Text>
            ) : null}
            <Text
              style={[styles.bubbleTime, isUser ? styles.bubbleUserTime : styles.bubbleAssistantTime]}
              testID="chat-message-timestamp"
            >
              {timeLabel}
            </Text>
          </View>
        </View>
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
    gap: 8,
    marginTop: 6,
  },
  deliveryMark: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.65)',
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
  bubbleAssistantTime: {
    color: colors.textMuted,
  },
});
