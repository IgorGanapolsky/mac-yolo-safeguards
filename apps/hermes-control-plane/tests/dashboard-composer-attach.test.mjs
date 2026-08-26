import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(import.meta.dirname, "..");
const client = fs.readFileSync(path.join(root, "app/dashboard/DashboardClient.tsx"), "utf8");
const attach = fs.readFileSync(path.join(root, "app/dashboard/ComposerAttach.tsx"), "utf8");
const tasks = fs.readFileSync(path.join(root, "app/api/tasks/route.ts"), "utf8");
const claim = fs.readFileSync(path.join(root, "app/api/runner/tasks/claim/route.ts"), "utf8");
const runner = fs.readFileSync(path.join(root, "../../services/hermes-cloud-runner/server.js"), "utf8");
const globals = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

test("composer exposes a real file input, not a fake paperclip", () => {
  assert.match(client, /ComposerAttach/);
  assert.match(attach, /data-testid="composer-attach-input"/);
  assert.match(attach, /type="file"/);
  assert.match(attach, /Attach images or files/);
  assert.match(globals, /\.composer-attach-button/);
});

test("createTask sends attachments and allows a files-only send", () => {
  assert.match(client, /attachments: attachFiles\.map/);
  assert.match(client, /composerHasSendableContent/);
  assert.match(client, /onPaste/);
  assert.match(tasks, /insertTaskFiles/);
  assert.match(tasks, /attachmentsFromPayload/);
  assert.match(tasks, /mergeAttachmentsIntoPrompt/);
});

test("hosted claim and runner pass image bytes to the model", () => {
  assert.match(claim, /loadTaskAttachments/);
  assert.match(claim, /attachments,/);
  assert.match(runner, /function userContent\(task\)/);
  assert.match(runner, /type: 'image_url'/);
  assert.match(runner, /content: userContent\(task\)/);
});
