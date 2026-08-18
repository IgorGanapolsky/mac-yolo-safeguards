import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const employeeCardSource = readFileSync(
  new URL("../app/components/AiEmployeeCard.tsx", import.meta.url),
  "utf8"
);
const downloadCenterSource = readFileSync(
  new URL("../app/components/DownloadCenter.tsx", import.meta.url),
  "utf8"
);

test("AiEmployeeCard component exports digital worker profile with metrics and expertise badges", () => {
  assert.match(employeeCardSource, /export function AiEmployeeCard/);
  assert.match(employeeCardSource, /ID: \{id\}/);
  assert.match(employeeCardSource, /Days Active/);
  assert.match(employeeCardSource, /Triggers/);
  assert.match(employeeCardSource, /Tasks/);
  assert.match(employeeCardSource, /Expertise & Capabilities/);
  assert.match(employeeCardSource, /Action\(s\) Required/);
});

test("DownloadCenter component implements ThumbGate Mobile and ThumbGate Wake sections", () => {
  assert.match(downloadCenterSource, /export function DownloadCenter/);
  assert.match(downloadCenterSource, /ThumbGate Mobile/);
  assert.match(downloadCenterSource, /Mobile control center for autonomous AI agents/);
  assert.match(downloadCenterSource, /\/go\/ios/);
  assert.match(downloadCenterSource, /\/go\/android/);
  assert.match(downloadCenterSource, /ThumbGate Wake/);
  assert.match(downloadCenterSource, /Your always-on digital AI employees/);
  assert.match(downloadCenterSource, /curl -fsSL https:\/\/raw\.githubusercontent\.com/);
  assert.match(downloadCenterSource, /macOS 13\+/);
});
