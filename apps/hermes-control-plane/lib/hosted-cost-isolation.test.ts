import { describe, expect, it } from "vitest";
import {
  attachCostIsolationToReceipt,
  agentFacingCatalog,
  classifySku,
  gradeCostIsolation,
  isolationMode,
  SOURCE,
} from "./hosted-cost-isolation.ts";

describe("hosted cost isolation", () => {
  it("rejects Giga/warehouse SKU escalation past $10", () => {
    expect(classifySku("giga")).toBe("foreign");
    expect(classifySku("hosted-10")).toBe("hosted-10");
    const giga = gradeCostIsolation({
      requestedSku: "giga",
      requestedUsd: 500,
    });
    expect(giga.isolated).toBe(false);
    expect(giga.status).toBe("NOT_OFFERED");
    expect(giga.reasons).toEqual(expect.arrayContaining(["sku_not_offered", "sku_cap_10"]));
    expect(giga.liveClaim).toBe(false);
  });

  it("rejects per-agent Duckling isolation and 100ms idle shutdown", () => {
    expect(isolationMode("per-agent duckling")).toBe("claimed-duckling");
    const grade = gradeCostIsolation({
      requestedSku: "hosted-10",
      claimedIsolation: "own isolated Duckling",
      claimedIdleShutdownMs: 100,
    });
    expect(grade.status).toBe("ISOLATION_INCOMPLETE");
    expect(grade.idleShutdownImplemented).toBe(false);
    expect(grade.reasons).toEqual(
      expect.arrayContaining(["not_per_agent_duckling", "idle_shutdown_not_duckling"]),
    );
  });

  it("isolates hosted-10 on the shared VPS and never claims LIVE", () => {
    const attach = attachCostIsolationToReceipt({
      requestedSku: "hosted-10",
      requestedUsd: 10,
      claimedIsolation: "shared-fenced-vps",
      agentTenantId: "t1",
      boundTenantId: "t1",
    });
    expect(attach.isolated).toBe(true);
    expect(attach.liveClaim).toBe(false);
    expect(attach.clonedDucklings).toBe(false);
    expect(attach.isolation).toBe("shared-fenced-vps");
    expect(attach.reason).toBe("hosted_10_shared_vps");
  });

  it("does not treat the MotherDuck homepage or JWT mint as production", () => {
    const talk = gradeCostIsolation({
      homepageUrl: SOURCE,
      requestedSku: "hosted-10",
    });
    expect(talk.isolated).toBe(false);
    expect(talk.reasons).toContain("talk_is_not_production");

    const jwt = gradeCostIsolation({
      mintUrl: "https://new.motherduck.com",
      requestedSku: "hosted-10",
    });
    expect(jwt.status).toBe("NOT_OFFERED");
    expect(jwt.reasons).toContain("jwt_mint_not_offered");

    const catalog = agentFacingCatalog();
    expect(catalog.motherduckMcp).toBe(false);
    expect(catalog.fuzzyWarehouseCatalog).toBe(false);
    expect(catalog.divesShares).toBe(false);
    expect(catalog.hostedChat).toBe(true);
  });
});
