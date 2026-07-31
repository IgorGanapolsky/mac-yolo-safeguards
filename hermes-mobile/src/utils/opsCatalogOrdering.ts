import type { HermesCronJob, HermesSkill, HermesToolset } from '../types/gatewayApi';

/**
 * Every catalog on the Settings ops screen is fetched from the ACTIVE gateway,
 * so the same header renders a different list depending on which computer is
 * selected. Without the machine name in the header "Cron jobs (21)" is
 * genuinely ambiguous when you run more than one Mac.
 */

/**
 * Labels that carry no machine identity — showing them would read as
 * "Cron jobs on Computer (21)", which is worse than saying nothing.
 */
const PLACEHOLDER_MACHINE_LABELS = new Set([
  '',
  'computer',
  'unknown',
  'computer not configured',
  'computer via tailscale',
]);

/**
 * Resolve the machine name to print in machine-scoped section headers.
 *
 * Prefers the saved profile label (what the machine picker shows) and falls
 * back to the host label the "Active:" line already derives from
 * `/health` + the gateway URL, so one machine is named identically everywhere.
 * Returns null when no computer is connected — callers must degrade to an
 * unscoped header rather than invent a name.
 */
export function resolveOpsMachineLabel(input: {
  profileLabel?: string | null;
  hostLabel?: string | null;
}): string | null {
  for (const candidate of [input.profileLabel, input.hostLabel]) {
    const trimmed = candidate?.trim().replace(/\.local$/i, '') ?? '';
    if (!trimmed) {
      continue;
    }
    if (PLACEHOLDER_MACHINE_LABELS.has(trimmed.toLowerCase())) {
      continue;
    }
    return trimmed;
  }
  return null;
}

/**
 * "Cron jobs on <machine> (21)" — or "Cron jobs (21)" with no computer.
 */
export function machineScopedSectionTitle(
  base: string,
  count: number,
  machineLabel: string | null,
): string {
  return machineLabel ? `${base} on ${machineLabel} (${count})` : `${base} (${count})`;
}

/** One-line reminder of where a machine-scoped catalog physically lives. */
export function machineScopeHint(noun: string, machineLabel: string | null): string {
  return machineLabel
    ? `These ${noun} live on ${machineLabel}. Switch computers above to see another machine's ${noun}.`
    : `Connect a computer above to see its ${noun}.`;
}

/**
 * Skills are read-only over the gateway API. Verified against hermes-agent
 * 0.19.0: `/v1/capabilities` advertises `skills: {method: "GET"}`, `POST
 * /v1/skills` answers 405 and there is no per-skill route at all. Say so
 * plainly instead of leaving "why can't I edit these?" unanswered.
 */
export function skillsReadOnlyHint(machineLabel: string | null): string {
  const where = machineLabel ? `on ${machineLabel}` : 'on your computer';
  return (
    `Read-only here. Skills are files ${where} (SKILL.md) and the Hermes gateway serves them ` +
    'GET-only, so the phone cannot edit or delete them — edit them on that computer. ' +
    'Tap one for its full description; Chat invokes them.'
  );
}

function compareCaseInsensitive(a: string, b: string): number {
  const byName = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return byName !== 0 ? byName : a.localeCompare(b);
}

/**
 * Alphabetical by name, case-insensitive.
 *
 * The gateway sorts skills by `(category, name)`, which on a real Mac renders
 * as an apparently random order — uncategorized skills first, then category
 * clusters. Scanning ~200 rows for one name is pure cognitive load.
 */
export function sortSkillsAlphabetically(skills: HermesSkill[]): HermesSkill[] {
  return [...skills].sort((a, b) => compareCaseInsensitive(a.name ?? '', b.name ?? ''));
}

/**
 * Alphabetical by display name (falling back to id).
 *
 * `/api/jobs` returns creation order — not next-run, not name — so there is no
 * deliberate ordering to preserve here.
 */
export function sortCronJobsAlphabetically(jobs: HermesCronJob[]): HermesCronJob[] {
  return [...jobs].sort((a, b) =>
    compareCaseInsensitive(a.name ?? a.id ?? '', b.name ?? b.id ?? ''),
  );
}

/** Alphabetical by the label the row actually renders. */
export function sortToolsetsAlphabetically(toolsets: HermesToolset[]): HermesToolset[] {
  return [...toolsets].sort((a, b) =>
    compareCaseInsensitive(a.label ?? a.name ?? '', b.label ?? b.name ?? ''),
  );
}
