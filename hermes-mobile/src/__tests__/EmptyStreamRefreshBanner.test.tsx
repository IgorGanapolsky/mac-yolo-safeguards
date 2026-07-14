import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import EmptyStreamRefreshBanner from '../components/EmptyStreamRefreshBanner';

describe('EmptyStreamRefreshBanner', () => {
  it('calls onRefresh when the Refresh chip is tapped', () => {
    const onRefresh = jest.fn();
    render(<EmptyStreamRefreshBanner onRefresh={onRefresh} />);

    fireEvent.press(screen.getByTestId('empty-stream-refresh-button'));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows a Start fresh chat action when provided', () => {
    const onStartFreshChat = jest.fn();
    render(
      <EmptyStreamRefreshBanner
        onRefresh={jest.fn()}
        onStartFreshChat={onStartFreshChat}
      />,
    );

    fireEvent.press(screen.getByTestId('empty-stream-start-fresh-chat'));
    expect(onStartFreshChat).toHaveBeenCalledTimes(1);
  });

  it('does not tell users to pull to refresh', () => {
    render(<EmptyStreamRefreshBanner onRefresh={jest.fn()} />);
    expect(screen.getByTestId('empty-stream-refresh-banner')).not.toHaveTextContent(
      /pull to refresh/i,
    );
  });
});
