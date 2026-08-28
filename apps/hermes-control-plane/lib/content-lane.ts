/**
 * One content lane: public help-first comments/posts for hosted Hermes $10.
 * Brief → staged artifacts → proof gate → quality loop. No network. No LLM.
 */
import {
  THUMBGATE_PUBLIC_COPY_CONTRACT,
  validateArtifact,
} from "./output-quality-loop.ts";

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

/** Word-boundary for single tokens so "not affiliated" does not trip "affiliate". */
export function hayHasBan(hay, ban) {
  const h = String(hay || "").toLowerCase();
  const b = String(ban || "").toLowerCase();
  if (!b) return false;
  if (b.startsWith("$") || b.includes(" ")) return h.includes(b);
  const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(h);
}

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
    if (hayHasBan(intent, ban)) failed.push(`brief:secondProduct:${ban}`);
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
const LOCKED_DOLLARS = new Set(["$10", "$0", "$0.00"]);

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

export const OUTLINE_SECTIONS = ["answerForward", "problem", "offer", "notThis", "cta"];

export function outliner(brief) {
  const problem = String(brief?.coreIdea || "").trim();
  const sections = {
    answerForward: `Hosted Hermes on a fenced VPS. Flat $10/mo.`,
    problem,
    offer: `${LOCKED_OFFER.product} on a ${LOCKED_OFFER.host}. ${LOCKED_OFFER.price}. ${LOCKED_OFFER.trial}. ${LOCKED_OFFER.approvals}.`,
    notThis: "Not a second product. Not invented traction.",
    cta: LOCKED_OFFER.cta,
  };
  const failed = [];
  for (const key of OUTLINE_SECTIONS) {
    if (!String(sections[key] || "").trim()) failed.push(`outline:missing:${key}`);
  }
  return {
    role: "outliner",
    sections,
    ok: failed.length === 0,
    failedCriteria: failed,
    needsHumanApproval: true,
  };
}

const CITATION_NEEDS = ["hosted hermes", "$10", "fenced vps"];

/** SEL: citable claims at the start or end (grounding window), not buried mid-piece. */
export function answerForward(text) {
  const raw = String(text || "");
  const failed = [];
  if (!raw.trim()) {
    return { role: "answerForward", ok: false, failedCriteria: ["answerForward:empty"] };
  }
  const window = `${raw.slice(0, 400)}\n${raw.slice(-200)}`.toLowerCase();
  for (const need of CITATION_NEEDS) {
    if (!window.includes(need)) failed.push(`answerForward:${need}`);
  }
  return { role: "answerForward", ok: failed.length === 0, failedCriteria: failed };
}

export function uniqueness(draft, liveItems = [], extraIdea = "") {
  const hay = `${extraIdea} ${draft}`.toLowerCase();
  const failed = [];
  for (const item of liveItems) {
    const slug = String(item?.slug || "").trim().toLowerCase();
    if (slug && hay.includes(slug)) failed.push(`uniqueness:slug:${slug}`);
    const title = String(item?.title || "").trim().toLowerCase();
    if (title.length >= 12 && hay.includes(title)) failed.push(`uniqueness:title:${slug || title}`);
  }
  return {
    role: "uniqueness",
    ok: failed.length === 0,
    failedCriteria: [...new Set(failed)],
  };
}

export function repairUnprovenFacts(text, proof = "") {
  const original = String(text || "");
  const first = factChecker(original, proof);
  if (first.ok) {
    return { ok: true, artifact: original, attempts: 0, failedCriteria: [] };
  }
  const tokens = first.failedCriteria
    .map((c) => c.replace(/^fact:unproven:/, ""))
    .filter(Boolean);
  const sentences = original.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !tokens.some((t) => s.includes(t)));
  const artifact = kept.join(" ").trim();
  const second = factChecker(artifact, proof);
  return {
    ok: second.ok,
    artifact,
    attempts: 1,
    failedCriteria: second.failedCriteria,
  };
}

export const FIRST_PARTY_LIVE_PROOF =
  "none — 0 stranger charges; hosted Hermes $10 fenced VPS thumbgate.app";

export function refreshGate(text, proof = FIRST_PARTY_LIVE_PROOF) {
  const tells = aiTellsEditor(text);
  const facts = factChecker(text, proof);
  const proofResult = proofGate(text);
  const forward = answerForward(text);
  const failedCriteria = [
    ...tells.failedCriteria,
    ...facts.failedCriteria,
    ...proofResult.failedCriteria,
    ...forward.failedCriteria,
  ];
  return {
    role: "refresh",
    ok: failedCriteria.length === 0,
    failedCriteria: [...new Set(failedCriteria)],
    artifacts: { aiEditor: tells, factChecker: facts, proof: proofResult, answerForward: forward },
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
    if (hayHasBan(hay, ban)) failed.push(`proof:ban:${ban}`);
  }
  for (const ban of SECOND_PRODUCT) {
    if (hayHasBan(hay, ban)) failed.push(`proof:secondProduct:${ban}`);
  }
  const quality = validateArtifact(THUMBGATE_PUBLIC_COPY_CONTRACT, text);
  if (!quality.ok) failed.push(...quality.failedCriteria);
  return { ok: failed.length === 0, failedCriteria: [...new Set(failed)] };
}

export function runLane(brief, draftOverride, opts = {}) {
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
  const outline = outliner(brief);
  if (!outline.ok) {
    return {
      ok: false,
      failedCriteria: outline.failedCriteria,
      needsHumanApproval: true,
      artifacts: { brief, researcher: research, outliner: outline },
    };
  }
  if (opts.outlineOnly) {
    return {
      ok: true,
      failedCriteria: [],
      needsHumanApproval: true,
      artifacts: { brief, researcher: research, outliner: outline },
      draft: null,
    };
  }
  const angle = strategist(brief);
  const written = writer(brief, angle);
  let draft = draftOverride != null ? String(draftOverride) : written.draft;
  if (opts.repairFacts) {
    const repaired = repairUnprovenFacts(draft, brief.proof);
    draft = repaired.artifact;
  }
  const edited = editor(draft);
  const tells = aiTellsEditor(edited.draft);
  const facts = factChecker(edited.draft, brief.proof);
  const proof = proofGate(edited.draft);
  const forward = answerForward(edited.draft);
  const distinct = uniqueness(edited.draft, opts.liveCatalog || [], brief.coreIdea);
  const failedCriteria = [
    ...tells.failedCriteria,
    ...facts.failedCriteria,
    ...proof.failedCriteria,
    ...forward.failedCriteria,
    ...distinct.failedCriteria,
  ];
  return {
    ok: failedCriteria.length === 0,
    failedCriteria: [...new Set(failedCriteria)],
    needsHumanApproval: true,
    artifacts: {
      brief,
      researcher: research,
      outliner: outline,
      strategist: angle,
      writer: written,
      editor: edited,
      aiEditor: tells,
      factChecker: facts,
      answerForward: forward,
      uniqueness: distinct,
      proof,
    },
    draft: edited.draft,
  };
}
