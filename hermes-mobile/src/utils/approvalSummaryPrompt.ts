/** Prompt template for on-device / cloud summarization of gate-blocked command diffs. */
export function buildApprovalSummaryPrompt(diff: string, toolName?: string): string {
  const tool = toolName?.trim() || 'unknown_tool';
  const body = diff.trim().slice(0, 4000);
  return [
    'You are Hermes Leash. Summarize this ThumbGate-blocked tool call for a human operator.',
    'Focus on: what would run, blast radius, and whether approve is reasonable.',
    'Keep under 3 sentences. Redact secrets and paths if present.',
    `Tool: ${tool}`,
    'Diff:',
    body || '(empty)',
  ].join('\n');
}
