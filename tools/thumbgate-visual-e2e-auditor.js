#!/usr/bin/env node

/**
 * tools/thumbgate-visual-e2e-auditor.js
 *
 * Automated Visual, Copy, and Behavioral E2E Auditing Suite for ThumbGate.app.
 * Verifies live production health, mobile viewport geometry, copy cleanliness,
 * and Playwright browser regression suites.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BANNED_PATTERNS = [
  { pattern: /If a stranger has not paid/i, reason: "Defensive developer phrasing in public copy" },
  { pattern: /closing the lid kills the agent/i, reason: "Legacy Mac laptop lid marketing" },
  { pattern: /single Mac mini serves 3 developers/i, reason: "Legacy Mac mini hardware bottleneck" },
  { pattern: /Manage machines…/i, reason: "Legacy machine pairing menu option in visible select" },
  { pattern: /\+ Pair computer…/i, reason: "Legacy pair computer option in visible select" },
];

const REQUIRED_PROD_ENDPOINTS = [
  { path: "/api/health", expectedStatus: 200, checkJson: (j) => j.ready === true && j.service === "leash-control" },
  { path: "/api/billing/plan", expectedStatus: 200, checkJson: (j) => j.active === true && j.unitAmount === 1000 },
  { path: "/api/expertise/stats", expectedStatus: 200, checkJson: (j) => Array.isArray(j.caseStudies) && j.caseStudies.length > 0 },
  { path: "/llms.txt", expectedStatus: 200, checkText: (t) => t.includes("ThumbGate") && t.includes("Continuity") },
  { path: "/go/android", expectedStatus: 302, redirectCheck: (loc) => loc.includes("play.google.com") },
  { path: "/go/ios", expectedStatus: 302, redirectCheck: (loc) => loc.includes("apple.com") },
];

/**
 * Audits live production endpoints for HTTP status and data integrity.
 */
async function auditLiveEndpoints(baseUrl = "https://thumbgate.app") {
  const results = [];
  for (const ep of REQUIRED_PROD_ENDPOINTS) {
    const url = `${baseUrl}${ep.path}`;
    try {
      const res = await fetch(url, { redirect: "manual" });
      const status = res.status;
      const location = res.headers.get("location") || "";
      let valid = status === ep.expectedStatus;

      if (ep.checkJson && valid) {
        const json = await res.json();
        valid = ep.checkJson(json);
      } else if (ep.checkText && valid) {
        const text = await res.text();
        valid = ep.checkText(text);
      } else if (ep.redirectCheck && valid) {
        valid = ep.redirectCheck(location);
      }

      results.push({
        path: ep.path,
        status,
        valid,
        location: location || undefined,
      });
    } catch (err) {
      results.push({
        path: ep.path,
        status: 0,
        valid: false,
        error: err.message,
      });
    }
  }
  return {
    ok: results.every((r) => r.valid),
    baseUrl,
    results,
  };
}

/**
 * Checks arbitrary source text/HTML for banned legacy copy or defensive phrasing.
 */
function auditCopySanity(content) {
  const violations = [];
  for (const item of BANNED_PATTERNS) {
    if (item.pattern.test(content)) {
      violations.push({ pattern: item.pattern.toString(), reason: item.reason });
    }
  }
  return {
    clean: violations.length === 0,
    violations,
  };
}

/**
 * Runs Playwright browser E2E test suite in hermes-control-plane.
 */
function runPlaywrightBrowserSuite(repoRoot = path.resolve(__dirname, '..')) {
  const controlPlaneDir = path.join(repoRoot, 'apps/hermes-control-plane');
  try {
    const output = execSync('npm run test:e2e:browser', {
      cwd: controlPlaneDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (err) {
    return {
      ok: false,
      output: err.stdout ? err.stdout.toString() : err.message,
      stderr: err.stderr ? err.stderr.toString() : '',
    };
  }
}

/**
 * CLI execution handler
 */
async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const checkLive = args.includes('--live') || args.length === 0;
  const runE2E = args.includes('--e2e');

  const report = {
    timestamp: new Date().toISOString(),
    liveAudit: null,
    playwrightSuite: null,
  };

  if (checkLive) {
    report.liveAudit = await auditLiveEndpoints();
  }

  if (runE2E) {
    report.playwrightSuite = runPlaywrightBrowserSuite();
  }

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n🔍 ThumbGate Visual & Copy E2E Auditor — ${report.timestamp}\n`);
    if (report.liveAudit) {
      console.log(`📡 Live Endpoints Audit (${report.liveAudit.baseUrl}): ${report.liveAudit.ok ? "✅ PASS" : "❌ FAIL"}`);
      for (const r of report.liveAudit.results) {
        console.log(`  ${r.valid ? "✓" : "✗"} ${r.path.padEnd(24)} -> Status ${r.status}${r.location ? ` (-> ${r.location})` : ""}`);
      }
    }
    if (report.playwrightSuite) {
      console.log(`\n🎭 Playwright Browser E2E Suite: ${report.playwrightSuite.ok ? "✅ PASS" : "❌ FAIL"}`);
    }
  }

  if (report.liveAudit && !report.liveAudit.ok) {
    process.exit(1);
  }
  if (report.playwrightSuite && !report.playwrightSuite.ok) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Auditor error:", err);
    process.exit(1);
  });
}

module.exports = {
  BANNED_PATTERNS,
  REQUIRED_PROD_ENDPOINTS,
  auditLiveEndpoints,
  auditCopySanity,
  runPlaywrightBrowserSuite,
};
