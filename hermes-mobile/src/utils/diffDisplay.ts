/** Codex-style diff preview for mobile approval surfaces. */

export function hasDiffContent(diff: string | undefined | null): boolean {
  const trimmed = diff?.trim() ?? '';
  return trimmed.length > 0 && trimmed !== '""' && trimmed !== '{}';
}

export function formatDiffPreview(diff: string, maxLines = 14): string {
  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= maxLines) {
    return lines.join('\n');
  }
  return `${lines.slice(0, maxLines).join('\n')}\n… (${lines.length - maxLines} more lines on Mac)`;
}

export function diffStats(diff: string): { additions: number; deletions: number } | null {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
      continue;
    }
    if (line.startsWith('+')) {
      additions += 1;
    } else if (line.startsWith('-')) {
      deletions += 1;
    }
  }
  if (additions === 0 && deletions === 0) {
    return null;
  }
  return { additions, deletions };
}
