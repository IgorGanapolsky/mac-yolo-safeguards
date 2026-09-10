import { describe, expect, it } from "vitest";
import { engineLabelForTask } from "./dashboard-engine-label.ts";

describe("engineLabelForTask", () => {
  it("labels cloud turns as the fenced VPS, never a paired Mac", () => {
    const cloud = engineLabelForTask({
      route: "cloud",
      deviceName: "Igors-MacBook-Pro",
      model: "gemini-2.5-flash",
      modelHost: "generativelanguage.googleapis.com",
    });
    expect(cloud).toBe("Hosted Hermes · Gemini (gemini-2.5-flash)");
    expect(cloud).not.toMatch(/MacBook/i);
    expect(cloud).not.toMatch(/Ollama|11434/i);
    expect(cloud).not.toMatch(/SuperGrok/i);
  });

  it("labels local turns as a paired computer, not Hosted VPS", () => {
    expect(engineLabelForTask({
      route: "local",
      deviceName: "Igors-MacBook-Pro",
    })).toBe("Paired computer · Igors-MacBook-Pro");
  });
});
