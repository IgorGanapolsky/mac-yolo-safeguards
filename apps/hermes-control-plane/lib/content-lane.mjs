/**
 * One content lane: public help-first comments/posts for hosted Hermes $10.
 * Brief → staged artifacts → proof gate → quality loop. No network. No LLM.
 */
import {
  THUMBGATE_PUBLIC_COPY_CONTRACT,
  validateArtifact,
} from "./output-quality-loop.mjs";

export const LANE = "public_help_first";

export const LOCKED_OFFER = {
  product: "hosted Hermes",
  host: "fenced VPS",
  price: "$10/mo",
  trial: "14-day trial",
  approvals: "approvals in thumbgate.app",
  cta: "https://thumbgate.app",
};

export const BRIEF_FIELDS = [
  "audience",
  "offer",
  "objective",
  "platform",
  "coreIdea",
  "cta",
  "proof",
  "brandVoice",
  "prohibitedClaims",
];

const SECOND_PRODUCT = [
  "affiliate",
  "leak score",
  "hvac",
  "plumbing",
  "$149",
  "youtube script",
  "n8n",
];

const TRACTION_LIES = [
  "1000 customers",
  "used by teams",
  "paying customers",
  "proven traction",
  "case study",
];

const EXTRA_BANS = [
  "phone leash",
  "hermes mobile as the paid",
  "lid closes",
  "pair a mac",
  "continuity",
  "team $49",
];

export function validateBrief(brief) {
  const failed = [];
  if (!brief || typeof brief !== "object") {
    return { ok: false, failedCriteria: ["brief:missing"] };
  }
  for (const field of BRIEF_FIELDS) {
    const v = brief[field];
    if (v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0)) {
      failed.push(`brief:${field}`);
    }
  }
  if (brief.lane && brief.lane !== LANE) failed.push("brief:lane");
  const intent = [brief.offer, brief.objective, brief.coreIdea].join(" ").toLowerCase();
  for (const ban of SECOND_PRODUCT) {
    if (intent.includes(ban)) failed.push(`brief:secondProduct:${ban}`);
  }
  return { ok: failed.length === 0, failedCriteria: failed };
}

export function strategist(brief) {
  return {
    role: "strategist",
    angle: String(brief.coreIdea || ""),
    audience: String(brief.audience || ""),
    cta: LOCKED_OFFER.cta,
  };
}

export function writer(brief, angle) {
  const draft = [
    String(angle?.angle || brief.coreIdea || "").trim(),
    `Hosted Hermes on a fenced VPS. Flat $10/mo. 14-day trial.`,
    `Approvals in thumbgate.app.`,
    LOCKED_OFFER.cta,
  ].filter(Boolean).join(" ");
  return { role: "writer", draft };
}

export function editor(draft) {
  return {
    role: "editor",
    notes: "help-first, one offer, no invented proof",
    draft: String(draft || ""),
  };
}

/**
 * SEL 2026-08-24 steal: research dossier is first-party observation, not SERP
 * commodity. No network. Fail closed if proof is generic "experts/studies".
 */
const COMMODITY_PROOF = [
  "according to experts",
  "studies show",
  "best practices",
  "in today's landscape",
  "industry leaders",
];

const FIRST_PARTY_PROOF = /0 stranger|stripe|thumbgate\.app|fenced vps|\$10|14-day|hosted hermes|live health|observed/i;

export function researcher(brief) {
  const failed = [];
  const proof = String(brief?.proof || "").trim();
  const low = proof.toLowerCase();
  if (!proof) failed.push("research:proof:missing");
  else if (!FIRST_PARTY_PROOF.test(proof)) failed.push("research:proof:notFirstParty");
  for (const phrase of COMMODITY_PROOF) {
    if (low.includes(phrase)) failed.push(`research:commodity:${phrase}`);
  }
  return {
    role: "researcher",
    dossier: { firstPartyProof: proof, sourcesToAvoid: COMMODITY_PROOF },
    ok: failed.length === 0,
    failedCriteria: failed,
  };
}

