import React from 'react';
import { Text, Platform } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import BottomSheetModal from '../components/BottomSheetModal';
import { COMPOSER_KEYBOARD_GAP } from '../utils/composerKeyboard';
import { useKeyboardInset } from '../hooks/useKeyboardInset';

jest.mock('../hooks/useKeyboardInset');

const mockUseKeyboardInset = useKeyboardInset as jest.MockedFunction<typeof useKeyboardInset>;

function contentMarginBottom(content: { props: Record<string, unknown> }): number | undefined {
  const liftedStyle = content.props.style;
  if (Array.isArray(liftedStyle)) {
    return liftedStyle.find((s: { marginBottom?: number }) => s?.marginBottom != null)?.marginBottom;
  }
  return (liftedStyle as { marginBottom?: number } | undefined)?.marginBottom;
}

describe('BottomSheetModal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseKeyboardInset.mockReturnValue({ inset: 0, windowShrunk: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('closes when backdrop is pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <BottomSheetModal visible onClose={onClose} testID="sheet">
        <Text>Body</Text>
      </BottomSheetModal>,
    );

    fireEvent.press(getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on backdrop when dismiss is disabled', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <BottomSheetModal visible onClose={onClose} dismissOnBackdropPress={false} testID="sheet">
        <Text>Body</Text>
      </BottomSheetModal>,
    );

    fireEvent.press(getByTestId('sheet-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('debounces keyboard lift so Android IME metric polls do not jump the sheet', () => {
    const platform = Platform as { OS: string };
    const prevOs = platform.OS;
    platform.OS = 'android';
    mockUseKeyboardInset.mockReturnValue({ inset: 280, windowShrunk: false });
    try {
      const { getByTestId } = render(
        <BottomSheetModal visible onClose={jest.fn()} testID="sheet">
          <Text>Body</Text>
        </BottomSheetModal>,
      );

      expect(contentMarginBottom(getByTestId('sheet-content'))).toBeUndefined();

      act(() => {
        jest.advanceTimersByTime(160);
      });

      expect(contentMarginBottom(getByTestId('sheet-content'))).toBe(280 + COMPOSER_KEYBOARD_GAP);
    } finally {
      platform.OS = prevOs;
    }
  });
});
