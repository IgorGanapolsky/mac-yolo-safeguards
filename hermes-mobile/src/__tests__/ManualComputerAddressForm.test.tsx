import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ManualComputerAddressForm from '../components/ManualComputerAddressForm';
import { connectManualGatewayAddress } from '../services/manualGatewayConnection';

jest.mock('../services/manualGatewayConnection', () => ({
  connectManualGatewayAddress: jest.fn(),
}));

const mockConnectManualGatewayAddress = jest.mocked(connectManualGatewayAddress);

describe('ManualComputerAddressForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectManualGatewayAddress.mockImplementation(async ({ persistProfile, ...input }) => {
      await persistProfile(input.fallbackLabel, input.gatewayUrl);
    });
  });

  it('connects with a Tailscale 100.x address via cleanManualGatewayUrl', async () => {
    const onAddProfile = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<ManualComputerAddressForm onAddProfile={onAddProfile} />);

    fireEvent.changeText(getByTestId('chat-manual-input'), '100.87.85.85');
    fireEvent.press(getByTestId('chat-manual-submit'));

    await waitFor(() => {
      expect(mockConnectManualGatewayAddress).toHaveBeenCalledWith({
        gatewayUrl: 'http://100.87.85.85:8642',
        fallbackLabel: 'Tailscale computer',
        persistProfile: onAddProfile,
      });
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
    expect(getByText('Paste your Mac’s Tailscale IP')).toBeTruthy();
    expect(getByText(/On the Mac: Tailscale → copy 100\.x → paste → Connect/)).toBeTruthy();
    expect(getByTestId('mac-picker-manual-input')).toBeTruthy();
    expect(getByTestId('mac-picker-manual-submit')).toBeTruthy();
    expect(getByTestId('mac-picker-manual-input-row')).toBeTruthy();
  });

  it('shows error for empty input', async () => {
    const { getByTestId, findByText } = render(
      <ManualComputerAddressForm onAddProfile={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('chat-manual-input'), '   ');
    fireEvent.press(getByTestId('chat-manual-submit'));
    expect(await findByText('Please enter an IP address or URL.')).toBeTruthy();
  });

  it('keeps the address and shows the verification error when Hermes cannot authenticate', async () => {
    mockConnectManualGatewayAddress.mockRejectedValueOnce(
      new Error('Hermes answered, but this phone is not paired.'),
    );
    const onAddProfile = jest.fn();
    const { getByTestId, findByText } = render(
      <ManualComputerAddressForm onAddProfile={onAddProfile} />,
    );

    fireEvent.changeText(getByTestId('chat-manual-input'), '100.70.124.54');
    fireEvent.press(getByTestId('chat-manual-submit'));

    expect(await findByText('Hermes answered, but this phone is not paired.')).toBeTruthy();
    expect(getByTestId('chat-manual-input').props.value).toBe('100.70.124.54');
    expect(onAddProfile).not.toHaveBeenCalled();
  });
});
