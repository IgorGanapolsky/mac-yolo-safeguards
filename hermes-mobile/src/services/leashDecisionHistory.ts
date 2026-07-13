import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local approve/deny history shared by BOTH approval surfaces:
 * - Leash tab GateApprovalCard (source: 'leash')
 * - Chat inline Approve/Deny bubbles (source: 'chat')
 *
 * The Leash tab renders this list so a decision made anywhere in the app
 * is visible in one place.
 */

const HISTORY_KEY = 'hermes-mobile:leash_decision_history';
export const LEASH_DECISION_HISTORY_LIMIT = 50;

export type LeashDecisionSource = 'chat' | 'leash';

export type LeashDecisionRecord = {
  /** Stable id of the approval that was resolved — used to dedupe double writes. */
  actionId: string;
  decision: 'approved' | 'denied';
  /** What the user was asked to approve — reason/title of the request. */
  title: string;
  command?: string;
  toolName?: string;
  source: LeashDecisionSource;
  /** ISO timestamp of the tap. */
  decidedAt: string;
};

function sanitizeRecord(raw: unknown): LeashDecisionRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Partial<LeashDecisionRecord>;
  if (
    typeof record.actionId !== 'string' ||
    !record.actionId ||
    (record.decision !== 'approved' && record.decision !== 'denied') ||
    typeof record.decidedAt !== 'string'
  ) {
    return null;
  }
  return {
    actionId: record.actionId,
    decision: record.decision,
    title: typeof record.title === 'string' ? record.title : '',
    command: typeof record.command === 'string' ? record.command : undefined,
    toolName: typeof record.toolName === 'string' ? record.toolName : undefined,
    source: record.source === 'chat' ? 'chat' : 'leash',
    decidedAt: record.decidedAt,
  };
}

export async function loadLeashDecisionHistory(
  limit: number = LEASH_DECISION_HISTORY_LIMIT,
): Promise<LeashDecisionRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(sanitizeRecord)
      .filter((record): record is LeashDecisionRecord => record !== null)
      .slice(0, limit);
  } catch (error) {
    console.error('[hermes-mobile] loadLeashDecisionHistory failed:', error);
    return [];
  }
}

export async function recordLeashDecision(
  record: Omit<LeashDecisionRecord, 'decidedAt'> & { decidedAt?: string },
): Promise<void> {
  if (!record.actionId) {
    return;
  }
  try {
    const existing = await loadLeashDecisionHistory();
    const entry: LeashDecisionRecord = {
      ...record,
      decidedAt: record.decidedAt ?? new Date().toISOString(),
    };
    const next = [
      entry,
      ...existing.filter((item) => item.actionId !== record.actionId),
    ].slice(0, LEASH_DECISION_HISTORY_LIMIT);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('[hermes-mobile] recordLeashDecision failed:', error);
  }
}

export async function clearLeashDecisionHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error('[hermes-mobile] clearLeashDecisionHistory failed:', error);
  }
}
