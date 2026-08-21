const LEAKED_TOOL_PROTOCOL_RE =
  /^[ \t]*(?:<\|DSML\|(?:tool_calls|invoke|parameter)\b|<tool_?call\b|<toolcall\b|<function_?call\b)/im;

const TOOL_PROTOCOL_BLOCKS = [
  /^[ \t]*<\|DSML\|tool_calls\b[^>]*>[\s\S]*?<\/\|DSML\|tool_calls>/gim,
  /^[ \t]*<\|DSML\|invoke\b[^>]*>[\s\S]*?<\/\|DSML\|invoke>/gim,
  /^[ \t]*<\|DSML\|parameter\b[^>]*>[\s\S]*?<\/\|DSML\|parameter>/gim,
  /^[ \t]*<toolcall\b[^>]*>[\s\S]*?<\/toolcall>/gim,
  /^[ \t]*<tool_?call\b[^>]*>[\s\S]*?<\/tool_?call>/gim,
  /^[ \t]*<function_?call\b[^>]*>[\s\S]*?<\/function_?call>/gim,
];

const TRUNCATED_TOOL_PROTOCOL = [
  /^[ \t]*<\|DSML\|tool_calls\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<\|DSML\|invoke\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<\|DSML\|parameter\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<toolcall\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<tool_?call\b[^>]*>[\s\S]*$/im,
  /^[ \t]*<function_?call\b[^>]*>[\s\S]*$/im,
];

export const TOOL_PROTOCOL_INCOMPLETE_MESSAGE =
  "The hosted run requested a tool but stopped before returning a final answer.";

function withoutMarkdownCode(text: string): string {
  let fenced = false;
  return text.split("\n").map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      fenced = !fenced;
      return "";
    }
    if (fenced) return "";

    let inline = false;
    let prose = "";
    for (const character of line) {
      if (character === "`") {
        inline = !inline;
      } else if (!inline) {
        prose += character;
      }
    }
    return prose;
  }).join("\n");
}

export function hasLeakedToolProtocol(text: string | null | undefined): boolean {
  return Boolean(text && LEAKED_TOOL_PROTOCOL_RE.test(withoutMarkdownCode(text)));
}

/**
 * A provider can emit its internal tool protocol as plain text when a runner has
 * no matching tool executor. Never make a customer decipher that wire format.
 */
export function readableChatOutput(text: string): string {
  if (!hasLeakedToolProtocol(text)) return text;

  let prose = text;
  for (const pattern of TOOL_PROTOCOL_BLOCKS) prose = prose.replace(pattern, "\n");
  for (const pattern of TRUNCATED_TOOL_PROTOCOL) prose = prose.replace(pattern, "\n");
  prose = prose.replace(/\n{3,}/g, "\n\n").trim();

  return prose
    ? `${prose}\n\n${TOOL_PROTOCOL_INCOMPLETE_MESSAGE}`
    : TOOL_PROTOCOL_INCOMPLETE_MESSAGE;
}
