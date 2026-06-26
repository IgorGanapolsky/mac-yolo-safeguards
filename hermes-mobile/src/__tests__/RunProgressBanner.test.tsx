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
