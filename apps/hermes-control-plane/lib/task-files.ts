import {
  TASK_FILES_DDL,
  chunkAttachmentData,
  type ValidAttachment,
} from "./composer-attachments.ts";

type Bound = {
  run: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
};

type D1Like = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => Bound;
    run: () => Promise<unknown>;
  };
  batch: (statements: Bound[]) => Promise<unknown>;
};

export async function ensureTaskFilesTable(database: D1Like): Promise<void> {
  await database.prepare(TASK_FILES_DDL).run();
  await database
    .prepare("CREATE INDEX IF NOT EXISTS task_files_task_idx ON task_files (organization_id, task_id)")
    .run();
}

export async function insertTaskFiles(
  database: D1Like,
  input: { organizationId: string; taskId: string; attachments: ValidAttachment[] },
): Promise<void> {
  if (!input.attachments.length) return;
  await ensureTaskFilesTable(database);
  const now = Date.now();
  const statements = [];
  for (const file of input.attachments) {
    const fileId = crypto.randomUUID();
    const chunks = chunkAttachmentData(file.data);
    chunks.forEach((chunk, index) => {
      statements.push(
        database
          .prepare(
            `INSERT INTO task_files
              (id, organization_id, task_id, name, mime, kind, size_bytes, chunk_index, data, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            fileId,
            input.organizationId,
            input.taskId,
            file.name,
            file.mime,
            file.kind,
            file.sizeBytes,
            index,
            chunk,
            now,
          ),
      );
    });
  }
  const BATCH = 40;
  for (let i = 0; i < statements.length; i += BATCH) {
    await database.batch(statements.slice(i, i + BATCH));
  }
}

export async function loadTaskAttachments(
  database: D1Like,
  input: { organizationId: string; taskId: string },
): Promise<
  Array<{ name: string; mime: string; kind: string; sizeBytes: number; data: string; text?: string }>
> {
  await ensureTaskFilesTable(database);
  const rows = await database
    .prepare(
      `SELECT id, name, mime, kind, size_bytes AS sizeBytes, chunk_index AS chunkIndex, data
         FROM task_files
        WHERE organization_id = ? AND task_id = ?
        ORDER BY id, chunk_index`,
    )
    .bind(input.organizationId, input.taskId)
    .all() as {
    results: Array<{
      id: string;
      name: string;
      mime: string;
      kind: string;
      sizeBytes: number;
      chunkIndex: number;
      data: string;
    }>;
  };
  const grouped = new Map<string, typeof rows.results>();
  for (const row of rows.results || []) {
    const list = grouped.get(row.id) ?? [];
    list.push(row);
    grouped.set(row.id, list);
  }
  const out = [];
  for (const list of grouped.values()) {
    const first = list[0];
    const data = list.map((row) => row.data).join("");
    const item: {
      name: string;
      mime: string;
      kind: string;
      sizeBytes: number;
      data: string;
      text?: string;
    } = {
      name: first.name,
      mime: first.mime,
      kind: first.kind,
      sizeBytes: first.sizeBytes,
      data,
    };
    if (first.kind === "text") {
      try {
        item.text = Buffer.from(data, "base64").toString("utf8");
      } catch {
        item.text = "";
      }
      item.data = "";
    }
    out.push(item);
  }
  return out;
}
