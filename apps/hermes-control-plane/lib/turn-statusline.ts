/**
 * Honest Turn Statusline for thumbgate.app.
 * Matches the Engine | TTFT | Cost chrome used on LLM turns.
 * Hosted Hermes is a fenced Fly VPS — never default to Mac localhost Ollama
 * and never claim SuperGrok unless that model is actually configured.
 */
import { HOSTED_PROVIDER_FALLBACK } from "./hosted-model-fallback.js";

/** Mac Ollama / loopback engines are not the hosted product. */
const BANNED_ENGINE_RE = /ollama|\b11434\b|127\.0\.0\.1/i;
const FENCED = { label: "Fenced VPS", model: "fly" };

export type TurnStatusInput = {
  providerLabel?: string | null;
  model?: string | null;
  modelHost?: string | null;
  ttftMs?: number | null;
  costUsd?: number | null;
};

export function labelForLiveModel(model?: string | null, host?: string | null): string {
  const m = String(model || "").toLowerCase();
  const h = String(host || "").toLowerCase();
  if (h.includes("googleapis") || m.includes("gemini")) return "Gemini";
  if (h.includes("together") || m.includes("together")) return "Together";
  if (h.includes("x.ai") || m.includes("grok")) return "SuperGrok";
  if (h.includes("z.ai") || m.includes("glm")) return "GLM";
  if (m.includes("deepseek")) return "DeepSeek";
  if (m.includes("poolside") || m.includes("laguna")) return "Poolside";
  if (m || h) return "Fenced VPS";
  return FENCED.label;
}

export function resolveHostedEngine(input: TurnStatusInput = {}): {
  label: string;
  model: string;
} {
  const rawLabel = (input.providerLabel ?? "").trim();
  const rawModel = (input.model ?? "").trim();
  const rawHost = (input.modelHost ?? "").trim();
  if (BANNED_ENGINE_RE.test(rawLabel) || BANNED_ENGINE_RE.test(rawModel)) {
    return { ...FENCED };
  }
  const needle = rawLabel.toLowerCase();
  const match = HOSTED_PROVIDER_FALLBACK.find((provider) => {
    const id = provider.id.toLowerCase();
    const label = provider.label.toLowerCase();
    return needle === id || needle === label;
  });
  if (match) {
    return { label: match.label, model: rawModel || match.model };
  }
  if (rawModel || rawHost) {
    return {
      label: labelForLiveModel(rawModel, rawHost),
      model: rawModel || FENCED.model,
    };
  }
  if (rawLabel) return { label: rawLabel, model: FENCED.model };
  return { ...FENCED };
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
