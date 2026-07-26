import { rm } from "node:fs/promises";
import { STATE_FILE } from "./global-setup.mjs";

export default async function globalTeardown() {
  const handles = globalThis.__thumbgateE2E__;
  if (handles?.worker && handles.worker.exitCode === null) {
    handles.worker.kill("SIGTERM");
    await new Promise((resolve) => handles.worker.once("exit", resolve));
  }
  if (handles?.gateway) {
    await handles.gateway.close();
  }
  try {
    const { readFile } = await import("node:fs/promises");
    const state = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if (state.persistence) await rm(state.persistence, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; state file may not exist if setup failed early.
  }
  await rm(STATE_FILE, { force: true });
}
