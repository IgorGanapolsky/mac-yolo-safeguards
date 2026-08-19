import { afterEach, describe, expect, it } from "vitest";
import {
  admitCloudSend,
  browserHealthy,
  clearHostedAppHostCaches,
  describeHostedResources,
  hostedConnectionCopy,
  hostedResourceLabel,
  isQuotaOrOverloadError,
  mapProviderError,
  modelHealthy,
  parseResetEpoch,
  probeBrowserHealth,
  probeRunnerHealth,
  publicHealthFromCache,
  cachedRunnerHealth,
  rememberProviderError,
  runnerHealthy,
  waitForHostedReady,
} from "./hosted-apphost";

// Aspire WaitFor lesson: Running ≠ Ready. Dependents wait until healthy.

const QUOTA =
  "Weekly/Monthly Limit Exhausted. Your limit will reset at 2026-08-22 21:07:02";
const OVERLOAD = "The service may be temporarily overloaded, please try again later";
const RESET_EPOCH = Date.UTC(2026, 7, 22, 21, 7, 2);

afterEach(() => {
  clearHostedAppHostCaches();
});

describe("parseResetEpoch", () => {
  it("parses reset at YYYY-MM-DD HH:MM:SS as UTC", () => {
    expect(parseResetEpoch(QUOTA)).toBe(RESET_EPOCH);
  });

  it("parses mapped until YYYY-MM-DD HH:MM:SS UTC stamps", () => {
    expect(parseResetEpoch("Hosted model quota is exhausted until 2026-08-22 21:07:02 UTC.")).toBe(RESET_EPOCH);
  });

  it("returns null when no stamp is present", () => {
    expect(parseResetEpoch("code 1310")).toBeNull();
    expect(parseResetEpoch("")).toBeNull();
  });
});

describe("isQuotaOrOverloadError", () => {
  it("matches quota, 1310, overload, and mapped dashboard text", () => {
    expect(isQuotaOrOverloadError(QUOTA)).toBe(true);
    expect(isQuotaOrOverloadError("provider said code 1310 in the body")).toBe(true);
    expect(isQuotaOrOverloadError(OVERLOAD)).toBe(true);
    expect(isQuotaOrOverloadError("Hosted model quota is exhausted until 2026-08-22 21:07:02 UTC.")).toBe(true);
    expect(isQuotaOrOverloadError("Hosted model is temporarily overloaded. The runner is up; the model is not ready.")).toBe(true);
    expect(isQuotaOrOverloadError("disk full")).toBe(false);
  });
});

describe("mapProviderError", () => {
  it("does not return only the raw z.ai string", () => {
    const mapped = mapProviderError(QUOTA);
    expect(mapped).toBe(
      "Hosted model quota is exhausted until 2026-08-22 21:07:02 UTC. The runner is up; the model is not ready.",
    );
    expect(mapped).not.toBe(QUOTA);
    expect(mapped).toContain("The runner is up; the model is not ready.");
  });

  it("maps overload without claiming the runner is the problem", () => {
    const mapped = mapProviderError(OVERLOAD);
    expect(mapped).toBe("Hosted model is temporarily overloaded. The runner is up; the model is not ready.");
    expect(mapped).not.toBe(OVERLOAD);
  });

  it("wraps unknown provider errors so raw text is never the only copy", () => {
    const mapped = mapProviderError("z.ai exploded");
    expect(mapped).toBe("Hosted model is not ready. z.ai exploded");
    expect(mapped).not.toBe("z.ai exploded");
  });
});

describe("runnerHealthy", () => {
  const now = RESET_EPOCH;

  it("requires ok===true and a fresh lastPollAt", () => {
    expect(runnerHealthy({ ok: true, lastPollAt: now - 10_000 }, now)).toBe(true);
    expect(runnerHealthy({ ok: true, lastPollAt: now - 60_000 }, now)).toBe(false);
    expect(runnerHealthy({ ok: true, lastPollAt: now - 59_999 }, now)).toBe(true);
    expect(runnerHealthy({ ok: false, lastPollAt: now - 1_000 }, now)).toBe(false);
    expect(runnerHealthy({ ok: true, lastPollAt: null }, now)).toBe(false);
    expect(runnerHealthy({}, now)).toBe(false);
  });
});

