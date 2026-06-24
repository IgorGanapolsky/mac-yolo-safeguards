import type { HermesMessage } from '../types/chat';
import { parseToolActivityDetails } from './toolMessageDetails';
import { isToolActivityRole } from './toolMessageDetails';

const TERMINAL_TOOL_RE = /terminal|run_command|bash|shell|exec/i;

export function isTerminalToolName(toolName: string): boolean {
  return TERMINAL_TOOL_RE.test(toolName);
}

export function extractTerminalActivityFromMessage(message: HermesMessage): {
  toolName: string;
  command: string;
  status: 'running' | 'completed' | 'error';
} | null {
  if (!isToolActivityRole(message.role)) {
    return null;
  }
  const raw = message.gatewayContent ?? message.rawContent ?? message.content ?? '';
  const details = parseToolActivityDetails(raw, message.content);
  if (!details || !isTerminalToolName(details.toolName)) {
    return null;
  }
  const command =
    details.detailRows.find((row) => row.label === 'Command')?.value ??
    details.summaryLine;
  return {
    toolName: details.toolName,
    command: command.trim(),
    status: 'completed',
  };
}
