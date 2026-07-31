/**
 * Developer Skills Marketplace — product surface for Hermes Mobile Settings.
 *
 * Real users are engineers / technical founders. Settings must NOT dump the
 * Mac's full Hermes skill zoo (Hue lights, Polymarket, Quora, songwriting, …).
 *
 * Primary UX: searchable marketplace of developer-relevant skills + Install.
 * Installed list: only developer-relevant skills already on the Mac.
 */

import type { HermesSkill } from '../types/gatewayApi';

export type DeveloperSkillCategory =
  | 'ops'
  | 'devops'
  | 'code'
  | 'qa'
  | 'data'
  | 'github'
  | 'agents'
  | 'mlops';

export interface DeveloperMarketplaceSkill {
  name: string;
  description: string;
  category: DeveloperSkillCategory;
  author: string;
  tags: string[];
  /** Passed to `hermes skills install <installId>` (or gateway POST body). */
  installId: string;
  recommended?: boolean;
}

/** Categories allowed in the "Installed for developers" section. */
export const DEVELOPER_SKILL_CATEGORIES: readonly DeveloperSkillCategory[] = [
  'ops',
  'devops',
  'code',
  'qa',
  'data',
  'github',
  'agents',
  'mlops',
] as const;

/**
 * Names that must never appear in Settings even if installed on the Mac.
 * (Consumer / hobby / revenue-experiment fluff.)
 */
export const HOBBY_SKILL_NAMES = new Set([
  'openhue',
  'polymarket',
  'quora-content',
  'bluesky_daily_post',
  'xurl',
  'blogwatcher',
  'llm-wiki',
  'research-paper-writing',
  'company-deep-dive-research',
  'arxiv',
  'youtube-content',
  'songsee',
  'gif-search',
  'comfyui',
  'songwriting-and-ai-music',
  'p5js',
  'manim-video',
  'excalidraw',
  'ascii-art',
  'ascii-video',
  'findmy',
  'imessage',
  'apple-notes',
  'apple-reminders',
  'maps',
  'notion',
  'airtable',
  'powerpoint',
  'docx',
  'xlsx',
  'pdf',
  'nano-pdf',
  'ocr-and-documents',
  'google-workspace',
  'himalaya',
  'obsidian',
  'yuanbao',
  'skool_top1percent_daily_ops',
  'skool-automation',
  'heartmula',
]);

/** Category strings from Mac gateway that are non-developer surface. */
export const HOBBY_SKILL_CATEGORIES = new Set([
  'smart-home',
  'media',
  'creative',
  'social-media',
  'research',
  'note-taking',
  'email',
  'productivity',
  'apple',
  'yuanbao',
  'revenue',
]);

/**
 * Curated developer marketplace. Prefer real Hermes official skill names so
 * Install can run `hermes skills install official/<path>`.
 */
