#!/usr/bin/env node
/**
 * secret-store.js — macOS Keychain wrapper so credentials never travel through chat.
 *
 * Why this exists
 * ---------------
 * Passwords have been pasted into agent chat at least twice (2026-07-28, 2026-07-29).
 * Every time that happens the credential lands in a transcript, and in both cases it
 * was unnecessary — the browser session was already authenticated.
 *
 * The fix is not "be careful." It is a path where the value has nowhere to leak:
 *
 *   you ──► Keychain ──► process env
 *
 * The agent orchestrates that path and never observes the value. Design rules:
 *
 *   1. Values are NEVER accepted as a command-line argument. `ps` shows argv to every
 *      process on the machine, and shell history keeps it forever. `set` reads from a
 *      TTY prompt or piped stdin only.
 *   2. `get` writes to stdout for piping into a process. Do not paste its output.
 *      Prefer `exec`, which never materialises the value in a terminal at all.
 *   3. `list` prints names only. There is no command that prints all values.
 *   4. Nothing here writes a secret to any file in the repo.
 *
 * Usage
 * -----
 *   node tools/secret-store.js set SKOOL_PASSWORD          # prompts; value hidden
 *   echo -n "$VAL" | node tools/secret-store.js set NAME --stdin
 *   node tools/secret-store.js list
 *   node tools/secret-store.js exec SKOOL_PASSWORD -- some-command --flag
 *   node tools/secret-store.js get NAME                    # last resort, for pipes
 *   node tools/secret-store.js delete NAME
 *
 * `exec` is the intended path: it injects the secret as an env var into a child
 * process and nothing else ever sees it.
 *
 * Exit: 0 ok · 1 not found / failure · 2 usage error
 */

const { spawnSync, execFileSync } = require("node:child_process");
const readline = require("node:readline");

const SERVICE = "hermes-agent-secrets";
const NAME_RE = /^[A-Z0-9_]{2,64}$/;

function assertMac() {
  if (process.platform !== "darwin") {
    console.error(
      "secret-store requires macOS Keychain. On Linux/CI, provide the value as an " +
        "environment variable from your CI secret store instead.",
    );
    process.exit(1);
  }
}

function validName(name) {
  if (!name || !NAME_RE.test(name)) {
    console.error(`Invalid name "${name}". Use SCREAMING_SNAKE_CASE, 2-64 chars.`);
    return false;
  }
  return true;
}

