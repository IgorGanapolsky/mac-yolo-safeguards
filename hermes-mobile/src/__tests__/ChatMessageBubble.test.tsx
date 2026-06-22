import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatMessageBubble from '../components/ChatMessageBubble';

describe('ChatMessageBubble', () => {
  it('expands truncated messages on tap', () => {
    const { getByText, queryByText } = render(
      <ChatMessageBubble
        content="clarify: Did you mean a specific bro…"
        rawContent="clarify: Did you mean to target a specific browser profile?"
        truncated
        isUser={false}
        timeLabel="Jun 19, 2026 4:48 PM"
      />,
    );

    expect(getByText('clarify: Did you mean a specific bro…')).toBeTruthy();
    expect(queryByText('browser profile')).toBeNull();

    fireEvent.press(getByText('Show more'));
    expect(getByText('clarify: Did you mean to target a specific browser profile?')).toBeTruthy();
    expect(getByText('Show less')).toBeTruthy();
  });
});
