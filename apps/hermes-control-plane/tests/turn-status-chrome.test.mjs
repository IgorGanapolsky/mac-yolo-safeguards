import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatEngine,
  formatTtft,
  formatTurnCost,
  formatTurnStatusline,
} from "../lib/turn-statusline.ts";

const root = new URL("../", import.meta.url);
const MAC_OLLAMA = /Ollama \(http:\/\/localhost/;

function read(rel) {
  return readFileSync(new URL(rel, root), "utf8");
}

test("dashboard chrome mounts hosted Turn Statusline, not localhost Ollama", () => {
  const layout = read("app/dashboard/layout.tsx");
  const chrome = read("app/dashboard/DashboardTurnChrome.tsx");
  const bar = read("app/dashboard/TurnStatusline.tsx");
  const api = read("app/api/turn-status/route.ts");
  const lib = read("lib/turn-statusline.ts");
  const css = read("app/dashboard/turn-statusline.module.css");

  assert.match(layout, /DashboardTurnChrome/);
  assert.match(layout, /styles\.frame/);
  assert.match(css, /\.frame\s*\{/);
  assert.match(css, /position:\s*sticky/);
  assert.match(bar, /data-testid="turn-statusline"/);
  assert.match(bar, /Turn Statusline/);
  assert.match(bar, /Engine:/);
  assert.match(bar, /TTFT:/);
  assert.match(bar, /Cost:/);
  assert.match(chrome, /formatTurnStatusline/);
  assert.match(chrome, /\/api\/turn-status/);
  assert.match(chrome, /setInterval/);
  assert.match(api, /hosted-fallback/);
  assert.doesNotMatch(api, /FROM llm_calls/);
  assert.match(lib, /Hosted Hermes/);
  assert.match(lib, /<\$0\.01/);
  assert.match(lib, /unmeasured/);
  assert.doesNotMatch(lib, /localhost:11434/);
  assert.doesNotMatch(chrome, MAC_OLLAMA);
  assert.doesNotMatch(bar, MAC_OLLAMA);
  assert.doesNotMatch(api, MAC_OLLAMA);
  assert.doesNotMatch(lib, MAC_OLLAMA);
});

test("formatter defaults to hosted Hermes and keeps TTFT unmeasured", () => {
  assert.equal(formatEngine(), "Hosted Hermes · SuperGrok (grok-4.5)");
  assert.equal(formatTtft(null), "unmeasured");
  assert.equal(formatTurnCost(null), "$0.00 · included in $10/mo");
  assert.equal(formatTurnCost(0.004), "<$0.01");
  assert.equal(
    formatTurnStatusline().line,
    "Turn Statusline | Engine: Hosted Hermes · SuperGrok (grok-4.5) | TTFT: unmeasured | Cost: $0.00 · included in $10/mo",
  );
  assert.equal(
    formatEngine({ providerLabel: "Ollama (http://localhost:11434/v1/models)" }),
    "Hosted Hermes · SuperGrok (grok-4.5)",
  );
});
