import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatScrollControls from '../components/ChatScrollControls';

describe('ChatScrollControls', () => {
  it('renders jump controls with Maestro testIDs', () => {
    const onJumpToBottom = jest.fn();
    const onJumpToTop = jest.fn();
    const { getByTestId } = render(
      <ChatScrollControls
        showJumpToBottom
        showJumpToTop
        onJumpToBottom={onJumpToBottom}
        onJumpToTop={onJumpToTop}
      />,
    );

    fireEvent.press(getByTestId('chat-scroll-to-top'));
    fireEvent.press(getByTestId('chat-scroll-to-bottom'));

    expect(onJumpToTop).toHaveBeenCalledTimes(1);
    expect(onJumpToBottom).toHaveBeenCalledTimes(1);
  });

  it('hides controls when neither shortcut is needed', () => {
    const { queryByTestId } = render(
      <ChatScrollControls
        showJumpToBottom={false}
        showJumpToTop={false}
        onJumpToBottom={jest.fn()}
        onJumpToTop={jest.fn()}
      />,
    );

    expect(queryByTestId('chat-scroll-to-bottom')).toBeNull();
    expect(queryByTestId('chat-scroll-to-top')).toBeNull();
  });
});
