import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FunnelAttribution } from "./funnel-attribution";

type DbCall = { sql: string; bindings: unknown[] };
const dbCalls: DbCall[] = [];

vi.mock("@/lib/runtime", () => ({
  db: () => ({
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => ({
        run: async () => {
          dbCalls.push({ sql, bindings });
          return { success: true };
        },
      }),
    }),
  }),
}));

import { bumpFunnelEvent } from "./funnel-counter";
import {
  buildPlayStoreUrl,
  recordStoreRedirect,
  storeRedirectResponse,
} from "./store-attribution";

const attribution: FunnelAttribution = {
  utmSource: "linkedin",
  utmMedium: "social",
  utmCampaign: "hermes_agent_20260730",
  ctaId: "linkedin_launch_card_a",
};

describe("store attribution", () => {
  beforeEach(() => {
    dbCalls.length = 0;
  });

  it("encodes sanitized campaign tokens into the Google Play Install Referrer", () => {
    const url = new URL(
      buildPlayStoreUrl(
        "https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en_US",
        attribution,
      ),
    );

    expect(url.searchParams.get("id")).toBe("com.iganapolsky.hermesmobile.paid");
    const referrer = new URLSearchParams(url.searchParams.get("referrer") ?? "");
    expect(Object.fromEntries(referrer)).toEqual({
      utm_source: "linkedin",
      utm_medium: "social",
      utm_campaign: "hermes_agent_20260730",
      utm_content: "linkedin_launch_card_a",
      cta_id: "linkedin_launch_card_a",
    });
  });

  it("does not add an empty referrer", () => {
    const url = new URL(
      buildPlayStoreUrl("https://play.google.com/store/apps/details?id=paid", {
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
        ctaId: "",
      }),
    );
    expect(url.searchParams.has("referrer")).toBe(false);
  });

  it("dual-writes aggregate and attributed counters", async () => {
    const database = {
      prepare: (sql: string) => ({
        bind: (...bindings: unknown[]) => ({
          run: async () => {
            dbCalls.push({ sql, bindings });
            return { success: true };
          },
        }),
      }),
    } as unknown as D1Database;

    await bumpFunnelEvent(
      database,
      "play_store_click",
      attribution,
      Date.UTC(2026, 6, 30, 18, 58),
    );

    expect(dbCalls).toHaveLength(2);
    expect(dbCalls[0]?.bindings).toEqual([
      "2026-07-30",
      "play_store_click",
      Date.UTC(2026, 6, 30, 18, 58),
    ]);
    expect(dbCalls[1]?.bindings).toEqual([
      "2026-07-30",
      "play_store_click",
      "linkedin",
      "social",
      "hermes_agent_20260730",
      "linkedin_launch_card_a",
      Date.UTC(2026, 6, 30, 18, 58),
    ]);
  });

  it("records direct /go traffic without a browser beacon", async () => {
    const receipt = await recordStoreRedirect(
      new Request(
        "https://thumbgate.app/go/android?utm_source=linkedin&utm_medium=social&utm_campaign=hermes_agent_20260730&cta_id=linkedin_launch_card_a",
      ),
      "play_store_click",
    );

    expect(receipt).toEqual({
      attribution,
      event: "play_store_click",
      recorded: true,
    });
    expect(dbCalls).toHaveLength(2);
  });

  it("recovers campaign tokens from a same-origin landing referrer", async () => {
    const receipt = await recordStoreRedirect(
      new Request("https://thumbgate.app/go/ios", {
        headers: {
          referer:
            "https://thumbgate.app/?utm_source=linkedin&utm_medium=social&utm_campaign=hermes_agent_20260730&cta_id=linkedin_launch_card_a",
        },
      }),
      "app_store_click",
    );

    expect(receipt).toEqual({
      attribution,
      event: "app_store_click",
      recorded: true,
    });
    expect(dbCalls).toHaveLength(2);
  });

  it("ignores campaign tokens in a cross-origin referrer", async () => {
    const receipt = await recordStoreRedirect(
      new Request("https://thumbgate.app/go/ios", {
        headers: {
          referer:
            "https://untrusted.example/?utm_source=spoof&utm_campaign=fake",
        },
      }),
      "app_store_click",
    );

    expect(receipt.attribution).toEqual({
      utmSource: "",
      utmMedium: "",
      utmCampaign: "",
      ctaId: "",
    });
    expect(dbCalls).toHaveLength(1);
  });

  it("separates identified preview crawlers from human click counters", async () => {
    const receipt = await recordStoreRedirect(
      new Request(
        "https://thumbgate.app/go/android?utm_source=linkedin&utm_medium=social&utm_campaign=hermes_agent_20260730&cta_id=linkedin_launch_card_a",
        {
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; LinkedInBot/1.0; +https://www.linkedin.com)",
          },
        },
      ),
      "play_store_click",
    );

    expect(receipt).toEqual({
      attribution,
      event: "play_store_preview",
      recorded: true,
    });
    expect(dbCalls).toHaveLength(2);
    expect(dbCalls[0]?.bindings[1]).toBe("play_store_preview");
    expect(dbCalls[1]?.bindings[1]).toBe("play_store_preview");
  });

  it("separates explicit prefetch requests from human click counters", async () => {
    const receipt = await recordStoreRedirect(
      new Request("https://thumbgate.app/go/ios", {
        headers: { purpose: "prefetch" },
      }),
      "app_store_click",
    );

    expect(receipt.event).toBe("app_store_preview");
    expect(dbCalls).toHaveLength(1);
    expect(dbCalls[0]?.bindings[1]).toBe("app_store_preview");
  });

  it("returns a non-cacheable privacy-preserving redirect", () => {
    const response = storeRedirectResponse("https://example.com/store");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/store");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
