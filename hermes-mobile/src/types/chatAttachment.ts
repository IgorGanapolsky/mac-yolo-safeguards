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

/**
 * Bounded, persistable metadata needed to reconstruct a failed multimodal send.
 *
 * The prepared gateway body deliberately does not live here: image data URLs can
 * be several megabytes and AsyncStorage is not a blob store. ChatScreen keeps the
 * prepared body in memory for an exact immediate retry and falls back to
 * re-reading these app-owned attachment URIs after a remount.
 */
export type OutboundRetryEnvelope = {
  version: 1;
  text: string;
  displayText: string;
  attachments: ComposerAttachment[];
};
