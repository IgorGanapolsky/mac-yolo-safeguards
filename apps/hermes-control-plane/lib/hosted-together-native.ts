/**
 * Hosted Together Native — Together AI Native Conf process steal for thumbgate.app.
 * Keep in lockstep with tools/hosted-together-native.js.
 * Not Together Cloud, not FlashAttention-4, not ThunderAgent, not Instant Clusters.
 */

export const HOSTED_TOGETHER_NATIVE_SCHEMA = "hosted-together-native/v1";
export const DEPLOY_SHA_RE = /^[0-9a-f]{40}$/;
const PLACEHOLDER_SHA_RE = /^(.)\1{39}$/;
const VENDOR_PROMO_RE =
  /together\.ai|ainativeconf|flashattention|thunderagent|thunderkittens|instant clusters?/i;
const DEDICATED_RE =
  /\b(gpu clusters?|instant clusters?|dedicated (gpu|model|container|inference)|together cloud)\b/i;
const BATCH_RE = /\b(batch|overnight|async eval|offline eval|asynchronous)\b/i;

const CLASS_ALIASES: Record<string, WorkloadClass> = {
  serverless: "serverless",
  chat: "serverless",
  realtime: "serverless",
  interactive: "serverless",
  ask: "serverless",
  summarize: "serverless",
  batch: "batch",
  async: "batch",
  overnight: "batch",
  eval: "batch",
  offline: "batch",
  provisioned: "provisioned",
  sla: "provisioned",
  reserved: "provisioned",
  subscriber: "provisioned",
  dedicated: "dedicated",
  gpu: "dedicated",
  cluster: "dedicated",
  "instant-cluster": "dedicated",
  gpu_cluster: "dedicated",
};

export type WorkloadClass = "serverless" | "batch" | "provisioned" | "dedicated";

export type HostedTogetherInput = {
  claimedClass?: string;
  class?: string;
  kind?: string;
  prompt?: string;
  text?: string;
  quotaRemainingUsd?: number;
  tokensLeft?: number;
  vpsUp?: boolean;
  evalArtifact?: string;
  researchArtifact?: string;
  deploySha?: string;
  testsPass?: boolean;
  blogUrl?: string;
  talkUrl?: string;
  stripePaid?: boolean;
  workerLive?: boolean;
};

export type Workload = {
  class: WorkloadClass;
  offered: boolean;
  reason: string;
  liveClaim: false;
};

export type TogetherGrade = {
  schema: typeof HOSTED_TOGETHER_NATIVE_SCHEMA;
  clonedTogetherCloud: false;
  capacityIsNotFrontier: true;
  workerLive: false;
  capturedRevenueUsd: 0;
  workload: Workload;
  capacity: {
    capacity: boolean;
    capacityIsNotFrontier: true;
    liveFromCapacity: false;
    quotaRemainingUsd: number | null;
    tokensLeft: number | null;
    vpsUp: boolean;
  };
  research: {
    ok: boolean;
    reason: string;
    liveClaim: false;
    artifact?: string;
    deploySha?: string;
  };
  reasons: string[];
  liveClaim: boolean;
  status: "LIVE" | "NOT_LIVE" | "BATCH_COMPLETE" | "NOT_OFFERED";
  inputWorkerLive: boolean;
};

function isVendorPromo(value: string | undefined): boolean {
  return VENDOR_PROMO_RE.test(String(value || ""));
}

