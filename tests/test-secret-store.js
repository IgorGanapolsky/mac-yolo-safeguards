#!/usr/bin/env node
/**
 * Round-trip tests for tools/secret-store.js.
 *
 * The bug these pin (found 2026-08-01): `set --stdin` piped the value to
 * `security ... -U -w` with -w given no operand, believing security(1) reads it from
 * stdin. It prompts instead, so EVERY secret stored that way was empty — a 53-char
 * Cloudflare API token and a 13-char probe both landed as 1 byte. `set` still printed
 * "Stored ... The value was not logged.", so the failure was completely silent, and it
 * was only caught because an API call using the stored token returned "Invalid format
 * for Authorization header".
 *
 * There were no tests for this file at all. A credential store that silently stores
 * nothing is worse than no store, because callers believe the secret is safe.
 *
 * Values are synthetic and deleted afterwards; nothing real is written.
 */

const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");

const TOOL = path.join(__dirname, "..", "tools", "secret-store.js");
const NAME = "SECRET_STORE_SELFTEST";
const SERVICE = "hermes-agent-secrets";

let failures = 0;

function cleanup() {
  spawnSync("security", ["delete-generic-password", "-a", NAME, "-s", SERVICE], {
    stdio: "ignore",
  });
}

function setViaStdin(value) {
  return spawnSync("node", [TOOL, "set", NAME, "--stdin"], { input: value, encoding: "utf8" });
}

function getValue() {
  try {
    return execFileSync("node", [TOOL, "get", NAME], { encoding: "utf8" }).replace(/\n$/, "");
  } catch {
    return null;
  }
}

function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`);
  }
}

function roundTrip(label, value) {
  cleanup();
  const r = setViaStdin(value);
  if (r.status !== 0) {
    check(label, false, `set exited ${r.status}: ${(r.stderr || "").trim().slice(0, 120)}`);
    return;
  }
  const got = getValue();
  check(label, got === value, `wanted ${value.length} chars, got ${got === null ? "null" : got.length}`);
}

console.log("secret-store round-trip:");
// The exact shapes that were broken or at risk.
roundTrip("plain ascii", "ABCDEFGH12345");
roundTrip("cloudflare-style token", "cfut_EXAMPLEnotarealtokenEXAMPLEnotarealtoken0000000");
roundTrip("password metacharacters", "Xx9metachars&*");
roundTrip("contains spaces", "two words here"); // unquoted `security -i` stored 0 bytes
roundTrip("leading/trailing space", " pad ");
roundTrip("embedded double quote", 'a"b');
roundTrip("backslash", "a\\b");
roundTrip("dollar and backtick", "a$b`c");
roundTrip("long random", "x".repeat(200));

console.log("guards:");

// A silent empty store is the whole bug — it must be impossible, not merely unlikely.
cleanup();
const empty = setViaStdin("");
check("empty input is rejected", empty.status !== 0, `exited ${empty.status}`);

// Non-ASCII cannot round-trip through `security -w` (returns hex), so it must fail
// loudly rather than hand back a corrupted secret that looks legitimate.
cleanup();
const uni = setViaStdin("pässwörd");
check("non-ascii is rejected, not corrupted", uni.status !== 0, `exited ${uni.status}`);

// The value must never be visible in the process table.
cleanup();
const marker = "PSLEAKCANARY" + "9182736455";
setViaStdin(marker);
const ps = spawnSync("sh", ["-c", "ps -Ao command= 2>/dev/null"], { encoding: "utf8" });
check("value absent from process table", !(ps.stdout || "").includes(marker));

// get on a missing name must fail rather than return a confusing empty string.
cleanup();
const missing = spawnSync("node", [TOOL, "get", NAME], { encoding: "utf8" });
check("get of unset name fails", missing.status !== 0, `exited ${missing.status}`);

cleanup();
console.log(failures === 0 ? `\nPASS: secret-store (${13} checks)` : `\nFAIL: ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
