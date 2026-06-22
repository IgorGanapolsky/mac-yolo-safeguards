/** Gateway may return numeric message ids — never call string methods on raw ids. */
export function coerceMessageId(id: unknown, fallback?: string | number): string | undefined {
  if (id == null || id === '') {
    return fallback != null ? String(fallback) : undefined;
  }
  if (typeof id === 'string') {
    return id;
  }
  if (typeof id === 'number' && Number.isFinite(id)) {
    return String(id);
  }
  if (typeof id === 'boolean') {
    return String(id);
  }
  return fallback != null ? String(fallback) : undefined;
}

export function idHasPrefix(id: unknown, prefix: string): boolean {
  const text = coerceMessageId(id);
  return text != null && text.startsWith(prefix);
}
