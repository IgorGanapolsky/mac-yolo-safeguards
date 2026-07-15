import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AttachPickerSheet from '../components/AttachPickerSheet';

describe('AttachPickerSheet', () => {
  it('renders dark-themed attach options when visible', () => {
    const onSelect = jest.fn();
    const { getByTestId, getByText } = render(
      <AttachPickerSheet visible onClose={jest.fn()} onSelect={onSelect} />,
    );

    expect(getByText('Attach')).toBeTruthy();
    expect(getByText('Photo library')).toBeTruthy();
    expect(getByText('File')).toBeTruthy();
    expect(getByTestId('attach-picker-sheet')).toBeTruthy();
  });

  it('calls onSelect with photos when Photo library is tapped', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <AttachPickerSheet visible onClose={jest.fn()} onSelect={onSelect} />,
    );

    fireEvent.press(getByTestId('attach-picker-photos'));
    expect(onSelect).toHaveBeenCalledWith('photos');
  });

  it('calls onSelect with file when File is tapped', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <AttachPickerSheet visible onClose={jest.fn()} onSelect={onSelect} />,
    );

    fireEvent.press(getByTestId('attach-picker-file'));
    expect(onSelect).toHaveBeenCalledWith('file');
  });

  it('closes when backdrop is pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <AttachPickerSheet visible onClose={onClose} onSelect={jest.fn()} />,
    );

    fireEvent.press(getByTestId('attach-picker-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