describe("modelHealthy", () => {
  it("stays unhealthy until the reset epoch, then recovers", () => {
    expect(modelHealthy({ lastError: QUOTA, now: RESET_EPOCH - 1 })).toBe(false);
    expect(modelHealthy({ lastError: QUOTA, now: RESET_EPOCH })).toBe(true);
    expect(modelHealthy({ lastError: QUOTA, now: RESET_EPOCH + 1 })).toBe(true);
  });

  it("treats overload as unhealthy and missing errors as healthy", () => {
    expect(modelHealthy({ lastError: OVERLOAD, now: RESET_EPOCH })).toBe(false);
    expect(modelHealthy({ lastError: null, now: RESET_EPOCH })).toBe(true);
    expect(modelHealthy({ lastError: "disk full", now: RESET_EPOCH })).toBe(true);
  });
});

describe("waitForHostedReady", () => {
  const now = RESET_EPOCH - 1_000;
  const healthyRunner = { ok: true, lastPollAt: now - 5_000 };

  it("is ready only when runner and model are both healthy", () => {
    expect(waitForHostedReady({ runner: healthyRunner, modelError: null, now })).toEqual({
      ready: true,
      waitingOn: [],
      message: "Hosted runner and model are ready.",
    });
  });

  it("waits on the runner when health is stale even if the process is up", () => {
    const result = waitForHostedReady({
      runner: { ok: true, lastPollAt: now - 120_000 },
      modelError: null,
      now,
    });
    expect(result.ready).toBe(false);
    expect(result.waitingOn).toEqual(["runner"]);
  });

  it("waits on the model when quota is exhausted", () => {
    const result = waitForHostedReady({
      runner: healthyRunner,
      modelError: QUOTA,
      now,
    });
    expect(result.ready).toBe(false);
    expect(result.waitingOn).toEqual(["model"]);
    expect(result.message).toContain("quota is exhausted until 2026-08-22 21:07:02 UTC");
  });

  it("waits on both resources when neither is ready", () => {
    const result = waitForHostedReady({
      runner: { ok: false, lastPollAt: null },
      modelError: OVERLOAD,
      now,
    });
    expect(result.ready).toBe(false);
    expect(result.waitingOn).toEqual(["runner", "model"]);
  });
});

describe("admitCloudSend", () => {
  it("allows only a ready WaitFor result", () => {
    expect(admitCloudSend({ ready: true, waitingOn: [], message: "ok" })).toEqual({
      allowed: true,
      message: "ok",
    });
    expect(admitCloudSend({
      ready: false,
      waitingOn: ["model"],
      message: "Hosted model quota is exhausted until 2026-08-22 21:07:02 UTC. The runner is up; the model is not ready.",
    }).allowed).toBe(false);
  });
});

describe("hostedConnectionCopy", () => {
  it("does not claim live or instantly when resources are unhealthy", () => {
    const copy = hostedConnectionCopy({
      runnerStatus: "healthy",
      modelStatus: "unhealthy",
      message: mapProviderError(QUOTA),
    });
    expect(copy.live).toBe(false);
    expect(copy.headline).toBe("Hosted Hermes not ready");
    expect(copy.body.toLowerCase()).not.toContain("instantly");
    expect(copy.headline.toLowerCase()).not.toContain("live");
    expect(copy.body).toContain("quota is exhausted");
    expect(copy.body).toContain("fenced VPS");
  });

  it("keeps hosted Hermes / fenced VPS / $10 when healthy", () => {
    const copy = hostedConnectionCopy({
      runnerStatus: "healthy",
      modelStatus: "healthy",
    });
    expect(copy.live).toBe(true);
    expect(copy.headline).toBe("Hosted Hermes live");
    expect(copy.body).toContain("fenced VPS");
    expect(copy.body).toContain("$10");
    expect(copy.body.toLowerCase()).not.toContain("instantly");
  });

  it("labels resources Waiting / Healthy / Unhealthy", () => {
    expect(hostedResourceLabel("waiting")).toBe("Waiting");
    expect(hostedResourceLabel("healthy")).toBe("Healthy");
    expect(hostedResourceLabel("unhealthy")).toBe("Unhealthy");
  });
});

