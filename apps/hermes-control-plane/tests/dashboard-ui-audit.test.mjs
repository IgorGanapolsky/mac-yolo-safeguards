import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const globals = fs.readFileSync(
  path.join(import.meta.dirname, "../app/globals.css"),
  "utf8",
);

// 2026-08-20 UI audit (user screenshot): three dashboard layout defects.

test("mobile clear-all is hidden on desktop and shown only under 700px", () => {
  // The base .button class displays it at every width, so the fix must be an
  // order-based override: display:none AFTER .button, then the phone re-enable
  // AFTER the none rule.
  const noneAt = globals.lastIndexOf(".mobile-clear-all{display:none}");
  const reEnableAt = globals.lastIndexOf("@media(max-width:700px){.mobile-clear-all{display:inline-flex}}");
  assert.ok(noneAt > -1, "desktop hide rule missing");
  assert.ok(reEnableAt > noneAt, "phone re-enable must come after the desktop hide");
});

test("hosted-resource-status list is styled, not a bare default ul", () => {
  assert.match(globals, /\.hosted-resource-status\{[^}]*list-style:none/);
  assert.match(globals, /\.hosted-resource-status li\[data-status="healthy"\]/);
  assert.match(globals, /\.hosted-resource-status li\[data-status="unhealthy"\]/);
});

test("agent-activity strip has TOP-LEVEL styles, not only phone-scoped ones", () => {
  // Production showed "0 hosted runs activeHosted on a fenced VPS" because the
  // strip's only styles were authored inside the phone media block — desktop
  // got an unstyled, always-visible div. The cure must live at top level:
  // require the rules AFTER the UI-audit marker appended at end of file.
  const marker = globals.lastIndexOf("2026-08-20 UI audit fixes");
  assert.ok(marker > -1, "UI-audit block missing");
  const tail = globals.slice(marker);
  assert.match(tail, /\.agent-activity\{[^}]*display:flex[^}]*gap:8px/);
  assert.match(tail, /\.agent-activity\[data-state="idle"\]\{display:none\}/);
});
