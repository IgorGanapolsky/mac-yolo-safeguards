import { ThumbgateApiError } from '../services/thumbgateClient';
import {
  CLOUD_MEMORY_SAVED_NOTE,
  formatCloudMemoryCaptureFailure,
  formatCloudMemorySkipNote,
} from '../utils/thumbgateConsumerCopy';

describe('thumbgateConsumerCopy', () => {
  it('uses cloud memory wording for success', () => {
    expect(CLOUD_MEMORY_SAVED_NOTE).toBe('Saved to cloud memory');
    expect(CLOUD_MEMORY_SAVED_NOTE.toLowerCase()).not.toContain('install');
    expect(CLOUD_MEMORY_SAVED_NOTE.toLowerCase()).not.toContain('thumbgate app');
  });

  it('explains skip reasons without generic "Not recorded"', () => {
    expect(formatCloudMemorySkipNote('leash_locked')).toMatch(/Leash Pro/i);
    expect(formatCloudMemorySkipNote('capture_disabled')).toMatch(/memory capture is off/i);
  });

  it('prompts pairing when no API key is present', () => {
    expect(
      formatCloudMemoryCaptureFailure(new Error('ignored'), { hasApiKey: false }),
    ).toBe('Not saved — pair your Mac to enable memory sync');
  });

  it('maps 401 to invalid key copy', () => {
    expect(
      formatCloudMemoryCaptureFailure(new ThumbgateApiError(401, 'Unauthorized'), {
        hasApiKey: true,
      }),
    ).toMatch(/invalid.*Pair your Mac again/i);
  });

  it('maps network failures to connection copy', () => {
    expect(
      formatCloudMemoryCaptureFailure(new TypeError('Network request failed'), {
        hasApiKey: true,
      }),
    ).toMatch(/can't reach cloud memory/i);
  });

  it('includes API detail for other HTTP errors', () => {
    expect(
      formatCloudMemoryCaptureFailure(new ThumbgateApiError(503, 'Service unavailable'), {
        hasApiKey: true,
      }),
    ).toBe('Not saved — Service unavailable');
  });
});