describe("describeHostedResources", () => {
  it("marks runner waiting until a probe has been seen", () => {
    const now = RESET_EPOCH;
    const described = describeHostedResources({
      runner: {},
      modelError: null,
      now,
      runnerKnown: false,
    });
    expect(described.hostedRunner.status).toBe("waiting");
    expect(described.hostedModel.status).toBe("healthy");
    expect(described.ready).toBe(false);
  });
});

describe("rememberProviderError", () => {
  it("lets admission see a mapped quota after complete without D1", () => {
    rememberProviderError(mapProviderError(QUOTA), RESET_EPOCH - 1);
    expect(modelHealthy({ now: RESET_EPOCH - 1 })).toBe(false);
    expect(modelHealthy({ now: RESET_EPOCH })).toBe(true);
  });
});

describe("browserHealthy", () => {
  const now = RESET_EPOCH;

  it("is false for undefined/null and true for a healthy poll", () => {
    expect(browserHealthy(undefined, now)).toBe(false);
    expect(browserHealthy(null, now)).toBe(false);
    expect(browserHealthy({ ok: true, lastPollAt: now - 5_000 }, now)).toBe(true);
  });
});

describe("waitForHostedReady browser sidecar", () => {
  const now = RESET_EPOCH - 1_000;
  const healthyRunner = { ok: true, lastPollAt: now - 5_000 };

  it("stays ready when browser is missing if browser is not required", () => {
    const result = waitForHostedReady({
      runner: healthyRunner,
      modelError: null,
      browser: null,
      now,
    });
    expect(result.ready).toBe(true);
    expect(result.waitingOn).toEqual([]);
  });

  it("waits on browser and refuses admit when required browser is null", () => {
    const result = waitForHostedReady({
      runner: healthyRunner,
      modelError: null,
      browser: null,
      required: ["runner", "model", "browser"],
      now,
    });
    expect(result.ready).toBe(false);
    expect(result.waitingOn).toEqual(["browser"]);
    expect(admitCloudSend(result).allowed).toBe(false);
  });

  it("is ready when required browser is healthy", () => {
    const result = waitForHostedReady({
      runner: healthyRunner,
      modelError: null,
      browser: { ok: true, lastPollAt: now - 5_000 },
      required: ["runner", "model", "browser"],
      now,
    });
    expect(result.ready).toBe(true);
    expect(result.waitingOn).toEqual([]);
  });
});

describe("probeBrowserHealth", () => {
  it("does not call fetchImpl when HERMES_HOSTED_BROWSER_HEALTH_URL is unset", async () => {
    const prev = process.env.HERMES_HOSTED_BROWSER_HEALTH_URL;
    delete process.env.HERMES_HOSTED_BROWSER_HEALTH_URL;
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      throw new Error("fetchImpl should not be called");
    }) as unknown as typeof fetch;
    try {
      const health = await probeBrowserHealth({ now: RESET_EPOCH, fetchImpl, force: true });
      expect(called).toBe(false);
      expect(health.ok).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.HERMES_HOSTED_BROWSER_HEALTH_URL;
      else process.env.HERMES_HOSTED_BROWSER_HEALTH_URL = prev;
    }
  });
});

describe("cachedRunnerHealth", () => {
  it("is unknown until a probe has been cached and does not advertise paid", async () => {
    expect(cachedRunnerHealth().known).toBe(false);
    const unknown = publicHealthFromCache({ now: RESET_EPOCH, stripeConfigured: true });
    expect(unknown.trust).toEqual({ runner: "reachable", model: "reachable" });
    expect(unknown.advertisePaid).toBe(false);
    expect(unknown.turningOn).toBe(true);

    await probeRunnerHealth({
      now: RESET_EPOCH,
      force: true,
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({ ok: true, lastPollAt: RESET_EPOCH - 1_000 }),
      })) as unknown as typeof fetch,
    });
    expect(cachedRunnerHealth().known).toBe(true);
    const known = publicHealthFromCache({ now: RESET_EPOCH, stripeConfigured: true });
    expect(known.trust.runner).toBe("verified");
    expect(known.advertisePaid).toBe(true);
    expect(known.turningOn).toBe(false);
  });
});
