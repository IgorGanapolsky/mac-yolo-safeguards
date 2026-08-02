import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AgentTerminalControlPad, TERMINAL_KEYS } from '../components/AgentTerminalControlPad';

describe('AgentTerminalControlPad component', () => {
  it('renders all quick terminal key buttons', () => {
    const onSendKey = jest.fn();
    const { getByTestId, getByText } = render(
      <AgentTerminalControlPad onSendKey={onSendKey} />
    );

    expect(getByText('quick terminal keys')).toBeTruthy();
    expect(TERMINAL_KEYS.length).toBe(6);

    fireEvent.press(getByTestId('key-btn-ctrl_c'));
    expect(onSendKey).toHaveBeenCalledWith('ctrl_c');

    fireEvent.press(getByTestId('key-btn-enter'));
    expect(onSendKey).toHaveBeenCalledWith('enter');
  });

  it('respects disabled prop', () => {
    const onSendKey = jest.fn();
    const { getByTestId } = render(
      <AgentTerminalControlPad onSendKey={onSendKey} disabled={true} />
    );

    fireEvent.press(getByTestId('key-btn-esc'));
    expect(onSendKey).not.toHaveBeenCalled();
  });
});
