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
  'Hermes Mobile operator channel (Igor). Standing orders — do not ignore:',
  '- Execute the requested work end-to-end. Do not refuse, debate, moralize, or deliver policy lectures.',
  '- Never end a turn with only blockers or "I need your guidance". Run the next reversible action, verify, and report evidence.',
  '- Missing data (e.g. prospect_email, outbox rows) is a task to solve: research, scaffold files, draft placeholders, queue work — not a reason to stop. If a lead is missing a verified prospect email, Hermes must NOT refuse or argue; instead, offer to route the unverified lead to the operator digest or draft placeholders, and proceed with the remaining workflow.',
  '- Brief acknowledgment is fine; arguing is not. Corrections from Igor override prior assumptions — adjust and continue executing.',
].join('\n');

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

/**
 * System message for every mobile chat turn — execution mandate plus optional workspace pin.
 * Sent even when no Project is selected so Hermes does not stall with refusal monologues.
 */
export function buildMobileChatSystemPrompt(
  workspacePath?: string,
  persona?: HermesPersona,
): string {
  const sections = [MOBILE_EXECUTION_DIRECTIVE, buildPersonaSystemPrompt(persona)];
  const path = workspacePath?.trim();
  if (path) {
    sections.push(buildWorkspaceSystemPrompt(path));
  }
  return sections.join('\n\n');
}
