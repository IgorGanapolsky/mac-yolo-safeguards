import type { HermesCapabilities } from '../types/gatewayApi';
import { displayableLlmModel } from './runProgressDisplay';

export function listDisplayableGatewayModels(
  caps: HermesCapabilities | null | undefined,
): string[] {
  if (!caps) {
    return [];
  }
  const seen = new Set<string>();
  const models: string[] = [];

  const push = (raw: string | undefined | null) => {
    const model = displayableLlmModel(raw);
    if (model && !seen.has(model)) {
      seen.add(model);
      models.push(model);
    }
  };

  push(caps.default_model);
  push(caps.llm);
  push(caps.model);

  for (const entry of caps.models ?? []) {
    const raw = typeof entry === 'string' ? entry : entry?.id ?? entry?.name ?? entry?.model;
    push(raw);
  }

  return models;
}

export function primaryGatewayModelLabel(
  caps: HermesCapabilities | null | undefined,
): string | null {
  return listDisplayableGatewayModels(caps)[0] ?? null;
}

export function formatGatewayModelPickerLabel(
  caps: HermesCapabilities | null | undefined,
): string {
  const primary = primaryGatewayModelLabel(caps);
  const all = listDisplayableGatewayModels(caps);
  if (!primary && all.length === 0) {
    return 'Model routed on your computer';
  }
  if (all.length <= 1) {
    return primary ?? all[0] ?? 'Model routed on your computer';
  }
  const extras = all.length - 1;
  return `${primary ?? all[0]} (+${extras} on computer)`;
}
