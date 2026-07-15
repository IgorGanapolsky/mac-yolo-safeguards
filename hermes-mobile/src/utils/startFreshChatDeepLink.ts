/**
 * One-shot intent for hermes://chat?fresh=1 and hermes://new-chat.
 * Agents (adb) use this to clear poisoned mega/stalled sessions — same as UI "Start fresh chat".
 */

type Listener = () => void;

let pendingStartFreshChat = false;
const listeners = new Set<Listener>();

export function requestStartFreshChat(): void {
  pendingStartFreshChat = true;
  for (const listener of [...listeners]) {
    listener();
  }
}

export function consumeStartFreshChatRequest(): boolean {
  const pending = pendingStartFreshChat;
  pendingStartFreshChat = false;
  return pending;
}

export function subscribeStartFreshChatRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — clears pending flag + subscribers. */
export function resetStartFreshChatDeepLinkState(): void {
  pendingStartFreshChat = false;
  listeners.clear();
}
