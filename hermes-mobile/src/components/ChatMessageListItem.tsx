import React, { useMemo } from 'react';
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
  approvalBusy: boolean;
  isSending: boolean;
  outputFeedback?: OutputFeedbackHandlers;
  onShowDetail: (body: string, isUser: boolean) => void;
  onInlineTextApproval: (textApproval: ChatTextApproval, choice: ApprovalChoice) => void;
  onClarificationOption?: (option: ClarificationOption) => void;
  promptReplyElapsed?: PromptReplyElapsedState;
};

function ChatMessageListItem({
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
  approvalBusy,
  isSending,
  outputFeedback,
  onShowDetail,
  onInlineTextApproval,
  onClarificationOption,
  promptReplyElapsed,
}: ChatMessageListItemProps) {
  const isUser = item.role === 'user';

  const threadLabel = useMemo(
    () => (isTelegramInbox ? threadLabelAtMessageIndex(messages, originalIndex) : undefined),
    [isTelegramInbox, messages, originalIndex],
  );

  const threadDivider = threadLabel !== undefined && originalIndex > 0;

  // Never render an empty timestamp-only row (user or assistant). Empty user
  // bubbles previously slipped through and showed "Jul 13 9:10 AM" with no text.
  if (isMessageDisplayEmpty(item.content) && !inlineNudge && !clarificationPrompt && !item.isCollapsedToolActivity) {
    return null;
  }

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

  const inlineApproval = inlineNudge
    ? {
        title: inlineNudge.title,
        busy: approvalBusy || isSending,
        onApprove: () => onInlineTextApproval(inlineNudge, 'once'),
        onDeny: () => onInlineTextApproval(inlineNudge, 'deny'),
      }
    : undefined;

  const clarification = clarificationPrompt
    ? {
        prompt: clarificationPrompt,
        busy: approvalBusy || isSending,
        onSelectOption: (option: ClarificationOption) => onClarificationOption?.(option),
      }
    : undefined;

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
      onShowDetail={(body) => onShowDetail(body, isUser)}
      inlineApproval={inlineApproval}
      clarification={clarification}
      outputFeedback={outputFeedback}
      promptReplyElapsed={isUser ? promptReplyElapsed : undefined}
    />
  );
}

export default React.memo(ChatMessageListItem, (prev, next) => {
  if (prev.item !== next.item) {
    return false;
  }
  if (prev.listIndex !== next.listIndex) {
    return false;
  }
  if (prev.originalIndex !== next.originalIndex) {
    return false;
  }
  if (prev.inlineNudge !== next.inlineNudge) {
    return false;
  }
  if (prev.clarificationPrompt !== next.clarificationPrompt) {
    return false;
  }
  if (prev.timeLabel !== next.timeLabel) {
    return false;
  }
  if (prev.includeToolActivity !== next.includeToolActivity) {
    return false;
  }
  if (prev.isTelegramInbox !== next.isTelegramInbox) {
    return false;
  }
  if (prev.connectionState !== next.connectionState) {
    return false;
  }
  if (prev.macHttpOk !== next.macHttpOk) {
    return false;
  }
  if (prev.approvalBusy !== next.approvalBusy) {
    return false;
  }
  // isSending only affects the trailing assistant row (streaming) and inline approvals.
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
  if (prev.outputFeedback !== next.outputFeedback) {
    return false;
  }
  if (prev.promptReplyElapsed !== next.promptReplyElapsed) {
    return false;
  }
  if (prev.messages !== next.messages && prev.isTelegramInbox) {
    return false;
  }
  return (
    prev.onShowDetail === next.onShowDetail &&
    prev.onInlineTextApproval === next.onInlineTextApproval
  );
});
