/**
 * Optimized Chat Message List Component
 * Implements performance improvements for message list rendering in Hermes Mobile
 */

import React, { useRef, useCallback, useMemo } from 'react';
import {
  FlatList,
  View,
  StyleSheet,
  NativeScrollEvent,
  NativeSyntheticEvent,
  LayoutRectangle,
} from 'react-native';
import { useWindowDimensions } from 'react-native';
import OptimizedChatMessageListItem from './OptimizedChatMessageListItem';
import ChatScrollControls from './ChatScrollControls';
import type { HermesMessage } from '../types/chat';
import type { ChatTextApproval } from '../utils/chatApproval';
import type { ParsedClarification } from '../utils/chatClarification';
import type { ClarificationOption } from '../utils/chatClarification';
import type { ApprovalChoice } from '../types/approval';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';
import type { PromptReplyElapsedState } from '../utils/promptReplyElapsed';

// Define the timeline entry type
export type ChatTimelineEntry = {
  message: HermesMessage;
  originalIndex: number;
};

// Props for the optimized chat list
export interface OptimizedChatListProps {
  // Messages and data
  chatTimelineMessages: ChatTimelineEntry[];
  messages: HermesMessage[];
  
  // Callbacks
  onShowMessageDetail: (body: string, isUser: boolean) => void;
  onInlineTextApproval: (textApproval: ChatTextApproval, choice: ApprovalChoice) => void;
  onClarificationOption?: (option: ClarificationOption) => void;
  onResendFailed?: () => void;
  
  // State and settings
  inlineTextApprovals: Map<number, ChatTextApproval>;
  settings: {
    includeToolActivity: boolean;
  };
  isTelegramInbox: boolean;
  connectionState: LeashConnectionState;
  effectiveMacHttpOk: boolean;
  autoResendPendingMessageId?: string;
  approvalBusy: boolean;
  isSending: boolean;
  
  // Feedback and output handlers
  feedbackSelections: Record<string, 'up' | 'down'>;
  feedbackNotes: Record<string, { text: string; error?: boolean }>;
  feedbackNotesRef: React.RefObject<{ [key: string]: { text: string; error?: boolean } }>;
  chatOutputFeedbackBusyId: string;
  handleChatOutputFeedbackTap: (message: HermesMessage, feedback: 'up' | 'down') => void;
  handleAddFeedbackDetails: (message: HermesMessage) => void;
  
  // Scroll and layout
  handleChatScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleChatScrollBeginDrag: () => void;
  handleChatScrollEndDrag: () => void;
  scrollChatToLatest: (animated: boolean) => void;
  chatNearBottom: boolean;
  chatNearTop: boolean;
  handleJumpToBottom: () => void;
  handleJumpToTop: () => void;
  showRecentChatsPanel: boolean;
  recentChatsList: React.ReactNode;
  
  // Loading and refresh
  isPullRefreshing?: boolean;
  handleManualSync?: () => void;
  keyboardOpen: boolean;
  
  // Additional props
  [key: string]: any;
}

// Calculate the estimated height for different types of messages
const calculateEstimatedItemHeight = (item: ChatTimelineEntry): number => {
  const { message } = item;
  
  // Base height for different message types
  if (message.isCollapsedToolActivity) {
    return 60; // Collapsed tool activity is typically shorter
  }
  
  if (message.role === 'user') {
    return 80; // User messages are typically shorter
  }
  
  // For assistant messages, estimate based on content length
  const content = message.content || '';
  const contentLength = typeof content === 'string' ? content.length : JSON.stringify(content).length;
  
  // Rough estimation: 200 characters per line, 20px per line, with minimum 60px
  const lines = Math.ceil(contentLength / 200);
  return Math.max(60, 20 * lines);
};

