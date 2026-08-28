import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Reported from a phone screenshot, 2026-08-26. The landing footer rendered as
// four narrow columns wrapping one word per line, and the brand text visually
// abutted the next column ("ThumbGateclosed-system").
//
// Cause: `footer` is display:flex with justify-content:space-between, and the
// max-width:700px query overrode only `width`. Four flex children then shared
// ~360px, so each became a ~90px column. Nothing in the markup was wrong.
const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** The @media(max-width:700px) block, which is where phone layout is decided. */
function mobileBlock() {
  const start = CSS.indexOf("@media(max-width:700px)");
  assert.notEqual(start, -1, "the 700px breakpoint must exist");
  // Walk braces so the whole block is captured rather than a truncated slice.
  let depth = 0;
  for (let i = CSS.indexOf("{", start); i < CSS.length; i += 1) {
    if (CSS[i] === "{") depth += 1;
    else if (CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced braces in the 700px block");
}

/** The `footer{...}` declaration inside a given block. */
function footerRule(block) {
  const m = /(?:^|[};])footer\{([^}]*)\}/.exec(block);
  assert.ok(m, "a footer rule must exist in this block");
  return m[1];
}

test("the base footer is a horizontal flex row", () => {
  // Establishes the precondition: without an override, phones inherit this.
  const base = footerRule(CSS.slice(0, CSS.indexOf("@media")));
  assert.match(base, /display:flex/);
  assert.match(base, /justify-content:space-between/);
});

test("REGRESSION: the mobile footer must stop being a row", () => {
  // The whole defect in one assertion. Setting only `width` leaves four
  // children competing for ~360px.
  const rule = footerRule(mobileBlock());
  assert.match(
    rule,
    /flex-direction:column|display:(block|grid)/,
    `mobile footer must stack; got "${rule}"`,
  );
});

test("stacked footer items align to one edge rather than spreading", () => {
  const rule = footerRule(mobileBlock());
  if (/flex-direction:column/.test(rule)) {
    assert.match(
      rule,
      /align-items:flex-start/,
      "a column footer without align-items stretches children full width",
    );
  }
});

test("stacked rows are separated", () => {
  const rule = footerRule(mobileBlock());
  assert.match(rule, /gap:\s*\d/, "stacked footer rows need a gap or they collide");
});

test("the footer reserves room for the sticky call-to-action", () => {
  // In the screenshot the floating CTA sat on top of the Privacy link. The
  // footer needs bottom padding taller than that control.
  const rule = footerRule(mobileBlock());
  const m = /padding-bottom:(\d+)px/.exec(rule);
  assert.ok(m, "mobile footer must reserve bottom padding for the sticky CTA");
  assert.ok(
    Number(m[1]) >= 100,
    `bottom padding ${m[1]}px is too small to clear the floating CTA`,
  );
});

test("the desktop footer is unchanged", () => {
  // Narrow-screen fixes must not reflow the desktop layout.
  const base = footerRule(CSS.slice(0, CSS.indexOf("@media")));
  assert.doesNotMatch(base, /flex-direction:column/);
  assert.match(base, /width:min\(1180px/);
});
