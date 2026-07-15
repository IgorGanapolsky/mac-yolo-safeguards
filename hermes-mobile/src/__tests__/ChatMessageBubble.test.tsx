import React, { useState } from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ChatMessageBubble from '../components/ChatMessageBubble';
import ChatMessageDetailModal from '../components/ChatMessageDetailModal';
import { outboundDeliveryLabel } from '../utils/outboundDeliveryStatus';
import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';

function renderWithDetailModal(props: React.ComponentProps<typeof ChatMessageBubble>) {
  const Host = () => {
    const [detail, setDetail] = useState<{ title: string; body: string } | null>(null);
    return (
      <>
        <ChatMessageBubble
          {...props}
          onShowDetail={(body) =>
            setDetail({ title: props.isUser ? 'Your message' : 'Message detail', body })
          }
        />
        <ChatMessageDetailModal
          visible={detail != null}
          title={detail?.title ?? ''}
          body={detail?.body ?? ''}
          onClose={() => setDetail(null)}
        />
      </>
    );
  };
  return render(<Host />);
}

describe('ChatMessageBubble', () => {
  it('renders message body as selectable text for copy', () => {
    const { getByTestId, UNSAFE_getAllByType } = renderWithDetailModal({
      content: 'Here is the finished analysis.',
      isUser: false,
      timeLabel: 'Jun 24, 2026 11:55 AM',
    });

    expect(getByTestId('chat-message-body')).toBeTruthy();
    expect(
      UNSAFE_getAllByType(Text).some(
        (node) => node.props.testID === 'chat-message-body' && node.props.selectable === true,
      ),
    ).toBe(true);
  });

  it('renders markdown headings in assistant bubbles', () => {
    const { getByText, UNSAFE_getAllByType } = renderWithDetailModal({
      content: '## Summary\n\nDone.',
      isUser: false,
      timeLabel: 'Jun 24, 2026 11:55 AM',
    });

    expect(getByText('Summary')).toBeTruthy();
    expect(getByText(/Done\./)).toBeTruthy();
    expect(UNSAFE_getAllByType(Text).some((node) => node.props.selectable === true)).toBe(true);
  });

  it('keeps truncated preview selectable without wrapping it in Pressable', () => {
    const { getByTestId, UNSAFE_getAllByType } = renderWithDetailModal({
      content: 'Did you mean a specific bro…',
      rawContent: 'Did you mean to target a specific browser profile?',
      truncated: true,
      isUser: false,
      timeLabel: 'Jun 19, 2026 4:48 PM',
    });

    expect(getByTestId('chat-message-body')).toBeTruthy();
    expect(UNSAFE_getAllByType(Text).some((node) => node.props.selectable === true)).toBe(true);
  });

  it('opens a screen-level detail modal when Show more is pressed', () => {
    const { getByTestId, getByText, queryByText } = renderWithDetailModal({
      content: 'Did you mean a specific bro…',
      rawContent: 'Did you mean to target a specific browser profile?',
      truncated: true,
      isUser: false,
      timeLabel: 'Jun 19, 2026 4:48 PM',
    });

    expect(getByText('Did you mean a specific bro…')).toBeTruthy();
    expect(queryByText('browser profile')).toBeNull();

    fireEvent.press(getByTestId('chat-message-expand'));
    expect(getByText('Did you mean to target a specific browser profile?')).toBeTruthy();
    expect(getByTestId('chat-message-detail-close')).toBeTruthy();
  });

  it('shows operational failure reason when Mac is reachable but send failed', () => {
    const failureReason = GATEWAY_WRONG_KEY_MESSAGE;
    const { getByTestId } = renderWithDetailModal({
      content: 'Make money faster',
      isUser: true,
      timeLabel: 'Jun 23, 2026 9:13 PM',
      outboundStatus: 'failed',
      connectionState: 'connected',
      macHttpOk: true,
      outboundFailureReason: failureReason,
    });

    expect(getByTestId('chat-outbound-failed').props.children).toBe(
      outboundDeliveryLabel('failed', {
        connectionState: 'connected',
        macHttpOk: true,
        failureReason,
      }),
    );
  });

  it('shows reachability hint when send failed and Mac health is down', () => {
    const { getByTestId } = renderWithDetailModal({
      content: 'Make money faster',
      isUser: true,
      timeLabel: 'Jun 23, 2026 9:13 PM',
      outboundStatus: 'failed',
      connectionState: 'connecting',
      macHttpOk: false,
    });

    expect(getByTestId('chat-outbound-failed').props.children).toBe(
      "⚠ Couldn't reach your computer — tap Computer above",
    );
  });

  it('shows resend hint when Mac is reachable but send failed', () => {
    const { getByTestId } = renderWithDetailModal({
      content: 'Print money make money faster',
      isUser: true,
      timeLabel: 'Jul 12, 2026 2:19 PM',
      outboundStatus: 'failed',
      connectionState: 'disconnected',
      macHttpOk: true,
    });

    expect(getByTestId('chat-outbound-failed').props.children).toContain('tap ↑');
    expect(getByTestId('chat-outbound-failed').props.children).not.toContain('Computer above');
  });

  it('shows live waiting elapsed on pending user prompts', () => {
    const sentAt = '2026-07-14T22:00:00.000Z';
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-14T22:00:12.000Z'));
    const { getByTestId } = renderWithDetailModal({
      content: 'make money today',
      isUser: true,
      timeLabel: 'Jul 14, 2026 10:00 PM',
      outboundStatus: 'sent',
      promptReplyElapsed: { mode: 'live', sinceMs: Date.parse(sentAt) },
    });

    expect(getByTestId('chat-prompt-elapsed-live').props.children).toBe('Waiting 12s');
    jest.useRealTimers();
  });

  it('shows frozen reply duration on completed user prompts', () => {
    const { getByTestId } = renderWithDetailModal({
      content: 'make money today',
      isUser: true,
      timeLabel: 'Jul 14, 2026 10:00 PM',
      outboundStatus: 'sent',
      promptReplyElapsed: { mode: 'frozen', durationSec: 45 },
    });

    expect(getByTestId('chat-message-timestamp').props.children).toBe(
      'Jul 14, 2026 10:00 PM · 45s',
    );
  });

  it('renders timestamp on user outbound bubbles', () => {
    const { getByTestId } = renderWithDetailModal({
      content: 'Print money make money faster',
      isUser: true,
      timeLabel: 'Jul 9, 2026 7:42 PM',
      outboundStatus: 'sent',
      connectionState: 'connecting',
      macHttpOk: false,
    });

    expect(getByTestId('chat-message-timestamp').props.children).toBe('Jul 9, 2026 7:42 PM');
    expect(getByTestId('chat-outbound-sent').props.children).toBe('○ Waiting for computer…');
  });

  it('renders Leash output feedback controls for assistant messages', () => {
    const onThumbsUp = jest.fn();
    const onThumbsDown = jest.fn();
    const { getByTestId } = renderWithDetailModal({
      content: 'Here is the finished analysis.',
      isUser: false,
      timeLabel: 'Jun 24, 2026 11:55 AM',
      outputFeedback: {
        onThumbsUp,
        onThumbsDown,
      },
    });

    fireEvent.press(getByTestId('chat-output-thumbs-up'));
    fireEvent.press(getByTestId('chat-output-thumbs-down'));

    expect(onThumbsUp).toHaveBeenCalledTimes(1);
    expect(onThumbsDown).toHaveBeenCalledTimes(1);
  });

  it('renders clarification prompt card instead of raw XML dumps', () => {
    const onSelectOption = jest.fn();
    const { getByTestId, queryByText } = renderWithDetailModal({
      content: '',
      isUser: false,
      timeLabel: 'Jul 14, 2026 9:20 AM',
      clarification: {
        prompt: {
          question: 'Which path should I take?',
          options: [{ id: '1', label: 'Manual auth' }],
          partial: false,
        },
        onSelectOption,
      },
    });

    expect(getByTestId('clarification-prompt-card')).toBeTruthy();
    expect(queryByText('<clarification>')).toBeNull();
    fireEvent.press(getByTestId('clarification-option-1'));
    expect(onSelectOption).toHaveBeenCalledWith({ id: '1', label: 'Manual auth' });
  });
});
