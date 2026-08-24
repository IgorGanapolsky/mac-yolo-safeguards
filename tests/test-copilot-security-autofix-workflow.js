#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflowPath = path.join(__dirname, "..", ".github", "workflows", "copilot-security-autofix.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

test("Copilot security autofix passes the jq filter as gh api's single --jq argument", () => {
  assert.doesNotMatch(workflow, /--jq\s+--raw\b/);
  assert.match(
    workflow,
    /NEW=\$\(gh api[\s\S]*?--jq '\[\.\[\] \| select\([\s\S]*?\| length'\)/,
  );
});

test("Copilot security autofix remains scoped to workflow runs tied to a PR", () => {
  assert.match(workflow, /if: github\.event\.workflow_run\.pull_requests\[0\]\.number != null/);
  assert.match(workflow, /PR_NUMBER: \$\{\{ github\.event\.workflow_run\.pull_requests\[0\]\.number \}\}/);
});
