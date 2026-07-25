import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import EmptyStreamRefreshBanner from '../components/EmptyStreamRefreshBanner';
import { EMPTY_STREAM_HARD_STOP_MS } from '../utils/emptyStreamReplyRecovery';

describe('EmptyStreamRefreshBanner', () => {
  it('shows auto-checking spinner when polling is active', () => {
    render(
      <EmptyStreamRefreshBanner
        autoChecking
        waitingSinceMs={Date.now() - 45_000}
        onRefresh={jest.fn()}
      />,
    );

    expect(screen.getByTestId('empty-stream-auto-checking')).toBeTruthy();
    expect(screen.getByTestId('empty-stream-refresh-banner')).toHaveTextContent(/\(45s\)/);
    expect(screen.getByTestId('empty-stream-elapsed')).toBeTruthy();
    expect(screen.getByTestId('empty-stream-refresh-banner')).not.toHaveTextContent(/tap refresh/i);
  });

  it('calls onRefresh when the optional Check now chip is tapped', () => {
    const onRefresh = jest.fn();
    render(<EmptyStreamRefreshBanner onRefresh={onRefresh} />);

    fireEvent.press(screen.getByTestId('empty-stream-refresh-button'));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Check now')).toBeTruthy();
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

  it('shows Open Leash CTA and stops the forever spinner after the hard bound', () => {
    const onOpenLeash = jest.fn();
    render(
      <EmptyStreamRefreshBanner
        autoChecking
        waitingSinceMs={Date.now() - EMPTY_STREAM_HARD_STOP_MS - 5_000}
        onRefresh={jest.fn()}
        onOpenLeash={onOpenLeash}
        pendingApprovalCount={2}
        onStartFreshChat={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('empty-stream-auto-checking')).toBeNull();
    expect(screen.getByTestId('empty-stream-hard-stopped')).toBeTruthy();
    expect(screen.getByTestId('empty-stream-open-leash')).toHaveTextContent('Open Leash (2)');
    expect(screen.queryByTestId('empty-stream-refresh-button')).toBeNull();
    fireEvent.press(screen.getByTestId('empty-stream-open-leash'));
    expect(onOpenLeash).toHaveBeenCalledTimes(1);
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