/** Read a secret without echoing it and without putting it in argv. */
function readSecretInteractively(name) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    process.stderr.write(`Value for ${name} (input hidden, not echoed): `);
    const onData = (char) => {
      // Suppress echo: rewrite the line with nothing.
      if (["\n", "\r", ""].includes(String(char))) {
        process.stdin.removeListener("data", onData);
        process.stderr.write("\n");
      } else {
        readline.moveCursor(process.stderr, -100, 0);
        readline.clearLine(process.stderr, 1);
        process.stderr.write(`Value for ${name} (input hidden, not echoed): `);
      }
    };
    process.stdin.on("data", onData);
    rl.question("", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function readStdin() {
  try {
    return require("node:fs").readFileSync(0, "utf8").replace(/\n$/, "");
  } catch {
    return "";
  }
}

// Values must round-trip byte-for-byte, and must never appear in argv.
//
// The previous implementation piped the value to `security ... -U -w` with -w given no
// operand, on the belief that security(1) then reads it from stdin. It does not — it
// prompts — so every `set --stdin` silently stored an EMPTY secret. Measured 2026-08-01:
// a 53-char Cloudflare token and a 13-char probe both landed as 1 byte, and the failure
// was invisible because `set` still printed "Stored ... The value was not logged."
//
// `security -i` reads COMMANDS from stdin, so the value rides stdin rather than argv —
// `ps` shows only `security -i` (verified). The interactive parser splits on whitespace,
// so the value must be double-quoted with " and \ escaped, or anything containing a
// space stores as empty (verified: 'two words here' -> 0 bytes unquoted, exact quoted).
const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;

// Split out so the escaping can be unit-tested on ANY platform. The Keychain itself is
// macOS-only, and this repo's CI runs the Node suite on ubuntu — so without this the
// only tests would be ones CI can never execute, i.e. no protection at all where it
// counts. The space-handling bug lived here, not in the Keychain call.
function escapeForSecurityInteractive(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildSecuritySetCommand(name, value) {
  return `add-generic-password -a ${name} -s ${SERVICE} -U -w "${escapeForSecurityInteractive(value)}"\n`;
}

function keychainSet(name, value) {
  // Non-ASCII cannot round-trip: `find-generic-password -w` prints such passwords
  // HEX-ENCODED, so a stored "pässwörd" reads back as "70c3a4737377c3b67264". Failing
  // loudly beats handing back a corrupted secret that looks like a valid one.
  if (!ASCII_PRINTABLE.test(value)) {
    return (
      "value contains non-ASCII or control characters, which macOS `security` returns " +
      "hex-encoded on read and would corrupt silently. Store an ASCII-safe encoding " +
      "(e.g. base64) instead."
    );
  }
  const r = spawnSync("security", ["-i"], {
    input: buildSecuritySetCommand(name, value),
    encoding: "utf8",
  });
  if (r.status !== 0) return (r.stderr || "").trim() || "security exited " + r.status;
  // security -i reports per-command failures on stderr while still exiting 0, and a
  // silent no-op is exactly the bug being fixed — so confirm the write landed.
  const back = keychainGet(name);
  if (back !== value) {
    return `write did not round-trip (stored ${back === null ? "nothing" : back.length + " chars"}, expected ${value.length})`;
  }
  return null;
}

function keychainGet(name) {
  try {
    return execFileSync("security", ["find-generic-password", "-a", name, "-s", SERVICE, "-w"], {
      encoding: "utf8",
    }).replace(/\n$/, "");
  } catch {
    return null;
  }
}

function keychainList() {
  try {
    const out = execFileSync("security", ["dump-keychain"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const names = new Set();
    const blocks = out.split("keychain:");
    for (const b of blocks) {
      if (!b.includes(SERVICE)) continue;
      const m = b.match(/"acct"<blob>="([^"]+)"/);
      if (m) names.add(m[1]);
    }
    return [...names].sort();
  } catch {
    return [];
  }
}

async function main() {
  const [cmd, name, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(require("node:fs").readFileSync(__filename, "utf8").split("*/")[0]);
    return 2;
  }

  assertMac();

  if (cmd === "list") {
    const names = keychainList();
    console.log(names.length ? names.join("\n") : "(no secrets stored under " + SERVICE + ")");
    console.log(`\n${names.length} secret(s). Values are never printed by this tool.`);
    return 0;
  }

  if (!validName(name)) return 2;

  if (cmd === "set") {
    const value = rest.includes("--stdin") ? readStdin() : await readSecretInteractively(name);
    if (!value) {
      console.error("Empty value; nothing stored.");
      return 2;
    }
    const err = keychainSet(name, value);
    if (err) {
      console.error(`Keychain write failed: ${err}`);
      return 1;
    }
    console.error(`Stored ${name} in Keychain service "${SERVICE}". The value was not logged.`);
    return 0;
  }

  if (cmd === "get") {
    const v = keychainGet(name);
    if (v === null) {
      console.error(`${name} not found. Add it: node tools/secret-store.js set ${name}`);
      return 1;
    }
    process.stdout.write(v); // for piping; do not paste this anywhere
    return 0;
  }

  if (cmd === "exec") {
    const sep = rest.indexOf("--");
    const argv = sep >= 0 ? rest.slice(sep + 1) : [];
    if (argv.length === 0) {
      console.error("Usage: secret-store.js exec NAME -- <command> [args...]");
      return 2;
    }
    const v = keychainGet(name);
    if (v === null) {
      console.error(`${name} not found.`);
      return 1;
    }
    const r = spawnSync(argv[0], argv.slice(1), {
      stdio: "inherit",
      env: { ...process.env, [name]: v }, // only the child sees it
    });
    return r.status ?? 1;
  }

  if (cmd === "delete") {
    const r = spawnSync("security", ["delete-generic-password", "-a", name, "-s", SERVICE], { encoding: "utf8" });
    console.error(r.status === 0 ? `Deleted ${name}.` : `Not found: ${name}`);
    return r.status === 0 ? 0 : 1;
  }

  console.error(`Unknown command: ${cmd}`);
  return 2;
}

// Exported for tests. Requiring this file must not run the CLI, or `node -e require(...)`
// would execute a command.
module.exports = {
  ASCII_PRINTABLE,
  escapeForSecurityInteractive,
  buildSecuritySetCommand,
  SERVICE,
};

if (require.main === module) {
  main().then((code) => process.exit(code));
}
