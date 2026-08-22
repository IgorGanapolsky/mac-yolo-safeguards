/**
 * Honest Turn Statusline for thumbgate.app.
 * Matches the Engine | TTFT | Cost chrome used on LLM turns.
 * Hosted Hermes is a fenced VPS — never default to Mac localhost Ollama.
 */
import { HOSTED_PROVIDER_FALLBACK } from "./hosted-model-fallback.js";

const PRIMARY = HOSTED_PROVIDER_FALLBACK[0];
/** Mac Ollama / loopback engines are not the hosted product. */
const BANNED_ENGINE_RE = /ollama|\b11434\b|127\.0\.0\.1/i;

export type TurnStatusInput = {
  providerLabel?: string | null;
  model?: string | null;
  ttftMs?: number | null;
  costUsd?: number | null;
};

export function resolveHostedEngine(input: TurnStatusInput = {}): {
  label: string;
  model: string;
} {
  const rawLabel = (input.providerLabel ?? "").trim();
  const rawModel = (input.model ?? "").trim();
  if (BANNED_ENGINE_RE.test(rawLabel) || BANNED_ENGINE_RE.test(rawModel)) {
    return { label: PRIMARY.label, model: PRIMARY.model };
  }
  const needle = rawLabel.toLowerCase();
  const match = HOSTED_PROVIDER_FALLBACK.find((provider) => {
    const id = provider.id.toLowerCase();
    const label = provider.label.toLowerCase();
    return needle === id || needle === label;
  });
  return {
    label: match?.label || rawLabel || PRIMARY.label,
    model: rawModel || match?.model || PRIMARY.model,
  };
}

export function formatEngine(input: TurnStatusInput = {}): string {
  const { label, model } = resolveHostedEngine(input);
  return `Hosted Hermes · ${label} (${model})`;
}

export function formatTtft(ttftMs?: number | null): string {
  if (ttftMs == null || !Number.isFinite(ttftMs) || ttftMs < 0) return "unmeasured";
  if (ttftMs < 10) return "<10ms";
  if (ttftMs < 1000) return `${Math.round(ttftMs)}ms`;
  return `${(ttftMs / 1000).toFixed(1)}s`;
}

export function formatTurnCost(costUsd?: number | null): string {
  if (costUsd == null || !Number.isFinite(costUsd) || costUsd < 0) {
    return "$0.00 · included in $10/mo";
  }
  if (costUsd === 0) return "$0.00";
  if (costUsd < 0.01) return "<$0.01";
  return `$${costUsd.toFixed(2)}`;
}

export function formatTurnStatusline(input: TurnStatusInput = {}): {
  engine: string;
  ttft: string;
  cost: string;
  line: string;
} {
  const engine = formatEngine(input);
  const ttft = formatTtft(input.ttftMs);
  const cost = formatTurnCost(input.costUsd);
  return {
    engine,
    ttft,
    cost,
    line: `Turn Statusline | Engine: ${engine} | TTFT: ${ttft} | Cost: ${cost}`,
  };
}
