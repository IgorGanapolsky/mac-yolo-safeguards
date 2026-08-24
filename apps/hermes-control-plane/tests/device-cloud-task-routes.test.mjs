import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("device submit/status routes exist for Hermes Mobile continuity client", () => {
  const submit = read("../app/api/device/tasks/submit/route.ts");
  const status = read("../app/api/device/tasks/status/route.ts");
  const lib = read("../lib/device-cloud-task.ts");
  assert.match(submit, /requireDevice/);
  assert.match(submit, /submitDeviceCloudTask/);
  assert.match(submit, /routePreference/);
  assert.match(status, /fetchDeviceCloudTaskStatus/);
  assert.match(lib, /cloud_pending/);
  assert.match(lib, /ackHostedSend/);
});
