export type InlineSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export type FormattedBlock =
  | { kind: 'paragraph'; spans: InlineSpan[] }
  | { kind: 'heading'; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { kind: 'bullet'; spans: InlineSpan[] }
  | { kind: 'ordered'; index: number; spans: InlineSpan[] }
  | { kind: 'code'; text: string }
  | { kind: 'spacer' };

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const BULLET_RE = /^[-*+]\s+(.+)$/;
const ORDERED_RE = /^(\d+)[.)]\s+(.+)$/;
const INLINE_TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

export function hasFormattedMarkdown(text: string): boolean {
  if (!text.trim()) {
    return false;
  }
  return (
    /^#{1,3}\s/m.test(text) ||
    /^[-*+]\s/m.test(text) ||
    /^\d+[.)]\s/m.test(text) ||
    /```/.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /`[^`]+`/.test(text)
  );
}

function parseInlineSpans(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let last = 0;
  const matches = [...line.matchAll(INLINE_TOKEN_RE)];
  if (matches.length === 0) {
    return line ? [{ text: line }] : [];
  }
  for (const match of matches) {
    const index = match.index ?? 0;
    if (index > last) {
      spans.push({ text: line.slice(last, index) });
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      spans.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      spans.push({ text: token.slice(1, -1), italic: true });
    } else if (token.startsWith('`') && token.endsWith('`')) {
      spans.push({ text: token.slice(1, -1), code: true });
    } else {
      spans.push({ text: token });
    }
    last = index + token.length;
  }
  if (last < line.length) {
    spans.push({ text: line.slice(last) });
  }
  return spans.filter((span) => span.text.length > 0);
}

/** Normalize markdown spacing without stripping structure markers. */
export function normalizeMarkdownSpacing(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseFormattedBlocks(text: string): FormattedBlock[] {
  const normalized = normalizeMarkdownSpacing(text);
  if (!normalized) {
    return [];
  }

  const lines = normalized.split('\n');
  const blocks: FormattedBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      if (blocks.length > 0 && blocks[blocks.length - 1].kind !== 'spacer') {
        blocks.push({ kind: 'spacer' });
      }
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const fence = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ kind: 'code', text: codeLines.join('\n').trimEnd() });
      if (fence && codeLines.length === 0) {
        // empty fenced block — already advanced
      }
      continue;
    }

    const heading = trimmed.match(HEADING_RE);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({
        kind: 'heading',
        level,
        spans: parseInlineSpans(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    const bullet = trimmed.match(BULLET_RE);
    if (bullet) {
      blocks.push({ kind: 'bullet', spans: parseInlineSpans(bullet[1].trim()) });
      index += 1;
      continue;
    }

    const ordered = trimmed.match(ORDERED_RE);
    if (ordered) {
      blocks.push({
        kind: 'ordered',
        index: Number.parseInt(ordered[1], 10),
        spans: parseInlineSpans(ordered[2].trim()),
      });
      index += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      const nextTrimmed = next.trim();
      if (
        !nextTrimmed ||
        HEADING_RE.test(nextTrimmed) ||
        BULLET_RE.test(nextTrimmed) ||
        ORDERED_RE.test(nextTrimmed) ||
        nextTrimmed.startsWith('```')
      ) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push({
      kind: 'paragraph',
      spans: parseInlineSpans(paragraphLines.join('\n').trim()),
    });
  }

  return blocks;
}
