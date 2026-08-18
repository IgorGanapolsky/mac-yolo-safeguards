/**
 * Deterministic output-quality loop.
 * Contract → validate → capped repair. No network. No LLM in the validator.
 */
export const THUMBGATE_PUBLIC_COPY_CONTRACT = {
  audience: "a stranger considering $10 hosted Hermes",
  goal: "honest public copy for thumbgate.app",
  mustInclude: ["hosted Hermes", "$10", "fenced VPS"],
  mustNot: ["Continuity", "pair a Mac", "Lid closes", "Team $49"],
  format: "prose",
  definitionOfDone: [
    "hosted Hermes is the public noun",
    "price is $10",
    "no Mac-pair or lid-close sell",
  ],
};

export function validateArtifact(contract, artifact) {
  const text = String(artifact ?? "");
  const failed = [];
  if (!text.trim()) {
    failed.push("empty");
    return { ok: false, failedCriteria: failed };
  }
  const hay = text.toLowerCase();
  for (const need of contract.mustInclude) {
    if (!hay.includes(need.toLowerCase())) failed.push(`mustInclude:${need}`);
  }
  for (const ban of contract.mustNot) {
    if (hay.includes(ban.toLowerCase())) failed.push(`mustNot:${ban}`);
  }
  return { ok: failed.length === 0, failedCriteria: failed };
}

export async function repairLoop(input) {
  const maxAttempts = input.maxAttempts ?? 2;
  let current = input.artifact;
  let last = validateArtifact(input.contract, current);
  let attempts = 0;
  while (!last.ok && attempts < maxAttempts) {
    attempts += 1;
    current = await input.repair(current, last.failedCriteria);
    last = validateArtifact(input.contract, current);
  }
  return { ...last, artifact: current, attempts };
}
