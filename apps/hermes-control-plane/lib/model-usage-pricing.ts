/** Default rates when env does not override (USD per 1M tokens). Conservative mid-tier. */
const DEFAULT_INPUT_PER_1M = 0.15;
const DEFAULT_OUTPUT_PER_1M = 0.6;

function envRate(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Estimate USD micros (USD * 1e6) for a completion. Overridable via:
 *   MODEL_PRICE_INPUT_USD_PER_1M
 *   MODEL_PRICE_OUTPUT_USD_PER_1M
 */
export function estimateUsageUsdMicros(input: {
  promptTokens: number;
  completionTokens: number;
}): number {
  const inPer1M = envRate("MODEL_PRICE_INPUT_USD_PER_1M", DEFAULT_INPUT_PER_1M);
  const outPer1M = envRate("MODEL_PRICE_OUTPUT_USD_PER_1M", DEFAULT_OUTPUT_PER_1M);
  const prompt = Math.max(0, Math.floor(input.promptTokens));
  const completion = Math.max(0, Math.floor(input.completionTokens));
  const usd = (prompt / 1_000_000) * inPer1M + (completion / 1_000_000) * outPer1M;
  return Math.max(0, Math.round(usd * 1_000_000));
}

export function microsToUsd(micros: number): number {
  return Math.round((micros / 1_000_000) * 1_000_000) / 1_000_000;
}
