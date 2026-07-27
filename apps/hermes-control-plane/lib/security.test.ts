import { describe, expect, it } from "vitest";
import {
  base64Url,
  canonicalJson,
  displayFingerprint,
  fromBase64Url,
  publicKeyFingerprint,
  randomToken,
  sha256,
} from "./security";

describe("base64Url round trip", () => {
  it("encodes and decodes arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(base64Url(bytes))).toEqual(bytes);
  });

  it("produces URL-safe output with no padding", () => {
    const encoded = base64Url(new Uint8Array([251, 255, 190, 62]));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("sha256", () => {
  it("matches the RFC test vector for 'abc'", async () => {
    // SHA-256("abc") = ba7816bf... — base64url of those bytes:
    expect(await sha256("abc")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  });

  it("differs for different inputs", async () => {
    expect(await sha256("a")).not.toBe(await sha256("b"));
  });
});

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJson([2, 1, { b: 0, a: 0 }])).toBe('[2,1,{"a":0,"b":0}]');
  });

  it("handles null and primitives", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("x")).toBe('"x"');
    expect(canonicalJson(5)).toBe("5");
  });
});

describe("publicKeyFingerprint", () => {
  it("is stable under JWK key ordering", async () => {
    const a = { kty: "EC", crv: "P-256", x: "xx", y: "yy" };
    const b = { y: "yy", x: "xx", crv: "P-256", kty: "EC" };
    expect(await publicKeyFingerprint(a)).toBe(await publicKeyFingerprint(b));
  });
});

describe("displayFingerprint", () => {
  it("groups the first 20 chars into blocks of 4, uppercased", async () => {
    const display = displayFingerprint("abcdefghij0123456789tail");
    expect(display).toBe("ABCD EFGH IJ01 2345 6789");
  });
});

describe("randomToken", () => {
  it("is unique and respects requested size", () => {
    const seen = new Set(Array.from({ length: 64 }, () => randomToken()));
    expect(seen.size).toBe(64);
    // 16 bytes -> ceil(16*4/3) unpadded base64url chars
    expect(randomToken(16)).toHaveLength(22);
  });
});
