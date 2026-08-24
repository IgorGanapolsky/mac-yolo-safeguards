import { describe, expect, it } from "vitest";
import {
  OBSCURA_SSRF_SOURCE,
  evaluateBrowserSession,
  evaluateCdpBind,
  evaluateSsrf,
  isPrivateIpv4,
} from "./ssrf-guard";

describe("ssrf-guard (Obscura steal for thumbgate.app)", () => {
  it("allows public https", () => {
    const r = evaluateSsrf("https://example.com/docs");
    expect(r.allowed).toBe(true);
    expect(r.liveClaim).toBe(false);
    expect(r.documentation_url).toBe(OBSCURA_SSRF_SOURCE);
  });

  it("blocks loopback, RFC1918, link-local metadata, and CGNAT", () => {
    expect(evaluateSsrf("http://127.0.0.1:8080").allowed).toBe(false);
    expect(evaluateSsrf("http://10.0.0.5/").allowed).toBe(false);
    expect(evaluateSsrf("http://192.168.1.1/").allowed).toBe(false);
    expect(evaluateSsrf("http://172.16.0.1/").allowed).toBe(false);
    expect(evaluateSsrf("http://169.254.169.254/latest/meta-data/").allowed).toBe(false);
    expect(evaluateSsrf("http://100.64.0.1/").allowed).toBe(false);
    expect(evaluateSsrf("http://0.0.0.0/").allowed).toBe(false);
  });

  it("blocks localhost, .local, and rebinding helpers", () => {
    expect(evaluateSsrf("http://localhost:3000").allowed).toBe(false);
    expect(evaluateSsrf("http://Igors-MacBook-Pro.local:8642").allowed).toBe(false);
    expect(evaluateSsrf("http://127.0.0.1.nip.io/").allowed).toBe(false);
    expect(evaluateSsrf("http://metadata.google.internal/").allowed).toBe(false);
  });

  it("blocks decimal IPv4 2130706433 as 127.0.0.1", () => {
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(evaluateSsrf("http://2130706433/").allowed).toBe(false);
  });

  it("blocks IPv6 loopback and ULA", () => {
    expect(evaluateSsrf("http://[::1]/").allowed).toBe(false);
    expect(evaluateSsrf("http://[fd00:ec2::254]/").allowed).toBe(false);
  });

  it("blocks file/data schemes", () => {
    expect(evaluateSsrf("file:///etc/passwd").allowed).toBe(false);
    expect(evaluateSsrf("data:text/html,hi").allowed).toBe(false);
  });

  it("DNS-rebinding: public name + private resolved address", () => {
    const r = evaluateSsrf("https://evil.example", { resolvedAddresses: ["127.0.0.1"] });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/DNS-rebinding/);
  });

  it("operator override is the only way to allow private", () => {
    const blocked = evaluateSsrf("http://127.0.0.1/");
    expect(blocked.allowed).toBe(false);
    const allowed = evaluateSsrf("http://127.0.0.1/", { allowPrivateNetwork: true });
    expect(allowed.allowed).toBe(true);
  });

  it("CDP bind must be loopback", () => {
    expect(evaluateCdpBind("127.0.0.1").allowed).toBe(true);
    expect(evaluateCdpBind("0.0.0.0").allowed).toBe(false);
    expect(evaluateCdpBind("::").allowed).toBe(false);
  });

  it("zero-state: never reuse interactive Chrome", () => {
    expect(evaluateBrowserSession({ reuseInteractiveChrome: true }).allowed).toBe(false);
    expect(evaluateBrowserSession({ persistCookiesAcrossJobs: true }).allowed).toBe(false);
    expect(evaluateBrowserSession({}).allowed).toBe(true);
  });
});
