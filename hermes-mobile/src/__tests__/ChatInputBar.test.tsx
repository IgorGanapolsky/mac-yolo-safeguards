import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ChatInputBar from '../components/ChatInputBar';
import { colors } from '../theme/colors';

describe('ChatInputBar', () => {
  const baseProps = {
    value: '',
    onChangeText: jest.fn(),
    onFocus: jest.fn(),
    onBlur: jest.fn(),
    onSubmit: jest.fn(),
    placeholder: 'Type',
    sendMuted: true,
    onSend: jest.fn(),
  };

  it('shows stop control when run is active and composer is empty', () => {
    const onStop = jest.fn();
    const { getByTestId } = render(
      <ChatInputBar
        {...baseProps}
        showStop={true}
        onStop={onStop}
      />,
    );

    fireEvent.press(getByTestId('chat-stop-button'));
    expect(onStop).toHaveBeenCalled();
  });

  it('uses light text on dark composer field', () => {
    const { getByTestId } = render(<ChatInputBar {...baseProps} />);
    const input = getByTestId('chat-input');
    const flat = StyleSheet.flatten(input.props.style);

    expect(flat.color).toBe(colors.text);
    expect(flat.backgroundColor).toBe('rgba(255, 255, 255, 0.06)');
    expect(input.props.placeholderTextColor).toBe(colors.textMuted);
    expect(input.props.selectionColor).toBe(colors.primary);
    expect(input.props.editable).toBe(true);
    expect(input.props.secureTextEntry).toBeFalsy();
  });

  it('reflects controlled value while typing', () => {
    const onChangeText = jest.fn();
    const { getByTestId, rerender } = render(
      <ChatInputBar {...baseProps} onChangeText={onChangeText} />,
    );
    const input = getByTestId('chat-input');

    fireEvent.changeText(input, 'Hello Mac');
    expect(onChangeText).toHaveBeenCalledWith('Hello Mac');

    rerender(
      <ChatInputBar {...baseProps} onChangeText={onChangeText} value="Hello Mac" sendMuted={false} />,
    );
    expect(getByTestId('chat-input').props.value).toBe('Hello Mac');
  });
});
