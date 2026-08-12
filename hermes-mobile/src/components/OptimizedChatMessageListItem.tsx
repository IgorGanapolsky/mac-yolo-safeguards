/**
 * Optimized Chat Message List Item Component
 * Implements performance improvements for FlatList rendering in Hermes Mobile
 */

import React, { useMemo, memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ChatMessageBubble from './ChatMessageBubble';
import ToolActivityCard from './ToolActivityCard';
import ToolCallCard from './ToolCallCard';
import CollapsedToolActivityCard from './CollapsedToolActivityCard';
import {
  isToolDumpDisplayContent,
  prepareMessageForChatDisplay,
  shouldHideToolDumpFromTimeline,
} from '../utils/chatMessageDisplay';
import { isMessageDisplayEmpty } from '../utils/chatMessageMerge';
import { isToolActivityRole } from '../utils/toolMessageDetails';
import { extractTerminalActivityFromMessage } from '../utils/terminalActivity';
import { threadLabelAtMessageIndex } from '../utils/mergedThreadLabels';
import type { HermesMessage } from '../types/chat';
import type { ChatTextApproval } from '../utils/chatApproval';
import type { ParsedClarification } from '../utils/chatClarification';
import type { ClarificationOption } from '../utils/chatClarification';
import type { ApprovalChoice } from '../types/approval';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';
import type { PromptReplyElapsedState } from '../utils/promptReplyElapsed';

type OutputFeedbackHandlers = {
  busy?: boolean;
  selected?: 'up' | 'down';
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onAddDetails?: () => void;
};

export type ChatMessageListItemProps = {
  item: HermesMessage;
  listIndex: number;
  originalIndex: number;
  messages: HermesMessage[];
  timeLabel: string;
  inlineNudge?: ChatTextApproval;
  clarificationPrompt?: ParsedClarification;
  includeToolActivity: boolean;
  isTelegramInbox: boolean;
  connectionState: LeashConnectionState;
  macHttpOk: boolean;
  /** Failed turn the app will resend by itself — bubble shows progress, not "tap ↑". */
  autoResendPending?: boolean;
  approvalBusy: boolean;
  isSending: boolean;
  outputFeedback?: OutputFeedbackHandlers;
  onShowDetail: (body: string, isUser: boolean) => void;
  onInlineTextApproval: (textApproval: ChatTextApproval, choice: ApprovalChoice) => void;
  onClarificationOption?: (option: ClarificationOption) => void;
  onResendFailed?: () => void;
  promptReplyElapsed?: PromptReplyElapsedState;
};

const ChatMessageListItemComponent = ({
  item,
  listIndex,
  originalIndex,
  messages,
  timeLabel,
  inlineNudge,
  clarificationPrompt,
  includeToolActivity,
  isTelegramInbox,
  connectionState,
  macHttpOk,
  autoResendPending = false,
  approvalBusy,
  isSending,
  outputFeedback,
  onShowDetail,
  onInlineTextApproval,
  onClarificationOption,
  onResendFailed,
  promptReplyElapsed,
}: ChatMessageListItemProps) => {
  const isUser = item.role === 'user';

  // Memoize thread label calculation to prevent unnecessary recalculations
  const threadLabel = useMemo(() => {
    if (!isTelegramInbox) return undefined;
    return threadLabelAtMessageIndex(messages, originalIndex);
  }, [isTelegramInbox, messages, originalIndex]);

  const threadDivider = threadLabel !== undefined && originalIndex > 0;

  // Early return for empty items to prevent unnecessary renders
  if (isMessageDisplayEmpty(item.content) && !inlineNudge && !clarificationPrompt && !item.isCollapsedToolActivity) {
    return null;
  }

  // Handle collapsed tool activity
  if (item.isCollapsedToolActivity) {
    if (!includeToolActivity) {
      return null;
    }
    return (
      <CollapsedToolActivityCard
        activities={item.activities ?? []}
        timeLabel={timeLabel}
      />
    );
  }

  // Handle tool dumps when tool activity is excluded
  if (!includeToolActivity && !isUser && !inlineNudge && !clarificationPrompt) {
    if (shouldHideToolDumpFromTimeline(item, false)) {
      return null;
    }
    const raw = item.gatewayContent ?? item.rawContent ?? item.content;
    const preview = prepareMessageForChatDisplay(raw).content;
    if (isToolDumpDisplayContent(preview)) {
      return null;
    }
  }

  // Handle tool activity roles
  if (isToolActivityRole(item.role) && !inlineNudge && !clarificationPrompt) {
    if (!includeToolActivity) {
      return null;
    }
    
    const terminalActivity = extractTerminalActivityFromMessage(item);
    if (terminalActivity) {
      if (!includeToolActivity) {
        return null;
      }
      return (
        <ToolCallCard
          toolName={terminalActivity.toolName}
          command={terminalActivity.command}
          status={terminalActivity.status}
        />
      );
    }
    if (item.gatewayContent || item.rawContent) {
      return (
        <ToolActivityCard
          gatewayContent={item.gatewayContent ?? item.rawContent ?? item.content}
          preview={item.content}
          timeLabel={timeLabel}
          threadLabel={threadLabel}
          threadDivider={threadDivider}
        />
      );
    }
    return null;
  }

  // Prepare inline approval props
  const inlineApproval = useMemo(() => {
    if (!inlineNudge) return undefined;
    
    return {
      title: inlineNudge.title,
      busy: approvalBusy || isSending,
      onApprove: () => onInlineTextApproval(inlineNudge, 'once'),
      onDeny: () => onInlineTextApproval(inlineNudge, 'deny'),
    };
  }, [inlineNudge, approvalBusy, isSending, onInlineTextApproval]);

  // Prepare clarification props
  const clarification = useMemo(() => {
    if (!clarificationPrompt) return undefined;
    
    return {
      prompt: clarificationPrompt,
      busy: approvalBusy || isSending,
      onSelectOption: (option: ClarificationOption) => onClarificationOption?.(option),
    };
  }, [clarificationPrompt, approvalBusy, isSending, onClarificationOption]);

  // Render the main chat message bubble
  return (
    <ChatMessageBubble
      messageId={item.id}
      content={item.content}
      rawContent={item.rawContent}
      gatewayContent={item.gatewayContent}
      truncated={item.truncated}
      isUser={isUser}
      timeLabel={timeLabel}
      threadLabel={threadLabel}
      threadDivider={threadDivider}
      outboundStatus={isUser ? item.outboundStatus : undefined}
      outboundFailureReason={isUser ? item.outboundFailureReason : undefined}
      connectionState={connectionState}
      macHttpOk={macHttpOk}
      autoResendPending={autoResendPending}
      onResendFailed={
        isUser && item.outboundStatus === 'failed' && !autoResendPending
          ? onResendFailed
          : undefined
      }
      onShowDetail={(body) => onShowDetail(body, isUser)}
      inlineApproval={inlineApproval}
      clarification={clarification}
      outputFeedback={outputFeedback}
      promptReplyElapsed={isUser ? promptReplyElapsed : undefined}
    />
  );
};

// Optimized memo comparison function to prevent unnecessary re-renders
const areEqual = (prev: ChatMessageListItemProps, next: ChatMessageListItemProps): boolean => {
  // Quick equality checks for primitive values
  if (
    prev.listIndex !== next.listIndex ||
    prev.originalIndex !== next.originalIndex ||
    prev.timeLabel !== next.timeLabel ||
    prev.includeToolActivity !== next.includeToolActivity ||
    prev.isTelegramInbox !== next.isTelegramInbox ||
    prev.connectionState !== next.connectionState ||
    prev.autoResendPending !== next.autoResendPending ||
    prev.macHttpOk !== next.macHttpOk ||
    prev.approvalBusy !== next.approvalBusy ||
    prev.isSending !== next.isSending ||
    prev.outputFeedback !== next.outputFeedback ||
    prev.promptReplyElapsed !== next.promptReplyElapsed ||
    prev.inlineNudge !== next.inlineNudge ||
    prev.clarificationPrompt !== next.clarificationPrompt
  ) {
    return false;
  }

  // Check if item reference changed (most important for performance)
  if (prev.item !== next.item) {
    return false;
  }

  // For isSending, only check if it affects the current message type
  if (prev.isSending !== next.isSending) {
    const prevIsTailAssistant =
      prev.item.role?.toLowerCase() === 'assistant' &&
      prev.originalIndex === (prev.messages?.length ?? 0) - 1;
    const nextIsTailAssistant =
      next.item.role?.toLowerCase() === 'assistant' &&
      next.originalIndex === (next.messages?.length ?? 0) - 1;
    if (prevIsTailAssistant || nextIsTailAssistant || prev.inlineNudge || next.inlineNudge) {
      return false;
    }
  }

  // Check if messages changed when in telegram inbox mode
  if (prev.isTelegramInbox && prev.messages !== next.messages) {
    return false;
  }

  // Check callback functions (these should ideally be memoized by parent)
  return (
    prev.onShowDetail === next.onShowDetail &&
    prev.onInlineTextApproval === next.onInlineTextApproval &&
    prev.onClarificationOption === next.onClarificationOption &&
    prev.onResendFailed === next.onResendFailed
  );
};

// Export the memoized component
export default memo(ChatMessageListItemComponent, areEqual);

// Styles for the component (if needed)
const styles = StyleSheet.create({
  container: {
    // Add any container-specific styles if needed
  },
});