import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

function landingShellRules(source) {
  return [...source.matchAll(/\.landing-shell\{[^}]+\}/g)].map((match) => match[0]);
}

function mediaMaxWidth(prelude) {
  const max = prelude.match(/max-width:\s*(\d+)px/i);
  if (max) return Number(max[1]);
  const lte = prelude.match(/width\s*<=\s*(\d+)px/i);
  if (lte) return Number(lte[1]);
  return null;
}

/**
 * Walk top-level and @media blocks. Ignore dashboard-only :has(.dashboard-shell).
 * Used to prove a 390-wide public landing still has overflow-y scroll.
 */
function declarationsAt(source, widthPx, selectorNeedle) {
  const out = [];
  const re = /(@media[^{]+)\{|([^{}]+)\{([^{}]*)\}/g;
  const stack = [];
  let match;
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  while ((match = re.exec(text))) {
    if (match[1]) {
      stack.push(match[1]);
      continue;
    }
    const selectors = match[2].trim();
    const body = match[3];
    if (selectors.includes(":has(.dashboard-shell)")) continue;
    if (!selectors.split(",").some((part) => part.trim().includes(selectorNeedle))) continue;
    const prelude = stack[stack.length - 1] || "";
    const max = mediaMaxWidth(prelude);
    if (max != null && widthPx > max) continue;
    const min = prelude.match(/min-width:\s*(\d+)px/i);
    if (min && widthPx < Number(min[1])) continue;
    out.push(body);
  }
  return out.join(";");
}

function overflowY(decls) {
  const y = [...decls.matchAll(/overflow-y\s*:\s*([a-z]+)/gi)].map((m) => m[1]);
  const sh = [...decls.matchAll(/(?:^|[;}])\s*overflow\s*:\s*([a-z]+)(?:\s+([a-z]+))?/gi)];
  if (y.length) return y.at(-1);
  if (sh.length) {
    const last = sh.at(-1);
    return last[2] || last[1];
  }
  return "visible";
}

test("public landing html/body are not overflow:hidden", () => {
  assert.match(page, /className="landing-shell"/);
  // Unqualified html,body overflow-x:hidden froze iOS document scroll on thumbgate.app.
  assert.doesNotMatch(css, /html,body\s*\{[^}]*overflow(?:-x|-y)?:\s*hidden/);
  assert.match(css, /html:has\(\.landing-shell\)/);
  assert.match(css, /body:has\(\.landing-shell\)[\s\S]{0,240}?overflow:\s*visible/);
  for (const rule of landingShellRules(css)) {
    assert.doesNotMatch(rule, /overflow(?:-x|-y)?:\s*hidden/, rule);
  }
});

test("390-wide landing keeps overflow-y scroll (hero is not a 685px trap)", () => {
  const width = 390;
  const htmlDecls = declarationsAt(css, width, "html");
  const bodyDecls = declarationsAt(css, width, "body");
  const shellDecls = declarationsAt(css, width, ".landing-shell");
  const heroDecls = declarationsAt(css, width, ".hero");

  assert.notEqual(overflowY(htmlDecls), "hidden", `html overflow-y at 390px: ${htmlDecls}`);
  assert.notEqual(overflowY(bodyDecls), "hidden", `body overflow-y at 390px: ${bodyDecls}`);
  assert.notEqual(overflowY(shellDecls), "hidden", `landing-shell overflow-y at 390px: ${shellDecls}`);

  assert.match(heroDecls, /min-height:\s*0/, `hero at 390px must drop the 685px lock: ${heroDecls}`);
  assert.match(css, /@media\(max-width:700px\)[\s\S]{0,1200}?\.hero\{[^}]*min-height:\s*0/);

  // Money path: $10 CTAs POST Stripe Checkout (not WorkOS login).
  assert.match(page, /<HostedCheckoutCta/);
  assert.match(page, /Start hosted Hermes — \$10\/mo/);
  assert.match(page, /Start hosted Hermes — \$10\/mo/);
  assert.match(page, /<StartSurfaces \/>/);
});
