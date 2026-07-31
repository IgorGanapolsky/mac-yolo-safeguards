/**
 * Developer Skills Marketplace Catalog & Search Utilities
 *
 * Provides a curated, developer-first catalog of agent skills for engineers,
 * DevOps teams, and technical founders. Excludes consumer/hobbyist fluff by default,
 * while allowing instant search, category filtering, and one-tap skill installation.
 */

export interface DeveloperMarketplaceSkill {
  name: string;
  description: string;
  category: 'ops' | 'devops' | 'code' | 'qa' | 'data';
  author: string;
  tags: string[];
  recommended?: boolean;
}

export const DEVELOPER_SKILLS_MARKETPLACE: DeveloperMarketplaceSkill[] = [
  {
    name: 'mac-freeze-rescue',
    description: 'Rescue sluggish Mac, kill runaway process loops, and clear memory leaks (macOS).',
    category: 'ops',
    author: 'Hermes Core',
    tags: ['macOS', 'process', 'memory', 'rescue'],
    recommended: true,
  },
  {
    name: 'github-actions-spend',
    description: 'Audit GitHub Actions CI spend, slow workflow steps, and build cache bottlenecks.',
    category: 'devops',
    author: 'Hermes Core',
    tags: ['ci', 'github', 'actions', 'cost'],
    recommended: true,
  },
  {
    name: 'docker-container-ops',
    description: 'Inspect, restart, and triage Docker containers, compose services, and container logs.',
    category: 'devops',
    author: 'Community',
    tags: ['docker', 'containers', 'logs', 'devops'],
    recommended: true,
  },
  {
    name: 'sentry-issue-triage',
    description: 'Triage Sentry crash stack traces, release regressions, and unhandled exceptions.',
    category: 'qa',
    author: 'Hermes Core',
    tags: ['sentry', 'crash', 'errors', 'triage'],
    recommended: true,
  },
  {
    name: 'react-native-perf-audit',
    description: 'Diagnose JS thread jank, frame drops, Hermes memory usage, and re-render loops.',
    category: 'code',
    author: 'Callstack',
    tags: ['react-native', 'performance', 'hermes', 'jank'],
  },
  {
    name: 'postgres-query-analyzer',
    description: 'Analyze slow SQL queries, EXPLAIN ANALYZE execution plans, and index recommendations.',
    category: 'data',
    author: 'Database Tools',
    tags: ['postgres', 'sql', 'query', 'indexing'],
  },
  {
    name: 'apollo-sales-enrichment',
    description: 'Enrich prospect emails, verify domain contacts, and run pipeline diagnostic loops.',
    category: 'ops',
    author: 'Hermes Sales',
    tags: ['apollo', 'prospecting', 'revenue', 'email'],
  },
  {
    name: 'cloudflare-worker-deploy',
    description: 'Inspect Cloudflare Workers deployment logs, D1 database status, and edge routing.',
    category: 'devops',
    author: 'Cloudflare Ops',
    tags: ['cloudflare', 'workers', 'd1', 'edge'],
  },
];

export function filterMarketplaceSkills(
  skills: DeveloperMarketplaceSkill[],
  query: string,
  categoryFilter: string = 'all'
): DeveloperMarketplaceSkill[] {
  const normalized = query.trim().toLowerCase();
  return skills.filter((skill) => {
    const matchesCategory =
      categoryFilter === 'all' || skill.category === categoryFilter;
    if (!matchesCategory) return false;

    if (!normalized) return true;

    const nameMatch = skill.name.toLowerCase().includes(normalized);
    const descMatch = skill.description.toLowerCase().includes(normalized);
    const tagMatch = skill.tags.some((tag) => tag.toLowerCase().includes(normalized));
    const categoryMatch = skill.category.toLowerCase().includes(normalized);

    return nameMatch || descMatch || tagMatch || categoryMatch;
  });
}
