/**
 * Hosted agentic watt — NVIDIA AgentX process steal for thumbgate.app.
 * Keep in lockstep with tools/hosted-agentic-watt.js.
 * Not Vera Rubin, AgentX, Dynamo, NVL72, or NVIDIA megawatt numbers.
 */

export const HOSTED_AGENTIC_WATT_SCHEMA = "hosted-agentic-watt/v1";
export const HOSTED_VPS_WATT_PROXY = 15;
export const DEFAULT_SLA_E2E_MS = 90_000;
export const DEPLOY_SHA_RE = /^[0-9a-f]{40}$/;
const PLACEHOLDER_SHA_RE = /^(.)\1{39}$/;
const NVIDIA_FACTORY_RE =
  /\b(vera rubin|blackwell|gb300|h200|nvl72|nvl8|agentx|inferencex|aiperf|nvidia dynamo|tensorrt-llm|nvlink|tokens? per megawatt|ai-factory)\b/i;
const VENDOR_PROMO_RE =
  /developer\.nvidia\.com|inferencex\.semianalysis|vera rubin|nvl72|agentx|nvidia dynamo/i;

export type SessionClass = "chat" | "agentic" | "nvidia_factory";

export type HostedWattTurn = {
  promptTokens?: number;
  outputTokens?: number;
  ttftMs?: number;
  e2eMs?: number;
  toolGapMs?: number;
  hasToolCall?: boolean;
};

export type HostedWattInput = {
  claimedClass?: string;
  class?: string;
  kind?: string;
  prompt?: string;
  text?: string;
  blogUrl?: string;
  talkUrl?: string;
  turns?: HostedWattTurn[];
  leaseSeconds?: number;
  vpsWatts?: number;
  slaE2eMs?: number;
  claimedTokensPerMegawatt?: number;
  nvidiaMw?: number;
  evalArtifact?: string;
  researchArtifact?: string;
  deploySha?: string;
  testsPass?: boolean;
  workerLive?: boolean;
};

export type NormalizedTurn = {
  index: number;
  promptTokens: number;
  outputTokens: number;
  ttftMs: number;
  toolGapMs: number;
  decodeMs: number;
  e2eMs: number;
  hasToolCall: boolean;
};

export function isTrueFlag(value: unknown): boolean {
  return value === true;
}

function isVendorPromo(value: string | undefined): boolean {
  return VENDOR_PROMO_RE.test(String(value || ""));
}

function isNvidiaFactoryClaim(value: string | undefined): boolean {
  return NVIDIA_FACTORY_RE.test(String(value || ""));
}

function isPlaceholderSha(sha: string): boolean {
  return PLACEHOLDER_SHA_RE.test(sha);
}

