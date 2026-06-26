import type { PendingApproval } from '../types/gateway';
import type { HermesMessage, HermesSession } from '../types/chat';

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

export function buildChatOutputThumbgateCaptureBody(
  message: HermesMessage,
  signal: ThumbgateCaptureSignal,
  options: {
    session?: HermesSession | null;
    explanation?: string;
  } = {},
): {
  signal: ThumbgateCaptureSignal;
  context: string;
  whatWentWrong?: string;
  whatWorked?: string;
  whatToChange?: string;
  tags: string[];
} {
  const content = (message.rawContent || message.gatewayContent || message.content || '').trim();
  const clippedContent = content.length > 1800 ? `${content.slice(0, 1800)}...` : content;
  const explanation = options.explanation?.trim();
  const sessionTitle = options.session?.title?.trim();
  const context = [
    'Hermes Mobile chat output',
    sessionTitle ? `thread: ${sessionTitle}` : '',
    options.session?.id ? `session: ${options.session.id}` : '',
    message.id ? `message: ${message.id}` : '',
    clippedContent ? `output: ${clippedContent}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const tags = ['hermes-mobile', 'leash', 'chat-output', signal === 'down' ? 'thumbs-down' : 'thumbs-up'];

  if (signal === 'down') {
    return {
      signal,
      context,
      whatWentWrong: explanation || 'Operator marked this Hermes output as unhelpful.',
      whatToChange:
        explanation || 'Adjust future Hermes outputs using this chat-output feedback signal.',
      tags,
    };
  }

  return {
    signal,
    context,
    whatWorked: explanation || 'Operator marked this Hermes output as useful.',
    tags,
  };
}
