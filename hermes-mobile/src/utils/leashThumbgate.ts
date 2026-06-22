import type { PendingApproval } from '../types/gateway';

export type ThumbgateCaptureSignal = 'up' | 'down';

export function buildLeashThumbgateCaptureBody(
  approval: PendingApproval,
  signal: ThumbgateCaptureSignal,
): {
  signal: ThumbgateCaptureSignal;
  context: string;
  whatWentWrong?: string;
  whatWorked?: string;
  whatToChange?: string;
  tags: string[];
} {
  const contextParts = [
    `Hermes Leash · ${approval.toolName}`,
    approval.reason,
    approval.command ? `command: ${approval.command}` : '',
    approval.workspacePath ? `workspace: ${approval.workspacePath}` : '',
    approval.actionId ? `action: ${approval.actionId}` : '',
  ].filter(Boolean);

  const tags = ['hermes-mobile', 'leash', approval.toolName].filter(Boolean);

  if (signal === 'down') {
    return {
      signal: 'down',
      context: contextParts.join(' · '),
      whatWentWrong: approval.reason,
      whatToChange: `Block or escalate ${approval.toolName} like this from Hermes Mobile Leash`,
      tags,
    };
  }

  return {
    signal: 'up',
    context: contextParts.join(' · '),
    whatWorked: `Operator allowed ${approval.toolName} from Hermes Mobile Leash`,
    tags,
  };
}
