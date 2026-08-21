const LEAKED_TOOL_PROTOCOL_RE =
  /^[ \t]*(?:<[|｜]DSML[|｜](?:tool_calls|invoke|parameter)\b|<tool_?call\b|<toolcall\b|<function_?call\b)/im;

const TOOL_PROTOCOL_BLOCKS = [
  /^[ \t]*<[|｜]DSML[|｜]tool_calls\b[^>]*>[\s\S]*?<\/[|｜]DSML[|｜]tool_calls>/gim,
  /^[ \t]*<[|｜]DSML[|｜]invoke\b[^>]*>[\s\S]*?<\/[|｜]DSML[|｜]invoke>/gim,
  /^[ \t]*<[|｜]DSML[|｜]parameter\b[^>]*>[\s\S]*?<\/[|｜]DSML[|｜]parameter>/gim,
  /^[ \t]*<toolcall\b[^>]*>[\s\S]*?<\/toolcall>/gim,
  /^[ \t]*<tool_?call\b[^>]*>[\s\S]*?<\/tool_?call>/gim,
  /^[ \t]*<function_?call\b[^>]*>[\s\S]*?<\/function_?call>/gim,
];

const TRUNCATED_TOOL_PROTOCOL = [
  /^[ \t]*<[|｜]DSML[|｜]tool_calls\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<[|｜]DSML[|｜]invoke\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<[|｜]DSML[|｜]parameter\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<toolcall\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<tool_?call\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<function_?call\b[^>]*>[\s\S]*$/im,
];

export const TOOL_PROTOCOL_INCOMPLETE_MESSAGE =
  "The hosted run requested a tool but stopped before returning a final answer.";

function protectMarkdownCode(text: string): { masked: string; restore: (value: string) => string } {
  const protectedSegments: string[] = [];
  const protect = (segment: string) => {
    const marker = `\uE000THUMBGATE_CODE_${protectedSegments.length}\uE001`;
    protectedSegments.push(segment);
    return marker;
  };

  let fenced = false;
  const masked = text.split(/(?<=\n)/).map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      fenced = !fenced;
      return protect(line);
    }
    if (fenced) return protect(line);

    let cursor = 0;
    let prose = "";
    while (cursor < line.length) {
      const start = line.indexOf("`", cursor);
      if (start < 0) return prose + line.slice(cursor);

      prose += line.slice(cursor, start);
      const end = line.indexOf("`", start + 1);
      if (end < 0) return prose + protect(line.slice(start));

      prose += protect(line.slice(start, end + 1));
      cursor = end + 1;
    }
    return prose;
  }).join("");

  return {
    masked,
    restore: (value) => protectedSegments.reduce(
      (restored, segment, index) => restored.replace(`\uE000THUMBGATE_CODE_${index}\uE001`, segment),
      value,
    ),
  };
}

export function hasLeakedToolProtocol(text: string | null | undefined): boolean {
  return Boolean(text && LEAKED_TOOL_PROTOCOL_RE.test(protectMarkdownCode(text).masked));
}

/**
 * A provider can emit its internal tool protocol as plain text when a runner has
 * no matching tool executor. Never make a customer decipher that wire format.
 */
export function readableChatOutput(text: string): string {
  const protectedMarkdown = protectMarkdownCode(text);
  if (!LEAKED_TOOL_PROTOCOL_RE.test(protectedMarkdown.masked)) return text;

  let prose = protectedMarkdown.masked;
  for (const pattern of TOOL_PROTOCOL_BLOCKS) prose = prose.replace(pattern, "\n");
  for (const pattern of TRUNCATED_TOOL_PROTOCOL) prose = prose.replace(pattern, "\n");
  prose = prose.replace(/\n{3,}/g, "\n\n").trim();
  prose = protectedMarkdown.restore(prose);

  return prose
    ? `${prose}\n\n${TOOL_PROTOCOL_INCOMPLETE_MESSAGE}`
    : TOOL_PROTOCOL_INCOMPLETE_MESSAGE;
}