export const DEVELOPER_SKILLS_MARKETPLACE: DeveloperMarketplaceSkill[] = [
  {
    name: 'mac-freeze-rescue',
    description: 'Rescue sluggish Mac, kill runaway process loops, clear memory pressure.',
    category: 'ops',
    author: 'Hermes Core',
    tags: ['macos', 'memory', 'jetsam', 'rescue'],
    installId: 'mac-freeze-rescue',
    recommended: true,
  },
  {
    name: 'systematic-debugging',
    description: '4-phase root-cause debugging: understand bugs before fixing.',
    category: 'code',
    author: 'Hermes Agent',
    tags: ['debug', 'root-cause', 'bugs'],
    installId: 'official/software-development/systematic-debugging',
    recommended: true,
  },
  {
    name: 'test-driven-development',
    description: 'TDD: RED-GREEN-REFACTOR — tests before code.',
    category: 'code',
    author: 'Hermes Agent',
    tags: ['tdd', 'tests', 'jest'],
    installId: 'official/software-development/test-driven-development',
    recommended: true,
  },
  {
    name: 'github-pr-workflow',
    description: 'PR lifecycle: branch, commit, open, CI, merge via gh.',
    category: 'github',
    author: 'Hermes Agent',
    tags: ['github', 'pr', 'ci', 'gh'],
    installId: 'official/github/github-pr-workflow',
    recommended: true,
  },
  {
    name: 'github-code-review',
    description: 'Review PRs: diffs and inline comments via gh or REST.',
    category: 'github',
    author: 'Hermes Agent',
    tags: ['github', 'review', 'diff'],
    installId: 'official/github/github-code-review',
    recommended: true,
  },
  {
    name: 'github-issues',
    description: 'Create, triage, label, assign GitHub issues.',
    category: 'github',
    author: 'Hermes Agent',
    tags: ['github', 'issues'],
    installId: 'official/github/github-issues',
  },
  {
    name: 'github-repo-management',
    description: 'Clone/create/fork repos; remotes and releases.',
    category: 'github',
    author: 'Hermes Agent',
    tags: ['github', 'git', 'repo'],
    installId: 'official/github/github-repo-management',
  },
  {
    name: 'codebase-inspection',
    description: 'Inspect codebases: LOC, languages, ratios (pygount).',
    category: 'code',
    author: 'Hermes Agent',
    tags: ['loc', 'metrics', 'audit'],
    installId: 'official/github/codebase-inspection',
  },
  {
    name: 'hermes-agent-skill-authoring',
    description: 'Author in-repo SKILL.md files: frontmatter and structure.',
    category: 'agents',
    author: 'Hermes Agent',
    tags: ['skills', 'authoring', 'hermes'],
    installId: 'official/software-development/hermes-agent-skill-authoring',
  },
  {
    name: 'requesting-code-review',
    description: 'Pre-commit review: security scan, quality gates, auto-fix.',
    category: 'qa',
    author: 'Hermes Agent',
    tags: ['review', 'security', 'quality'],
    installId: 'official/software-development/requesting-code-review',
    recommended: true,
  },
  {
    name: 'simplify-code',
    description: 'Parallel cleanup of recent code changes.',
    category: 'code',
    author: 'Hermes Agent',
    tags: ['refactor', 'cleanup'],
    installId: 'official/software-development/simplify-code',
  },
  {
    name: 'plan',
    description: 'Write a markdown implementation plan before coding.',
    category: 'code',
    author: 'Hermes Agent',
    tags: ['plan', 'design'],
    installId: 'official/software-development/plan',
  },
  {
    name: 'spike',
    description: 'Throwaway experiments to validate an idea before build.',
    category: 'code',
    author: 'Hermes Agent',
    tags: ['spike', 'prototype'],
    installId: 'official/software-development/spike',
  },
  {
    name: 'dogfood',
    description: 'Exploratory QA of apps: find bugs, collect evidence, report.',
    category: 'qa',
    author: 'Hermes Agent',
    tags: ['qa', 'e2e', 'bugs'],
    installId: 'official/software-development/dogfood',
    recommended: true,
  },
  {
    name: 'python-debugpy',
    description: 'Debug Python: pdb REPL + debugpy remote (DAP).',
    category: 'code',
    author: 'Hermes Agent',
    tags: ['python', 'debug', 'pdb'],
    installId: 'official/software-development/python-debugpy',
  },
  {
    name: 'node-inspect-debugger',
    description: 'Debug Node.js via --inspect + Chrome DevTools Protocol CLI.',
    category: 'code',
    author: 'Hermes Agent',
    tags: ['node', 'debug', 'cdp'],
    installId: 'official/software-development/node-inspect-debugger',
  },
  {
    name: 'claude-code',
    description: 'Delegate coding to Claude Code CLI (features, PRs).',
    category: 'agents',
    author: 'Hermes Agent',
    tags: ['claude', 'cli', 'agent'],
    installId: 'official/autonomous-ai-agents/claude-code',
  },
  {
    name: 'codex',
    description: 'Delegate coding to OpenAI Codex CLI (features, PRs).',
    category: 'agents',
    author: 'Hermes Agent',
    tags: ['codex', 'openai', 'agent'],
    installId: 'official/autonomous-ai-agents/codex',
  },
  {
    name: 'opencode',
    description: 'Delegate coding to OpenCode CLI (features, PR review).',
    category: 'agents',
    author: 'Hermes Agent',
    tags: ['opencode', 'agent'],
    installId: 'official/autonomous-ai-agents/opencode',
  },
  {
    name: 'hermes-agent',
    description: 'Configure, theme, extend, and orchestrate Hermes Agent itself.',
    category: 'agents',
    author: 'Hermes Agent',
    tags: ['hermes', 'config', 'fleet'],
    installId: 'official/autonomous-ai-agents/hermes-agent',
  },
  {
    name: 'computer-use',
    description: 'Desktop computer-use automation on the Mac (Leash-gated).',
    category: 'agents',
    author: 'Hermes Agent',
    tags: ['computer-use', 'desktop', 'ui'],
    installId: 'official/autonomous-ai-agents/computer-use',
  },
  {
    name: 'huggingface-hub',
    description: 'HuggingFace CLI: search/download/upload models and datasets.',
    category: 'mlops',
    author: 'Hermes Agent',
    tags: ['hf', 'models', 'ml'],
    installId: 'official/mlops/huggingface-hub',
  },
  {
    name: 'serving-llms-vllm',
    description: 'vLLM high-throughput LLM serving (OpenAI API, quantization).',
    category: 'mlops',
    author: 'Hermes Agent',
    tags: ['vllm', 'serving', 'inference'],
    installId: 'official/mlops/inference/serving-llms-vllm',
  },
  {
    name: 'llama-cpp',
    description: 'llama.cpp local GGUF inference + HF Hub discovery.',
    category: 'mlops',
    author: 'Hermes Agent',
    tags: ['llama.cpp', 'gguf', 'local'],
    installId: 'official/mlops/inference/llama-cpp',
  },
  {
    name: 'weights-and-biases',
    description: 'W&B: log experiments, sweeps, model registry, dashboards.',
    category: 'mlops',
    author: 'Hermes Agent',
    tags: ['wandb', 'ml', 'experiments'],
    installId: 'official/mlops/evaluation/weights-and-biases',
  },
  {
    name: 'evaluating-llms-harness',
    description: 'lm-eval-harness: MMLU, GSM8K, and other LLM benchmarks.',
    category: 'mlops',
    author: 'Hermes Agent',
    tags: ['eval', 'benchmarks', 'llm'],
    installId: 'official/mlops/evaluation/evaluating-llms-harness',
  },
  {
    name: 'github-actions-spend',
    description: 'Audit GitHub Actions CI spend, slow steps, and cache waste.',
    category: 'devops',
    author: 'Hermes Core',
    tags: ['ci', 'github', 'actions', 'cost'],
    installId: 'github-actions-spend',
    recommended: true,
  },
  {
    name: 'docker-container-ops',
    description: 'Inspect, restart, and triage Docker containers and compose logs.',
    category: 'devops',
    author: 'Community',
    tags: ['docker', 'containers', 'logs'],
    installId: 'docker-container-ops',
    recommended: true,
  },
  {
    name: 'sentry-issue-triage',
    description: 'Triage Sentry crashes, release regressions, unhandled exceptions.',
    category: 'qa',
    author: 'Hermes Core',
    tags: ['sentry', 'crash', 'errors'],
    installId: 'sentry-issue-triage',
    recommended: true,
  },
  {
    name: 'react-native-perf-audit',
    description: 'Diagnose JS thread jank, frame drops, Hermes memory, re-renders.',
    category: 'code',
    author: 'Callstack',
    tags: ['react-native', 'performance', 'hermes'],
    installId: 'react-native-perf-audit',
  },
  {
    name: 'postgres-query-analyzer',
    description: 'Slow SQL, EXPLAIN ANALYZE, and index recommendations.',
    category: 'data',
    author: 'Database Tools',
    tags: ['postgres', 'sql', 'indexes'],
    installId: 'postgres-query-analyzer',
  },
  {
    name: 'cloudflare-worker-deploy',
    description: 'Cloudflare Workers deploy logs, D1 status, edge routing.',
    category: 'devops',
    author: 'Cloudflare Ops',
    tags: ['cloudflare', 'workers', 'd1'],
    installId: 'cloudflare-worker-deploy',
  },
];

