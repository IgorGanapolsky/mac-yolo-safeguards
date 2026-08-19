/**
 * Pure string memory tiers for hosted Hermes.
 * HISTORY is the session log. MEMORY is upserted facts. Insights are JSONL.
 * Distill without an LLM: promote lines matching /^(fact|decided|lock):\s+/i.
 */

export const FACT_PROMOTE_RE = /^(fact|decided|lock):\s+/i;

export function appendHistory(existing: string, line: string): string {
  const base = String(existing ?? "").replace(/\s*$/, "");
  const next = String(line ?? "").trim();
  if (!next) return base ? `${base}\n` : "";
  return base ? `${base}\n${next}\n` : `${next}\n`;
}

export function upsertMemorySection(existing: string, heading: string, body: string): string {
  const title = String(heading ?? "").trim() || "facts";
  const content = String(body ?? "").trim();
  const text = String(existing ?? "");
  const block = `## ${title}\n${content}\n`;
  if (!text.trim()) return block;
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return `${text.replace(/\s*$/, "")}\n\n${block}`;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  const next = [...lines.slice(0, start), `## ${title}`, content, ...lines.slice(end)];
  return `${next.join("\n").replace(/\s*$/, "")}\n`;
}

export function distillFacts(history: string): string[] {
  return String(history ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => FACT_PROMOTE_RE.test(line));
}

export function appendInsight(jsonl: string, insight: Record<string, unknown>): string {
  const base = String(jsonl ?? "").replace(/\s*$/, "");
  const row = JSON.stringify(insight ?? {});
  return base ? `${base}\n${row}\n` : `${row}\n`;
}

export function renderMemoryFromHistory(history: string): string {
  const facts = distillFacts(history);
  if (facts.length === 0) return "## facts\n";
  return upsertMemorySection("", "facts", facts.join("\n"));
}
