const LEAKED_TOOL_PROTOCOL_RE =
  /<\|DSML\|(?:tool_calls|invoke|parameter)\b|<tool_?call\b|<toolcall\b|<function_?call\b/i;

const TOOL_PROTOCOL_BLOCKS = [
  /<\|DSML\|tool_calls\b[^>]*>[\s\S]*?<\/\|DSML\|tool_calls>/gi,
  /<toolcall\b[^>]*>[\s\S]*?<\/toolcall>/gi,
  /<tool_?call\b[^>]*>[\s\S]*?<\/tool_?call>/gi,
  /<function_?call\b[^>]*>[\s\S]*?<\/function_?call>/gi,
];

const TRUNCATED_TOOL_PROTOCOL = [
  /<\|DSML\|tool_calls\b[^>]*>[\s\S]*$/i,
  /<toolcall\b[^>]*>[\s\S]*$/i,
  /<tool_?call\b[^>]*>[\s\S]*$/i,
  /<function_?call\b[^>]*>[\s\S]*$/i,
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
