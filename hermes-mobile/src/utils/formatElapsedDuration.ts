/** Human-readable elapsed time for chat wait indicators (e.g. "12s", "1m 04s", "1h 2m"). */
export function formatElapsedDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  if (sec < 60) {
    return `${sec}s`;
  }
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts = [`${hours}h`];
  if (mins > 0) {
    parts.push(`${mins}m`);
  }
  if (seconds > 0 && hours < 2) {
    parts.push(String(seconds).padStart(2, '0') + 's');
  }
  return parts.join(' ');
}

export function elapsedSecondsSince(sinceMs: number, nowMs = Date.now()): number {
  if (!Number.isFinite(sinceMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((nowMs - sinceMs) / 1000));
}
