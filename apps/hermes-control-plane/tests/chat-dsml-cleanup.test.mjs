import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { cleanToolMarkup, parseFormattedBlocks } from "../lib/chat-formatted-blocks.ts";

test("cleanToolMarkup converts DSML tool calls into human-readable action callouts", () => {
  const rawOutput = `Let me fetch that URL to see what's trending and how we can apply it to your RealEstate repo.

< | DSML | tool_calls>
< | DSML | invoke name="shell">
< | DSML | parameter name="command" string="true">curl -s -L https://explainx.ai/trending | head -c 8000</ | DSML | parameter>
< | DSML | parameter name="description" string="true">Fetch trending page from explainx.ai</ | DSML | parameter>
</ | DSML | invoke>
</ | DSML | tool_calls>`;

  const cleaned = cleanToolMarkup(rawOutput);
  assert.ok(!cleaned.includes("< | DSML |"), "Should not contain raw DSML tags");
  assert.ok(cleaned.includes("⚡ `shell` — *Fetch trending page from explainx.ai*"), "Should contain formatted tool execution summary");
  assert.ok(cleaned.includes("curl -s -L https://explainx.ai/trending | head -c 8000"), "Should contain command inside code block");

  const blocks = parseFormattedBlocks(rawOutput);
  assert.ok(blocks.length >= 2, "Should parse into clean blocks");
  assert.equal(blocks[0].kind, "paragraph");
});

test("globals.css contains horizontal overflow prevention rules for conversation messages and code blocks", () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, "../app/globals.css"), "utf8");
  assert.match(css, /\.conversation-history\{[^}]*overflow-x:hidden/);
  assert.match(css, /\.conversation-message\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.conversation-message pre,[^}]*white-space:pre-wrap/);
});
