export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

/** Gateway session chat `message` field — plain text or multimodal parts. */
export type ChatMessageContent = string | ChatContentPart[];

export type ComposerAttachmentKind = 'image' | 'text';

export type ComposerAttachment = {
  id: string;
  name: string;
  mimeType: string;
  uri: string;
  kind: ComposerAttachmentKind;
  sizeBytes: number;
};
