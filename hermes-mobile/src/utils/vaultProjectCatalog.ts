import type {
  VaultHandoffSummary,
  VaultProjectCatalog,
  VaultProjectCatalogEntry,
} from '../types/vaultProject';
import { VAULT_PROJECT_CATALOG_SCHEMA } from '../types/vaultProject';

function stripBackticks(value: string): string {
  return value.trim().replace(/^`+|`+$/g, '');
}

export function slugFromStartHere(startHerePath: string): string {
  const match = startHerePath.match(/Projects\/([^/]+)\//);
  return match ? match[1] : '';
}

export function parseProjectsReadmeTable(readmeText: string): VaultProjectCatalogEntry[] {
  const projects: VaultProjectCatalogEntry[] = [];
  const lines = readmeText.split(/\r?\n/);
  let inTable = false;
  for (const line of lines) {
    if (line.includes('## Project Homes')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (line.startsWith('## ') && !line.includes('Project Homes')) break;
    if (!line.startsWith('|')) continue;
    const columns = line
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    if (columns.length < 4) continue;
    if (columns[0] === 'Project' || columns[0].includes('---')) continue;
    const name = columns[0];
    const startHerePath = stripBackticks(columns[1]);
    const sourceRepo = stripBackticks(columns[2]);
    const role = columns[3];
    const slug = slugFromStartHere(startHerePath) || name.replace(/\s+/g, '-');
    if (!sourceRepo) continue;
    projects.push({ slug, name, startHerePath, sourceRepo, role });
  }
  return projects;
}

export function attachHandoffsToProjects(
  projects: VaultProjectCatalogEntry[],
  handoffs: VaultHandoffSummary[],
): VaultProjectCatalogEntry[] {
  if (handoffs.length === 0) return projects;
  const byProject = new Map<string, string>();
  for (const handoff of handoffs) {
    const key = handoff.project?.trim().toLowerCase();
    if (!key || byProject.has(key)) continue;
    byProject.set(key, handoff.summary?.trim() || handoff.title.trim());
  }
  return projects.map((project) => {
    const keys = [project.slug, project.name].map((value) => value.trim().toLowerCase());
    for (const key of keys) {
      const summary = byProject.get(key);
      if (summary) {
        return { ...project, handoffSummary: summary };
      }
    }
    return project;
  });
}

export function isVaultProjectCatalog(value: unknown): value is VaultProjectCatalog {
  if (!value || typeof value !== 'object') return false;
  const catalog = value as Partial<VaultProjectCatalog>;
  return (
    catalog.schema === VAULT_PROJECT_CATALOG_SCHEMA &&
    Array.isArray(catalog.projects) &&
    typeof catalog.vaultPath === 'string'
  );
}

export function normalizeVaultProjectCatalog(value: unknown): VaultProjectCatalog | null {
  if (!isVaultProjectCatalog(value)) return null;
  return {
    schema: VAULT_PROJECT_CATALOG_SCHEMA,
    generatedAt: value.generatedAt || new Date(0).toISOString(),
    vaultPath: value.vaultPath,
    projects: value.projects.filter(
      (entry) => entry.slug && entry.name && entry.sourceRepo,
    ),
    handoffs: Array.isArray(value.handoffs) ? value.handoffs : [],
  };
}

type GatewayApiProject = {
  id?: string;
  name?: string;
  workspace_path?: string;
  has_plan?: boolean;
  plan_updated_at?: string;
};

/** Map claude-code `GET /api/projects` payload into the vault catalog shape. */
export function catalogFromGatewayApiProjects(body: unknown): VaultProjectCatalog | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as { projects?: GatewayApiProject[]; agents?: unknown[] };
  if (!Array.isArray(record.projects) || record.projects.length === 0) return null;
  const projects: VaultProjectCatalogEntry[] = record.projects
    .map((project): VaultProjectCatalogEntry | null => {
      const slug = project.id?.trim() || project.name?.trim().replace(/\s+/g, '-') || '';
      const name = project.name?.trim() || slug;
      const sourceRepo = project.workspace_path?.trim() || '';
      if (!slug || !sourceRepo) return null;
      return {
        slug,
        name,
        startHerePath: `Projects/${slug}/Start Here.md`,
        sourceRepo,
        role: project.has_plan ? 'plan on disk' : undefined,
      };
    })
    .filter((entry): entry is VaultProjectCatalogEntry => entry !== null);
  if (projects.length === 0) return null;
  return {
    schema: VAULT_PROJECT_CATALOG_SCHEMA,
    generatedAt: new Date().toISOString(),
    vaultPath: 'gateway:/api/projects',
    projects,
  };
}

/** Map legacy `/v1/obsidian/projects` rows into the vault catalog shape. */
export function catalogFromObsidianProjects(
  rows: Array<{ name: string; workspacePath: string; vaultHome: string; rule?: string }>,
): VaultProjectCatalog | null {
  if (!rows.length) return null;
  const projects: VaultProjectCatalogEntry[] = rows
    .map((row): VaultProjectCatalogEntry | null => {
      const sourceRepo = row.workspacePath?.trim();
      const name = row.name?.trim();
      if (!sourceRepo || !name) return null;
      const cleanSlug = row.vaultHome.replace(/^Projects\//i, '').split('/')[0] || name;
      return {
        slug: cleanSlug,
        name,
        startHerePath: row.vaultHome || `Projects/${cleanSlug}/Start Here.md`,
        sourceRepo,
        handoffSummary: row.rule?.trim() || undefined,
      };
    })
    .filter((entry): entry is VaultProjectCatalogEntry => entry !== null);
  if (projects.length === 0) return null;
  return {
    schema: VAULT_PROJECT_CATALOG_SCHEMA,
    generatedAt: new Date().toISOString(),
    vaultPath: 'gateway:/v1/obsidian/projects',
    projects,
  };
}
