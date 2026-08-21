import catalogJson from "../../../config/continuation-prompts.json";

interface ContinuationCommand {
  id: string;
  canonical: string;
  triggers: string[];
  requiresContext: boolean;
  instruction: string;
}

interface Resolution {
  applied: boolean;
  command: string | null;
  displayPrompt: string;
  executionPrompt: string;
  reason: "applied" | "context_required" | "not_continuation_command";
}

const catalog = catalogJson as { commands: ContinuationCommand[] };
const commandsByTrigger = new Map<string, ContinuationCommand>();
for (const command of catalog.commands) {
  for (const trigger of command.triggers) commandsByTrigger.set(trigger, command);
}

export function normalizeContinuationPrompt(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[!?.,;:]+$/u, "")
    .trim()
    .replace(/\s+/gu, " ");
}

export function resolveContinuationPrompt(
  prompt: unknown,
  options: { hasContext: boolean },
): Resolution {
  const displayPrompt = String(prompt ?? "").trim();
  const matched = commandsByTrigger.get(normalizeContinuationPrompt(displayPrompt)) ?? null;
  if (!matched) {
    return {
      applied: false,
      command: null,
      displayPrompt,
      executionPrompt: displayPrompt,
      reason: "not_continuation_command",
    };
  }
  if (matched.requiresContext && !options.hasContext) {
    return {
      applied: false,
      command: matched.id,
      displayPrompt,
      executionPrompt: displayPrompt,
      reason: "context_required",
    };
  }
  return {
    applied: true,
    command: matched.id,
    displayPrompt,
    executionPrompt: [
      `[Continuation command: ${matched.canonical}]`,
      matched.instruction,
      "Use the established conversation context as the source of truth. Do not ask the user to repeat context already present.",
    ].join("\n"),
    reason: "applied",
  };
}
