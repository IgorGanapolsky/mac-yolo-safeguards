/**
 * Hosted Hermes provider fallback (TrueFoundry-style order, not the product).
 *
 * Explicit lock: SuperGrok → DeepSeek free → Poolside.
 * A quota miss or stale FAILED row on the first provider is failover.
 * It is not "the VPS is dead".
 *
 * Named `gateway-budget` reuses spend=0: when spend is not approved,
 * fail closed — do not claim live, do not keep calling a dead route.
 *
 * Refuse: MCP Gateway product, OTel/Grafana export, GPU cluster,
 * TrueForge OSS harness, virtual models, semantic cache, $499 Pro,
 * air-gapped VPC, Team seats, Tavily, generative UI.
 */

export const HOSTED_PROVIDER_FALLBACK = Object.freeze([
  { id: "supergrok", label: "SuperGrok", model: "grok-4.5" },
  { id: "deepseek-free", label: "DeepSeek free", model: "deepseek-v4-flash" },
  { id: "poolside", label: "Poolside", model: "poolside/laguna-s-2.1" },
]);

export const GATEWAY_BUDGET = "gateway-budget";

const GENERIC_IDENTITIES = new Set([
  "",
  "shared",
  "generic",
  "default",
  "unknown",
  "shared-account",
  "shared_account",
  "sharedaccount",
]);

const FAILED_ROW_RE = /\bFAILED\b|status["']?\s*[:=]\s*["']?failed\b/i;
const QUOTA_RE = /Weekly\/Monthly Limit Exhausted|quota is exhausted|code 1310|temporarily overloaded|Hosted model quota/i;

export function isQuotaOrFailedRow(text) {
  const value = String(text ?? "");
  return QUOTA_RE.test(value) || FAILED_ROW_RE.test(value);
}

export function inferFailedProvider(text) {
  const raw = String(text ?? "").toLowerCase();
  if (/deepseek/.test(raw)) return "deepseek-free";
  if (/poolside|laguna/.test(raw)) return "poolside";
  if (/supergrok|grok-4|grok\.com|grok-yolo|\bgrok\b/.test(raw)) return "supergrok";
  // Stale FAILED row without a provider name → first hop, not a dead VPS.
  return "supergrok";
}

/**
 * Pick the next explicit provider. Quota/FAILED on hop 1 fails over.
 * Never reports vpsDead=true for a provider miss.
 */
export function resolveHostedFallback(input = {}) {
  const lastError = input.lastError ?? input.error ?? null;
  const failedIds = new Set(
    Array.isArray(input.failedProviders) ? input.failedProviders.map(String) : [],
  );
  if (lastError && isQuotaOrFailedRow(lastError)) {
    failedIds.add(inferFailedProvider(lastError));
  }
  const remaining = HOSTED_PROVIDER_FALLBACK.filter((provider) => !failedIds.has(provider.id));
  const selected = remaining[0] ?? null;
  const failover = failedIds.size > 0 && selected != null;
  return {
    order: HOSTED_PROVIDER_FALLBACK.map((provider) => provider.id),
    failedProviders: [...failedIds],
    selected,
    failover,
    modelAlive: selected != null,
    vpsDead: false,
    exhausted: selected == null,
  };
}

/** Named gateway-budget: spend=0 or an explicit approval. Otherwise fail closed. */
export function gatewayBudgetApproved(input = {}) {
  const spendUsd = Number(input.spendUsd);
  const spend = Number.isFinite(spendUsd) ? spendUsd : 0;
  return spend === 0 || input.spendApproved === true;
}

/** Never attribute work to a generic shared account. */
export function namedRunnerIdentity(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (GENERIC_IDENTITIES.has(raw.toLowerCase())) return null;
  return raw;
}

/**
 * Resolve a named runner identity.
 * Explicit empty/generic fails closed.
 * When omitted, use HERMES_CLOUD_RUNNER_IDENTITY or the runner URL host.
 */
export function resolveNamedRunnerIdentity(input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, "runnerIdentity")) {
    const explicit = namedRunnerIdentity(input.runnerIdentity);
    if (explicit) return explicit;
    const raw = input.runnerIdentity;
    if (raw != null && String(raw).trim() !== "") return null;
    if (raw === "") return null;
    // undefined / null with the key present: fall through to env/URL.
  }
  const envName = typeof process !== "undefined"
    ? namedRunnerIdentity(process.env?.HERMES_CLOUD_RUNNER_IDENTITY)
    : null;
  if (envName) return envName;
  const url = String(
    input.runnerHealthUrl
      || (typeof process !== "undefined" ? process.env?.HERMES_CLOUD_RUNNER_HEALTH_URL : "")
      || "https://igor-hermes-cloud-runner.fly.dev/health",
  );
  try {
    const host = new URL(url).hostname.split(".")[0];
    return namedRunnerIdentity(host);
  } catch {
    return null;
  }
}

export function shouldKeepCallingRoute(input = {}) {
  if (!gatewayBudgetApproved(input)) return false;
  const route = resolveHostedFallback(input);
  if (route.exhausted) return false;
  if (input.turningOn === true) return false;
  if (!resolveNamedRunnerIdentity(input)) return false;
  return true;
}
