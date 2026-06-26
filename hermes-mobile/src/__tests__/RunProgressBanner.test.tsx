import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import RunProgressBanner from '../components/RunProgressBanner';

describe('RunProgressBanner', () => {
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
    expect(getByTestId('run-progress-detail').props.children).toBe("Couldn't reach your Mac");
    expect(getByTestId('run-progress-failed-detail').props.children).toBe(detail);
    expect(getByText('229s')).toBeTruthy();
  });
});
