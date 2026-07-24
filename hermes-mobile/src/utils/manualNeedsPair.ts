/** True when Connect failed because the Mac is reachable but this phone lacks a key. */
export function isManualNeedsPairError(message: string | null | undefined): boolean {
  const text = message?.trim() ?? '';
  if (!text) {
    return false;
  }
  return (
    /still needs to pair/i.test(text) ||
    /needs pairing/i.test(text) ||
    (/reachable/i.test(text) && /pair/i.test(text))
  );
}
