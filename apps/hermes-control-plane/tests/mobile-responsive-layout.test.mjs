import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const globalsCssPath = path.resolve(__dirname, "../app/globals.css");

test("mobile CSS responsive rules prevent sidebar block & options truncation", () => {
  const css = fs.readFileSync(globalsCssPath, "utf8");

  // 1. Sidebar must be hidden on mobile when data-mobile-tab="hermes" so chat is visible
  assert.match(
    css,
    /\.dashboard-shell\[data-mobile-tab="hermes"\]\s+\.sidebar\s*\{\s*display:\s*none\s*!important;?\s*\}/,
    "globals.css must hide sidebar on mobile when data-mobile-tab=hermes"
  );

  // 2. Composer options must use 3-column grid or flex column on narrow viewports (< 700px)
  assert.match(
    css,
    /\.composer-route\s*\{\s*display:\s*(grid|flex);\s*(grid-template-columns:\s*1fr\s+1fr\s+1fr|flex-direction:\s*column);/,
    "globals.css must layout composer route buttons for mobile touch"
  );

  // 3. Machine selector must be full width with minimum touch height (>=42px)
  assert.match(
    css,
    /\.composer-machine-select\s*\{\s*width:\s*100%;\s*min-height:\s*4[26]px;/,
    "globals.css must make machine select full width with touch height on mobile"
  );
});
