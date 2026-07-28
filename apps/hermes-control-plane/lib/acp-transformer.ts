/**
 * Agent Client Protocol (ACP) Transformer for Hermes Control Plane
 * Converts incoming ACP messages from Buzz/Goose/OpenAI/Claude agent frameworks into native Hermes tasks
 */

export type AcpMessage = {
  protocolVersion: string;
  sender: {
    id: string;
    role: "user" | "assistant" | "agent";
    name?: string;
  };
  payload: {
    text: string;
    action?: string;
    context?: Record<string, unknown>;
  };
  metadata?: {
    nostrEventId?: string;
    targetMachine?: string;
    fencedSafetyToken?: string;
  };
};

export type HermesTaskInstruction = {
  prompt: string;
  sourceProtocol: "acp" | "native" | "nostr";
  targetAgent: string;
  routePreference: "auto" | "local" | "cloud";
  metadata: Record<string, unknown>;
};

/**
 * Transform an incoming ACP message payload into a standardized Hermes task instruction
 */
export function transformAcpToHermesTask(acp: AcpMessage): HermesTaskInstruction {
  const rawText = acp.payload?.text ?? "";
  const prompt = rawText.trim();

  // Extract multi-agent tagging if present (@hermes-coder, @hermes-reviewer, etc.)
  const tagMatch = prompt.match(/@(hermes-[a-z0-9-]+)/i);
  const targetAgent = tagMatch ? tagMatch[1].toLowerCase() : "hermes";

  return {
    prompt,
    sourceProtocol: acp.metadata?.nostrEventId ? "nostr" : "acp",
    targetAgent,
    routePreference: "auto",
    metadata: {
      acpProtocolVersion: acp.protocolVersion || "1.0",
      senderId: acp.sender.id,
      senderName: acp.sender.name ?? "Anonymous Agent",
      nostrEventId: acp.metadata?.nostrEventId ?? null,
      context: acp.payload?.context ?? {},
    },
  };
}

/**
 * Format a Hermes task result back into a compliant ACP response message
 */
export function transformHermesResultToAcp(
  taskResult: string,
  taskError: string | null,
  recipientId: string,
): AcpMessage {
  return {
    protocolVersion: "1.0",
    sender: {
      id: "hermes-agent-control-plane",
      role: "agent",
      name: "Hermes Agent",
    },
    payload: {
      text: taskError ? `Execution Failed: ${taskError}` : taskResult,
      action: taskError ? "error" : "completed",
    },
    metadata: {
      recipientId,
    },
  };
}
