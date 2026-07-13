import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import RunProgressBanner from '../components/RunProgressBanner';

describe('RunProgressBanner', () => {
  it('shows delivering copy before a run id exists', () => {
    const { getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'sending',
          startedAtMs: Date.now() - 1200,
          detail: 'Delivering your message…',
        }}
      />,
    );
    expect(getByTestId('run-progress-banner')).toBeTruthy();
    expect(getByTestId('run-progress-detail').props.children).toBe('Delivering your message…');
  });

  it('shows live streaming copy while tokens stream', () => {
    const { getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 3000,
          detail: '   ',
          runId: 'run-1',
        }}
      />,
    );
    expect(getByTestId('run-progress-detail').props.children).toBe('Live streaming from your computer');
  });

  it('shows stop chip while run is active', () => {
    const onStop = jest.fn();
    const { getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 5000,
          detail: 'Running tests',
          runId: 'run-1',
        }}
        onStop={onStop}
      />,
    );

    fireEvent.press(getByTestId('run-progress-stop'));
    expect(onStop).toHaveBeenCalled();
  });

  it('hides hermes-agent model name', () => {
    const { queryByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 5000,
          detail: 'Running tests',
          runId: 'run-1',
          model: 'hermes-agent',
        }}
        showTechnicalStats={true}
      />,
    );
    expect(queryByText('hermes-agent')).toBeNull();
  });

  it('shows other model names', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 5000,
          detail: 'Running tests',
          runId: 'run-1',
          model: 'gemini-2.5-flash',
        }}
        showTechnicalStats={true}
      />,
    );
    expect(getByText('gemini-2.5-flash')).toBeTruthy();
  });

  it('shows token counts during active runs without showTechnicalStats', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 3000,
          detail: 'Hermes is thinking…',
          inputTokens: 89041,
          outputTokens: 1989,
        }}
      />,
    );
    expect(getByText('In: 89041 | Out: 1989')).toBeTruthy();
  });

  it('shows live model from tool.progress during active runs', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 2000,
          detail: 'Hermes is working on your computer…',
          runId: 'run_live',
          model: 'hermes-local-fast',
          inputTokens: 66476,
          outputTokens: 535,
          streamUsageLive: true,
        }}
      />,
    );
    expect(getByText('hermes-local-fast')).toBeTruthy();
    expect(getByText('In: 66476 | Out: 535')).toBeTruthy();
  });

  it('uses fallbackModel when progress model is a gateway platform label', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 1000,
          detail: 'Hermes is thinking…',
          model: 'hermes-agent',
        }}
        fallbackModel="google/gemini-2.5-flash"
      />,
    );
    expect(getByText('google/gemini-2.5-flash')).toBeTruthy();
  });

  it('splits long connectivity failures so timer does not overlap text', () => {
    const detail =
      "Your phone can't reach that local computer link. Join the same Wi‑Fi, add a tunnel URL in Settings, or use relay for approvals only.";
    const { getByTestId, getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'failed',
          startedAtMs: Date.now() - 229000,
          detail,
        }}
      />,
    );
    expect(getByTestId('run-progress-detail').props.children).toBe("Couldn't reach your computer");
    expect(getByTestId('run-progress-failed-detail').props.children).toBe(detail);
    expect(getByText('229s')).toBeTruthy();
  });

  it('shows stale hint and emphasized stop after warn threshold', () => {
    const onStop = jest.fn();
    const { getByTestId, getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 16 * 60 * 1000,
          detail: 'Agent working…',
          runId: 'run-stale',
        }}
        onStop={onStop}
      />,
    );
    expect(getByTestId('run-progress-stale-hint').props.children).toContain(
      'Taking longer than expected',
    );
    expect(getByText('Stop stuck run')).toBeTruthy();
  });

  it('expands model and token stats by default', () => {
    const { getByTestId, getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 2000,
          detail: 'Delivering your message…',
          model: 'google/gemini-2.5-flash',
          inputTokens: 120,
          outputTokens: 45,
        }}
      />,
    );
    expect(getByTestId('run-progress-toggle')).toBeTruthy();
    expect(getByTestId('run-progress-stats')).toBeTruthy();
    expect(getByText('google/gemini-2.5-flash')).toBeTruthy();
    expect(getByText('In: 120 | Out: 45')).toBeTruthy();
  });

  it('collapses model and token stats while keeping status header', () => {
    const { getByTestId, getByText, queryByTestId, queryByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 2000,
          detail: 'Delivering your message…',
          model: 'google/gemini-2.5-flash',
          inputTokens: 120,
          outputTokens: 45,
        }}
      />,
    );

    fireEvent.press(getByTestId('run-progress-toggle'));

    expect(getByTestId('run-progress-detail').props.children).toBe('Delivering your message…');
    expect(queryByTestId('run-progress-stats')).toBeNull();
    expect(queryByText('google/gemini-2.5-flash')).toBeNull();
    expect(queryByText('In: 120 | Out: 45')).toBeNull();
  });

  it('toggles details when tapping the header row', () => {
    const { getByTestId, queryByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 1000,
          detail: 'Hermes is thinking…',
          inputTokens: 10,
          outputTokens: 2,
        }}
      />,
    );

    expect(getByTestId('run-progress-stats')).toBeTruthy();
    fireEvent.press(getByTestId('run-progress-header'));
    expect(queryByTestId('run-progress-stats')).toBeNull();
    fireEvent.press(getByTestId('run-progress-header'));
    expect(getByTestId('run-progress-stats')).toBeTruthy();
  });

  it('shows Switch computer and New chat when retry is escalated', () => {
    const onSwitchComputer = jest.fn();
    const onStartFreshChat = jest.fn();
    const onRetry = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'failed',
          startedAtMs: Date.now() - 214_800,
          detail: 'No reply yet — your computer may be slow or stuck. Tap Stop and try again.',
          duration: 214.8,
        }}
        retryEscalated
        onSwitchComputer={onSwitchComputer}
        onStartFreshChat={onStartFreshChat}
        onRetry={onRetry}
        onDismiss={jest.fn()}
      />,
    );

    expect(queryByTestId('run-progress-retry')).toBeNull();
    fireEvent.press(getByTestId('run-progress-switch-computer'));
    expect(onSwitchComputer).toHaveBeenCalled();
    fireEvent.press(getByTestId('run-progress-new-chat'));
    expect(onStartFreshChat).toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
