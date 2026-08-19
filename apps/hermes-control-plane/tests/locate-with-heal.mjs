/**
 * Hosted Hermes $10 e2e — Functionize-style locator fallback (not a QA product).
 *
 * Tries candidates in order and returns the first visible locator so a moved
 * #hermes-thread-list / data-testid / role / text selector does not fail the
 * step. On a total miss, returns/throws a named RCA object instead of a vibe
 * "timeout". Not live self-heal in production; not NLP, CV, or Functionize SDK.
 *
 * Candidate shapes:
 *   "#id" | ".class" | "[data-testid=...]"   → page.locator(css)
 *   { testid: "x" }                          → getByTestId
 *   { role: "button", name: "Run" }          → getByRole
 *   { text: "Checkout" }                     → getByText
 *   { css: ".dashboard-task", hasText: "…" } → locator(css, { hasText })
 */

export const HERMES_THREAD_LIST_CANDIDATES = [
  "#hermes-thread-list",
  '[data-testid="hermes-thread-list"]',
  { testid: "hermes-thread-list" },
  { role: "navigation", name: /Chats/ },
];

export const DASHBOARD_TASK_CANDIDATES_FOR = (prompt) => [
  { css: ".dashboard-task", hasText: prompt },
  { testid: "dashboard-task" },
  { text: prompt },
];

export const CHECKOUT_CTA_CANDIDATES = [
  '[data-funnel-event="hosted_checkout_click"]',
  { testid: "start-browser" },
  { role: "link", name: /Start hosted Hermes|Get hosted|Start in browser/i },
  ".button.button-primary",
];

function candidateLabel(candidate) {
  if (typeof candidate === "string") return candidate;
  if (!candidate || typeof candidate !== "object") return String(candidate);
  if (candidate.testid != null || candidate.testId != null) {
    return `testid:${candidate.testid ?? candidate.testId}`;
  }
  if (candidate.role) {
    const name = candidate.name;
    const nameLabel = name instanceof RegExp ? String(name) : name == null ? "" : String(name);
    return nameLabel ? `role=${candidate.role}[name=${nameLabel}]` : `role=${candidate.role}`;
  }
  if (candidate.text != null) return `text:${candidate.text}`;
  if (candidate.css) {
    return candidate.hasText != null
      ? `${candidate.css} hasText=${candidate.hasText}`
      : candidate.css;
  }
  return JSON.stringify(candidate);
}

function resolveCandidate(page, candidate) {
  const label = candidateLabel(candidate);
  if (!page) return { locator: null, label };
  if (typeof candidate === "string") {
    if (typeof page.locator !== "function") return { locator: null, label };
    return { locator: page.locator(candidate), label };
  }
  if (!candidate || typeof candidate !== "object") return { locator: null, label };
  if (candidate.testid != null || candidate.testId != null) {
    const id = candidate.testid ?? candidate.testId;
    if (typeof page.getByTestId === "function") return { locator: page.getByTestId(id), label };
    if (typeof page.locator === "function") {
      return { locator: page.locator(`[data-testid="${id}"]`), label };
    }
    return { locator: null, label };
  }
  if (candidate.role) {
    if (typeof page.getByRole !== "function") return { locator: null, label };
    const opts = candidate.name != null ? { name: candidate.name } : undefined;
    return { locator: page.getByRole(candidate.role, opts), label };
  }
  if (candidate.text != null) {
    if (typeof page.getByText !== "function") return { locator: null, label };
    return { locator: page.getByText(candidate.text), label };
  }
  if (candidate.css) {
    if (typeof page.locator !== "function") return { locator: null, label };
    const opts = candidate.hasText != null ? { hasText: candidate.hasText } : undefined;
    return { locator: page.locator(candidate.css, opts), label };
  }
  return { locator: null, label };
}

function rcaMiss(step, tried, reason) {
  return { ok: false, step, tried, reason };
}

function rcaError(miss) {
  const err = new Error(`[${miss.step}] ${miss.reason}; tried=${JSON.stringify(miss.tried)}`);
  err.ok = false;
  err.step = miss.step;
  err.tried = miss.tried;
  err.reason = miss.reason;
  err.rca = miss;
  return err;
}

async function visible(locator, timeout) {
  if (!locator || typeof locator.isVisible !== "function") return false;
  const handle = typeof locator.first === "function" ? locator.first() : locator;
  try {
    return Boolean(await handle.isVisible({ timeout }));
  } catch {
    return false;
  }
}

/**
 * @param {object} page Playwright page or a test double
 * @param {Array<string|object>} candidates
 * @param {{ step?: string, timeout?: number, throwOnMiss?: boolean }} [opts]
 * @returns {Promise<{ok:true, locator: object, matched: string, tried: string[], step: string}|{ok:false, step: string, tried: string[], reason: string}>}
 */
export async function locateWithHeal(page, candidates, opts = {}) {
  const step = opts.step || "locate";
  const timeout = opts.timeout ?? 500;
  const throwOnMiss = opts.throwOnMiss !== false;
  const list = Array.isArray(candidates) ? candidates : [];
  const tried = [];

  if (list.length === 0) {
    const miss = rcaMiss(step, tried, `no candidates for step "${step}"`);
    if (throwOnMiss) throw rcaError(miss);
    return miss;
  }

  for (const candidate of list) {
    const { locator, label } = resolveCandidate(page, candidate);
    tried.push(label);
    const handle = locator && typeof locator.first === "function" ? locator.first() : locator;
    if (await visible(handle, timeout)) {
      return { ok: true, locator: handle, matched: label, tried, step };
    }
  }

  const miss = rcaMiss(
    step,
    tried,
    `none of ${tried.length} locators visible for step "${step}"`,
  );
  if (throwOnMiss) throw rcaError(miss);
  return miss;
}
