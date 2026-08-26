import { describe, expect, it } from "vitest";
import { insertTaskFiles, loadTaskAttachments } from "./task-files.ts";

type Row = {
  id: string;
  organization_id: string;
  task_id: string;
  name: string;
  mime: string;
  kind: string;
  size_bytes: number;
  chunk_index: number;
  data: string;
  created_at: number;
};

function memoryDb() {
  const rows: Row[] = [];
  return {
    rows,
    prepare(sql: string) {
      const statement: {
        args: unknown[];
        bind: (...next: unknown[]) => typeof bound;
      } = {
        args: [],
        bind(...next: unknown[]) {
          const bound = {
            async run() {
              if (sql.includes("INSERT INTO task_files")) {
                rows.push({
                  id: String(next[0]),
                  organization_id: String(next[1]),
                  task_id: String(next[2]),
                  name: String(next[3]),
                  mime: String(next[4]),
                  kind: String(next[5]),
                  size_bytes: Number(next[6]),
                  chunk_index: Number(next[7]),
                  data: String(next[8]),
                  created_at: Number(next[9]),
                });
              }
            },
            async all() {
              return {
                results: rows
                  .filter((row) => row.organization_id === next[0] && row.task_id === next[1])
                  .map((row) => ({
                    id: row.id,
                    name: row.name,
                    mime: row.mime,
                    kind: row.kind,
                    sizeBytes: row.size_bytes,
                    chunkIndex: row.chunk_index,
                    data: row.data,
                  })),
              };
            },
          };
          return bound;
        },
      };
      return {
        ...statement,
        async run() { return undefined; },
      };
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      for (const item of statements) await item.run();
    },
  };
}

describe("task_files chunks", () => {
  it("round-trips an image across chunks and omits text bytes on load", async () => {
    const database = memoryDb();
    const image = Buffer.alloc(20_000, 7).toString("base64");
    const notes = Buffer.from("hello from notes").toString("base64");
    await insertTaskFiles(database, {
      organizationId: "org-1",
      taskId: "task-1",
      attachments: [
        { name: "shot.png", mime: "image/png", kind: "image", data: image, sizeBytes: 20_000 },
        { name: "notes.txt", mime: "text/plain", kind: "text", data: notes, sizeBytes: 16 },
      ],
    });
    expect(database.rows.length).toBeGreaterThan(1);
    const loaded = await loadTaskAttachments(database, { organizationId: "org-1", taskId: "task-1" });
    const png = loaded.find((item) => item.name === "shot.png");
    const txt = loaded.find((item) => item.name === "notes.txt");
    expect(png?.data).toBe(image);
    expect(txt?.text).toBe("hello from notes");
    expect(txt?.data).toBe("");
  });
});
