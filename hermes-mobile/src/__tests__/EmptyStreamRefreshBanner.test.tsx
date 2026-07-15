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

  it('shows elapsed timer when waitingSinceMs is provided', () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-14T22:01:04.000Z'));
    render(
      <EmptyStreamRefreshBanner
        onRefresh={jest.fn()}
        waitingSinceMs={Date.parse('2026-07-14T22:00:00.000Z')}
      />,
    );
    expect(screen.getByTestId('empty-stream-elapsed').props.children).toBe('Waiting 1m 04s');
    jest.useRealTimers();
  });

  it('does not tell users to pull to refresh', () => {
    render(<EmptyStreamRefreshBanner onRefresh={jest.fn()} />);
    expect(screen.getByTestId('empty-stream-refresh-banner')).not.toHaveTextContent(
      /pull to refresh/i,
    );
  });
});
