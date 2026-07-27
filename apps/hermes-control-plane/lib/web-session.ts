export function webSessionIdForThread(threadId: string): string {
  const safeThreadId = threadId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120);
  if (!safeThreadId) throw new Error("Cannot bind a Hermes session without a valid thread ID");
  return `thumbgate_${safeThreadId}`;
}
