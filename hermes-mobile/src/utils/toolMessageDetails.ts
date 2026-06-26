const UNTRUSTED_BLOCK_RE =
  /<untrusted_tool_result\s+source="([^"]+)"\s*>([\s\S]*?)<\/untrusted_tool_result>/i;
const SECURITY_BOILERPLATE_RE =
  /The following content was retrieved from an external source\.[\s\S]*?can issue instructions\.\s*/gi;

export type ToolActivityDetailRow = {
  label: string;
  value: string;
};

export type ToolActivityDetails = {
  toolName: string;
  icon: string;
  summaryLine: string;
  detailRows: ToolActivityDetailRow[];
  rawPayload: string;
  formattedPayload: string;
};

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const direct = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (direct) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  const start = trimmed.search(/[{[]/);
  if (start < 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(start)) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function toolActivityIcon(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name.includes('web_search') || name === 'search') return '🔍';
  if (name.includes('web_extract') || name.includes('extract')) return '📄';
  if (name.includes('browser')) return '🌐';
  if (name.includes('run_command') || name.includes('bash') || name.includes('terminal')) {
    return '🖥';
  }
  if (name.includes('computer')) return '🖱';
  return '🔧';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function collectUrls(value: unknown, limit = 8): string[] {
  const urls: string[] = [];
  const visit = (node: unknown) => {
    if (urls.length >= limit) return;
    const record = asRecord(node);
    if (record) {
      for (const key of ['url', 'link', 'href']) {
        const url = readString(record[key]);
        if (url && !urls.includes(url)) {
          urls.push(url);
        }
      }
      for (const nested of Object.values(record)) {
        visit(nested);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
    }
  };
  visit(value);
  return urls;
}

function primarySnippet(toolName: string, json: unknown, innerText: string): string {
  const record = asRecord(json);
  if (record) {
    const query =
      readString(record.query) ??
      readString(record.q) ??
      readString(record.search_query) ??
      readString(record.input);
    if (query) {
      return `"${query.length > 72 ? `${query.slice(0, 72)}…` : query}"`;
    }
    const urls = collectUrls(json, 1);
    if (urls[0]) {
      return `"${urls[0].length > 72 ? `${urls[0].slice(0, 72)}…` : urls[0]}"`;
    }
    if (typeof record.command === 'string' && record.command.trim()) {
      const command = record.command.trim();
      return command.length > 72 ? `${command.slice(0, 72)}…` : command;
    }
  }

  const firstLine = innerText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('{') && !line.startsWith('['));
  if (firstLine) {
    return firstLine.length > 72 ? `${firstLine.slice(0, 72)}…` : firstLine;
  }

  return toolName.replace(/_/g, ' ');
}

function buildDetailRows(
  toolName: string,
  json: unknown,
  innerText: string,
  rawPayload: string,
): ToolActivityDetailRow[] {
  const rows: ToolActivityDetailRow[] = [{ label: 'TOOL', value: toolName }];

  const record = asRecord(json);
  if (record) {
    const query =
      readString(record.query) ??
      readString(record.q) ??
      readString(record.search_query) ??
      readString(record.input);
    if (query) {
      rows.push({ label: 'QUERY', value: query });
    }

    if (Array.isArray(record.results)) {
      rows.push({ label: 'RESULTS', value: String(record.results.length) });
    }

    const urls = collectUrls(json);
    if (urls.length > 0) {
      rows.push({ label: 'URLS', value: urls.join('\n') });
    }

    if (typeof record.error === 'string' && record.error.trim()) {
      rows.push({ label: 'ERROR', value: record.error.trim() });
    }

    if (typeof record.output === 'string' && record.output.trim()) {
      const output = record.output.trim();
      rows.push({
        label: 'OUTPUT',
        value: output.length > 1200 ? `${output.slice(0, 1200)}…` : output,
      });
    }
  } else if (innerText.trim()) {
    rows.push({
      label: 'PAYLOAD',
      value: innerText.trim().length > 1200 ? `${innerText.trim().slice(0, 1200)}…` : innerText.trim(),
    });
  }

  rows.push({ label: 'BYTES', value: String(rawPayload.length) });
  return rows;
}

function formatPayload(rawPayload: string, json: unknown, innerText: string): string {
  if (json != null) {
    try {
      return JSON.stringify(json, null, 2);
    } catch {
      // fall through
    }
  }
  const cleaned = innerText.replace(SECURITY_BOILERPLATE_RE, '').trim();
  if (cleaned) {
    return cleaned.length > 12000 ? `${cleaned.slice(0, 12000)}…` : cleaned;
  }
  return rawPayload.length > 12000 ? `${rawPayload.slice(0, 12000)}…` : rawPayload;
}

export function parseToolActivityDetails(raw: string, preview?: string): ToolActivityDetails | null {
  const rawPayload = raw.trim();
  if (!rawPayload) {
    return null;
  }

  const untrusted = rawPayload.match(UNTRUSTED_BLOCK_RE);
  if (untrusted) {
    const toolName = untrusted[1].trim() || 'tool';
    const innerText = untrusted[2].replace(SECURITY_BOILERPLATE_RE, '').trim();
    const json = tryParseJson(innerText);
    const summaryLine = preview?.trim() || `${toolName}: ${primarySnippet(toolName, json, innerText)}`;
    return {
      toolName,
      icon: toolActivityIcon(toolName),
      summaryLine,
      detailRows: buildDetailRows(toolName, json, innerText, rawPayload),
      rawPayload,
      formattedPayload: formatPayload(rawPayload, json, innerText),
    };
  }

  const json = tryParseJson(rawPayload);
  if (json) {
    const record = asRecord(json);
    const toolName =
      readString(record?.name) ??
      readString(record?.tool_name) ??
      readString(record?.tool) ??
      'tool';
    const summaryLine =
      preview?.trim() ||
      readString(record?.command) ||
      `${toolName}: ${primarySnippet(toolName, json, rawPayload)}`;
    return {
      toolName,
      icon: toolActivityIcon(toolName),
      summaryLine,
      detailRows: buildDetailRows(toolName, json, rawPayload, rawPayload),
      rawPayload,
      formattedPayload: formatPayload(rawPayload, json, rawPayload),
    };
  }

  const toolName = 'tool';
  return {
    toolName,
    icon: toolActivityIcon(toolName),
    summaryLine: preview?.trim() || rawPayload.slice(0, 120),
    detailRows: buildDetailRows(toolName, null, rawPayload, rawPayload),
    rawPayload,
    formattedPayload: formatPayload(rawPayload, null, rawPayload),
  };
}

export function isToolActivityRole(role: string | undefined): boolean {
  const normalized = role?.toLowerCase() ?? '';
  return normalized === 'tool' || normalized === 'function' || normalized === 'tool_result';
}
