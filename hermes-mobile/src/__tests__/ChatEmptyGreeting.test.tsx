import React from 'react';
import { render } from '@testing-library/react-native';
import ChatEmptyGreeting, {
  greetingForTime,
  greetingSubtitle,
} from '../components/ChatEmptyGreeting';

describe('ChatEmptyGreeting', () => {
  it('picks morning greeting before noon', () => {
    expect(greetingForTime(new Date('2026-06-24T09:00:00'))).toBe('Good morning');
  });

  it('picks afternoon greeting before evening', () => {
    expect(greetingForTime(new Date('2026-06-24T14:00:00'))).toBe('Good afternoon');
  });

  it('picks evening greeting at night', () => {
    expect(greetingForTime(new Date('2026-06-24T20:00:00'))).toBe('Good evening');
  });

  it('renders disconnected copy without a specific machine', () => {
    const { getByTestId } = render(<ChatEmptyGreeting />);

    expect(getByTestId('chat-empty-greeting-title').props.children).toBeTruthy();
    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toBe(
      'Ask anything. Plug in USB or pick a computer above to connect.',
    );
  });

  it('prefers route labels for account-relay copy', () => {
    const { getByTestId } = render(<ChatEmptyGreeting routeLabel="Hermes account relay" />);

    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toBe(
      'Ask anything — pair Hermes relay for Wi‑Fi, cellular, or USB when you are away from your computer.',
    );
  });

  it('does not claim connected for generic routes when disconnected', () => {
    const { getByTestId } = render(<ChatEmptyGreeting routeLabel="Computer via USB" />);
    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toBe(
      'Ask anything. Plug in USB or pick a computer above to connect.',
    );
  });

  it('shows connected copy when gateway is live', () => {
    const { getByTestId } = render(
      <ChatEmptyGreeting routeLabel="Igors-MacBook-Pro" isConnected />,
    );

    expect(getByTestId('chat-empty-greeting-subtitle').props.children).toBe(
      'Ask anything — connected via Igors-MacBook-Pro.',
    );
  });

  it('shows unreachable copy when disconnected with a machine label', () => {
    expect(greetingSubtitle('Igors-MacBook-Pro', false)).toBe(
      "Can't reach Igors-MacBook-Pro yet — tap header to retry.",
    );
  });

  it('shows heal copy instead of unreachable during silent reconnect', () => {
    expect(greetingSubtitle('Igors-Mac-mini', false, true)).toBe(
      'Trying to reach Igors-Mac-mini automatically…',
    );
  });
});
