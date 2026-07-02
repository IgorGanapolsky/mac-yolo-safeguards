import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatMessageBubble from '../components/ChatMessageBubble';
import ChatMessageDetailModal from '../components/ChatMessageDetailModal';
import { outboundDeliveryLabel } from '../utils/outboundDeliveryStatus';

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
  it('opens detail modal when truncated message body is pressed', () => {
    const { getByText, queryByText } = renderWithDetailModal({
      content: 'clarify: Did you mean a specific bro…',
      rawContent: 'clarify: Did you mean to target a specific browser profile?',
      truncated: true,
      isUser: false,
      timeLabel: 'Jun 19, 2026 4:48 PM',
    });

    fireEvent.press(getByText('clarify: Did you mean a specific bro…'));
    expect(getByText('clarify: Did you mean to target a specific browser profile?')).toBeTruthy();
  });

  it('opens a screen-level detail modal when Show more is pressed', () => {
    const { getByTestId, getByText, queryByText } = renderWithDetailModal({
      content: 'clarify: Did you mean a specific bro…',
      rawContent: 'clarify: Did you mean to target a specific browser profile?',
      truncated: true,
      isUser: false,
      timeLabel: 'Jun 19, 2026 4:48 PM',
    });

    expect(getByText('clarify: Did you mean a specific bro…')).toBeTruthy();
    expect(queryByText('browser profile')).toBeNull();

    fireEvent.press(getByTestId('chat-message-expand'));
    expect(getByText('clarify: Did you mean to target a specific browser profile?')).toBeTruthy();
    expect(getByTestId('chat-message-detail-close')).toBeTruthy();
  });

  it('shows operational failure reason when Mac is reachable but send failed', () => {
    const failureReason = 'Sign-in to your computer failed. Open Settings and pair again.';
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

    expect(getByTestId('chat-outbound-failed').props.children).toBe("⚠ Couldn't reach your computer");
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
});
