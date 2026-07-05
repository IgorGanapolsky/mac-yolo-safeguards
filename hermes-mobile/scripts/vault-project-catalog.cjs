'use strict';

/**
 * Shared vault catalog parser — used by tools/hermes-vault-projects-sync.js and mirrored in
 * hermes-mobile/src/utils/vaultProjectCatalog.ts (keep fixtures aligned).
 */

function stripBackticks(value) {
  return String(value || '')
    .trim()
    .replace(/^`+|`+$/g, '');
}

function slugFromStartHere(startHerePath) {
  const match = String(startHerePath || '').match(/Projects\/([^/]+)\//);
  return match ? match[1] : '';
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      value = value.replace(/^['"]|['"]$/g, '');
    }
    fields[key] = value;
  }
  return fields;
}

function firstParagraphAfterFrontmatter(text) {
  const body = text.replace(/^---[\s\S]*?---\r?\n?/, '').trim();
  for (const block of body.split(/\r?\n\r?\n/)) {
    const line = block
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find((part) => part && !part.startsWith('#'));
    if (line) return line.replace(/\*\*/g, '').slice(0, 240);
  }
  return '';
}

function parseProjectsReadmeTable(readmeText) {
  const projects = [];
  const lines = String(readmeText || '').split(/\r?\n/);
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

function parseHandoffFile(filePath, text) {
  const frontmatter = parseFrontmatter(text);
  const titleMatch = text.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : filePath;
  const summary = firstParagraphAfterFrontmatter(text);
  const dateMatch = String(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  return {
    path: filePath,
    title,
    summary,
    project: typeof frontmatter.project === 'string' ? frontmatter.project : undefined,
    date: dateMatch ? dateMatch[1] : undefined,
  };
}

function attachHandoffs(projects, handoffs) {
  if (!handoffs?.length) return projects;
  const byProject = new Map();
  for (const handoff of handoffs) {
    const key = handoff.project?.trim().toLowerCase();
    if (!key || byProject.has(key)) continue;
    byProject.set(key, handoff.summary || handoff.title);
  }
  return projects.map((project) => {
    const keys = [project.slug, project.name].map((value) => value.trim().toLowerCase());
    for (const key of keys) {
      const summary = byProject.get(key);
      if (summary) return { ...project, handoffSummary: summary };
    }
    return project;
  });
}

function buildVaultProjectCatalog({ vaultPath, readmeText, handoffFiles = [] }) {
  const handoffs = handoffFiles.map(({ path, text }) => parseHandoffFile(path, text));
  handoffs.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const projects = attachHandoffs(parseProjectsReadmeTable(readmeText), handoffs);
  return {
    schema: 'hermes-vault-projects/v1',
    generatedAt: new Date().toISOString(),
    vaultPath,
    projects,
    handoffs: handoffs.slice(0, 8),
  };
}

module.exports = {
  attachHandoffs,
  buildVaultProjectCatalog,
  parseHandoffFile,
  parseProjectsReadmeTable,
  slugFromStartHere,
  stripBackticks,
};
