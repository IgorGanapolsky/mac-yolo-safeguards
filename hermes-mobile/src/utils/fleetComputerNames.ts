/**
 * Fleet display aliases for known Hermes machines.
 * MacBook Pro hostnames get a "(Mac Pro)" fleet label in the picker.
 */

function normalizeStem(name: string): string {
  return name
    .trim()
    .replace(/\.local$/i, '')
    .replace(/\.tail[a-z0-9]+\.ts\.net$/i, '');
}

function compactKey(name: string): string {
  return normalizeStem(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** True when this hostname/label is the MacBook Pro fleet node (Mac Pro). */
export function isFleetMacProName(name: string | undefined | null): boolean {
  if (!name?.trim()) {
    return false;
  }
  const key = compactKey(name);
  if (!key) {
    return false;
  }
  if (key === 'macpro' || key.startsWith('macpro')) {
    return true;
  }
  // Any *MacBook-Pro* stem (including numbered suffixes) maps to Mac Pro.
  return key.includes('macbookpro');
}

/**
 * Picker/header label: keep hostname, append fleet alias when known.
 * e.g. My-MacBook-Pro → My-MacBook-Pro (Mac Pro)
 */
export function fleetComputerDisplayName(name: string): string {
  const stem = normalizeStem(name);
  if (!stem) {
    return name.trim();
  }
  if (/\(mac pro\)\s*$/i.test(stem) || /^mac pro$/i.test(stem)) {
    return stem;
  }
  if (isFleetMacProName(stem)) {
    return `${stem} (Mac Pro)`;
  }
  return stem;
}
