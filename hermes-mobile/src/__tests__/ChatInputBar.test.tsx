import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import ChatInputBar from '../components/ChatInputBar';
import { colors } from '../theme/colors';

jest.mock('expo-document-picker');

jest.mock('../utils/documentContentExtractor', () => ({
  extractDocumentText: jest.fn(),
}));

import { extractDocumentText } from '../utils/documentContentExtractor';

describe('ChatInputBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  const baseProps = {
    value: '',
    onChangeText: jest.fn(),
    onFocus: jest.fn(),
    onBlur: jest.fn(),
    onSubmit: jest.fn(),
    placeholder: 'Type',
    sendMuted: true,
    onSend: jest.fn(),
    attachments: [],
    onAddAttachment: jest.fn(),
    onRemoveAttachment: jest.fn(),
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

  it('renders attachment chips when attachments are present', () => {
    const { getByTestId } = render(
      <ChatInputBar
        {...baseProps}
        attachments={[
          {
            id: 'link-1',
            kind: 'link',
            name: 'https://example.com',
            url: 'https://example.com',
          },
        ]}
      />,
    );

    expect(getByTestId('composer-attachment-strip')).toBeTruthy();
    expect(getByTestId('composer-attachment-link-link-1')).toBeTruthy();
  });

  it('sends when an attachment exists even with empty text', () => {
    const onSend = jest.fn();
    const { getByTestId } = render(
      <ChatInputBar
        {...baseProps}
        onSend={onSend}
        sendMuted={false}
        attachments={[
          {
            id: 'doc-1',
            kind: 'document',
            name: 'notes.md',
            textContent: 'hello',
          },
        ]}
      />,
    );

    fireEvent.press(getByTestId('chat-send-button'));
    expect(onSend).toHaveBeenCalledWith('');
  });

  it('removes attachment chips', () => {
    const onRemoveAttachment = jest.fn();
    const { getByTestId } = render(
      <ChatInputBar
        {...baseProps}
        onRemoveAttachment={onRemoveAttachment}
        attachments={[
          {
            id: 'link-1',
            kind: 'link',
            name: 'https://example.com',
            url: 'https://example.com',
          },
        ]}
      />,
    );

    fireEvent.press(getByTestId('composer-attachment-remove-link-1'));
    expect(onRemoveAttachment).toHaveBeenCalledWith('link-1');
  });

  it('lists Document first in the attach menu', () => {
    const { getByTestId, getByText } = render(<ChatInputBar {...baseProps} />);

    fireEvent.press(getByTestId('composer-attach-button'));

    expect(getByTestId('composer-attach-option-document')).toBeTruthy();
    expect(getByText('Document (PDF, Word, text)')).toBeTruthy();
    expect(getByTestId('composer-attach-option-photo-library')).toBeTruthy();
    expect(getByTestId('composer-attach-option-take-photo')).toBeTruthy();
    expect(getByTestId('composer-attach-option-paste-link')).toBeTruthy();
  });

  it('adds a document chip after picking a supported file', async () => {
    const onAddAttachment = jest.fn();
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/notes.txt',
          name: 'notes.txt',
          mimeType: 'text/plain',
          size: 128,
        },
      ],
    });
    (extractDocumentText as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: 'hello from file',
      truncated: false,
    });

    const { getByTestId } = render(
      <ChatInputBar {...baseProps} onAddAttachment={onAddAttachment} />,
    );

    fireEvent.press(getByTestId('composer-attach-button'));
    fireEvent.press(getByTestId('composer-attach-option-document'));

    await waitFor(() => {
      expect(onAddAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'document',
          name: 'notes.txt',
          textContent: 'hello from file',
        }),
      );
    });
  });

  it('adds a PDF document chip after extracting readable text', async () => {
    const onAddAttachment = jest.fn();
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/report.pdf',
          name: 'report.pdf',
          mimeType: 'application/pdf',
          size: 4096,
        },
      ],
    });
    (extractDocumentText as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: 'Extracted PDF body',
      truncated: false,
    });

    const { getByTestId } = render(
      <ChatInputBar {...baseProps} onAddAttachment={onAddAttachment} />,
    );

    fireEvent.press(getByTestId('composer-attach-button'));
    fireEvent.press(getByTestId('composer-attach-option-document'));

    await waitFor(() => {
      expect(extractDocumentText).toHaveBeenCalledWith(
        'file:///tmp/report.pdf',
        'report.pdf',
        'application/pdf',
      );
      expect(onAddAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'document',
          name: 'report.pdf',
          textContent: 'Extracted PDF body',
        }),
      );
    });
  });

  it('adds a Word document chip after extracting DOCX text', async () => {
    const onAddAttachment = jest.fn();
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/brief.docx',
          name: 'brief.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 8192,
        },
      ],
    });
    (extractDocumentText as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: 'Extracted Word body',
      truncated: false,
    });

    const { getByTestId } = render(
      <ChatInputBar {...baseProps} onAddAttachment={onAddAttachment} />,
    );

    fireEvent.press(getByTestId('composer-attach-button'));
    fireEvent.press(getByTestId('composer-attach-option-document'));

    await waitFor(() => {
      expect(extractDocumentText).toHaveBeenCalledWith(
        'file:///tmp/brief.docx',
        'brief.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(onAddAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'document',
          name: 'brief.docx',
          textContent: 'Extracted Word body',
        }),
      );
    });
  });

  it('shows a clear error for unsupported document types', async () => {
    const onAddAttachment = jest.fn();
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/sheet.xlsx',
          name: 'sheet.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 8192,
        },
      ],
    });
    (extractDocumentText as jest.Mock).mockResolvedValueOnce({
      ok: false,
      userMessage: 'Unsupported file type.',
    });

    const { getByTestId } = render(
      <ChatInputBar {...baseProps} onAddAttachment={onAddAttachment} />,
    );

    fireEvent.press(getByTestId('composer-attach-button'));
    fireEvent.press(getByTestId('composer-attach-option-document'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Could not attach document', 'Unsupported file type.');
    });
    expect(onAddAttachment).not.toHaveBeenCalled();
  });
});
