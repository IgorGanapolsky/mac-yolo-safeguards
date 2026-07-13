import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __setPosthogConfigForTesting,
  buildCrashRecord,
  captureCrash,
  clearCrashQueue,
  enqueueCrash,
  flushCrashQueue,
  getCrashQueue,
  installGlobalCrashHandler,
} from '../services/crashReporting';
import { __setShouldReportToPostHogForTesting } from '../services/productAnalytics';

const QUEUE_KEY = 'hermes-mobile:crash_queue';
const originalFetch = global.fetch;

describe('crashReporting', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    __setPosthogConfigForTesting({ host: 'https://us.i.posthog.com', key: '' });
    // Allow PostHog capture environment for flush tests (prod-only gate).
    __setShouldReportToPostHogForTesting(true);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    __setPosthogConfigForTesting({ host: 'https://us.i.posthog.com', key: '' });
    __setShouldReportToPostHogForTesting(null);
  });

  describe('buildCrashRecord', () => {
    it('builds a record from an Error with message and stack', () => {
      const err = new Error('boom');
      const record = buildCrashRecord('ui_crash', err);
      expect(record.event).toBe('ui_crash');
      expect(record.message).toBe('boom');
      expect(record.stack).toContain('Error: boom');
      expect(record.id).toMatch(/^crash_\d+_/);
      expect(record.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('falls back to String for non-Error throwables', () => {
      const record = buildCrashRecord('js_fatal_crash', 'string error');
      expect(record.message).toBe('string error');
      expect(record.stack).toBeUndefined();
    });

    it('includes optional component_stack', () => {
      const record = buildCrashRecord('ui_crash', new Error('x'), {
        component_stack: 'in Component',
      });
      expect(record.component_stack).toBe('in Component');
    });
  });

  describe('queue persistence', () => {
    it('enqueueCrash persists a record to AsyncStorage', async () => {
      const record = buildCrashRecord('ui_crash', new Error('a'));
      await enqueueCrash(record);
      const queue = await getCrashQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].message).toBe('a');
    });

    it('captureCrash builds and persists in one call', async () => {
      await captureCrash('js_fatal_crash', new Error('captured'));
      const queue = await getCrashQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].event).toBe('js_fatal_crash');
      expect(queue[0].message).toBe('captured');
    });

    it('getCrashQueue returns [] when storage is empty', async () => {
      expect(await getCrashQueue()).toEqual([]);
    });

    it('getCrashQueue tolerates corrupt JSON', async () => {
      await AsyncStorage.setItem(QUEUE_KEY, '{not json');
      expect(await getCrashQueue()).toEqual([]);
    });

    it('queue is bounded to MAX_QUEUE (25)', async () => {
      for (let i = 0; i < 30; i++) {
        await captureCrash('ui_crash', new Error(`e${i}`));
      }
      const queue = await getCrashQueue();
      expect(queue).toHaveLength(25);
      // Oldest dropped; newest retained.
      expect(queue[0].message).toBe('e5');
      expect(queue[24].message).toBe('e29');
    });

    it('clearCrashQueue empties the queue', async () => {
      await captureCrash('ui_crash', new Error('x'));
      await clearCrashQueue();
      expect(await getCrashQueue()).toEqual([]);
    });
  });

  describe('flushCrashQueue', () => {
    it('flushes nothing when the queue is empty', async () => {
      const result = await flushCrashQueue();
      expect(result).toEqual({ flushed: 0, retained: 0 });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('flushes and clears on success when a PostHog key is configured', async () => {
      __setPosthogConfigForTesting({ key: 'phc_test_key' });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await captureCrash('ui_crash', new Error('will flush'));
      const result = await flushCrashQueue();

      expect(result.flushed).toBe(1);
      expect(result.retained).toBe(0);
      expect(await getCrashQueue()).toEqual([]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.api_key).toBe('phc_test_key');
      expect(body.event).toBe('ui_crash');
    });

    it('retains crashes on network failure for the next launch', async () => {
      __setPosthogConfigForTesting({ key: 'phc_test_key' });
      (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

      await captureCrash('ui_crash', new Error('offline crash'));
      const result = await flushCrashQueue();

      expect(result.flushed).toBe(0);
      expect(result.retained).toBe(1);
      const retained = await getCrashQueue();
      expect(retained).toHaveLength(1);
      expect(retained[0].message).toBe('offline crash');
    });

    it('retains crashes on non-2xx response', async () => {
      __setPosthogConfigForTesting({ key: 'phc_test_key' });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

      await captureCrash('ui_crash', new Error('server error'));
      const result = await flushCrashQueue();
      expect(result.flushed).toBe(0);
      expect(result.retained).toBe(1);
    });

    it('clears the queue without sending when no PostHog key is configured', async () => {
      // Default: no key configured
      await captureCrash('ui_crash', new Error('no key'));
      const result = await flushCrashQueue();
      expect(result).toEqual({ flushed: 0, retained: 0 });
      expect(await getCrashQueue()).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('clears the queue without sending when capture environment is gated off', async () => {
      __setPosthogConfigForTesting({ key: 'phc_test_key' });
      __setShouldReportToPostHogForTesting(false);
      await captureCrash('ui_crash', new Error('dogfood'));
      const result = await flushCrashQueue();
      expect(result).toEqual({ flushed: 0, retained: 0 });
      expect(await getCrashQueue()).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('installGlobalCrashHandler', () => {
    type Handler = (error: unknown, isFatal?: boolean) => void;

    function makeErrorUtils() {
      let current: Handler | undefined;
      return {
        getGlobalHandler: jest.fn(() => current),
        setGlobalHandler: jest.fn((h: Handler) => {
          current = h;
        }),
      };
    }

    afterEach(() => {
      const g = globalThis as { ErrorUtils?: unknown };
      delete g.ErrorUtils;
    });

    it('installs a handler that persists the crash and chains the previous one', async () => {
      const utils = makeErrorUtils();
      const previous: Handler = jest.fn();
      utils.getGlobalHandler.mockReturnValue(previous);
      (globalThis as { ErrorUtils?: typeof utils }).ErrorUtils = utils;

      installGlobalCrashHandler();
      expect(utils.setGlobalHandler).toHaveBeenCalledTimes(1);
      const installed = utils.setGlobalHandler.mock.calls[0][0] as Handler;

      await installed(new Error('fatal'), true);

      const queue = await getCrashQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].event).toBe('js_fatal_crash');
      expect(queue[0].message).toBe('fatal');
      expect(previous).toHaveBeenCalledWith(expect.any(Error), true);
    });

    it('is a no-op when ErrorUtils is absent', () => {
      const g = globalThis as { ErrorUtils?: unknown };
      delete g.ErrorUtils;
      expect(() => installGlobalCrashHandler()).not.toThrow();
    });
  });

  // Isolated last: the spy on AsyncStorage.getItem corrupts the
  // async-storage-mock's internal state for subsequent reads in the file.
  describe('resilience', () => {
    it('enqueueCrash does not throw when AsyncStorage fails', async () => {
      const spy = jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValue(new Error('storage down'));
      await expect(
        enqueueCrash(buildCrashRecord('ui_crash', new Error('x'))),
      ).resolves.toBeUndefined();
      spy.mockRestore();
    });
  });
});
