import * as Sentry from '@sentry/react-native';
import {
  __setSentryConfigForTesting,
  captureException,
  captureMessage,
  initCrashReporting,
  isCrashReportingEnabled,
  withCrashReporting,
} from '../services/telemetry';

const TEST_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

describe('telemetry', () => {
  beforeEach(() => {
    __setSentryConfigForTesting({ dsn: '', tracesSampleRate: 0.2 });
    jest.clearAllMocks();
  });

  afterEach(() => {
    __setSentryConfigForTesting({ dsn: '', tracesSampleRate: 0.2 });
    jest.clearAllMocks();
  });

  describe('initCrashReporting', () => {
    it('is a no-op when no DSN is configured', () => {
      initCrashReporting();
      expect(Sentry.init).not.toHaveBeenCalled();
      expect(isCrashReportingEnabled()).toBe(false);
    });

    it('initializes Sentry when a DSN is present', () => {
      __setSentryConfigForTesting({ dsn: TEST_DSN });
      initCrashReporting();

      expect(Sentry.init).toHaveBeenCalledTimes(1);
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: TEST_DSN,
          tracesSampleRate: 0.2,
          release: expect.stringMatching(/^hermes-mobile@/),
        }),
      );
      expect(isCrashReportingEnabled()).toBe(true);
    });

    it('does not re-initialize on repeated calls', () => {
      __setSentryConfigForTesting({ dsn: TEST_DSN });
      initCrashReporting();
      initCrashReporting();
      expect(Sentry.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('captureException', () => {
    it('is a no-op when crash reporting is disabled', () => {
      captureException(new Error('boom'));
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('forwards to Sentry with extra context when enabled', () => {
      __setSentryConfigForTesting({ dsn: TEST_DSN });
      initCrashReporting();
      const err = new Error('handled');
      captureException(err, { source: 'unit_test' });

      expect(Sentry.captureException).toHaveBeenCalledWith(err, {
        extra: { source: 'unit_test' },
      });
    });
  });

  describe('captureMessage', () => {
    it('is a no-op when crash reporting is disabled', () => {
      captureMessage('hello');
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('forwards to Sentry when enabled', () => {
      __setSentryConfigForTesting({ dsn: TEST_DSN });
      initCrashReporting();
      captureMessage('gateway offline', { retries: 3 });

      expect(Sentry.captureMessage).toHaveBeenCalledWith('gateway offline', {
        extra: { retries: 3 },
      });
    });
  });

  describe('withCrashReporting', () => {
    it('wraps the component via Sentry.wrap', () => {
      const Root = () => null;
      const wrapped = withCrashReporting(Root);
      expect(Sentry.wrap).toHaveBeenCalledWith(Root);
      expect(wrapped).toBe(Root);
    });
  });
});
