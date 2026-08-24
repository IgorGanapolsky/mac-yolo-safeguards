/**
 * Hosted prompt-distill for thumbgate.app — cookbook analog, not a training API.
 *
 * Tinker cookbook prompt-distillation trains a student on (query → teacher
 * reply) *without* the long prompt p in context. We steal the *shape*:
 * strip operator skill dumps from hosted system/context so the VPS does
 * not burn tokens on 30–60k catalogs. We do not call Tinker. We do not
 * train. We never overwrite teacher traces. We never ingest customer runs.
 *
 * TINKER-DEPLOY-OK analog: hosted task `completed` is lifecycle, not quality.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = "thumbgate.hosted-prompt-distill.v1";
export const HOSTED_COMPLETED_IS_NOT_QUALITY = true;
export const HOST_EXECUTES_TOOLS = true;
export const TRAIN_ON_CUSTOMER_RUNS = false;
export const SKILL_DUMP_MIN_CHARS = 8_000;
export const CONTEXT_KEEP_CHARS = 4_000;
export const MINIMUM_HOLDOUT_PAIRS = 5;
export const MINIMUM_HOLDOUT_ACCURACY = 0.7;
export const CUSTOMER_SOURCES = Object.freeze([
  "customer_run",
  "d1_task",
  "thumbgate_task_result",
  "hosted_customer_trace",
]);
export const PRODUCT_LOCK = [
  "You own the work. We own the machine.",
  "Hosted Hermes on a fenced VPS ($10/mo).",
  "Approvals happen on thumbgate.app.",
  "We do not train our models on your data.",
  "Hosted VPS default. No Continuity picker.",
].join(" ");

const SKILL_DUMP_RES = [
  /SKILL\.md/i,
  /You are an interactive CLI/i,
  /##\s+NEVER/i,
  /##\s+ALWAYS/i,
  /Slash:\s+\//,
  /Auto-invoke/i,
];

const CUSTOMER_SOURCE_SET = new Set(CUSTOMER_SOURCES);

function asText(value) {
  if (value == null) return "";
  return String(value);
}

function isLongSkillDump(text) {
  const s = asText(text);
  if (s.length < SKILL_DUMP_MIN_CHARS) return false;
  if (s.length >= 24_000) return true;
  const hits = SKILL_DUMP_RES.filter((re) => re.test(s)).length;
  return hits >= 2;
}

export function looksLikeCustomerRun(input = {}) {
  const source = asText(input.source).trim().toLowerCase();
  if (CUSTOMER_SOURCE_SET.has(source)) return true;
  if (input.train === true || input.trainOnCustomerRuns === true) return true;
  return false;
}

function distillBlob(text, kind) {
  const original = asText(text);
  if (!original) {
    return { text: "", originalLength: 0, distilledLength: 0, stripped: false };
  }
  if (kind === "system" && isLongSkillDump(original)) {
    const pointer =
      `[hosted-prompt-distill: stripped ${original.length} char operator skill dump;` +
      " teacher trace not overwritten; student runs without p]";
    const textOut = `${PRODUCT_LOCK}\n${pointer}`;
    return {
      text: textOut,
      originalLength: original.length,
      distilledLength: textOut.length,
      stripped: true,
    };
  }
  if (kind === "context" && original.length > CONTEXT_KEEP_CHARS) {
    const textOut = original.slice(-CONTEXT_KEEP_CHARS);
    return {
      text: textOut,
      originalLength: original.length,
      distilledLength: textOut.length,
      stripped: true,
    };
  }
  return {
    text: original,
    originalLength: original.length,
    distilledLength: original.length,
    stripped: false,
  };
}

export function distillHostedPrompt(input = {}) {
  if (looksLikeCustomerRun(input)) {
    return {
      ok: false,
      reason: "train_on_customer_runs_forbidden",
      trained: false,
      teacherPreserved: true,
      schemaVersion: SCHEMA_VERSION,
    };
  }
  if (input.overwriteTeacher === true) {
    return {
      ok: false,
      reason: "teacher_trace_is_append_only",
      trained: false,
      teacherPreserved: true,
      schemaVersion: SCHEMA_VERSION,
    };
  }

  const systemPart = distillBlob(input.system, "system");
  const contextPart = distillBlob(input.context, "context");
  const user = asText(input.user);
  const charsBefore = systemPart.originalLength + contextPart.originalLength;
  const charsAfter = systemPart.distilledLength + contextPart.distilledLength;
  const ratio = charsBefore === 0 ? 1 : Number((charsAfter / charsBefore).toFixed(4));

  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    system: systemPart.text,
    context: contextPart.text,
    user,
    trained: false,
    teacherPreserved: true,
    stripped: systemPart.stripped || contextPart.stripped,
    charsBefore,
    charsAfter,
    ratio,
    costUsd: 0,
  };
}

export function gradeHostedTask(input = {}) {
  const status = asText(input.status).trim().toLowerCase();
  const lifecycle = ["queued", "running", "completed", "failed", "cancelled"].includes(status)
    ? status
    : "unknown";
  const kind = input.kind === "observed" ? "observed" : "modeledNotMeasured";
  const pairs = Number(input.holdoutPairs) || 0;
  const acc = Number(input.holdoutAccuracy);
  const qualityOk =
    kind === "observed" &&
    pairs >= MINIMUM_HOLDOUT_PAIRS &&
    Number.isFinite(acc) &&
    acc >= MINIMUM_HOLDOUT_ACCURACY;

  return {
    ok: true,
    lifecycle,
    quality: qualityOk ? "holdout_pass" : "unevaluated",
    qualityKind: kind,
    completedIsNotQuality: HOSTED_COMPLETED_IS_NOT_QUALITY,
    hostedCompletedOkIsNotQuality: true,
    shippable: qualityOk,
    holdoutPairs: pairs,
    holdoutAccuracy: Number.isFinite(acc) ? acc : null,
  };
}

export function doctor(input = {}) {
  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    product: "thumbgate.app hosted Hermes",
    tinkerClone: false,
    trainOnCustomerRuns: TRAIN_ON_CUSTOMER_RUNS,
    paidTrain: false,
    hostedCompletedIsNotQuality: HOSTED_COMPLETED_IS_NOT_QUALITY,
    hostExecutesTools: HOST_EXECUTES_TOOLS,
    checkpointResume: true,
    inklingDefault: false,
    costUsd: 0,
    note: "Tinker is a cloud training API. This doctor never trains, never uploads, never calls Tinker.",
    ...((input && input.extra) || {}),
  };
}

function readOptionalFile(filePath) {
  if (!filePath) return "";
  return fs.readFileSync(filePath, "utf8");
}

function appendLedger(ledgerPath, payload) {
  if (!ledgerPath) return;
  const dir = path.dirname(ledgerPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(payload)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function main(argv = process.argv.slice(2)) {
  const args = { json: false, doctor: false, distill: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--doctor") args.doctor = true;
    else if (a === "--distill") args.distill = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--system-file") args.systemFile = argv[++i];
    else if (a === "--context-file") args.contextFile = argv[++i];
    else if (a === "--source") args.source = argv[++i];
    else if (a === "--ledger") args.ledger = argv[++i];
    else if (a === "--user") args.user = argv[++i];
  }

  if (args.help) {
    const help =
      "hosted-prompt-distill — $0 ThumbGate.app analog of Tinker prompt-distillation\n" +
      "  --doctor --json\n" +
      "  --distill --system-file FILE [--context-file FILE] [--source NAME] --json\n" +
      "  --ledger PATH   append JSONL (never overwrites teacher traces)\n";
    process.stdout.write(help);
    return 0;
  }

  let payload;
  if (args.distill) {
    payload = distillHostedPrompt({
      system: readOptionalFile(args.systemFile),
      context: readOptionalFile(args.contextFile),
      user: args.user || "",
      source: args.source,
    });
  } else {
    payload = doctor();
  }

  appendLedger(args.ledger, { ts: new Date().toISOString(), ...payload });
  if (args.json || !args.help) {
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
  }
  return payload.ok ? 0 : 2;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  process.exit(main());
}
