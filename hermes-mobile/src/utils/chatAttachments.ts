import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import type {
  ChatContentPart,
  ChatMessageContent,
  ComposerAttachment,
  ComposerAttachmentKind,
} from '../types/chatAttachment';

export const MAX_COMPOSER_ATTACHMENTS = 5;
/** Raw image bytes before base64 inflation (~4 MB keeps under provider image caps). */
export const MAX_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024;
/** Text inlined into a single gateway text part (api_server MAX_NORMALIZED_TEXT_LENGTH = 64 KB). */
export const MAX_TEXT_ATTACHMENT_BYTES = 48 * 1024;

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'tsv',
  'xml',
  'yaml',
  'yml',
  'log',
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'sh',
  'sql',
  'html',
  'css',
  'toml',
  'ini',
  'env',
]);

export function composerHasSendableContent(
  text: string,
  attachments: readonly ComposerAttachment[],
): boolean {
  return Boolean(text.trim()) || attachments.length > 0;
}

export function formatAttachmentBubbleText(
  text: string,
  attachments: readonly ComposerAttachment[],
): string {
  const trimmed = text.trim();
  const names = attachments.map((item) => item.name).join(', ');
  if (trimmed && names) {
    return `${trimmed}\n\n📎 ${names}`;
  }
  if (trimmed) {
    return trimmed;
  }
  if (names) {
    return `📎 ${names}`;
  }
  return '';
}

function extensionForName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) {
    return '';
  }
  return name.slice(dot + 1).toLowerCase();
}

export function classifyAttachment(
  mimeType: string,
  name: string,
  sizeBytes: number,
): { kind: ComposerAttachmentKind } | { kind: 'unsupported'; reason: string } {
  const mime = mimeType.trim().toLowerCase();
  const ext = extensionForName(name);

  if (mime.startsWith('image/')) {
    if (sizeBytes > MAX_IMAGE_ATTACHMENT_BYTES) {
      return {
        kind: 'unsupported',
        reason: `${name} is too large (max ${Math.round(MAX_IMAGE_ATTACHMENT_BYTES / (1024 * 1024))} MB for images).`,
      };
    }
    return { kind: 'image' };
  }

  const textLike =
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    TEXT_EXTENSIONS.has(ext);

  if (textLike) {
    if (sizeBytes > MAX_TEXT_ATTACHMENT_BYTES) {
      return {
        kind: 'unsupported',
        reason: `${name} is too large (max ${Math.round(MAX_TEXT_ATTACHMENT_BYTES / 1024)} KB for text files).`,
      };
    }
    return { kind: 'text' };
  }

  return {
    kind: 'unsupported',
    reason: `${name} is not supported yet. Attach images or text files (.txt, .md, .json, .csv, code). PDFs and documents are not wired to the gateway chat API.`,
  };
}

export function buildChatMessageContent(
  text: string,
  input: {
    textSnippets: string[];
    imageDataUrls: string[];
  },
): ChatMessageContent {
  const parts: ChatContentPart[] = [];
  const trimmed = text.trim();

  if (trimmed) {
    parts.push({ type: 'text', text: trimmed });
  }
  for (const snippet of input.textSnippets) {
    const body = snippet.trim();
    if (body) {
      parts.push({ type: 'text', text: body });
    }
  }
  for (const url of input.imageDataUrls) {
    if (url.trim()) {
      parts.push({ type: 'image_url', image_url: { url: url.trim() } });
    }
  }

  if (parts.length === 0) {
    return '';
  }
  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text;
  }
  return parts;
}

async function readDataUrl(attachment: ComposerAttachment): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(attachment.uri, {
    encoding: 'base64',
  });
  return `data:${attachment.mimeType};base64,${base64}`;
}

async function readTextSnippet(attachment: ComposerAttachment): Promise<string> {
  const body = await FileSystem.readAsStringAsync(attachment.uri);
  return `Attached file: ${attachment.name}\n\n${body}`;
}

export async function prepareChatMessageContent(
  text: string,
  attachments: readonly ComposerAttachment[],
): Promise<{ content: ChatMessageContent; error?: string }> {
  const textSnippets: string[] = [];
  const imageDataUrls: string[] = [];

  for (const attachment of attachments) {
    if (attachment.kind === 'image') {
      imageDataUrls.push(await readDataUrl(attachment));
      continue;
    }
    if (attachment.kind === 'text') {
      textSnippets.push(await readTextSnippet(attachment));
      continue;
    }
    return { content: '', error: `Unsupported attachment: ${attachment.name}` };
  }

  const content = buildChatMessageContent(text, { textSnippets, imageDataUrls });
  if (!content || (typeof content === 'string' && !content.trim())) {
    return { content: '', error: 'Add a message or supported attachment before sending.' };
  }
  return { content };
}

function makeAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toComposerAttachment(input: {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}): ComposerAttachment | { error: string } {
  const name = input.name.trim() || 'attachment';
  const mimeType = (input.mimeType?.trim() || 'application/octet-stream').toLowerCase();
  const sizeBytes = Math.max(0, input.size ?? 0);
  const classified = classifyAttachment(mimeType, name, sizeBytes);
  if (classified.kind === 'unsupported') {
    return { error: classified.reason };
  }
  return {
    id: makeAttachmentId(),
    name,
    mimeType,
    uri: input.uri,
    kind: classified.kind,
    sizeBytes,
  };
}

export async function pickImageAttachments(
  remainingSlots: number,
): Promise<{ attachments: ComposerAttachment[]; error?: string }> {
  if (remainingSlots <= 0) {
    return { attachments: [], error: `You can attach up to ${MAX_COMPOSER_ATTACHMENTS} files.` };
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { attachments: [], error: 'Photo library access is required to attach images.' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: remainingSlots > 1,
    quality: 1,
  });

  if (result.canceled) {
    return { attachments: [] };
  }

  const picked = result.assets.slice(0, remainingSlots);
  const attachments: ComposerAttachment[] = [];
  for (const asset of picked) {
    const mapped = toComposerAttachment({
      uri: asset.uri,
      name: asset.fileName ?? `image-${attachments.length + 1}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize,
    });
    if ('error' in mapped) {
      return { attachments: [], error: mapped.error };
    }
    attachments.push(mapped);
  }
  return { attachments };
}

export async function pickDocumentAttachments(
  remainingSlots: number,
): Promise<{ attachments: ComposerAttachment[]; error?: string }> {
  if (remainingSlots <= 0) {
    return { attachments: [], error: `You can attach up to ${MAX_COMPOSER_ATTACHMENTS} files.` };
  }

  const result = await DocumentPicker.getDocumentAsync({
    multiple: remainingSlots > 1,
    copyToCacheDirectory: true,
    type: '*/*',
  });

  if (result.canceled) {
    return { attachments: [] };
  }

  const assets = result.assets ?? [];
  const picked = assets.slice(0, remainingSlots);
  const attachments: ComposerAttachment[] = [];
  for (const asset of picked) {
    const mapped = toComposerAttachment({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
    });
    if ('error' in mapped) {
      return { attachments: [], error: mapped.error };
    }
    attachments.push(mapped);
  }
  return { attachments };
}
