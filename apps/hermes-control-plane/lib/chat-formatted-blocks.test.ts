import { describe, expect, it } from "vitest";
import {
  hasFormattedMarkdown,
  normalizeMarkdownSpacing,
  parseFormattedBlocks,
} from "./chat-formatted-blocks";

describe("chatFormattedBlocks", () => {
  it("detects markdown structure", () => {
    expect(hasFormattedMarkdown("## Heading\n\nBody")).toBe(true);
    expect(hasFormattedMarkdown("plain sentence")).toBe(false);
  });

  it("parses headings, bullets, and inline emphasis", () => {
    const blocks = parseFormattedBlocks(
      "## Next steps\n\nHere is the summary.\n\n* First item\n* Second item\n\nUse `npm test`.",
    );
    expect(blocks.filter((b) => b.kind === "heading")).toHaveLength(1);
    expect(blocks.filter((b) => b.kind === "bullet")).toHaveLength(2);
    const paragraph = blocks.find((b) => b.kind === "paragraph");
    expect(paragraph && paragraph.kind === "paragraph" ? paragraph.spans[0].text : "").toContain(
      "summary",
    );
    const codeSpan = blocks
      .flatMap((b) => (b.kind === "paragraph" ? b.spans : []))
      .find((s) => s.code);
    expect(codeSpan?.text).toBe("npm test");
  });

  it("parses fenced code blocks", () => {
    const blocks = parseFormattedBlocks('Before\n\n```json\n{"ok":true}\n```\n\nAfter');
    const code = blocks.find((b) => b.kind === "code");
    expect(code && code.kind === "code" ? code.text : "").toContain('"ok":true');
  });

  it("normalizes excessive blank lines", () => {
    expect(normalizeMarkdownSpacing("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("renders bold spans without leaking asterisks", () => {
    const blocks = parseFormattedBlocks("Based on the verified facts: **$0 revenue, 18 unpaid checkouts.**");
    const paragraph = blocks.find((b) => b.kind === "paragraph");
    const spans = paragraph && paragraph.kind === "paragraph" ? paragraph.spans : [];
    expect(spans.some((s) => s.bold && s.text.includes("$0 revenue"))).toBe(true);
    expect(spans.every((s) => !s.text.includes("**"))).toBe(true);
  });
});
