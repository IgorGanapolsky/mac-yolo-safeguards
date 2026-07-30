import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin detail endpoint privacy contract", () => {
  it("never selects chat prompt/result bodies or IP fields, and stays admin-gated", () => {
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("currentAdminSession()");
    // No `s` flag: it only changes what `.` matches, and neither pattern uses `.`.
    // `[^;]*` already spans newlines. The flag needs target >= ES2018 (TS1501) while
    // this project targets ES2017, so it was a no-op that broke the typecheck.
    expect(source).not.toMatch(/\bSELECT\b[^;]*\bprompt\b[^;]*FROM tasks/i);
    expect(source).not.toMatch(/\bSELECT\b[^;]*\bresult\b[^;]*FROM tasks/i);
    expect(source).not.toMatch(/\bclient_ip\b|\bremote_addr\b|\bip_address\b/i);
  });
});
