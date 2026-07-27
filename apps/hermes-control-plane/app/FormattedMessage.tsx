import type { ReactNode } from "react";
import type { InlineSpan } from "@/lib/chat-formatted-blocks";
import { parseFormattedBlocks } from "@/lib/chat-formatted-blocks";

function InlineSpans({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.code) return <code key={index}>{span.text}</code>;
        if (span.bold) return <strong key={index}>{span.text}</strong>;
        if (span.italic) return <em key={index}>{span.text}</em>;
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

/**
 * Structured markdown-lite renderer, ported from hermes-mobile's chat formatter so
 * bold/lists/code from Hermes responses don't show up as literal asterisks on the web
 * dashboard. Renders via JSX only — no dangerouslySetInnerHTML, so there's no HTML
 * injection surface even though this content comes from an LLM.
 */
export function FormattedMessage({ text }: { text: string }) {
  const blocks = parseFormattedBlocks(text);
  if (blocks.length === 0) return null;
  const items: ReactNode[] = [];
  let listBuffer: ReactNode[] = [];
  let listKind: "bullet" | "ordered" | null = null;

  const flushList = () => {
    if (!listBuffer.length) return;
    items.push(
      listKind === "ordered" ? (
        <ol key={`list-${items.length}`}>{listBuffer}</ol>
      ) : (
        <ul key={`list-${items.length}`}>{listBuffer}</ul>
      ),
    );
    listBuffer = [];
    listKind = null;
  };

  for (const [blockIndex, block] of blocks.entries()) {
    if (block.kind === "bullet" || block.kind === "ordered") {
      if (listKind && listKind !== (block.kind === "bullet" ? "bullet" : "ordered")) flushList();
      listKind = block.kind === "bullet" ? "bullet" : "ordered";
      listBuffer.push(
        <li key={`item-${blockIndex}`}>
          <InlineSpans spans={block.spans} />
        </li>,
      );
      continue;
    }
    flushList();
    if (block.kind === "spacer") continue;
    if (block.kind === "code") {
      items.push(
        <pre key={blockIndex}>
          <code>{block.text}</code>
        </pre>,
      );
      continue;
    }
    if (block.kind === "heading") {
      const Heading = (`h${block.level + 3}`) as "h4" | "h5" | "h6";
      items.push(
        <Heading key={blockIndex}>
          <InlineSpans spans={block.spans} />
        </Heading>,
      );
      continue;
    }
    items.push(
      <p key={blockIndex}>
        <InlineSpans spans={block.spans} />
      </p>,
    );
  }
  flushList();
  return <>{items}</>;
}
