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
    expect(flat.backgroundColor).toBe('transparent');
    expect(input.props.placeholderTextColor).toBe(colors.textMuted);
    expect(input.props.selectionColor).toBe(colors.primary);
    expect(input.props.editable).toBe(true);
    expect(input.props.secureTextEntry).toBeFalsy();
  });

  it('enables best-in-class predictive text, spell-check, and auto-capitalization', () => {
    const { getByTestId } = render(<ChatInputBar {...baseProps} />);
    const input = getByTestId('chat-input');

    expect(input.props.autoCorrect).toBe(true);
    expect(input.props.spellCheck).toBe(true);
    expect(input.props.autoCapitalize).toBe('sentences');
    expect(input.props.keyboardType).toBe('default');
    expect(input.props.multiline).toBe(true);
  });

  it('does not use suggestion-killing input configuration', () => {
    const { getByTestId } = render(<ChatInputBar {...baseProps} />);
    const input = getByTestId('chat-input');

    expect(input.props.secureTextEntry).toBeFalsy();
    expect(input.props.keyboardType).not.toBe('visible-password');
    expect(input.props.textContentType).toBe('none');
    expect(input.props.importantForAutofill).toBe('no');
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

  it('passes the latest native text to send even before controlled value catches up', () => {
    const onChangeText = jest.fn();
    const onSend = jest.fn();
    const { getByTestId } = render(
      <ChatInputBar {...baseProps} onChangeText={onChangeText} onSend={onSend} />,
    );
    const input = getByTestId('chat-input');

    fireEvent.changeText(input, 'print money faster');
    fireEvent.press(getByTestId('chat-send-button'));

    expect(onChangeText).toHaveBeenCalledWith('print money faster');
    expect(onSend).toHaveBeenCalledWith('print money faster');
  });

  it('keeps native end-editing text available for send after the keyboard hides', () => {
    const onSend = jest.fn();
    const { getByTestId } = render(<ChatInputBar {...baseProps} onSend={onSend} />);
    const input = getByTestId('chat-input');

    fireEvent(input, 'endEditing', { nativeEvent: { text: 'same prompt after keyboard hide' } });
    fireEvent.press(getByTestId('chat-send-button'));

    expect(onSend).toHaveBeenCalledWith('same prompt after keyboard hide');
  });

  it('does not let an empty end-editing event erase the typed native draft', () => {
    const onSend = jest.fn();
    const { getByTestId } = render(<ChatInputBar {...baseProps} onSend={onSend} />);
    const input = getByTestId('chat-input');

    fireEvent.changeText(input, 'typed before keyboard hide');
    fireEvent(input, 'endEditing', { nativeEvent: { text: '' } });
    fireEvent.press(getByTestId('chat-send-button'));

    expect(onSend).toHaveBeenCalledWith('typed before keyboard hide');
  });

  // T-330 priority 5 (prevent-recurrence engineering control): an active agent run may
  // disable Send or offer Queue, but the composer must NEVER stop the user from typing.
  // These lock in the invariant so a future change cannot wire `editable` to run state.
  it('never disables typing while an active run has Send disabled (composer stays editable)', () => {
    const { getByTestId } = render(
      <ChatInputBar {...baseProps} sendDisabled showStop={true} onStop={jest.fn()} />,
    );
    expect(getByTestId('chat-input').props.editable).toBe(true);
  });

  it('never disables typing while sendMuted (empty composer during an active run)', () => {
    const { getByTestId } = render(
      <ChatInputBar {...baseProps} sendMuted sendDisabled showStop={true} onStop={jest.fn()} />,
    );
    expect(getByTestId('chat-input').props.editable).toBe(true);
  });

  it('still accepts typed input while Send is disabled during an active run', () => {
    const onChangeText = jest.fn();
    const { getByTestId } = render(
      <ChatInputBar {...baseProps} onChangeText={onChangeText} sendDisabled showStop={true} onStop={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('chat-input'), 'typed while a run is active');
    expect(onChangeText).toHaveBeenCalledWith('typed while a run is active');
  });

  it('still invokes onSend when sendDisabled (blocking handled upstream)', () => {
    const onSend = jest.fn();
    const { getByTestId } = render(
      <ChatInputBar
        {...baseProps}
        value="make money faster"
        sendMuted={false}
        sendDisabled
        onSend={onSend}
      />,
    );

    fireEvent.press(getByTestId('chat-send-button'));
    expect(onSend).toHaveBeenCalledWith('make money faster');
  });

  it('shows paperclip attach control', () => {
    const onAttachPress = jest.fn();
    const { getByTestId } = render(
      <ChatInputBar {...baseProps} onAttachPress={onAttachPress} />,
    );

    fireEvent.press(getByTestId('chat-attach-button'));
    expect(onAttachPress).toHaveBeenCalledTimes(1);
  });

  it('renders attachment chips and enables send without typed text', () => {
    const onSend = jest.fn();
    const attachments = [
      {
        id: 'att-1',
        name: 'screenshot.png',
        mimeType: 'image/png',
        uri: 'file:///screenshot.png',
        kind: 'image' as const,
        sizeBytes: 100,
      },
    ];
    const { getByTestId } = render(
      <ChatInputBar
        {...baseProps}
        attachments={attachments}
        sendMuted={false}
        onSend={onSend}
        onRemoveAttachment={jest.fn()}
      />,
    );

    expect(getByTestId('chat-attachment-chips')).toBeTruthy();
    expect(getByTestId('chat-attach-chip-att-1')).toBeTruthy();
    fireEvent.press(getByTestId('chat-send-button'));
    expect(onSend).toHaveBeenCalledWith('');
  });

  it('calls onRemoveAttachment when chip remove is pressed', () => {
    const onRemoveAttachment = jest.fn();
    const attachments = [
      {
        id: 'att-2',
        name: 'notes.txt',
        mimeType: 'text/plain',
        uri: 'file:///notes.txt',
        kind: 'text' as const,
        sizeBytes: 20,
      },
    ];
    const { getByTestId } = render(
      <ChatInputBar
        {...baseProps}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />,
    );

    fireEvent.press(getByTestId('chat-attach-remove-att-2'));
    expect(onRemoveAttachment).toHaveBeenCalledWith('att-2');
  });
});
