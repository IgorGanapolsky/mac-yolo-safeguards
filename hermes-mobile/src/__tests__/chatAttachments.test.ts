import {
  buildChatMessageContent,
  classifyAttachment,
  composerHasSendableContent,
  formatAttachmentBubbleText,
  MAX_COMPOSER_ATTACHMENTS,
  prepareChatMessageContent,
} from '../utils/chatAttachments';
import type { ComposerAttachment } from '../types/chatAttachment';
import * as FileSystem from 'expo-file-system';

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(async (uri: string) => {
    if (uri.includes('photo')) {
      return 'aW1hZ2UtYnl0ZXM=';
    }
    return 'hello from file';
  }),
  EncodingType: { Base64: 'base64' },
}));

describe('chatAttachments', () => {
  it('allows send when attachments exist without typed text', () => {
    expect(composerHasSendableContent('', [{ id: '1' } as ComposerAttachment])).toBe(true);
    expect(composerHasSendableContent('  ', [])).toBe(false);
  });

  it('classifies images and text files and rejects unsupported types', () => {
    expect(classifyAttachment('image/png', 'shot.png', 1024)).toEqual({ kind: 'image' });
    expect(classifyAttachment('text/plain', 'notes.txt', 1024)).toEqual({ kind: 'text' });
    expect(classifyAttachment('application/pdf', 'doc.pdf', 1024).kind).toBe('unsupported');
  });

  it('builds multimodal gateway payload with text and image parts', () => {
    const payload = buildChatMessageContent('Also improve yourself (Hermes) with this:', {
      textSnippets: ['Attached file: plan.md\n\n# Plan'],
      imageDataUrls: ['data:image/png;base64,abc'],
    });
    expect(payload).toEqual([
      { type: 'text', text: 'Also improve yourself (Hermes) with this:' },
      { type: 'text', text: 'Attached file: plan.md\n\n# Plan' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ]);
  });

  it('formats outbound bubble text with attachment names', () => {
    const attachments = [{ id: '1', name: 'screenshot.png' } as ComposerAttachment];
    expect(formatAttachmentBubbleText('Review this', attachments)).toBe(
      'Review this\n\n📎 screenshot.png',
    );
    expect(formatAttachmentBubbleText('', attachments)).toBe('📎 screenshot.png');
  });

  it('prepares image and text attachments for gateway send', async () => {
    const attachments: ComposerAttachment[] = [
      {
        id: 'img-1',
        name: 'photo.png',
        mimeType: 'image/png',
        uri: 'file:///photo.png',
        kind: 'image',
        sizeBytes: 100,
      },
      {
        id: 'txt-1',
        name: 'notes.txt',
        mimeType: 'text/plain',
        uri: 'file:///notes.txt',
        kind: 'text',
        sizeBytes: 20,
      },
    ];
    const prepared = await prepareChatMessageContent('See attached', attachments);
    expect(Array.isArray(prepared.content)).toBe(true);
    expect(prepared.content).toEqual(
      expect.arrayContaining([
        { type: 'text', text: 'See attached' },
        expect.objectContaining({ type: 'text', text: expect.stringContaining('Attached file: notes.txt') }),
        expect.objectContaining({
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=' },
        }),
      ]),
    );
  });

  it('returns a named error instead of rejecting when an attachment cannot be read', async () => {
    const readAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;
    readAsStringAsync.mockRejectedValueOnce(new Error('ENOENT'));
    const attachment: ComposerAttachment = {
      id: 'missing-1',
      name: 'missing-notes.txt',
      mimeType: 'text/plain',
      uri: 'file:///missing-notes.txt',
      kind: 'text',
      sizeBytes: 20,
    };

    await expect(prepareChatMessageContent('Keep this prompt', [attachment])).resolves.toEqual({
      content: '',
      error: 'Could not read missing-notes.txt. Reattach it and try again.',
    });
  });

  it('documents attachment slot cap', () => {
    expect(MAX_COMPOSER_ATTACHMENTS).toBe(5);
  });
});
