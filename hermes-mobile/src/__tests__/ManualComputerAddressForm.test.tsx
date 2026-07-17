import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ManualComputerAddressForm from '../components/ManualComputerAddressForm';

describe('ManualComputerAddressForm', () => {
  it('connects with a Tailscale 100.x address via cleanManualGatewayUrl', async () => {
    const onAddProfile = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<ManualComputerAddressForm onAddProfile={onAddProfile} />);

    fireEvent.changeText(getByTestId('chat-manual-input'), '100.87.85.85');
    fireEvent.press(getByTestId('chat-manual-submit'));

    await waitFor(() => {
      expect(onAddProfile).toHaveBeenCalledWith('Tailscale computer', 'http://100.87.85.85:8642');
    });
  });

  it('shows picker Mode fresh-user copy', () => {
    const { getByText, getByTestId } = render(
      <ManualComputerAddressForm
        onAddProfile={jest.fn()}
        pickerMode
        testIDPrefix="mac-picker-manual"
      />,
    );
    expect(getByText('Add by Tailscale address')).toBeTruthy();
    expect(getByText(/Tailscale name or 100\.x address/)).toBeTruthy();
    expect(getByTestId('mac-picker-manual-input')).toBeTruthy();
    expect(getByTestId('mac-picker-manual-submit')).toBeTruthy();
  });

  it('aligns Connect button height with the address field', () => {
    const { getByTestId } = render(
      <ManualComputerAddressForm
        onAddProfile={jest.fn()}
        pickerMode
        testIDPrefix="mac-picker-manual"
      />,
    );
    const inputStyle = getByTestId('mac-picker-manual-input').props.style;
    const buttonStyle = getByTestId('mac-picker-manual-submit').props.style;
    const flatten = (style: unknown) =>
      (Array.isArray(style) ? style : [style]).reduce(
        (acc: Record<string, unknown>, part) =>
          part && typeof part === 'object' ? { ...acc, ...part } : acc,
        {},
      );
    expect(flatten(inputStyle).height).toBe(44);
    expect(flatten(buttonStyle).height).toBe(44);
    expect(flatten(buttonStyle).paddingVertical).toBe(0);
  });

  it('shows error for empty input', async () => {
    const { getByTestId, findByText } = render(
      <ManualComputerAddressForm onAddProfile={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('chat-manual-input'), '   ');
    fireEvent.press(getByTestId('chat-manual-submit'));
    expect(await findByText('Please enter an IP address or URL.')).toBeTruthy();
  });
});
