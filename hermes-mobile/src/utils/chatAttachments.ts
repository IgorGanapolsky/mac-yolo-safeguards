export type ChatAttachmentKind = 'image' | 'document' | 'link';

export type ChatComposerAttachment = {
  id: string;
  kind: ChatAttachmentKind;
  name: string;
  uri?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  /** Raw base64 (no data: prefix) for images picked in the composer. */
  base64?: string;
  /** Inline text for small code/text documents. */
  textContent?: string;
};

export type GatewayContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

/** Hermes gateway rejects image data URLs above 5 MB (api_server.py). */
export const GATEWAY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Hermes gateway text part cap (api_server.py MAX_NORMALIZED_TEXT_LENGTH). */
export const GATEWAY_TEXT_MAX_CHARS = 65_536;

/** Reserve headroom for user message + document headers when truncating inline docs. */
export const GATEWAY_DOCUMENT_TEXT_BUDGET_CHARS = 60_000;

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

const TEXT_DOCUMENT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'py',
  'js',
  'ts',
  'tsx',
  'jsx',
  'html',
  'css',
  'yaml',
  'yml',
  'xml',
  'csv',
  'log',
  'sh',
  'sql',
]);

export function createComposerAttachmentId(prefix = 'att'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[),.;]+$/, '')))];
}

export function extractFirstUrl(text: string): string | null {
  return extractUrls(text)[0] ?? null;
}

export function isTextDocumentName(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase();
  return Boolean(extension && TEXT_DOCUMENT_EXTENSIONS.has(extension));
}

export function truncateDocumentTextForGateway(
  text: string,
  maxChars = GATEWAY_DOCUMENT_TEXT_BUDGET_CHARS,
): { text: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return { text: trimmed, truncated: false };
  }
  return {
    text: `${trimmed.slice(0, maxChars)}\n\n[Document truncated to ${maxChars.toLocaleString()} characters for gateway limit.]`,
    truncated: true,
  };
}

export function estimateBase64Bytes(base64: string): number {
  const normalized = base64.replace(/^data:[^;]+;base64,/, '');
  return Math.floor((normalized.length * 3) / 4);
}

