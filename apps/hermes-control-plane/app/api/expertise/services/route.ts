import { readFile } from "fs/promises";
import path from "path";

/**
 * Public service cards (District Cyber packaging → ThumbGate/Hermes offers).
 * Static JSON from repo config — no DB, no secrets.
 */
export async function GET() {
  try {
    const candidates = [
      path.join(process.cwd(), "config", "ai-services-catalog.json"),
      path.join(process.cwd(), "..", "..", "config", "ai-services-catalog.json"),
      path.join(process.cwd(), "..", "config", "ai-services-catalog.json"),
    ];
    let raw: string | null = null;
    for (const p of candidates) {
      try {
        raw = await readFile(p, "utf8");
        break;
      } catch {
        /* try next */
      }
    }
    if (!raw) {
      return Response.json(
        { error: "ai-services-catalog.json not found", generatedAt: Date.now() },
        { status: 404 },
      );
    }
    const catalog = JSON.parse(raw);
    return Response.json(
      {
        generatedAt: Date.now(),
        product: catalog.productHero,
        journey: catalog.journey,
        services: catalog.services,
        offers: catalog.offers,
        sourceInspiration: catalog.sourceInspiration,
      },
      {
        headers: {
          "cache-control": "public, max-age=300, stale-while-revalidate=600",
          "content-type": "application/json; charset=utf-8",
        },
      },
    );
  } catch (error) {
    console.error("expertise services error:", error);
    return Response.json(
      { error: "Failed to load services catalog", generatedAt: Date.now() },
      { status: 500 },
    );
  }
}
