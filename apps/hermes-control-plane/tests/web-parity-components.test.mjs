import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const threadSidebar = readFileSync(new URL("../components/ThreadSidebar.tsx", import.meta.url), "utf8");
const computerPickerModal = readFileSync(new URL("../components/ComputerPickerModal.tsx", import.meta.url), "utf8");
const leashPermissionsDrawer = readFileSync(new URL("../components/LeashPermissionsDrawer.tsx", import.meta.url), "utf8");
const promptFeedbackModal = readFileSync(new URL("../components/PromptFeedbackModal.tsx", import.meta.url), "utf8");

test("web prudent components exist with Hermes Mobile HSL styling & brand marks", () => {
  assert.ok(existsSync(new URL("../components/ThreadSidebar.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../components/ComputerPickerModal.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../components/LeashPermissionsDrawer.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../components/PromptFeedbackModal.tsx", import.meta.url)));

  // Brand and color system contract assertions
  assert.match(threadSidebar, /#0B0F19/);
  assert.match(threadSidebar, /\/brand\/thumbgate-mark-inline-v3\.svg/);
  assert.match(computerPickerModal, /Select Target Computer/);
  assert.match(leashPermissionsDrawer, /Leash Permissions & Safety/);
  assert.match(promptFeedbackModal, /What went wrong\?/);
});
