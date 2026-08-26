"use client";

import { ChangeEvent, DragEvent } from "react";
import {
  ACCEPT_ATTRIBUTE,
  MAX_COMPOSER_ATTACHMENTS,
  classifyAttachment,
} from "@/lib/composer-attachments";

export type ComposerFile = {
  name: string;
  mime: string;
  kind: "image" | "text";
  data: string;
  previewUrl?: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function filesToComposerAttachments(
  files: File[],
  existingCount: number,
): Promise<{ attachments: ComposerFile[]; error?: string }> {
  const room = MAX_COMPOSER_ATTACHMENTS - existingCount;
  if (room <= 0) {
    return { attachments: [], error: `At most ${MAX_COMPOSER_ATTACHMENTS} files.` };
  }
  const picked = files.slice(0, room);
  const attachments: ComposerFile[] = [];
  for (const file of picked) {
    const classified = classifyAttachment(file.type || "application/octet-stream", file.name, file.size);
    if (classified.kind === "unsupported") {
      return { attachments: [], error: classified.reason };
    }
    const dataUrl = await readFileAsDataUrl(file);
    attachments.push({
      name: file.name,
      mime: file.type || (classified.kind === "image" ? "image/png" : "text/plain"),
      kind: classified.kind,
      data: dataUrl,
      previewUrl: classified.kind === "image" ? dataUrl : undefined,
    });
  }
  return { attachments };
}

export function ComposerAttach({
  files,
  disabled,
  error,
  onAdd,
  onRemove,
}: {
  files: ComposerFile[];
  disabled?: boolean;
  error?: string | null;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const list = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (list.length) onAdd(list);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    const list = Array.from(event.dataTransfer.files || []);
    if (list.length) onAdd(list);
  }

  return (
    <div
      className="composer-attach"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {files.length > 0 ? (
        <ul className="composer-attach-chips" aria-label="Attached files">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="composer-attach-chip">
              {file.previewUrl ? (
                <img src={file.previewUrl} alt="" className="composer-attach-thumb" />
              ) : (
                <span aria-hidden="true">📄</span>
              )}
              <span>{file.name}</span>
              <button
                type="button"
                className="composer-attach-remove"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemove(index)}
                disabled={disabled}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="composer-attach-error" role="alert">{error}</p> : null}
      <label className="composer-attach-button">
        <input
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          disabled={disabled}
          onChange={onPick}
          data-testid="composer-attach-input"
          aria-label="Attach images or files"
        />
        Attach
      </label>
    </div>
  );
}