function isSafeRepoPath(artifact: string): boolean {
  if (!artifact || artifact.includes("\0")) return false;
  if (artifact.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(artifact)) return false;
  const parts = artifact.split(/[\\/]/);
  if (parts.some((part) => part === ".." || part === "")) return false;
  return true;
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeTurns(input: HostedWattInput = {}): NormalizedTurn[] {
  const raw = input.turns || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((turn, index) => {
    const ttftMs = Math.max(0, num(turn.ttftMs, 0));
    const toolGapMs = Math.max(0, num(turn.toolGapMs, 0));
    const e2eIn = Math.max(0, num(turn.e2eMs, 0));
    const e2eMs = Math.max(e2eIn, ttftMs + toolGapMs);
    return {
      index,
      promptTokens: Math.max(0, Math.floor(num(turn.promptTokens, 0))),
      outputTokens: Math.max(0, Math.floor(num(turn.outputTokens, 0))),
      ttftMs,
      toolGapMs,
      decodeMs: Math.max(0, e2eMs - ttftMs - toolGapMs),
      e2eMs,
      hasToolCall: Boolean(turn.hasToolCall || toolGapMs > 0),
    };
  });
}

export function classifySession(
  input: HostedWattInput = {},
  turns: Array<{ promptTokens: number; hasToolCall: boolean }>,
): { class: SessionClass; offered: boolean; reason: string; liveClaim: false } {
  const claimed = String(input.claimedClass || input.class || input.kind || "")
    .toLowerCase()
    .trim();
  const prompt = String(input.prompt || input.text || input.blogUrl || "");
  if (
    isNvidiaFactoryClaim(claimed) ||
    isNvidiaFactoryClaim(prompt) ||
    Number.isFinite(Number(input.claimedTokensPerMegawatt)) ||
    Number.isFinite(Number(input.nvidiaMw))
  ) {
    return {
      class: "nvidia_factory",
      offered: false,
      reason: "nvidia_factory_not_offered",
      liveClaim: false,
    };
  }
  const tools = turns.filter((t) => t.hasToolCall).length;
  const growing =
    turns.length >= 2 && turns[turns.length - 1].promptTokens > turns[0].promptTokens;
  if (claimed === "agentic" || tools > 0 || growing) {
    return {
      class: "agentic",
      offered: true,
      reason: tools > 0 ? "tool_calls" : growing ? "growing_context" : "claimed_agentic",
      liveClaim: false,
    };
  }
  return {
    class: "chat",
    offered: true,
    reason: claimed === "chat" || !claimed ? "chat" : "default_chat",
    liveClaim: false,
  };
}

export function contextReuse(turns: NormalizedTurn[]) {
  let reusedPromptTokens = 0;
  let billedPrefillTokens = 0;
  for (let i = 0; i < turns.length; i += 1) {
    const prompt = turns[i].promptTokens;
    if (i === 0) {
      billedPrefillTokens += prompt;
      continue;
    }
    const overlap = Math.min(turns[i - 1].promptTokens, prompt);
    reusedPromptTokens += overlap;
    billedPrefillTokens += Math.max(0, prompt - overlap);
  }
  return { reusedPromptTokens, billedPrefillTokens };
}

function splitSessionLatency(turns: NormalizedTurn[]) {
  const ttftMs = turns.reduce((s, t) => s + t.ttftMs, 0);
  const toolGapMs = turns.reduce((s, t) => s + t.toolGapMs, 0);
  const decodeMs = turns.reduce((s, t) => s + t.decodeMs, 0);
  const e2eMs = turns.reduce((s, t) => s + t.e2eMs, 0);
  const outputTokens = turns.reduce((s, t) => s + t.outputTokens, 0);
  const e2eSec = e2eMs / 1000;
  const decodeSec = decodeMs / 1000;
  return {
    ttftMs,
    toolGapMs,
    decodeMs,
    e2eMs,
    outputTokens,
    e2eInteractivityTps: e2eSec > 0 ? outputTokens / e2eSec : 0,
    decodeInteractivityTps: decodeSec > 0 ? outputTokens / decodeSec : 0,
    maxTurnE2eMs: turns.reduce((m, t) => Math.max(m, t.e2eMs), 0),
  };
}

function wattProxy(
  input: HostedWattInput,
  latency: { e2eMs: number; outputTokens: number },
) {
  const watts = Math.max(0.1, num(input.vpsWatts, HOSTED_VPS_WATT_PROXY));
  const leaseSeconds = Math.max(
    latency.e2eMs / 1000,
    num(input.leaseSeconds, latency.e2eMs / 1000),
  );
  const wattHours = (watts * leaseSeconds) / 3600;
  return {
    watts,
    leaseSeconds,
    wattHours,
    outputTokens: latency.outputTokens,
    tokensPerWattHour: wattHours > 0 ? latency.outputTokens / wattHours : 0,
    unit: "tokens_per_watt_hour_vps_proxy" as const,
    notTokensPerMegawatt: true as const,
  };
}

export function researchToProduction(input: HostedWattInput = {}) {
  const artifact = String(input.evalArtifact || input.researchArtifact || "").trim();
  const sha = String(input.deploySha || "").trim();
  const testsPass = isTrueFlag(input.testsPass);
  const blog = String(input.blogUrl || input.talkUrl || "").trim();
  if (isVendorPromo(artifact) || isVendorPromo(blog)) {
    return {
      ok: false,
      reason: blog && !artifact ? "talk_is_not_production" : "vendor_blog_is_not_receipt",
      liveClaim: false as const,
    };
  }
  if (blog && !artifact) {
    return { ok: false, reason: "talk_is_not_production", liveClaim: false as const };
  }
  if (!artifact) {
    return { ok: false, reason: "eval_artifact_missing", liveClaim: false as const };
  }
  if (/^https?:\/\//i.test(artifact)) {
    return { ok: false, reason: "url_is_not_eval_artifact", liveClaim: false as const };
  }
  if (!isSafeRepoPath(artifact)) {
    return { ok: false, reason: "eval_artifact_unsafe_path", liveClaim: false as const };
  }
  if (!DEPLOY_SHA_RE.test(sha)) {
    return { ok: false, reason: "deploy_sha_missing", liveClaim: false as const };
  }
  if (isPlaceholderSha(sha)) {
    return {
      ok: false,
      reason: "deploy_sha_placeholder",
      liveClaim: false as const,
      artifact,
      deploySha: sha,
    };
  }
  if (!testsPass) {
    return {
      ok: false,
      reason: "tests_not_pass",
      liveClaim: false as const,
      artifact,
      deploySha: sha,
    };
  }
  return { ok: true, reason: "ok", liveClaim: false as const, artifact, deploySha: sha };
}

export type HostedWattGrade = {
  schema: typeof HOSTED_AGENTIC_WATT_SCHEMA;
  clonedVeraRubin: false;
  clonedAgentX: false;
  clonedDynamo: false;
  nvidiaMegawattClaim: false;
  workerLive: false;
  capturedRevenueUsd: 0;
  session: ReturnType<typeof classifySession>;
  turns: number;
  reuse: ReturnType<typeof contextReuse>;
  latency: ReturnType<typeof splitSessionLatency>;
  watt: ReturnType<typeof wattProxy>;
  slaE2eMs: number;
  usable: boolean;
  research: ReturnType<typeof researchToProduction>;
  reasons: string[];
  liveClaim: boolean;
  status: "LIVE" | "NOT_LIVE" | "UNUSABLE" | "NOT_OFFERED";
  inputWorkerLive: boolean;
};

export function gradeHostedWatt(input: HostedWattInput = {}): HostedWattGrade {
  const turns = normalizeTurns(input);
  const session = classifySession(input, turns);
  const reuse = contextReuse(turns);
  const latency = splitSessionLatency(turns);
  const watt = wattProxy(input, latency);
  const slaE2eMs = Math.max(1, num(input.slaE2eMs, DEFAULT_SLA_E2E_MS));
  const usable = turns.length > 0 && latency.maxTurnE2eMs <= slaE2eMs;
  const research = researchToProduction(input);
  const reasons: string[] = [];
  if (session.class === "nvidia_factory") reasons.push("nvidia_factory_not_offered");
  if (turns.length === 0) reasons.push("session_turns_missing");
  if (!usable && turns.length > 0) reasons.push("interactivity_unusable");
  if (latency.toolGapMs > 0 && latency.toolGapMs >= latency.decodeMs) {
    reasons.push("tool_gap_dominates_decode");
  }
  if (!research.ok) reasons.push(research.reason);
  const workerLive = isTrueFlag(input.workerLive);
  const liveClaim =
    reasons.length === 0 && workerLive && research.ok && session.offered && usable;
  let status: HostedWattGrade["status"] = "NOT_LIVE";
  if (liveClaim) status = "LIVE";
  else if (session.class === "nvidia_factory") status = "NOT_OFFERED";
  else if (!usable && turns.length > 0 && research.ok) status = "UNUSABLE";
  return {
    schema: HOSTED_AGENTIC_WATT_SCHEMA,
    clonedVeraRubin: false,
    clonedAgentX: false,
    clonedDynamo: false,
    nvidiaMegawattClaim: false,
    workerLive: false,
    capturedRevenueUsd: 0,
    session,
    turns: turns.length,
    reuse,
    latency,
    watt,
    slaE2eMs,
    usable,
    research,
    reasons,
    liveClaim,
    status,
    inputWorkerLive: workerLive,
  };
}

export type AgenticWattAttach = {
  schema: typeof HOSTED_AGENTIC_WATT_SCHEMA;
  sessionClass: SessionClass;
  usable: boolean;
  liveClaim: boolean;
  status: HostedWattGrade["status"];
  reasons: string[];
  tokensPerWattHour: number;
  toolGapMs: number;
  reusedPromptTokens: number;
  notTokensPerMegawatt: true;
};

export function attachAgenticWattToReceipt(
  _receiptLike: { outcome?: string } = {},
  input: HostedWattInput = {},
): AgenticWattAttach {
  const grade = gradeHostedWatt({
    ...input,
    workerLive: isTrueFlag(input.workerLive),
    testsPass: isTrueFlag(input.testsPass),
  });
  return {
    schema: HOSTED_AGENTIC_WATT_SCHEMA,
    sessionClass: grade.session.class,
    usable: grade.usable,
    liveClaim: grade.liveClaim,
    status: grade.status,
    reasons: grade.reasons,
    tokensPerWattHour: grade.watt.tokensPerWattHour,
    toolGapMs: grade.latency.toolGapMs,
    reusedPromptTokens: grade.reuse.reusedPromptTokens,
    notTokensPerMegawatt: true,
  };
}
