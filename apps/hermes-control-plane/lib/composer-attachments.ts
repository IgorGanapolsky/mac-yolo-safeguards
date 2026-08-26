/**
 * Composer attach for thumbgate.app: images + text/code files.
 * Bytes live in task_files (chunked). Prompt stays under the 24k hosted budget.
 * No SVG (XSS). No executables. Not a Mac-pair path.
 */

export const MAX_COMPOSER_ATTACHMENTS = 4;
export const MAX_IMAGE_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_ATTACHMENT_BYTES = 48 * 1024;
export const TASK_FILE_CHUNK_CHARS = 12_000;
export const ACCEPT_ATTRIBUTE =
  "image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,text/csv,application/json,.md,.txt,.csv,.json,.ts,.tsx,.js,.jsx,.py,.sh,.sql,.html,.css,.yml,.yaml,.toml,.log";

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "text/html",
  "text/css",
  "text/x-python",
  "text/x-sh",
  "text/x-sql",
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/toml",
]);
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "xml",
  "yaml",
  "yml",
  "log",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "sh",
  "sql",
  "html",
  "css",
  "toml",
  "ini",
]);

export type AttachmentKind = "image" | "text";

export type IncomingAttachment = {
  name?: string;
  mime?: string;
  data?: string;
};

export type ValidAttachment = {
  name: string;
  mime: string;
  kind: AttachmentKind;
  data: string;
  sizeBytes: number;
};

export type AttachmentError = { ok: false; error: string };
export type AttachmentOk = { ok: true; attachments: ValidAttachment[] };

export function composerHasSendableContent(
  text: string,
  attachments: readonly { name?: string }[] = [],
): boolean {
  return Boolean(String(text || "").trim()) || attachments.length > 0;
}

export function formatAttachmentBubbleText(
  text: string,
  attachments: readonly { name?: string }[],
): string {
  const trimmed = String(text || "").trim();
  const names = attachments.map((item) => String(item.name || "").trim()).filter(Boolean).join(", ");
  if (trimmed && names) return `${trimmed}\n\n📎 ${names}`;
  if (trimmed) return trimmed;
  if (names) return `📎 ${names}`;
  return "";
}

function extensionForName(name: string): string {
  const dot = String(name || "").lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

function stripDataUrl(raw: string): string {
  const value = String(raw || "").trim();
  const comma = value.indexOf(",");
  if (value.startsWith("data:") && comma > 0) return value.slice(comma + 1).replace(/\s/g, "");
  return value.replace(/\s/g, "");
}

function byteLengthFromBase64(b64: string): number {
  const padded = b64.replace(/=+$/, "");
  return Math.floor((padded.length * 3) / 4);
}

export function classifyAttachment(
  mimeType: string,
  name: string,
  sizeBytes: number,
): { kind: AttachmentKind } | { kind: "unsupported"; reason: string } {
  const mime = String(mimeType || "").trim().toLowerCase();
  const ext = extensionForName(name);
  if (mime === "image/svg+xml" || ext === "svg") {
    return { kind: "unsupported", reason: `${name} is SVG and is not allowed.` };
  }
  if (IMAGE_MIMES.has(mime) || (mime.startsWith("image/") && mime !== "image/svg+xml")) {
    if (sizeBytes > MAX_IMAGE_ATTACHMENT_BYTES) {
      return {
        kind: "unsupported",
        reason: `${name} is too large (max ${Math.round(MAX_IMAGE_ATTACHMENT_BYTES / (1024 * 1024))} MB for images).`,
      };
    }
    return { kind: "image" };
  }
  const textLike =
    TEXT_MIMES.has(mime) ||
    mime.startsWith("text/") ||
    TEXT_EXTENSIONS.has(ext);
  if (textLike) {
    if (sizeBytes > MAX_TEXT_ATTACHMENT_BYTES) {
      return {
        kind: "unsupported",
        reason: `${name} is too large (max ${Math.round(MAX_TEXT_ATTACHMENT_BYTES / 1024)} KB for text).`,
      };
    }
    return { kind: "text" };
  }
  return { kind: "unsupported", reason: `${name} is not an allowed image or text file.` };
}

export function validateIncomingAttachments(raw: unknown): AttachmentOk | AttachmentError {
  if (raw == null) return { ok: true, attachments: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "attachments must be an array" };
  if (raw.length > MAX_COMPOSER_ATTACHMENTS) {
    return { ok: false, error: `at most ${MAX_COMPOSER_ATTACHMENTS} attachments` };
  }
  const out: ValidAttachment[] = [];
  for (const item of raw as IncomingAttachment[]) {
    const name = String(item?.name || "file").replace(/[/\\]/g, "").slice(0, 180) || "file";
    const mime = String(item?.mime || "application/octet-stream").toLowerCase().slice(0, 80);
    const data = stripDataUrl(item?.data || "");
    if (!data || !/^[A-Za-z0-9+/]+=*$/.test(data)) {
      return { ok: false, error: `${name} is not valid base64` };
    }
    const sizeBytes = byteLengthFromBase64(data);
    const classified = classifyAttachment(mime, name, sizeBytes);
    if (classified.kind === "unsupported") return { ok: false, error: classified.reason };
    out.push({
      name,
      mime: classified.kind === "image" ? (mime.startsWith("image/") ? mime : "image/png") : mime,
      kind: classified.kind,
      data,
      sizeBytes,
    });
  }
  return { ok: true, attachments: out };
}

export function decodeTextAttachment(data: string): string {
  try {
    return Buffer.from(data, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function mergeAttachmentsIntoPrompt(
  prompt: string,
  attachments: readonly ValidAttachment[],
): string {
  const parts = [String(prompt || "").trim()];
  for (const file of attachments) {
    if (file.kind === "text") {
      const body = decodeTextAttachment(file.data).slice(0, MAX_TEXT_ATTACHMENT_BYTES);
      parts.push(`Attached file ${file.name}:\n\`\`\`\n${body}\n\`\`\``);
    } else {
      parts.push(`[Attached image: ${file.name} (${file.mime}, ${file.sizeBytes} bytes)]`);
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

export function chunkAttachmentData(data: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += TASK_FILE_CHUNK_CHARS) {
    chunks.push(data.slice(i, i + TASK_FILE_CHUNK_CHARS));
  }
  return chunks.length ? chunks : [""];
}

export const TASK_FILES_DDL = `CREATE TABLE IF NOT EXISTS task_files (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  kind TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (id, chunk_index)
)`;

export function attachmentsFromPayload(payload: unknown): AttachmentOk | AttachmentError {
  if (!payload || typeof payload !== "object") return { ok: true, attachments: [] };
  return validateIncomingAttachments((payload as { attachments?: unknown }).attachments);
}

export function buildModelUserContent(task: {
  prompt?: string;
  attachments?: Array<{ kind?: string; mime?: string; data?: string; name?: string; text?: string }>;
}): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  const prompt = String(task?.prompt || "");
  const attachments = Array.isArray(task?.attachments) ? task.attachments : [];
  const images = attachments.filter((file) => file.kind === "image" && file.data);
  if (!images.length) return prompt;
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  if (prompt.trim()) parts.push({ type: "text", text: prompt });
  for (const file of images) {
    const mime = String(file.mime || "image/png");
    parts.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${file.data}` },
    });
  }
  return parts;
}
