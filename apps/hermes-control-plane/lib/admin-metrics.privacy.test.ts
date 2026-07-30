import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin metrics privacy contract", () => {
  it("never selects chat prompt/result bodies or IP fields for admin tables", () => {
    const source = readFileSync(new URL("./admin-metrics.ts", import.meta.url), "utf8");
    expect(source).toContain("privacy");
    expect(source).toContain("No LangSmith");
    // Continuity list must not pull prompt/result columns into admin payload construction beyond canary detection
    expect(source).toMatch(/SELECT id, status, route, created_at/);
    // No `s` flag: the pattern contains no `.`, so dotAll changed nothing. `[^;]*`
    // and `\s*` already span newlines. The flag requires target >= ES2018 (TS1501)
    // while this project targets ES2017.
    expect(source).not.toMatch(/SELECT[^;]*\bprompt\b[^;]*FROM tasks[^;]*ORDER BY created_at DESC\s*LIMIT 50/);
    expect(source).not.toMatch(/\bclient_ip\b|\bremote_addr\b|\bip_address\b/i);
    expect(source).toContain("ipAddresses: false");
  });
});
