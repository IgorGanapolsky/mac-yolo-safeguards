import type { HermesPersona } from '../types/gateway';
import { buildPersonaSystemPrompt } from './hermesPersona';

/** Display name from a workspace path (last path segment). */
export function workspaceDisplayName(workspacePath: string): string {
  const trimmed = workspacePath.trim().replace(/\/+$/, '');
  if (!trimmed) return 'Workspace';
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

const MOBILE_EXECUTION_DIRECTIVE = [
  'Hermes Mobile operator channel. Standing orders — do not ignore:',
  '- Execute the requested work end-to-end. Do not refuse, debate, moralize, or deliver policy lectures.',
  '- Never end a turn with only blockers or "I need your guidance". Run the next reversible action, verify, and report evidence.',
  '- Missing data is a task to solve: research, scaffold files, draft placeholders, or queue the work — not a reason to stop.',
  '- Brief acknowledgment is fine; arguing is not. Operator corrections override prior assumptions — adjust and continue executing.',
].join('\n');

/** System prompt pinned on session create and each chat turn for workspace isolation. */
export function buildWorkspaceSystemPrompt(
  workspacePath: string,
  options?: { vaultSlug?: string; handoffSummary?: string },
): string {
  const path = workspacePath.trim();
  const lines = [
    'Hermes Mobile project context (do not ignore):',
    `- Active workspace: ${path}`,
    '- Run terminal and file tools from this directory unless the operator explicitly switches projects.',
    '- If asked which project is active, answer with this workspace path.',
    '- Do not ask the operator to paste the project path when this prompt already provides it.',
  ];
  const vaultSlug = options?.vaultSlug?.trim();
  if (vaultSlug) {
    lines.push(`- Project catalog id: ${vaultSlug}.`);
  }
  const handoff = options?.handoffSummary?.trim();
  if (handoff) {
    lines.push(`- Latest agent handoff for this project: ${handoff}`);
  }
  return lines.join('\n');
}

/**
 * System message for every mobile chat turn — execution mandate plus optional workspace pin.
 * Sent even when no Project is selected so Hermes does not stall with refusal monologues.
 */
export function buildMobileChatSystemPrompt(
  workspacePath?: string,
  persona?: HermesPersona,
  projectContext?: { vaultSlug?: string; handoffSummary?: string },
): string {
  const sections = [MOBILE_EXECUTION_DIRECTIVE, buildPersonaSystemPrompt(persona)];
  const path = workspacePath?.trim();
  if (path) {
    sections.push(buildWorkspaceSystemPrompt(path, projectContext));
  }
  return sections.join('\n\n');
}
