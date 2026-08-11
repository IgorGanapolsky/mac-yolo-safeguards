#!/usr/bin/env node
/**
 * Dual-gate dependency audit for hermes-control-plane.
 *
 * 1) Production tree: fail on any high/critical (deployed runtime).
 * 2) Full tree (incl. build/deploy tools): fail on any critical, and on any
 *    high that is not on the explicit allowlist below.
 *
 * Why not bare `npm audit --omit=dev` alone: that would ignore advisories in
 * vinext/wrangler/playwright used by CI to build and smoke the Worker.
 * Why not bare full-tree high: image-size has no fixed release on npm yet
 * (advisories cover <=2.0.2, latest is 2.0.2); npm's only "fix" is a
 * breaking vinext downgrade to 0.0.45. Allowlist until image-size ships a patch.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

/** @type {Array<{ name: string, viaIncludes?: string, ghsas: string[] }>} */
const ALLOWED_HIGH_FULL_TREE = [
  {
    name: "image-size",
    ghsas: [
      "GHSA-w3rx-r6r6-pgpr",
      "GHSA-5p2g-fcmc-qvqq",
    ],
  },
  {
    // vinext is marked high only as an effect of image-size; no direct GHSA.
    name: "vinext",
    viaIncludes: "image-size",
    ghsas: [],
  },
];

function runAudit(args) {
  const result = spawnSync("npm", ["audit", "--json", ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  // npm audit exits 1 when vulns found; still emits JSON on stdout.
  const stdout = result.stdout || "";
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    console.error("npm audit did not return JSON");
    console.error(stdout.slice(0, 2000));
    console.error(result.stderr || "");
    process.exit(1);
  }
  return report;
}

function listHighCritical(report) {
  const vulns = report.vulnerabilities || {};
  /** @type {Array<{ name: string, severity: string, via: unknown[] }>} */
  const out = [];
  for (const [name, meta] of Object.entries(vulns)) {
    const severity = meta?.severity;
    if (severity === "high" || severity === "critical") {
      out.push({ name, severity, via: meta.via || [] });
    }
  }
  return out;
}

function viaNames(via) {
  return via
    .map((entry) => (typeof entry === "string" ? entry : entry?.name))
    .filter(Boolean);
}

function viaGhsas(via) {
  return via
    .map((entry) => {
      if (typeof entry !== "object" || !entry?.url) return null;
      const m = String(entry.url).match(/GHSA-[a-z0-9-]+/i);
      return m ? m[0].toUpperCase() : null;
    })
    .filter(Boolean);
}

function isAllowlisted(item) {
  const rule = ALLOWED_HIGH_FULL_TREE.find((r) => r.name === item.name);
  if (!rule) return false;
  if (item.severity === "critical") return false;
  if (rule.viaIncludes) {
    const names = viaNames(item.via);
    if (!names.includes(rule.viaIncludes) && item.name !== rule.viaIncludes) {
      // vinext via image-size only
      if (item.name === "vinext") {
        const effectsOnly = viaNames(item.via).length === 0 || viaNames(item.via).includes("image-size");
        // vinext's via is often just "image-size" as string
        return viaNames(item.via).includes("image-size") || effectsOnly;
      }
      return false;
    }
  }
  if (rule.ghsas.length === 0) return true;
  const found = viaGhsas(item.via).map((g) => g.toUpperCase());
  // Allow if every reported GHSA is in the allowlist, or no GHSA objects (string via only).
  if (found.length === 0) return true;
  return found.every((g) => rule.ghsas.map((x) => x.toUpperCase()).includes(g));
}

function main() {
  console.log("security-audit: production tree (high+)");
  const prod = runAudit(["--omit=dev"]);
  const prodBad = listHighCritical(prod);
  if (prodBad.length) {
    console.error("FAIL: production high/critical advisories:");
    for (const item of prodBad) {
      console.error(`  - ${item.severity} ${item.name}`);
    }
    process.exit(1);
  }
  console.log("  ok: 0 high/critical in production tree");

  console.log("security-audit: full tree (critical blocked; high only if allowlisted)");
  const full = runAudit([]);
  const fullItems = listHighCritical(full);
  const critical = fullItems.filter((i) => i.severity === "critical");
  const high = fullItems.filter((i) => i.severity === "high");
  const unallowed = high.filter((i) => !isAllowlisted(i));

  if (critical.length) {
    console.error("FAIL: critical advisories in full tree:");
    for (const item of critical) console.error(`  - critical ${item.name}`);
    process.exit(1);
  }

  if (unallowed.length) {
    console.error("FAIL: high advisories not on allowlist:");
    for (const item of unallowed) console.error(`  - high ${item.name}`);
    process.exit(1);
  }

  if (high.length) {
    console.log("  allowlisted high (build tooling only):");
    for (const item of high) console.log(`  - high ${item.name}`);
  } else {
    console.log("  ok: 0 high/critical in full tree");
  }

  console.log("security-audit: PASS");
}

main();
