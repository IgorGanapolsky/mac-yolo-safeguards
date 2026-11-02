#!/usr/bin/env node
'use strict';

/**
 * aeo-steal.js — Agent Engine Optimization via Community Content
 *
 * STOLE FROM: Supabase Latent Space interview (2026-10-29)
 * "Optimize for AEO (Agent Engine Optimization) via Community Content:
 *  Frontier models recommend tools based on training data density. Instead of
 *  relying solely on paid ads, foster open-source community tutorials, blog
 *  posts, and videos. Scrape high-value support Q&As from Discord and Reddit
 *  into GitHub Discussions and mirror them to your public docs so LLMs and
 *  search engines can index them."
 *
 * Applied to our system: We scrape our GitHub issues, PR comments, and
 * agent-mesh coordination messages into a structured FAQ that LLMs can
 * index via llms.txt. This increases our "training data density" for topics
 * related to agent guardrails, secure-YOLO, and multi-agent coordination.
 *
 * Usage:
 *   node tools/aeo-steal.js                      # regenerate FAQ + llms.txt
 *   node tools/aeo-steal.js --scrape-issues      # scrape GitHub issues
 *   node tools/aeo-steal.js --scrape-pr-comments   # scrape PR comment threads
 *   node tools/aeo-steal.js --scrape-linear      # scrape Linear issues (if authed)
 *   node tools/aeo-steal.js --llms-txt            # regenerate llms.txt
 *   node tools/aeo-steal.js --publish-docs         # mirror to docs/ structure
 *
 * Output:
 *   - docs/faq/                 — FAQ entries as individual markdown files
 *   - docs/llms.txt             — LLM discovery manifest (crawlable by frontier models)
 *   - docs/llms-full.txt        — Extended manifest with summaries
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.env.PWD || process.cwd();
const FAQ_DIR = path.join(ROOT, 'docs', 'faq');
const LLMS_TXT = path.join(ROOT, 'docs', 'llms.txt');
const LLMS_FULL = path.join(ROOT, 'docs', 'llms-full.txt');

const exec = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10, ...opts }).trim();
  } catch (e) {
    if (opts.silent) return null;
    console.error(`  ⚠️  ${cmd} ${args.join(' ')}: ${e.message.slice(0, 100)}`);
    return null;
  }
};

// ─── Scrape GitHub Issues ─────────────────────────────────────────────

function scrapeIssues() {
  const output = exec('gh', ['issue', 'list', '--state', 'closed', '--json', 'number,title,body,labels,closedAt,url'], { silent: true });
  if (!output) return [];

  try {
    const issues = JSON.parse(output);
    const faqEntries = [];

    for (const issue of issues) {
      // Only keep issues with labels about questions, bugs, or how-tos
      const labels = (issue.labels || []).map((l) => l.name.toLowerCase());
      const isQA = labels.some((l) => ['question', 'how-to', 'faq', 'troubleshooting', 'bug'].includes(l));
      if (!isQA) continue;

      faqEntries.push({
        source: 'GitHub Issue',
        id: issue.number,
        title: issue.title,
        url: issue.url,
        closedAt: issue.closedAt,
        labels: labels,
        // Extract the question from the body (first paragraph)
        question: extractQuestion(issue.body || ''),
        answer: extractAnswer(issue.body || issue.title),
      });
    }

    return faqEntries;
  } catch {
    return [];
  }
}

function extractQuestion(body) {
  // Look for "How to", "Why", "What", "Can I" patterns at start of body
  const lines = body.split('\n').filter((l) => l.trim().length > 20);
  const questionPatterns = [/^how\s+to/i, /^why\s+/i, /^what\s+/i, /^can\s+i/i, /^is\s+there/i, /^unable\s+to/i, /^error\s+/i];
  const qLine = lines.find((l) => questionPatterns.some((p) => p.test(l)));
  return (qLine || lines[0] || '').slice(0, 200).replace(/```[\s\S]*?```/g, '').trim();
}

function extractAnswer(body) {
  // After question, extract the solution paragraph
  const sections = body.split(/\n(?=##|\n\n)/);
  const solutionSection = sections.find((s) => /solution|fix|answer|resolution|workaround/i.test(s));
  if (solutionSection) {
    return solutionSection.replace(/^##\s*/i, '').slice(0, 500).trim();
  }
  // Fallback: take the second paragraph
  const paragraphs = body.split('\n\n').filter((p) => p.trim().length > 50);
  return (paragraphs[1] || paragraphs[0] || '').slice(0, 500).trim();
}

