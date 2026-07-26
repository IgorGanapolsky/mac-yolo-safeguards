import { describe, expect, it } from "vitest";
import {
  hasAttribution,
  parseAttributionFromPayload,
  parseAttributionFromSearch,
  sanitizeAttributionToken,
} from "./funnel-attribution";

describe("funnel-attribution privacy sanitizer", () => {
  it("accepts campaign-safe tokens", () => {
    expect(sanitizeAttributionToken("linkedin")).toBe("linkedin");
    expect(sanitizeAttributionToken("evidence-installs-v1-20260725")).toBe(
      "evidence-installs-v1-20260725",
    );
    expect(sanitizeAttributionToken("ab_hook_a")).toBe("ab_hook_a");
  });

  it("rejects email-like and free-form junk", () => {
    expect(sanitizeAttributionToken("user@example.com")).toBe("");
    expect(sanitizeAttributionToken("has space")).toBe("");
    expect(sanitizeAttributionToken("evil<script>")).toBe("");
    expect(sanitizeAttributionToken("a".repeat(100)).length).toBeLessThanOrEqual(64);
  });

  it("parses payload camelCase and snake_case", () => {
    const a = parseAttributionFromPayload({
      utm_source: "x",
      utm_campaign: "evidence-installs-v1-20260725",
      cta_id: "evidence_x_play",
    });
    expect(a.utmSource).toBe("x");
    expect(a.utmCampaign).toBe("evidence-installs-v1-20260725");
    expect(a.ctaId).toBe("evidence_x_play");
    expect(hasAttribution(a)).toBe(true);
  });

  it("parses landing search params", () => {
    const a = parseAttributionFromSearch(
      "?utm_source=linkedin&utm_medium=social&utm_campaign=evidence-installs-v1-20260725&cta_id=li_diag",
    );
    expect(a.utmSource).toBe("linkedin");
    expect(a.utmMedium).toBe("social");
    expect(a.utmCampaign).toBe("evidence-installs-v1-20260725");
    expect(a.ctaId).toBe("li_diag");
  });

  it("empty when no tokens", () => {
    expect(hasAttribution(parseAttributionFromSearch(""))).toBe(false);
    expect(hasAttribution(parseAttributionFromPayload({}))).toBe(false);
  });
});
