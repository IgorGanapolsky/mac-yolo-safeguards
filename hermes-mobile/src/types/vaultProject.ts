export interface VaultHandoffSummary {
  path: string;
  title: string;
  summary: string;
  project?: string;
  date?: string;
}

export interface VaultProjectCatalogEntry {
  slug: string;
  name: string;
  startHerePath: string;
  sourceRepo: string;
  role?: string;
  handoffSummary?: string;
}

export interface VaultProjectCatalog {
  schema: 'hermes-vault-projects/v1';
  generatedAt: string;
  vaultPath: string;
  projects: VaultProjectCatalogEntry[];
  handoffs?: VaultHandoffSummary[];
}

export const VAULT_PROJECT_CATALOG_SCHEMA = 'hermes-vault-projects/v1' as const;
