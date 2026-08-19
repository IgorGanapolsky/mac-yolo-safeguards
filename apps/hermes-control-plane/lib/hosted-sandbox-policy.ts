/**
 * Hosted Hermes sandbox / analytics policy.
 * Isolated fenced VPS. The idle laptop is not the runtime.
 * Credentials never appear on public receipts or client-visible health.
 * recoveredRun is the public metric — not sandbox-create counts.
 *
 * Do not steal: OpenClaw, Eigent, E2B, Cua/trycua, "perplexity computer",
 * Agent S, a 20-model supervisor, or Telegram as an approval surface.
 */

export const runtimeIsLaptop = false as const;
export const cursorHijack = false as const;
export const PUBLIC_METRIC = "recoveredRun" as const;

export const DO_NOT_STEAL = Object.freeze([
  "openclaw",
  "eigent",
  "e2b",
  "trycua",
  "perplexity computer",
]);

export const REFUSE_STEALS = Object.freeze([
  "openclaw install",
  "eigent desktop",
  "e2b desktop sandbox",
  "cua drivers",
  "agent s",
  "20-model supervisor",
  "telegram gateway",
]);

const SECRET_FIELD =
  /^(authorization|token|access_token|refresh_token|api[_-]?key|secret|password|passwd|credential|bearer|cookie|set-cookie|openai_api_key|anthropic_api_key|stripe_secret|x-api-key|x_api_key)$/i;
const SECRET_VALUE = /^(sk-|rk-|pk_live_|pk_test_|ghp_|github_pat_|xox[baprs]-|Bearer\s+)/i;
const HOST_MOUSE_RE = /\b(xdotool|cliclick)\b/i;
const OSA_MOUSE_RE = /osascript[\s\S]{0,120}mouse/i;

function stripSecrets(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return SECRET_VALUE.test(value) ? "[redacted]" : value;
  }
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD.test(key)) continue;
      out[key] = stripSecrets(nested);
    }
    return out;
  }
  return value;
}

export function publicRunReceipt(input: Record<string, unknown> = {}):
  | {
      ok: true;
      taskId: string;
      route: string;
      status: string;
      sourceOfTruth: "hosted-vps";
      metric: typeof PUBLIC_METRIC;
      runtimeIsLaptop: false;
      cursorHijack: false;
    }
  | { ok: false; reason: "not_persisted" } {
  const taskId = String(input.taskId ?? "").trim();
  if (!taskId) return { ok: false, reason: "not_persisted" };
  const safe = stripSecrets({
    route: input.route,
    status: input.status,
  }) as { route?: unknown; status?: unknown };
  return {
    ok: true,
    taskId,
    route: String(safe.route ?? "cloud").trim() || "cloud",
    status: String(safe.status ?? "pending").trim() || "pending",
    sourceOfTruth: "hosted-vps",
    metric: PUBLIC_METRIC,
    runtimeIsLaptop: false,
    cursorHijack: false,
  };
}

export function clientVisibleHealth(input: {
  runnerTrust?: string | null;
  modelTrust?: string | null;
  turningOn?: boolean;
  token?: string;
  apiKey?: string;
  authorization?: string;
} = {}): {
  turningOn: boolean;
  advertisePaid: boolean;
  runtimeIsLaptop: false;
  cursorHijack: false;
  metric: typeof PUBLIC_METRIC;
} {
  const turningOn =
    input.turningOn === true
    || input.runnerTrust !== "verified"
    || input.modelTrust !== "verified";
  return {
    turningOn,
    advertisePaid: turningOn
      ? false
      : input.runnerTrust === "verified" && input.modelTrust === "verified",
    runtimeIsLaptop: false,
    cursorHijack: false,
    metric: PUBLIC_METRIC,
  };
}

export function denyHostMouse(input: {
  command?: string | null;
  target?: "user-machine" | "hosted-vps" | string | null;
} = {}): { allowed: boolean; cursorHijack: false; reason?: "host_mouse_denied" } {
  const command = String(input.command ?? "");
  const isMouse = HOST_MOUSE_RE.test(command) || OSA_MOUSE_RE.test(command);
  const onUserMachine = input.target !== "hosted-vps";
  if (isMouse && onUserMachine) {
    return { allowed: false, cursorHijack: false, reason: "host_mouse_denied" };
  }
  return { allowed: true, cursorHijack: false };
}

export function refuseProductSteal(intent: string):
  | { allowed: false; reason: "do_not_steal"; item: string }
  | { allowed: true } {
  const text = String(intent ?? "").trim().toLowerCase();
  for (const item of [...DO_NOT_STEAL, ...REFUSE_STEALS]) {
    if (text.includes(item)) {
      return { allowed: false, reason: "do_not_steal", item };
    }
  }
  return { allowed: true };
}

export function publicHostedMetric(): { metric: typeof PUBLIC_METRIC } {
  return { metric: PUBLIC_METRIC };
}