export function isHobbySkillName(name: string): boolean {
  return HOBBY_SKILL_NAMES.has(name.trim().toLowerCase());
}

export function isHobbySkillCategory(category: string | undefined): boolean {
  if (!category) {
    return false;
  }
  return HOBBY_SKILL_CATEGORIES.has(category.trim().toLowerCase());
}

export function isDeveloperSkillCategory(category: string | undefined): boolean {
  if (!category) {
    return false;
  }
  return (DEVELOPER_SKILL_CATEGORIES as readonly string[]).includes(
    category.trim().toLowerCase(),
  );
}

export function filterMarketplaceSkills(
  skills: DeveloperMarketplaceSkill[],
  query: string,
  categoryFilter: string = 'all',
): DeveloperMarketplaceSkill[] {
  const normalized = query.trim().toLowerCase();
  return skills.filter((skill) => {
    const matchesCategory =
      categoryFilter === 'all' || skill.category === categoryFilter;
    if (!matchesCategory) {
      return false;
    }
    if (!normalized) {
      return true;
    }
    return (
      skill.name.toLowerCase().includes(normalized) ||
      skill.description.toLowerCase().includes(normalized) ||
      skill.category.toLowerCase().includes(normalized) ||
      skill.author.toLowerCase().includes(normalized) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(normalized)) ||
      skill.installId.toLowerCase().includes(normalized)
    );
  });
}

/**
 * Installed Mac skills shown in Settings: developer-relevant only.
 * Never surfaces hobby / consumer packs even if the gateway returns them.
 */
export function filterInstalledDeveloperSkills(
  installed: HermesSkill[],
  marketplace: DeveloperMarketplaceSkill[] = DEVELOPER_SKILLS_MARKETPLACE,
): HermesSkill[] {
  const marketNames = new Set(marketplace.map((s) => s.name.toLowerCase()));
  return installed
    .filter((skill) => {
      const name = skill.name.trim().toLowerCase();
      if (!name || isHobbySkillName(name)) {
        return false;
      }
      if (isHobbySkillCategory(skill.category)) {
        return false;
      }
      if (marketNames.has(name)) {
        return true;
      }
      if (isDeveloperSkillCategory(skill.category)) {
        return true;
      }
      // Unknown category from Mac: only keep if name looks like a tech skill
      // already curated (prefix match against marketplace tags is overkill).
      return false;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function marketplaceSkillIsInstalled(
  skill: DeveloperMarketplaceSkill,
  installed: HermesSkill[],
): boolean {
  const name = skill.name.toLowerCase();
  return installed.some((s) => s.name.trim().toLowerCase() === name);
}

export function recommendedMarketplaceSkills(
  skills: DeveloperMarketplaceSkill[] = DEVELOPER_SKILLS_MARKETPLACE,
): DeveloperMarketplaceSkill[] {
  return skills.filter((s) => s.recommended);
}

export function skillsMarketplaceSectionHint(): string {
  return 'Search developer skills and install them on your Mac. Consumer packs (lights, social, research fluff) stay off this list — find those only if you install them yourself on the Mac.';
}
