import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatMessageBubble from '../components/ChatMessageBubble';
import ChatMessageDetailModal from '../components/ChatMessageDetailModal';

const SCREENSHOT_BUBBLE =
  "I reached the turn time limit and couldn't generate a final report Error: Error code: 500 - " +
  "{'error': {'message': 'an error was encountered while running the model: unexpected EOF', " +
  "'type': 'api_error', 'param': None, 'code': None}}";

function renderWithDetailModal(props: React.ComponentProps<typeof ChatMessageBubble>) {
  const Host = () => {
    const [detail, setDetail] = useState<string | null>(null);
    return (
      <>
        <ChatMessageBubble {...props} onShowDetail={(body) => setDetail(body)} />
        <ChatMessageDetailModal
          visible={detail != null}
          title="Message detail"
          body={detail ?? ''}
          onClose={() => setDetail(null)}
        />
      </>
    );
  };
  return render(<Host />);
}

describe('ChatMessageBubble — provider error payloads', () => {
  it('renders humanized copy instead of the raw provider payload', () => {
    const { getByTestId, queryByText } = renderWithDetailModal({
      content: SCREENSHOT_BUBBLE,
      isUser: false,
      timeLabel: 'Jul 30, 2026 9:15 AM',
    });

    const body = getByTestId('chat-message-body');
    const rendered = JSON.stringify(body.props);
    expect(rendered).not.toContain('api_error');
    expect(rendered).not.toContain('unexpected EOF');
    expect(queryByText(/unexpected EOF/)).toBeNull();
    expect(queryByText(/Your Mac's AI model stopped responding/)).toBeTruthy();
  });

  it('labels the expand affordance "Show technical detail" for provider errors', () => {
    const { getByTestId } = renderWithDetailModal({
      content: SCREENSHOT_BUBBLE,
      isUser: false,
      timeLabel: 'Jul 30, 2026 9:15 AM',
    });

    expect(getByTestId('chat-message-expand')).toBeTruthy();
    expect(getByTestId('chat-message-expand-label').props.children).toBe('Show technical detail');
  });

  it('still shows the diagnostic when the user opens the detail', () => {
    const { getByTestId, getByText } = renderWithDetailModal({
      content: SCREENSHOT_BUBBLE,
      isUser: false,
      timeLabel: 'Jul 30, 2026 9:15 AM',
    });

    fireEvent.press(getByTestId('chat-message-expand'));
    expect(getByText(/unexpected EOF/)).toBeTruthy();
  });

  it('keeps "Show more" for ordinary long messages', () => {
    const { getByTestId } = renderWithDetailModal({
      content: 'Did you mean a specific bro…',
      rawContent: 'Did you mean to target a specific browser profile in the default workspace?',
      truncated: true,
      isUser: false,
      timeLabel: 'Jul 30, 2026 9:15 AM',
    });

    expect(getByTestId('chat-message-expand-label').props.children).toBe('Show more');
  });
});
