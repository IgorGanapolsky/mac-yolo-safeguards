import React from 'react';
import { Vibration } from 'react-native';
import { act, render } from '@testing-library/react-native';
import ElapsedSince from '../components/ElapsedSince';

describe('ElapsedSince', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Vibration, 'vibrate').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('ticks every second and cleans up on unmount', () => {
    const sinceMs = Date.now() - 12_000;
    const { getByTestId, unmount } = render(
      <ElapsedSince sinceMs={sinceMs} prefix="Waiting" testID="elapsed-test" />,
    );

    expect(getByTestId('elapsed-test').props.children).toBe('Waiting 12s');

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(getByTestId('elapsed-test').props.children).toBe('Waiting 13s');

    unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
  });

  it('Waiting elapsed ticks never invoke haptics / Vibration', () => {
    const sinceMs = Date.now() - 5_000;
    const { unmount } = render(
      <ElapsedSince sinceMs={sinceMs} prefix="Waiting" testID="elapsed-waiting" />,
    );

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(Vibration.vibrate).not.toHaveBeenCalled();
    unmount();
  });
});
