/**
 * self-healing-runtime.ts — Cloudflare Worker & Browser-Safe Self-Healing Runtime
 * Provides resilient execution, automatic error recovery, and graceful degradation.
 */

export interface HealingResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  healed: boolean;
  fallbackUsed: boolean;
  attempts: number;
}

export interface SelfHealingOptions<T> {
  maxRetries?: number;
  fallback?: () => T | Promise<T>;
  onHeal?: (error: Error, attempt: number) => void;
}

/**
 * Executes a function with automatic retry, backoff, and graceful fallback.
 */
export async function withSelfHealing<T>(
  taskName: string,
  taskFn: (attempt: number) => Promise<T> | T,
  options: SelfHealingOptions<T> = {}
): Promise<HealingResult<T>> {
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const data = await taskFn(attempt);
      return {
        ok: true,
        data,
        healed: attempt > 1,
        fallbackUsed: false,
        attempts: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (options.onHeal) {
        options.onHeal(lastError, attempt);
      }

      if (attempt < maxRetries) {
        const delayMs = Math.min(50 * Math.pow(2, attempt - 1), 500);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  // Attempt graceful fallback
  if (options.fallback) {
    try {
      const data = await options.fallback();
      return {
        ok: true,
        data,
        healed: false,
        fallbackUsed: true,
        attempts: attempt,
        error: lastError?.message,
      };
    } catch (fallbackErr) {
      return {
        ok: false,
        healed: false,
        fallbackUsed: true,
        attempts: attempt,
        error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      };
    }
  }

  return {
    ok: false,
    healed: false,
    fallbackUsed: false,
    attempts: attempt,
    error: lastError?.message ?? "Unknown execution failure",
  };
}
