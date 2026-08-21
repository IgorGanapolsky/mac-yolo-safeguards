const LEAKED_TOOL_PROTOCOL_RE =
  /<\|DSML\|(?:tool_calls|invoke|parameter)\b|<tool\s*_?\s*call\b|<toolcall\b|<function\s*_?\s*call\b/i;

const TOOL_PROTOCOL_BLOCKS = [
  /\s*<\|DSML\|tool_calls\b[^>]*>[\s\S]*?<\/\|DSML\|tool_calls>\s*/gi,
  /\s*<toolcall\b[^>]*>[\s\S]*?<\/toolcall>\s*/gi,
  /\s*<tool\s*_?\s*call\b[^>]*>[\s\S]*?<\/tool\s*_?\s*call>\s*/gi,
  /\s*<function\s*_?\s*call\b[^>]*>[\s\S]*?<\/function\s*_?\s*call>\s*/gi,
];

const TRUNCATED_TOOL_PROTOCOL = [
  /\s*<\|DSML\|tool_calls\b[^>]*>[\s\S]*$/i,
  /\s*<toolcall\b[^>]*>[\s\S]*$/i,
  /\s*<tool\s*_?\s*call\b[^>]*>[\s\S]*$/i,
  /\s*<function\s*_?\s*call\b[^>]*>[\s\S]*$/i,
];

export const TOOL_PROTOCOL_INCOMPLETE_MESSAGE =
  "The hosted run requested a tool but stopped before returning a final answer.";

export function hasLeakedToolProtocol(text: string | null | undefined): boolean {
  return Boolean(text && LEAKED_TOOL_PROTOCOL_RE.test(text));
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