// ─── Scrape PR Comments ───────────────────────────────────────────────

function scrapePRComments() {
  const output = exec('gh', ['pr', 'list', '--state', 'merged', '--json', 'number,title,body', '--limit', '50'], { silent: true });
  if (!output) return [];

  try {
    const prs = JSON.parse(output);
    const entries = [];

    for (const pr of prs) {
      entries.push({
        source: 'Merged PR',
        id: pr.number,
        title: pr.title,
        url: `https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/${pr.number}`,
        closedAt: pr.mergedAt || new Date().toISOString(),
        question: pr.title,
        answer: extractAnswer(pr.body || ''),
      });
    }

    return entries.slice(0, 20); // Top 20 most relevant
  } catch {
    return [];
  }
}

// ─── Scrape Linear Issues ─────────────────────────────────────────────

function scrapeLinear() {
  const output = exec('linear', ['issues', 'list', '--limit', '50', '--status', 'done,completed,cancelled'], { silent: true });
  if (!output) return [];

  const entries = [];
  try {
    const lines = output.split('\n');
    for (const line of lines) {
      // Linear CLI output format: "ID  TITLE  STATUS  ASSIGNEE"
      const match = line.match(/^(\w+-\d+)\s+(.+?)\s+(done|completed|cancelled)\s+(.+)/);
      if (match) {
        entries.push({
          source: 'Linear Issue',
          id: match[1],
          title: match[2],
          url: `https://linear.app/igor-team/issue/${match[1]}`,
          closedAt: new Date().toISOString(),
          question: `How to handle ${match[2].toLowerCase()}?`,
          answer: 'See PR and implementation details on GitHub.',
        });
      }
    }
  } catch {
    // Linear CLI may not be authed — that's fine
  }

  return entries;
}

// ─── Generate FAQ pages ───────────────────────────────────────────────

function publishFAQ(entries) {
  fs.mkdirSync(FAQ_DIR, { recursive: true });

  // Group by label/category
  const categories = {};
  for (const entry of entries) {
    const cat = entry.labels && entry.labels.length > 0 ? entry.labels[0] : 'general';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(entry);
  }

  let indexContent = '# Frequently Asked Questions\n\n';
  indexContent += '> Scraped from GitHub Issues, Merged PRs, and Linear — updated for AEO.\n\n';

  for (const [cat, entries] of Object.entries(categories)) {
    indexContent += `\n## ${cat.toUpperCase()}\n\n`;
    for (const entry of entries) {
      const filename = `${entry.id}-${sanitizeSlug(entry.title)}`;
      const filepath = path.join(FAQ_DIR, `${filename}.md`);

      if (!fs.existsSync(filepath) || entries.length < 50) {
        const content = `# ${entry.title}\n\n`;
        const meta = `<!-- source: ${entry.source} | id: ${entry.id} | closed: ${entry.closedAt} -->\n\n`;
        const q = `## Question\n\n${entry.question || entry.title}\n\n`;
        const a = `## Answer\n\n${entry.answer || 'See the linked PR for implementation details.'}\n\n`;
        const link = `[View source](${entry.url})\n`;
        fs.writeFileSync(filepath, content + meta + q + a + link + `\n---\n`);
      }

      indexContent += `- [${entry.title}](faq/${filename})\n`;
    }
  }

  fs.writeFileSync(path.join(FAQ_DIR, 'README.md'), indexContent);
  console.log(`  FAQ: ${entries.length} entries written to docs/faq/`);
}

