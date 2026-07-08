import type { ChatProject } from '../types/chatProject';

export function sortChatProjects(projects: ChatProject[]): ChatProject[] {
  return [...projects].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

function projectSearchHaystack(project: ChatProject): string {
  return [
    project.name,
    project.role,
    project.handoffSummary,
    project.vaultSlug,
    project.workspacePath,
    project.sourceRepo,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

/** Case-insensitive filter across name, role, handoff, slug, and repo paths. */
export function filterChatProjects(projects: ChatProject[], query: string): ChatProject[] {
  const sorted = sortChatProjects(projects);
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return sorted;
  }
  return sorted.filter((project) => projectSearchHaystack(project).includes(normalizedQuery));
}
