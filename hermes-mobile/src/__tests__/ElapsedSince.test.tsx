import React from 'react';
import { act, render } from '@testing-library/react-native';
import ElapsedSince from '../components/ElapsedSince';

describe('ElapsedSince', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
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
});
