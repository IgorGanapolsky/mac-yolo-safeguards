import React from 'react';
import { render } from '@testing-library/react-native';
import EmptyStreamRefreshBanner from '../components/EmptyStreamRefreshBanner';
import { EMPTY_STREAM_HARD_STOP_MS } from '../utils/emptyStreamReplyRecovery';

/**
 * Unit coverage alone would not have caught the real defect: the pure functions
 * can be correct while the component never passes the flag. This renders the
 * actual banner past the hard-stop ceiling with a reply present.
 */
const PAST_HARD_STOP_SINCE = Date.now() - (EMPTY_STREAM_HARD_STOP_MS + 10_000);

describe('EmptyStreamRefreshBanner once the reply is on screen', () => {
  it('shows no "Stopped waiting" text past the ceiling when a reply arrived', () => {
    const { queryByText } = render(
      <EmptyStreamRefreshBanner
        waitingSinceMs={PAST_HARD_STOP_SINCE}
        hasAssistantReply
        onRefresh={() => {}}
      />,
    );
    expect(queryByText(/stopped waiting/i)).toBeNull();
    expect(queryByText(/checking your mac/i)).toBeNull();
  });

  it('still shows the stopped copy past the ceiling when NO reply arrived', () => {
    const { queryByText } = render(
      <EmptyStreamRefreshBanner
        waitingSinceMs={PAST_HARD_STOP_SINCE}
        hasAssistantReply={false}
        onRefresh={() => {}}
      />,
    );
    expect(queryByText(/stopped waiting/i)).toBeTruthy();
  });

  it('hides the auto-checking spinner once the reply arrived', () => {
    const { queryByTestId } = render(
      <EmptyStreamRefreshBanner
        waitingSinceMs={Date.now() - 45_000}
        autoChecking
        hasAssistantReply
        onRefresh={() => {}}
      />,
    );
    expect(queryByTestId('empty-stream-auto-checking')).toBeNull();
  });

  it('keeps the spinner while genuinely still waiting', () => {
    const { queryByTestId } = render(
      <EmptyStreamRefreshBanner
        waitingSinceMs={Date.now() - 45_000}
        autoChecking
        hasAssistantReply={false}
        onRefresh={() => {}}
      />,
    );
    expect(queryByTestId('empty-stream-auto-checking')).toBeTruthy();
  });
});
