/**
 * Hosted Hermes $10 e2e — Functionize-style locator fallback + Diagnose-Agent RCA
 * (not a QA product, not NLP test authoring, not CV / Functionize SDK).
 *
 * Tries candidates in order and returns the first visible locator so a moved
 * #hermes-thread-list / .dashboard-task / checkout CTA does not fail the step.
 * If a later candidate wins, the hit includes healed: { from, to }.
 * On a total miss, returns/throws a JSON-serializable RCA object (named step,
 * expected/actual/rootCause) instead of a vibe "timeout". Dump the RCA to
 * "chat about a run" — do not add NL test authoring. Not live.
 *
 * Candidate shapes:
 *   "#id" | ".class" | "[data-testid=...]"   → page.locator(css)
 *   { testid: "x" }                          → getByTestId
 *   { role: "button", name: "Run" }          → getByRole
 *   { text: "Checkout" }                     → getByText
 *   { css: ".dashboard-task", hasText: "…" } → locator(css, { hasText })
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

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

function screenshotFileName(step) {
  return `${String(step).replace(/[/\\]/g, "_")}.png`;
}

async function maybeScreenshot(page, opts, step) {
  const dir = opts.screenshotDir;
  if (!dir || !page || typeof page.screenshot !== "function") return null;
  const screenshotPath = join(dir, screenshotFileName(step));
  try {
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: screenshotPath });
    return screenshotPath;
  } catch {
    return null;
  }
}

function rcaMiss({ step, tried, expected, screenshotPath }) {
  return {
    ok: false,
    step,
    expected: expected ?? tried[0] ?? "",
    actual: "none visible",
    rootCause: "locator-miss",
    tried,
    screenshotPath: screenshotPath ?? null,
    reason: `locator-miss at step "${step}"`,
  };
}

function rcaError(miss) {
  const err = new Error(JSON.stringify(miss));
  err.ok = miss.ok;
  err.step = miss.step;
  err.expected = miss.expected;
  err.actual = miss.actual;
  err.rootCause = miss.rootCause;
  err.tried = miss.tried;
  err.screenshotPath = miss.screenshotPath;
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
 * @param {{ step?: string, timeout?: number, throwOnMiss?: boolean, screenshotDir?: string }} [opts]
 */
export async function locateWithHeal(page, candidates, opts = {}) {
  const step = opts.step || "locate";
  const timeout = opts.timeout ?? 500;
  const throwOnMiss = opts.throwOnMiss !== false;
  const list = Array.isArray(candidates) ? candidates : [];
  const tried = [];
  const expected = list.length ? candidateLabel(list[0]) : "";

  if (list.length === 0) {
    const miss = rcaMiss({
      step,
      tried,
      expected,
      screenshotPath: await maybeScreenshot(page, opts, step),
    });
    if (throwOnMiss) throw rcaError(miss);
    return miss;
  }

  for (const candidate of list) {
    const { locator, label } = resolveCandidate(page, candidate);
    tried.push(label);
    const handle = locator && typeof locator.first === "function" ? locator.first() : locator;
    if (await visible(handle, timeout)) {
      const matched = label;
      const healed = matched !== tried[0] ? { from: tried[0], to: matched } : null;
      return { ok: true, locator: handle, matched, tried, step, healed };
    }
  }

  const miss = rcaMiss({
    step,
    tried,
    expected,
    screenshotPath: await maybeScreenshot(page, opts, step),
  });
  if (throwOnMiss) throw rcaError(miss);
  return miss;
}
