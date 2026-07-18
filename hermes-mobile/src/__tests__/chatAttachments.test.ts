import * as FileSystem from 'expo-file-system';
import {
  buildChatMessageContent,
  classifyAttachment,
  composerHasSendableContent,
  formatAttachmentBubbleText,
  MAX_COMPOSER_ATTACHMENTS,
  prepareChatMessageContent,
  serializeChatMessageContent,
} from '../utils/chatAttachments';
import type { ComposerAttachment } from '../types/chatAttachment';

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

  it('documents attachment slot cap', () => {
    expect(MAX_COMPOSER_ATTACHMENTS).toBe(5);
  });

  it('returns a loud error when file read fails instead of throwing', async () => {
    const readAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;
    readAsStringAsync.mockRejectedValueOnce(new Error('ENOENT'));
    const prepared = await prepareChatMessageContent('See attached', [
      {
        id: 'txt-1',
        name: 'notes.txt',
        mimeType: 'text/plain',
        uri: 'file:///missing.txt',
        kind: 'text',
        sizeBytes: 20,
      },
    ]);
    expect(prepared.content).toBe('');
    expect(prepared.error).toContain('notes.txt');
    expect(prepared.error).toContain('ENOENT');
  });

  it('serializes multimodal content for non-stream fallback', () => {
    expect(
      serializeChatMessageContent([
        { type: 'text', text: 'See attached' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ]),
    ).toBe('See attached\n\n[Attached image]');
  });

  it('empty attach list with text still prepares a plain string', async () => {
    const prepared = await prepareChatMessageContent('make money today', []);
    expect(prepared.error).toBeUndefined();
    expect(prepared.content).toBe('make money today');
  });
});
