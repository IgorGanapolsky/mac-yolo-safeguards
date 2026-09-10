/**
 * Engine chrome for dashboard bubbles.
 * Cloud turns are the Fly fenced VPS. Never paint a paired Mac as Hosted VPS.
 * Never default SuperGrok / localhost Ollama when the live model is something else.
 */
import { formatEngine } from "./turn-statusline.ts";

export type TaskEngineInput = {
  route?: string | null;
  deviceName?: string | null;
  model?: string | null;
  modelHost?: string | null;
};

export function engineLabelForTask(task: TaskEngineInput = {}): string {
  if (task.route === "cloud") {
    return formatEngine({
      model: task.model,
      modelHost: task.modelHost,
    });
  }
  const name = String(task.deviceName || "").trim();
  if (!name) return "Paired computer";
  return `Paired computer · ${name}`;
}