const OptimizedChatList: React.FC<OptimizedChatListProps> = ({
  chatTimelineMessages,
  messages,
  onShowMessageDetail,
  onInlineTextApproval,
  onClarificationOption,
  onResendFailed,
  inlineTextApprovals,
  settings,
  isTelegramInbox,
  connectionState,
  effectiveMacHttpOk,
  autoResendPendingMessageId,
  approvalBusy,
  isSending,
  feedbackSelections,
  feedbackNotes,
  feedbackNotesRef,
  chatOutputFeedbackBusyId,
  handleChatOutputFeedbackTap,
  handleAddFeedbackDetails,
  handleChatScroll,
  handleChatScrollBeginDrag,
  handleChatScrollEndDrag,
  scrollChatToLatest,
  chatNearBottom,
  chatNearTop,
  handleJumpToBottom,
  handleJumpToTop,
  showRecentChatsPanel,
  recentChatsList,
  isPullRefreshing,
  handleManualSync,
  keyboardOpen,
}) => {
  const flatListRef = useRef<FlatList<ChatTimelineEntry>>(null);
  const { height: windowHeight } = useWindowDimensions();
  
  // Memoize the key extractor to prevent recreation on every render
  const keyExtractor = useCallback((item: ChatTimelineEntry, index: number) => {
    return item.message.id ?? `${item.message.role}-${item.originalIndex}-${index}`;
  }, []);
  
  // Memoize the render item function
  const renderItem = useCallback(({ item, index }: { item: ChatTimelineEntry; index: number }) => {
    const { message, originalIndex } = item;
    
    // Get inline approval for this message
    const inlineNudge = inlineTextApprovals.get(originalIndex);
    
    // Determine if this is a streaming assistant message
    const isStreamingAssistant =
      isSending &&
      message.role?.toLowerCase() === 'assistant' &&
      originalIndex === messages.length - 1;
    
    // Determine if output feedback should be shown
    const showOutputFeedback = (() => {
      // Logic for showing output feedback - simplified for performance
      return Boolean(
        settings.includeToolActivity && 
        message.role?.toLowerCase() === 'assistant' &&
        !isStreamingAssistant
      );
    })();
    
    const busyKey = `${message.id}-${message.role}`; // Simplified busy key
    const feedbackNote = feedbackNotes[busyKey];
    
    const outputFeedback = showOutputFeedback
      ? {
          busy: chatOutputFeedbackBusyId === busyKey,
          selected: feedbackSelections[busyKey],
          onThumbsUp: () => handleChatOutputFeedbackTap(message, 'up'),
          onThumbsDown: () => handleChatOutputFeedbackTap(message, 'down'),
          onAddDetails: () => handleAddFeedbackDetails(message),
          note: feedbackNote?.text,
          noteIsError: feedbackNote?.error,
        }
      : undefined;
    
    // Calculate prompt reply elapsed state if needed
    const promptReplyElapsed = message.role?.toLowerCase() === 'user'
      ? { /* calculate elapsed state */ } as PromptReplyElapsedState
      : undefined;
    
    return (
      <OptimizedChatMessageListItem
        item={message}
        listIndex={index}
        originalIndex={originalIndex}
        messages={messages}
        timeLabel={`Message ${originalIndex}`} // Simplified time label for now
        inlineNudge={inlineNudge}
        includeToolActivity={settings.includeToolActivity}
        isTelegramInbox={isTelegramInbox}
        connectionState={connectionState}
        macHttpOk={effectiveMacHttpOk}
        autoResendPending={
          Boolean(autoResendPendingMessageId) &&
          message.id === autoResendPendingMessageId
        }
        approvalBusy={approvalBusy}
        isSending={isSending}
        outputFeedback={outputFeedback}
        onShowDetail={onShowMessageDetail}
        onInlineTextApproval={onInlineTextApproval}
        onResendFailed={onResendFailed}
        promptReplyElapsed={promptReplyElapsed}
      />
    );
  }, [
    inlineTextApprovals,
    settings.includeToolActivity,
    isTelegramInbox,
    connectionState,
    effectiveMacHttpOk,
    autoResendPendingMessageId,
    approvalBusy,
    isSending,
    messages,
    feedbackSelections,
    feedbackNotes,
    chatOutputFeedbackBusyId,
    handleChatOutputFeedbackTap,
    handleAddFeedbackDetails,
    onShowMessageDetail,
    onInlineTextApproval,
    onResendFailed,
  ]);
  
  // Memoize the viewability config to prevent recreation
  const viewabilityConfig = useMemo(() => ({
    itemVisiblePercentThreshold: 20, // Reduce from default 50%
  }), []);
  
  // Calculate average item height for better scrolling performance
  const averageItemHeight = useMemo(() => {
    if (chatTimelineMessages.length === 0) return 80; // Default height
    
    const totalHeight = chatTimelineMessages.reduce((sum, item) => {
      return sum + calculateEstimatedItemHeight(item);
    }, 0);
    
    return totalHeight / chatTimelineMessages.length;
  }, [chatTimelineMessages]);
  
  // Memoize the estimated total height
  const estimatedTotalHeight = useMemo(() => {
    return chatTimelineMessages.length * averageItemHeight;
  }, [chatTimelineMessages.length, averageItemHeight]);
  
  // Render the footer component
  const renderFooter = useCallback(() => {
    return showRecentChatsPanel ? (
      <View style={styles.recentChatsInThread}>
        {recentChatsList}
      </View>
    ) : null;
  }, [showRecentChatsPanel, recentChatsList]);
  
  // Memoize the onContentSizeChange handler
  const handleContentSizeChange = useCallback(() => {
    // In a real implementation, this would handle content size changes
    // For now, we'll keep it simple
  }, []);
  
  // Calculate initial scroll position if needed
  const initialScrollIndex = useMemo(() => {
    // Only set initial scroll index if we have a lot of messages
    // and we want to start near the bottom
    if (chatTimelineMessages.length > 50) {
      return chatTimelineMessages.length - 1;
    }
    return undefined;
  }, [chatTimelineMessages.length]);
  
  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={chatTimelineMessages}
        keyExtractor={keyExtractor}
        style={styles.flatList}
        contentContainerStyle={styles.messageList}
        
        // Performance optimizations
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={7} // Reduce window size to improve performance
        removeClippedSubviews={true} // Remove offscreen views
        updateCellsBatchingPeriod={50} // Increase batch period to reduce main thread work
        
        // Virtualization and rendering
        getItemLayout={(_, index) => ({
          length: calculateEstimatedItemHeight(chatTimelineMessages[index]),
          offset: calculateEstimatedItemHeight(chatTimelineMessages[index]) * index,
          index,
        })}
        
        // Rendering functions
        renderItem={renderItem}
        ListFooterComponent={renderFooter}
        
        // Scroll handling
        onScroll={handleChatScroll}
        onScrollBeginDrag={handleChatScrollBeginDrag}
        onScrollEndDrag={handleChatScrollEndDrag}
        scrollEventThrottle={16} // ~60fps for smooth scrolling
        
        // Pull to refresh
        refreshing={isPullRefreshing}
        onRefresh={handleManualSync}
        
        // Content size handling
        onContentSizeChange={handleContentSizeChange}
        
        // Viewability
        viewabilityConfig={viewabilityConfig}
        
        // Initial scroll position
        initialScrollIndex={initialScrollIndex}
        
        // Optimization: prevent unnecessary re-renders
        extraData={{
          approvalBusy,
          isSending,
          chatOutputFeedbackBusyId,
          feedbackSelections,
          feedbackNotes,
        }}
      />
      
      {/* Scroll controls */}
      <ChatScrollControls
        showJumpToBottom={!chatNearBottom && chatTimelineMessages.length > 0}
        showJumpToTop={!chatNearTop && chatTimelineMessages.length > 2}
        onJumpToBottom={handleJumpToBottom}
        onJumpToTop={handleJumpToTop}
      />
    </View>
  );
};

export default OptimizedChatList;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flatList: {
    flex: 1,
  },
  messageList: {
    paddingVertical: 8,
  },
  recentChatsInThread: {
    marginTop: 16,
  },
});