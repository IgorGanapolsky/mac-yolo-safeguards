/** Display name from a workspace path (last path segment). */
export function workspaceDisplayName(workspacePath: string): string {
  const trimmed = workspacePath.trim().replace(/\/+$/, '');
  if (!trimmed) return 'Workspace';
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

/** System prompt pinned on session create and each chat turn for workspace isolation. */
export function buildWorkspaceSystemPrompt(workspacePath: string): string {
  const path = workspacePath.trim();
  return [
    'Hermes Mobile project context (do not ignore):',
    `- Active workspace: ${path}`,
    '- Run terminal and file tools from this directory unless Igor explicitly switches projects.',
    '- If asked which project is active, answer with this workspace path.',
    '- Do not ask Igor to paste the project path when this prompt already provides it.',
  ].join('\n');
}
