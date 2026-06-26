import { stopRun } from '../services/hermesGatewayClient';
import { isSessionInUseError } from './chatErrors';

const SESSION_RECOVERY_DELAY_MS = 900;
const SESSION_IN_USE_RETRY_DELAY_MS = 1500;
const SESSION_IN_USE_MAX_ATTEMPTS = 4;

export async function releaseMacOperatorSlot(
  gatewayUrl: string,
  apiKey: string | null | undefined,
  runIds: string[],
): Promise<void> {
  const unique = [...new Set(runIds.map((id) => id.trim()).filter(Boolean))];
  for (const runId of unique) {
    try {
      await stopRun(gatewayUrl, runId, apiKey);
    } catch {
      // best effort — Mac may already be idle
    }
  }
  if (unique.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, SESSION_RECOVERY_DELAY_MS));
  }
}

export async function retryOnSessionInUse<T>(
  gatewayUrl: string,
  apiKey: string | null | undefined,
  runIds: string[],
  fn: () => Promise<T>,
  onWaiting?: () => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SESSION_IN_USE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isSessionInUseError(error) || attempt >= SESSION_IN_USE_MAX_ATTEMPTS - 1) {
        throw error;
      }
      onWaiting?.();
      await releaseMacOperatorSlot(gatewayUrl, apiKey, runIds);
      await new Promise((resolve) => setTimeout(resolve, SESSION_IN_USE_RETRY_DELAY_MS));
    }
  }
  throw lastError;
}
