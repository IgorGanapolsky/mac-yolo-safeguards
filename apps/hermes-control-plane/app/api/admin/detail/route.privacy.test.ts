import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin detail endpoint privacy contract", () => {
  it("never selects chat prompt/result bodies or IP fields, and stays admin-gated", () => {
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).toContain("currentAdminSession()");
    expect(source).not.toMatch(/\bSELECT\b[^;]*\bprompt\b[^;]*FROM tasks/is);
    expect(source).not.toMatch(/\bSELECT\b[^;]*\bresult\b[^;]*FROM tasks/is);
    expect(source).not.toMatch(/\bclient_ip\b|\bremote_addr\b|\bip_address\b/i);
  });
});
