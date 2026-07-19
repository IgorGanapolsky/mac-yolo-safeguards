import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AttachPickerSheet from '../components/AttachPickerSheet';

describe('AttachPickerSheet', () => {
  it('renders Hermes-styled Photos / Camera / Files options', () => {
    const onSelect = jest.fn();
    const { getByTestId, getByText } = render(
      <AttachPickerSheet visible onClose={jest.fn()} onSelect={onSelect} />,
    );

    expect(getByText('Attach to message')).toBeTruthy();
    expect(getByText('Photos')).toBeTruthy();
    expect(getByText('Camera')).toBeTruthy();
    expect(getByText('Files')).toBeTruthy();
    expect(getByTestId('attach-picker-sheet')).toBeTruthy();
    expect(getByTestId('attach-picker-options')).toBeTruthy();
  });

  it('calls onSelect for each option row', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <AttachPickerSheet visible onClose={jest.fn()} onSelect={onSelect} />,
    );

    fireEvent.press(getByTestId('attach-picker-photos'));
    fireEvent.press(getByTestId('attach-picker-camera'));
    fireEvent.press(getByTestId('attach-picker-file'));
    expect(onSelect.mock.calls.map((call) => call[0])).toEqual([
      'photos',
      'camera',
      'file',
    ]);
  });

  it('closes when Done or backdrop is pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <AttachPickerSheet visible onClose={onClose} onSelect={jest.fn()} />,
    );

    fireEvent.press(getByTestId('attach-picker-close'));
    fireEvent.press(getByTestId('attach-picker-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