export function formatAttachmentSize(sizeBytes?: number): string | null {
  if (!sizeBytes || sizeBytes <= 0) {
    return null;
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function attachmentDisplayLabel(attachment: ChatComposerAttachment): string {
  if (attachment.kind === 'link') {
    return attachment.url ?? attachment.name;
  }
  return attachment.name;
}

function attachmentContextLine(attachment: ChatComposerAttachment, index: number): string {
  const kind = attachment.kind === 'image' ? 'screenshot/image' : attachment.kind;
  const details = [
    attachment.mimeType,
    formatAttachmentSize(attachment.sizeBytes),
    attachment.width && attachment.height ? `${attachment.width}x${attachment.height}` : null,
  ].filter(Boolean);
  const target = attachment.kind === 'link' ? attachment.url : attachment.uri;
  const suffix = details.length ? ` (${details.join(', ')})` : '';
  return `${index + 1}. ${kind}: ${attachment.name}${suffix}${target ? `\n   ${target}` : ''}`;
}

export function formatAttachmentContext(attachments: ChatComposerAttachment[]): string {
  if (attachments.length === 0) {
    return '';
  }
  return [
    'Attached context:',
    ...attachments.map((attachment, index) => attachmentContextLine(attachment, index)),
  ].join('\n');
}

export function composeMessageWithAttachments(
  message: string,
  attachments: ChatComposerAttachment[],
): string {
  const trimmed = message.trim();
  const context = formatAttachmentContext(attachments);
  if (!context) {
    return trimmed;
  }
  if (!trimmed) {
    return `Please review these attachments.\n\n${context}`;
  }
  return `${trimmed}\n\n${context}`;
}

function imageDataUrl(base64: string, mimeType = 'image/jpeg'): string {
  const trimmed = base64.trim();
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }
  return `data:${mimeType};base64,${trimmed}`;
}

function appendTextBlock(blocks: string[], text: string): void {
  const trimmed = text.trim();
  if (trimmed) {
    blocks.push(trimmed);
  }
}

function documentInlineBlock(attachment: ChatComposerAttachment): string {
  const header = `[Document: ${attachment.name}]`;
  const body = attachment.textContent?.trim();
  if (!body) {
    return `${header}\n(Document text unavailable.)`;
  }
  const { text } = truncateDocumentTextForGateway(body);
  return `${header}\n${text}`;
}

function linkInlineBlock(attachment: ChatComposerAttachment): string {
  const url = attachment.url?.trim() ?? attachment.name.trim();
  return `[Link: ${url}]`;
}

export function buildGatewayMessagePayload(
  message: string,
  attachments: ChatComposerAttachment[],
): string | GatewayContentPart[] {
  const textBlocks: string[] = [];
  appendTextBlock(textBlocks, message);

  for (const attachment of attachments) {
    if (attachment.kind === 'link') {
      appendTextBlock(textBlocks, linkInlineBlock(attachment));
      continue;
    }
    if (attachment.kind === 'document') {
      appendTextBlock(textBlocks, documentInlineBlock(attachment));
    }
  }

  const imageParts: GatewayContentPart[] = [];
  for (const attachment of attachments) {
    if (attachment.kind !== 'image' || !attachment.base64?.trim()) {
      continue;
    }
    const bytes = estimateBase64Bytes(attachment.base64);
    if (bytes > GATEWAY_IMAGE_MAX_BYTES) {
      throw new Error(
        `${attachment.name} is too large (${formatAttachmentSize(bytes)}). Images must be under 5 MB.`,
      );
    }
    imageParts.push({
      type: 'image_url',
      image_url: {
        url: imageDataUrl(attachment.base64, attachment.mimeType ?? 'image/jpeg'),
      },
    });
  }

  const combinedText = textBlocks.join('\n\n').trim();

  if (imageParts.length === 0) {
    return combinedText;
  }

  const parts: GatewayContentPart[] = [];
  if (combinedText) {
    parts.push({ type: 'text', text: combinedText });
  }
  parts.push(...imageParts);
  return parts;
}

export function formatOutboundBubbleContent(
  gatewayMessage: string | GatewayContentPart[],
): string {
  if (typeof gatewayMessage === 'string') {
    return gatewayMessage;
  }
  return JSON.stringify(gatewayMessage);
}

export function composerHasSendPayload(text: string, attachments: ChatComposerAttachment[]): boolean {
  return Boolean(text.trim()) || attachments.length > 0;
}

export function mergeLinkAttachmentsFromText(
  text: string,
  attachments: ChatComposerAttachment[],
): { text: string; attachments: ChatComposerAttachment[] } {
  const urls = extractUrls(text);
  if (urls.length === 0) {
    return { text, attachments };
  }

  const existing = new Set(
    attachments
      .filter((attachment) => attachment.kind === 'link')
      .map((attachment) => (attachment.url ?? attachment.name).trim().toLowerCase()),
  );

  let nextText = text;
  const added: ChatComposerAttachment[] = [];
  for (const url of urls) {
    if (existing.has(url.toLowerCase())) {
      continue;
    }
    added.push({
      id: createComposerAttachmentId('link'),
      kind: 'link',
      name: url,
      url,
    });
    existing.add(url.toLowerCase());
    nextText = nextText.replace(url, '').replace(/\s{2,}/g, ' ').trim();
  }

  if (added.length === 0) {
    return { text, attachments };
  }

  return {
    text: nextText,
    attachments: [...attachments, ...added],
  };
}

export function attachmentChipTestId(attachment: ChatComposerAttachment): string {
  return `composer-attachment-${attachment.kind}-${attachment.id}`;
}
