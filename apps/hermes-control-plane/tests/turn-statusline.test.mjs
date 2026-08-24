import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controlPlaneRoot = path.resolve(__dirname, "..");

test("TurnStatusline: DashboardClient.tsx mounts Turn Statusline across assistant outputs", () => {
  const clientPath = path.join(controlPlaneRoot, "app/dashboard/DashboardClient.tsx");
  assert.ok(fs.existsSync(clientPath), "DashboardClient.tsx exists");
  const source = fs.readFileSync(clientPath, "utf8");

  // 1. Definition exists
  assert.ok(source.includes("function TurnStatusline"), "TurnStatusline component defined");
  assert.ok(source.includes("data-testid=\"turn-statusline\""), "turn-statusline testid present");
  assert.ok(source.includes("Turn Statusline"), "Turn Statusline label present");
  assert.ok(source.includes("Engine:"), "Engine label present");
  assert.ok(source.includes("TTFT:"), "TTFT label present");
  assert.ok(source.includes("Cost:"), "Cost label present");

  // 2. Wired to conversation snapshot assistant outputs
  assert.ok(
    source.includes("message.role === \"assistant\" && <TurnStatusline"),
    "Wired to snapshot assistant messages"
  );

  // 3. Wired to live task results
  assert.ok(
    source.includes("<TurnStatusline engine={task.deviceName"),
    "Wired to task result messages"
  );
});

test("TurnStatusline: globals.css contains styling for .turn-statusline", () => {
  const cssPath = path.join(controlPlaneRoot, "app/globals.css");
  assert.ok(fs.existsSync(cssPath), "globals.css exists");
  const css = fs.readFileSync(cssPath, "utf8");

  assert.ok(css.includes(".turn-statusline"), ".turn-statusline selector present in CSS");
  assert.ok(css.includes(".statusline-metric"), ".statusline-metric selector present in CSS");
  assert.ok(css.includes(".statusline-tag"), ".statusline-tag selector present in CSS");
});
