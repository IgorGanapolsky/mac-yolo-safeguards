import React, { useRef } from 'react';
import { act, render } from '@testing-library/react-native';
import { Dimensions, Keyboard, Platform, Text } from 'react-native';
import { useKeyboardInset } from '../hooks/useKeyboardInset';

function KeyboardProbe({ focused }: { focused: boolean }) {
  const { inset, windowShrunk } = useKeyboardInset({ focused });
  return <Text testID="keyboard-probe">{`${inset}:${windowShrunk ? 'shrunk' : 'steady'}`}</Text>;
}

function SuppressedKeyboardProbe() {
  const suppressRef = useRef(true);
  const { inset } = useKeyboardInset({
    suppressHideWhileFocusedRef: suppressRef,
    focused: true,
  });
  return <Text testID="keyboard-probe">{inset}</Text>;
}

describe('useKeyboardInset', () => {
  const listeners = new Map<string, (event?: unknown) => void>();
  const originalOs = Platform.OS;

  beforeEach(() => {
    jest.useFakeTimers();
    Platform.OS = 'android';
    listeners.clear();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, callback) => {
      listeners.set(eventName, callback as (event?: unknown) => void);
      return { remove: jest.fn() } as never;
    });
  });

  afterEach(() => {
    Platform.OS = originalOs;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('clears stale Android keyboard inset when the keyboard frame collapses', () => {
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({ height: 320 } as never);
    const { getByTestId } = render(<KeyboardProbe focused />);

    act(() => {
      listeners.get('keyboardDidShow')?.({
        endCoordinates: { screenX: 0, screenY: 0, width: 360, height: 320 },
      });
    });

    expect(getByTestId('keyboard-probe').props.children).toContain('320');

    act(() => {
      const windowHeight = Dimensions.get('window').height;
      listeners.get('keyboardDidChangeFrame')?.({
        endCoordinates: { screenX: 0, screenY: windowHeight, width: 360, height: 0 },
      });
    });

    expect(getByTestId('keyboard-probe').props.children).toBe('0:steady');
  });

  it('ignores keyboardDidHide while suppressHideWhileFocusedRef is true', () => {
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({ height: 320 } as never);
    const { getByTestId } = render(<SuppressedKeyboardProbe />);

    act(() => {
      listeners.get('keyboardDidShow')?.({
        endCoordinates: { screenX: 0, screenY: 0, width: 360, height: 320 },
      });
    });

    expect(getByTestId('keyboard-probe').props.children).toBe(320);

    act(() => {
      listeners.get('keyboardDidHide')?.();
    });

    expect(getByTestId('keyboard-probe').props.children).toBe(320);
  });

  it('polls Android keyboard metrics while the composer is focused', () => {
    jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
    const { getByTestId } = render(<KeyboardProbe focused />);

    expect(getByTestId('keyboard-probe').props.children).toBe('0:steady');

    (Keyboard.metrics as jest.Mock).mockReturnValue({ height: 280 } as never);

    act(() => {
      jest.advanceTimersByTime(120);
    });

    expect(getByTestId('keyboard-probe').props.children).toContain('280');
  });
});
