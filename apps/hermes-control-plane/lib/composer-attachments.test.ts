import { describe, expect, it } from "vitest";
import {
  ACCEPT_ATTRIBUTE,
  MAX_COMPOSER_ATTACHMENTS,
  attachmentsFromPayload,
  buildModelUserContent,
  classifyAttachment,
  composerHasSendableContent,
  formatAttachmentBubbleText,
  mergeAttachmentsIntoPrompt,
  validateIncomingAttachments,
} from "./composer-attachments.ts";

describe("composer attachments", () => {
  it("allows send with only a file", () => {
    expect(composerHasSendableContent("", [{ name: "shot.png" }])).toBe(true);
    expect(composerHasSendableContent("  ", [])).toBe(false);
    expect(composerHasSendableContent("do this", [])).toBe(true);
  });

  it("rejects svg and oversize images", () => {
    expect(classifyAttachment("image/svg+xml", "x.svg", 10).kind).toBe("unsupported");
    expect(classifyAttachment("image/png", "big.png", 9 * 1024 * 1024).kind).toBe("unsupported");
    expect(classifyAttachment("image/png", "ok.png", 1200).kind).toBe("image");
    expect(classifyAttachment("text/plain", "notes.txt", 20).kind).toBe("text");
  });

  it("validates base64 payloads and caps count", () => {
    const png = Buffer.from("hi").toString("base64");
    const ok = validateIncomingAttachments([
      { name: "ok.png", mime: "image/png", data: `data:image/png;base64,${png}` },
    ]);
    expect(ok.ok).toBe(true);
    const tooMany = validateIncomingAttachments(
      Array.from({ length: MAX_COMPOSER_ATTACHMENTS + 1 }, () => ({
        name: "ok.png",
        mime: "image/png",
        data: png,
      })),
    );
    expect(tooMany.ok).toBe(false);
    const bad = validateIncomingAttachments([{ name: "x.exe", mime: "application/x-msdownload", data: png }]);
    expect(bad.ok).toBe(false);
  });

  it("merges text files into the prompt and only names images", () => {
    const text = Buffer.from("hello world").toString("base64");
    const img = Buffer.from("img").toString("base64");
    const merged = mergeAttachmentsIntoPrompt("Fix this", [
      {
        name: "note.txt",
        mime: "text/plain",
        kind: "text",
        data: text,
        sizeBytes: 11,
      },
      {
        name: "shot.png",
        mime: "image/png",
        kind: "image",
        data: img,
        sizeBytes: 3,
      },
    ]);
    expect(merged).toContain("Fix this");
    expect(merged).toContain("hello world");
    expect(merged).toContain("[Attached image: shot.png");
    expect(merged).not.toContain(img);
  });

  it("builds multimodal model content for images", () => {
    const img = Buffer.from("img").toString("base64");
    const content = buildModelUserContent({
      prompt: "what is this",
      attachments: [{ kind: "image", mime: "image/png", data: img, name: "shot.png" }],
    });
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "text", text: "what is this" });
    expect(content[1]).toEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${img}` },
    });
  });

  it("keeps string content when there are no image parts", () => {
    expect(buildModelUserContent({ prompt: "plain" })).toBe("plain");
    expect(
      buildModelUserContent({
        prompt: "plain plus file",
        attachments: [{ kind: "text", name: "a.txt", text: "ignored because already merged" }],
      }),
    ).toBe("plain plus file");
  });

  it("reads attachments from a raw create-task payload without slicing them", () => {
    const png = Buffer.from("hi").toString("base64");
    const parsed = attachmentsFromPayload({
      prompt: "look",
      attachments: [{ name: "ok.png", mime: "image/png", data: png }],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.attachments[0].data).toBe(png);
  });

  it("formats the chat bubble and exposes a non-wildcard accept list", () => {
    expect(formatAttachmentBubbleText("go", [{ name: "a.png" }])).toBe("go\n\n📎 a.png");
    expect(ACCEPT_ATTRIBUTE).toContain("image/png");
    expect(ACCEPT_ATTRIBUTE).not.toContain("*/*");
  });
});
