import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LEASH_DECISION_HISTORY_LIMIT,
  clearLeashDecisionHistory,
  loadLeashDecisionHistory,
  recordLeashDecision,
} from '../services/leashDecisionHistory';

const HISTORY_KEY = 'hermes-mobile:leash_decision_history';

describe('leashDecisionHistory', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('records a decision and reads it back newest-first', async () => {
    await recordLeashDecision({
      actionId: 'a-1',
      decision: 'approved',
      title: 'Proceed with these steps',
      source: 'chat',
    });
    await recordLeashDecision({
      actionId: 'a-2',
      decision: 'denied',
      title: 'rm -rf /tmp/x',
      command: 'rm -rf /tmp/x',
      toolName: 'run_command',
      source: 'leash',
    });

    const history = await loadLeashDecisionHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      actionId: 'a-2',
      decision: 'denied',
      source: 'leash',
      command: 'rm -rf /tmp/x',
    });
    expect(history[1]).toMatchObject({
      actionId: 'a-1',
      decision: 'approved',
      source: 'chat',
      title: 'Proceed with these steps',
    });
    expect(typeof history[0].decidedAt).toBe('string');
  });

  it('dedupes by actionId so a double write keeps one entry', async () => {
    await recordLeashDecision({
      actionId: 'dup-1',
      decision: 'approved',
      title: 'From Leash press handler',
      source: 'leash',
    });
    await recordLeashDecision({
      actionId: 'dup-1',
      decision: 'approved',
      title: 'From resolver funnel',
      source: 'leash',
    });

    const history = await loadLeashDecisionHistory();
    expect(history).toHaveLength(1);
    expect(history[0].title).toBe('From resolver funnel');
  });

  it('serializes concurrent decisions so Chat and Leash writes cannot overwrite each other', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        recordLeashDecision({
          actionId: `concurrent-${index}`,
          decision: index % 2 === 0 ? 'approved' : 'denied',
          title: `Concurrent action ${index}`,
          source: index % 2 === 0 ? 'chat' : 'leash',
          decidedAt: new Date(Date.UTC(2026, 6, 21, 19, 0, index)).toISOString(),
        }),
      ),
    );

    const history = await loadLeashDecisionHistory();
    expect(history).toHaveLength(20);
    expect(new Set(history.map((record) => record.actionId)).size).toBe(20);
  });

  it('caps history at the limit', async () => {
    for (let i = 0; i < LEASH_DECISION_HISTORY_LIMIT + 5; i += 1) {
      await recordLeashDecision({
        actionId: `cap-${i}`,
        decision: 'approved',
        title: `Action ${i}`,
        source: 'chat',
      });
    }
    const history = await loadLeashDecisionHistory();
    expect(history).toHaveLength(LEASH_DECISION_HISTORY_LIMIT);
    expect(history[0].actionId).toBe(`cap-${LEASH_DECISION_HISTORY_LIMIT + 4}`);
  });

  it('ignores records without an actionId', async () => {
    await recordLeashDecision({
      actionId: '',
      decision: 'approved',
      title: 'no id',
      source: 'chat',
    });
    expect(await loadLeashDecisionHistory()).toHaveLength(0);
  });

  it('survives corrupt stored JSON', async () => {
    await AsyncStorage.setItem(HISTORY_KEY, '{not json');
    expect(await loadLeashDecisionHistory()).toEqual([]);

    await AsyncStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ bogus: true }, null, 'string']),
    );
    expect(await loadLeashDecisionHistory()).toEqual([]);
  });

  it('clears history', async () => {
    await recordLeashDecision({
      actionId: 'c-1',
      decision: 'denied',
      title: 'x',
      source: 'leash',
    });
    await clearLeashDecisionHistory();
    expect(await loadLeashDecisionHistory()).toEqual([]);
  });
});
