import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatScrollControls from '../components/ChatScrollControls';

describe('ChatScrollControls', () => {
  it('renders only jump-to-latest (no useless ↑ stack)', () => {
    const onJumpToBottom = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ChatScrollControls showJumpToBottom onJumpToBottom={onJumpToBottom} />,
    );

    expect(queryByTestId('chat-scroll-to-top')).toBeNull();
    fireEvent.press(getByTestId('chat-scroll-to-bottom'));
    expect(onJumpToBottom).toHaveBeenCalledTimes(1);
  });

  it('hides when already near latest messages', () => {
    const { queryByTestId } = render(
      <ChatScrollControls showJumpToBottom={false} onJumpToBottom={jest.fn()} />,
    );

    expect(queryByTestId('chat-scroll-to-bottom')).toBeNull();
    expect(queryByTestId('chat-scroll-to-top')).toBeNull();
  });

  it('ignores deprecated jump-to-top props without rendering ↑', () => {
    const { queryByTestId } = render(
      <ChatScrollControls
        showJumpToBottom={false}
        showJumpToTop
        onJumpToBottom={jest.fn()}
        onJumpToTop={jest.fn()}
      />,
    );
    expect(queryByTestId('chat-scroll-to-top')).toBeNull();
  });
});
