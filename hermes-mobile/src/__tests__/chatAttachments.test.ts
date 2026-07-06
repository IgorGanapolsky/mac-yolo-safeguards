import {
  attachmentChipTestId,
  buildGatewayMessagePayload,
  composerHasSendPayload,
  estimateBase64Bytes,
  extractUrls,
  formatOutboundBubbleContent,
  GATEWAY_IMAGE_MAX_BYTES,
  mergeLinkAttachmentsFromText,
  type ChatComposerAttachment,
} from '../utils/chatAttachments';

describe('chatAttachments', () => {
  const tinyImageBase64 = 'a'.repeat(128);

  it('extracts unique URLs from composer text', () => {
    expect(extractUrls('see https://example.com/a and http://test.dev/x.')).toEqual([
      'https://example.com/a',
      'http://test.dev/x',
    ]);
  });

  it('promotes pasted URLs into link attachment chips', () => {
    const { text, attachments } = mergeLinkAttachmentsFromText('Check https://docs.hermes.dev/guide', []);
    expect(text).toBe('Check');
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.kind).toBe('link');
    expect(attachments[0]?.url).toBe('https://docs.hermes.dev/guide');
  });

  it('builds plain text payload when only links and text documents are attached', () => {
    const attachments: ChatComposerAttachment[] = [
      { id: 'l1', kind: 'link', name: 'https://x.dev', url: 'https://x.dev' },
      {
        id: 'd1',
        kind: 'document',
        name: 'notes.txt',
        textContent: 'hello file',
      },
    ];
    const payload = buildGatewayMessagePayload('summarize', attachments);
    expect(typeof payload).toBe('string');
    expect(payload).toContain('summarize');
    expect(payload).toContain('[Link: https://x.dev]');
    expect(payload).toContain('[Document: notes.txt]');
    expect(payload).toContain('hello file');
  });

  it('truncates oversized inline documents for the gateway text cap', () => {
    const oversized = 'x'.repeat(70_000);
    const payload = buildGatewayMessagePayload('', [
      {
        id: 'd1',
        kind: 'document',
        name: 'big.txt',
        textContent: oversized,
      },
    ]);
    expect(typeof payload).toBe('string');
    expect((payload as string).length).toBeLessThan(70_000);
    expect(payload).toContain('[Document truncated');
  });

  it('builds plain text payload for PDF-derived document content', () => {
    const payload = buildGatewayMessagePayload('review this pdf', [
      {
        id: 'd1',
        kind: 'document',
        name: 'report.pdf',
        textContent: 'Extracted PDF paragraph.',
      },
    ]);
    expect(typeof payload).toBe('string');
    expect(payload).toContain('[Document: report.pdf]');
    expect(payload).toContain('Extracted PDF paragraph.');
  });

  it('builds multimodal payload with image_url data URLs', () => {
    const attachments: ChatComposerAttachment[] = [
      {
        id: 'i1',
        kind: 'image',
        name: 'shot.png',
        base64: tinyImageBase64,
        mimeType: 'image/png',
      },
    ];
    const payload = buildGatewayMessagePayload('what is this?', attachments);
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toEqual([
      { type: 'text', text: 'what is this?' },
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${tinyImageBase64}` },
      },
    ]);
  });

  it('rejects images above the gateway 5 MB cap', () => {
    const oversized = 'A'.repeat(Math.ceil((GATEWAY_IMAGE_MAX_BYTES * 4) / 3) + 16);
    expect(estimateBase64Bytes(oversized)).toBeGreaterThan(GATEWAY_IMAGE_MAX_BYTES);
    expect(() =>
      buildGatewayMessagePayload('', [
        { id: 'big', kind: 'image', name: 'big.jpg', base64: oversized },
      ]),
    ).toThrow(/too large/i);
  });

  it('allows send when attachments exist without typed text', () => {
    expect(composerHasSendPayload('', [{ id: 'l1', kind: 'link', name: 'https://a.dev', url: 'https://a.dev' }])).toBe(
      true,
    );
  });

  it('serializes multimodal outbound bubbles as JSON', () => {
    const payload = [{ type: 'text' as const, text: 'hi' }];
    expect(formatOutboundBubbleContent(payload)).toBe(JSON.stringify(payload));
  });

  it('uses stable attachment chip test ids', () => {
    const attachment: ChatComposerAttachment = {
      id: 'abc',
      kind: 'image',
      name: 'shot.png',
    };
    expect(attachmentChipTestId(attachment)).toBe('composer-attachment-image-abc');
  });
});