const AI_TELLS = [
  "delve",
  "tapestry",
  "in today's landscape",
  "it's not just",
  "unlock the power",
  "game-changer",
  "ever-evolving",
];

export function aiTellsEditor(text) {
  const failed = [];
  const hay = String(text || "").toLowerCase();
  for (const tell of AI_TELLS) {
    if (hay.includes(tell)) failed.push(`aiTell:${tell}`);
  }
  return { role: "aiEditor", ok: failed.length === 0, failedCriteria: failed };
}

/**
 * Adversarial fact-check (SEL): assume numeric/dollar/count claims are false
 * unless they are the locked $10 offer or appear in brief.proof.
 */
const LOCKED_DOLLARS = new Set(["$10"]);

export function factChecker(text, proof = "") {
  const failed = [];
  const hay = String(text || "");
  const proofHay = String(proof || "").toLowerCase();

  const dollars = hay.match(/\$\s?\d[\d,]*(?:\.\d+)?(?:\/mo)?/g) || [];
  for (const raw of dollars) {
    const norm = raw.replace(/\s/g, "").toLowerCase();
    if (LOCKED_DOLLARS.has(norm) || norm === "$10/mo") continue;
    if (proofHay.includes(norm)) continue;
    failed.push(`fact:unproven:${raw.trim()}`);
  }

  const pcts = hay.match(/\d+(?:\.\d+)?%/g) || [];
  for (const p of pcts) {
    if (proofHay.includes(p.toLowerCase())) continue;
    failed.push(`fact:unproven:${p}`);
  }

  const counts = hay.match(/\b\d[\d,]*\s+(?:customers|users|teams|companies|clients)\b/gi) || [];
  for (const c of counts) {
    failed.push(`fact:unproven:${c}`);
  }

  return {
    role: "factChecker",
    ok: failed.length === 0,
    failedCriteria: [...new Set(failed)],
  };
}

export function proofGate(text) {
  const failed = [];
  const hay = String(text || "").toLowerCase();
  if (!hay.trim()) failed.push("empty");
  for (const lie of TRACTION_LIES) {
    if (hay.includes(lie)) failed.push(`proof:traction:${lie}`);
  }
  for (const ban of EXTRA_BANS) {
    if (hay.includes(ban)) failed.push(`proof:ban:${ban}`);
  }
  for (const ban of SECOND_PRODUCT) {
    if (hay.includes(ban)) failed.push(`proof:secondProduct:${ban}`);
  }
  const quality = validateArtifact(THUMBGATE_PUBLIC_COPY_CONTRACT, text);
  if (!quality.ok) failed.push(...quality.failedCriteria);
  return { ok: failed.length === 0, failedCriteria: [...new Set(failed)] };
}

export function runLane(brief, draftOverride) {
  const briefResult = validateBrief(brief);
  if (!briefResult.ok) {
    return {
      ok: false,
      failedCriteria: briefResult.failedCriteria,
      needsHumanApproval: true,
      artifacts: {},
    };
  }
  const research = researcher(brief);
  if (!research.ok) {
    return {
      ok: false,
      failedCriteria: research.failedCriteria,
      needsHumanApproval: true,
      artifacts: { brief, researcher: research },
    };
  }
  const angle = strategist(brief);
  const written = writer(brief, angle);
  const draft = draftOverride != null ? String(draftOverride) : written.draft;
  const edited = editor(draft);
  const tells = aiTellsEditor(edited.draft);
  const facts = factChecker(edited.draft, brief.proof);
  const proof = proofGate(edited.draft);
  const failedCriteria = [
    ...tells.failedCriteria,
    ...facts.failedCriteria,
    ...proof.failedCriteria,
  ];
  return {
    ok: failedCriteria.length === 0,
    failedCriteria: [...new Set(failedCriteria)],
    needsHumanApproval: true,
    artifacts: {
      brief,
      researcher: research,
      strategist: angle,
      writer: written,
      editor: edited,
      aiEditor: tells,
      factChecker: facts,
      proof,
    },
    draft: edited.draft,
  };
}