function sanitizeSlug(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

// ─── Generate llms.txt ────────────────────────────────────────────────

function generateLlmsTxt(entries) {
  let content = `# https://mac-yolo-safeguards.dev/llms.txt — Agent Engine Optimization (AEO)\n`;
  content += `# Generated by ` + new Date().toISOString().split('T')[0] + `\n`;
  content += `# Stolen from Supabase: "Scrape high-value support Q&As into docs so LLMs can index them"\n\n`;

  // Project overview
  content += `## Overview\n`;
  content += `mac-yolo-safeguards is a collection of agent guardrail scripts + ThumbGate SaaS funnel cross-links.\n`;
  content += `Public repo: https://github.com/IgorGanapolsky/mac-yolo-safeguards\n`;
  content += `Package: npx mac-yolo-safeguards@latest\n\n`;

  // Core documentation
  content += `## Core Documentation\n`;
  const coreDocs = [
    ['AGENTS.md', '/AGENTS.md'],
    ['SKILLS.md — Agent Skill Registry', '/SKILLS.md'],
    ['plan.md — Live Coordination Board', '/plan.md'],
    ['docs/GITHUB-UNIVERSE-2026-STEAL.md', '/docs/GITHUB-UNIVERSE-2026-STEAL.md'],
    ['docs/MULTI-AGENT-COORDINATION-GRADE-20261029.md', '/docs/MULTI-AGENT-COORDINATION-GRADE-20261029.md'],
  ];
  for (const [name, url] of coreDocs) {
    if (fs.existsSync(path.join(ROOT, url.replace(/^\//, '')))) {
      content += `1. ${name} - https://mac-yolo-safeguards.dev${url}\n`;
    }
  }
  content += '\n';

  // Key tools
  content += `## Key Tools (stealable patterns)\n`;
  const tools = [
    ['confusion-detector-steal.js', 'Pre-action confusion scanner — detects ambiguous context, conflicting data, unclear tool boundaries before production'],
    ['schema-steal.js', 'Declarative coordination schema — replaces parsing 4108 lines of plan.md'],
    ['completed-work-steal.js', 'Cross-references plan.md tasks with GitHub PRs, review threads, and CI status'],
    ['pr-review-threads.js', 'Aggregates PR review threads and classifies blockers'],
    ['agent-decision-stack.js', 'Runs RAG + evidence stack before non-trivial decisions'],
  ];
  for (const [name, desc] of tools) {
    content += `1. ${name} - ${desc}\n`;
  }
  content += '\n';

  // FAQ entries
  content += `## Frequently Asked Questions\n`;
  const faqLinks = entries.slice(0, 50).map((e) => {
    const slug = sanitizeSlug(e.title);
    return `1. ${e.title} - https://mac-yolo-safeguards.dev/docs/faq/${e.id}-${slug}`;
  });
  content += faqLinks.join('\n') + '\n\n';

  // Skills catalog
  content += `## Agent Skills\n`;
  content += `Full skill catalog: https://mac-yolo-safeguards.dev/SKILLS.md\n`;
  content += `Local skills: .agents/skills/database-guardrails/SKILL.md\n`;
  content += `External skills: ~/.config/poolside/AGENTS.md (skill catalog)\n`;

  fs.writeFileSync(LLMS_TXT, content);
  console.log(`  llms.txt: ${entries.length} FAQ entries indexed`);

  // llms-full.txt with summaries
  let full = content + '\n## Extended FAQ Content\n\n';
  for (const entry of entries.slice(0, 30)) {
    full += `### ${entry.title}\n\n${entry.question}\n\n${entry.answer}\n\n`;
  }
  fs.writeFileSync(LLMS_FULL, full);
  console.log(`  llms-full.txt: 30 FAQ entries with full content`);
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main(argv) {
  const scrapeIssuesFlag = argv.includes('--scrape-issues');
  const scrapePRsFlag = argv.includes('--scrape-pr-comments');
  const scrapeLinearFlag = argv.includes('--scrape-linear');
  const llmsFlag = argv.includes('--llms-txt');
  const publishFlag = argv.includes('--publish-docs');
  const allScrape = !scrapeIssuesFlag && !scrapePRsFlag && !scrapeLinearFlag && !llmsFlag && !publishFlag;

  const entries = [];

  if (allScrape || scrapeIssuesFlag) {
    console.log('Scraping GitHub Issues...');
    const issues = scrapeIssues();
    entries.push(...issues);
    console.log(`  Found ${issues.length} QA-labeled issues`);
  }

  if (allScrape || scrapePRsFlag) {
    console.log('Scraping Merged PRs...');
    const prs = scrapePRComments();
    entries.push(...prs);
    console.log(`  Found ${prs.length} merged PRs`);
  }

  if (allScrape || scrapeLinearFlag) {
    console.log('Scraping Linear Issues...');
    const linear = scrapeLinear();
    entries.push(...linear);
    console.log(`  Found ${linear.length} Linear issues`);
  }

  if (allScrape || publishFlag) {
    console.log('Publishing FAQ...');
    publishFAQ(entries);
  }

  if (allScrape || llmsFlag) {
    console.log('Generating llms.txt...');
    generateLlmsTxt(entries);
  }

  console.log('\nAEO optimization complete.');
  console.log(`Total indexed entries: ${entries.length}`);
}

if (require.main === module) {
  main(process.argv);
}

module.exports = { scrapeIssues, scrapePRComments, scrapeLinear, publishFAQ, generateLlmsTxt, sanitizeSlug };