export function isTrueFlag(value: unknown): boolean {
  return value === true;
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

export function classifyWorkload(input: HostedTogetherInput = {}): Workload {
  const claimed = String(input.claimedClass || input.class || input.kind || "")
    .toLowerCase()
    .trim();
  const prompt = String(input.prompt || input.text || "");
  if (DEDICATED_RE.test(prompt) || CLASS_ALIASES[claimed] === "dedicated") {
    return {
      class: "dedicated",
      offered: false,
      reason: "dedicated_not_offered",
      liveClaim: false,
    };
  }
  const aliased = CLASS_ALIASES[claimed];
  if (aliased === "batch" || BATCH_RE.test(prompt)) {
    return { class: "batch", offered: true, reason: "batch", liveClaim: false };
  }
  if (aliased === "provisioned") {
    return {
      class: "provisioned",
      offered: true,
      reason: "provisioned",
      liveClaim: false,
    };
  }
  return {
    class: "serverless",
    offered: true,
    reason: aliased === "serverless" || !claimed ? "serverless" : "default_serverless",
    liveClaim: false,
  };
}

export function capacityIsNotFrontier(input: HostedTogetherInput = {}) {
  const quota = Number(input.quotaRemainingUsd);
  const tokensLeft = Number(input.tokensLeft);
  const vpsUp = Boolean(input.vpsUp);
  const hasCapacity =
    (Number.isFinite(quota) && quota > 0) ||
    (Number.isFinite(tokensLeft) && tokensLeft > 0) ||
    vpsUp;
  return {
    capacity: hasCapacity,
    capacityIsNotFrontier: true as const,
    liveFromCapacity: false as const,
    quotaRemainingUsd: Number.isFinite(quota) ? quota : null,
    tokensLeft: Number.isFinite(tokensLeft) ? tokensLeft : null,
    vpsUp,
  };
}

export function researchToProduction(input: HostedTogetherInput = {}) {
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

export function gradeHostedClaim(input: HostedTogetherInput = {}): TogetherGrade {
  const workload = classifyWorkload(input);
  const capacity = capacityIsNotFrontier(input);
  const research = researchToProduction(input);
  const reasons: string[] = [];
  if (workload.class === "dedicated") reasons.push("dedicated_not_offered");
  if (workload.class === "batch") reasons.push("batch_is_not_live");
  if (workload.class === "provisioned" && !isTrueFlag(input.stripePaid)) {
    reasons.push("provisioned_requires_paid");
  }
  if (!research.ok) reasons.push(research.reason);
  if (capacity.capacity && !research.ok) reasons.push("capacity_is_not_frontier");
  const workerLive = isTrueFlag(input.workerLive);
  const classAllowsLive =
    workload.class === "serverless" ||
    (workload.class === "provisioned" && isTrueFlag(input.stripePaid));
  const liveClaim = reasons.length === 0 && workerLive && research.ok && classAllowsLive;
  let status: TogetherGrade["status"] = "NOT_LIVE";
  if (liveClaim) status = "LIVE";
  else if (workload.class === "batch" && research.ok) status = "BATCH_COMPLETE";
  else if (workload.class === "dedicated") status = "NOT_OFFERED";
  return {
    schema: HOSTED_TOGETHER_NATIVE_SCHEMA,
    clonedTogetherCloud: false,
    capacityIsNotFrontier: true,
    workerLive: false,
    capturedRevenueUsd: 0,
    workload,
    capacity,
    research,
    reasons,
    liveClaim,
    status,
    inputWorkerLive: workerLive,
  };
}

export type TogetherNativeAttach = {
  schema: typeof HOSTED_TOGETHER_NATIVE_SCHEMA;
  workloadClass: WorkloadClass;
  capacityIsNotFrontier: true;
  liveClaim: boolean;
  status: TogetherGrade["status"];
  reasons: string[];
};

export function attachTogetherNativeToReceipt(
  _receiptLike: { outcome?: string; externalCheck?: { passed?: boolean | null } | null } = {},
  input: HostedTogetherInput = {},
): TogetherNativeAttach {
  const grade = gradeHostedClaim({
    ...input,
    workerLive: isTrueFlag(input.workerLive),
    testsPass: isTrueFlag(input.testsPass),
  });
  return {
    schema: HOSTED_TOGETHER_NATIVE_SCHEMA,
    workloadClass: grade.workload.class,
    capacityIsNotFrontier: true,
    liveClaim: grade.liveClaim,
    status: grade.status,
    reasons: grade.reasons,
  };
}

export function attachTogetherNative<T extends { liveClaim?: boolean }>(
  receipt: T | undefined,
  input: HostedTogetherInput = {},
): T & {
  liveClaim: boolean;
  togetherNative: TogetherNativeAttach;
} {
  const togetherNative = attachTogetherNativeToReceipt(receipt, input);
  const incomingLive = Boolean(receipt && receipt.liveClaim);
  return {
    ...(receipt || ({} as T)),
    liveClaim: incomingLive && togetherNative.liveClaim,
    togetherNative,
  };
}
