/**
 * Pure cloud→Mac rejoin helpers (no Cloudflare runtime imports).
 */

export const REJOIN_HANDOFF_MAX_CHARS = 24_000;
export const REJOIN_MAX_PACKS = 40;
export const REJOIN_MAX_TASKS_PER_PACK = 30;

export type RejoinMessage = { role: "user" | "assistant" | "system"; content: string };

export type CompletedCloudTask = {
  id: string;
  prompt: string;
  result: string;
  createdAt: number;
};

/** Pure: build bounded handoff messages from completed cloud tasks after a watermark. */
export function buildRejoinHandoff(
  tasks: CompletedCloudTask[],
  watermark: number | null | undefined,
  maxChars = REJOIN_HANDOFF_MAX_CHARS,
): { handoffMessages: RejoinMessage[]; taskIds: string[]; nextWatermark: number } {
  const floor = typeof watermark === "number" && Number.isFinite(watermark) ? watermark : 0;
  const eligible = tasks
    .filter((task) => task.createdAt > floor && task.result?.trim() && task.prompt?.trim())
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, REJOIN_MAX_TASKS_PER_PACK);

  const handoffMessages: RejoinMessage[] = [];
  const taskIds: string[] = [];
  let chars = 0;
  let nextWatermark = floor;

  for (const task of eligible) {
    const pair: RejoinMessage[] = [
      { role: "user", content: task.prompt },
      { role: "assistant", content: task.result },
    ];
    const pairChars = pair.reduce((sum, message) => sum + message.content.length, 0);
    if (chars + pairChars > maxChars && handoffMessages.length) break;
    handoffMessages.push(...pair);
    taskIds.push(task.id);
    chars += pairChars;
    nextWatermark = Math.max(nextWatermark, task.createdAt);
  }

  return { handoffMessages, taskIds, nextWatermark };
}

export function formatRejoinHandoffBlock(messages: RejoinMessage[]): string {
  if (!messages.length) return "";
  return `Cloud/web continuation since this Mac last synced:\n${messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n")
    .slice(-REJOIN_HANDOFF_MAX_CHARS)}`;
}
