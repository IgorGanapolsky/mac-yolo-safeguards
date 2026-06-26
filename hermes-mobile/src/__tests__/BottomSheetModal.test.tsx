import React from 'react';
import { Text, Platform } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import BottomSheetModal from '../components/BottomSheetModal';
import { COMPOSER_KEYBOARD_GAP } from '../utils/composerKeyboard';
import { useKeyboardInset } from '../hooks/useKeyboardInset';

jest.mock('../hooks/useKeyboardInset');

const mockUseKeyboardInset = useKeyboardInset as jest.MockedFunction<typeof useKeyboardInset>;

describe('BottomSheetModal', () => {
  beforeEach(() => {
    mockUseKeyboardInset.mockReturnValue({ inset: 0, windowShrunk: false });
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

  it('lifts sheet content above the software keyboard on Android', () => {
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

      const content = getByTestId('sheet-content');
      const liftedStyle = content.props.style;
      const marginBottom = Array.isArray(liftedStyle)
        ? liftedStyle.find((s: { marginBottom?: number }) => s?.marginBottom != null)?.marginBottom
        : liftedStyle?.marginBottom;
      expect(marginBottom).toBe(280 + COMPOSER_KEYBOARD_GAP);
    } finally {
      platform.OS = prevOs;
    }
  });
});
