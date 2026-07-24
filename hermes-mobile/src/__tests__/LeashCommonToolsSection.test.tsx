import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import LeashCommonToolsSection from '../components/LeashCommonToolsSection';

describe('LeashCommonToolsSection', () => {
  const baseProps = {
    approvalRequiredIds: [] as string[],
    customTools: [] as { id: string; label: string }[],
    macConnected: true,
    onChangeApprovalRequiredIds: jest.fn(),
    onChangeCustomTools: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('renders builtin rows as allowed by default', () => {
    const { getByTestId, getAllByText } = render(<LeashCommonToolsSection {...baseProps} />);
    expect(getByTestId('leash-tool-row-terminal')).toBeTruthy();
    expect(getAllByText('Allowed without prompt').length).toBeGreaterThan(0);
  });

  it('shows a disconnected notice when the Mac is unreachable', () => {
    const { getByTestId, queryByTestId } = render(
      <LeashCommonToolsSection {...baseProps} macConnected={false} />,
    );
    expect(getByTestId('leash-common-tools-disconnected')).toBeTruthy();
    expect(queryByTestId('leash-common-tools-disconnected')).not.toBeNull();
  });

  it('hides the disconnected notice when connected', () => {
    const { queryByTestId } = render(<LeashCommonToolsSection {...baseProps} macConnected />);
    expect(queryByTestId('leash-common-tools-disconnected')).toBeNull();
  });

  it('toggling a builtin row off marks it as requiring approval', () => {
    const onChangeApprovalRequiredIds = jest.fn();
    const { getByTestId } = render(
      <LeashCommonToolsSection {...baseProps} onChangeApprovalRequiredIds={onChangeApprovalRequiredIds} />,
    );
    fireEvent(getByTestId('leash-tool-switch-terminal'), 'valueChange', false);
    expect(onChangeApprovalRequiredIds).toHaveBeenCalledWith(['terminal']);
  });

  it('adds a custom tool and explains what it actually does', () => {
    const onChangeCustomTools = jest.fn();
    const { getByTestId } = render(
      <LeashCommonToolsSection {...baseProps} onChangeCustomTools={onChangeCustomTools} />,
    );
    fireEvent.changeText(getByTestId('leash-custom-tool-input'), 'Stripe CLI');
    fireEvent.press(getByTestId('leash-custom-tool-add'));
    expect(onChangeCustomTools).toHaveBeenCalledWith([{ id: 'custom_stripe_cli', label: 'Stripe CLI' }]);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Tool added',
      expect.stringContaining('tool name or command contains that text'),
    );
  });

  it('rejects a duplicate custom tool with a clear message instead of silently adding it', () => {
    const onChangeCustomTools = jest.fn();
    const { getByTestId } = render(
      <LeashCommonToolsSection
        {...baseProps}
        customTools={[{ id: 'custom_stripe_cli', label: 'Stripe CLI' }]}
        onChangeCustomTools={onChangeCustomTools}
      />,
    );
    fireEvent.changeText(getByTestId('leash-custom-tool-input'), 'stripe cli');
    fireEvent.press(getByTestId('leash-custom-tool-add'));
    expect(onChangeCustomTools).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Already added', expect.stringContaining('stripe cli'));
  });

  it('does nothing when Add is pressed with an empty draft', () => {
    const onChangeCustomTools = jest.fn();
    const { getByTestId } = render(
      <LeashCommonToolsSection {...baseProps} onChangeCustomTools={onChangeCustomTools} />,
    );
    fireEvent.press(getByTestId('leash-custom-tool-add'));
    expect(onChangeCustomTools).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
