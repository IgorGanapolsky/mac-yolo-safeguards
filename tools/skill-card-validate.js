#!/usr/bin/env node
'use strict';

/**
 * skill-card-validate — AMD-style skill governance cards for this fleet.
 *
 * Steals high-ROI catalog patterns from https://github.com/amd/skills
 * (skill-card.md Description / Owner / License + fail-closed CI).
 *
 * Enhanced with NVIDIA SkillEvaluator Tier 1 checks:
 *   - PII / secret detection (emails, phone numbers, credit cards, API keys)
 *   - Quality scoring (completeness metrics)
 *   - Script linting (bash/python dangerous patterns, shell injection)
 *   - Prompt injection scanning (skill descriptions/prompts)
 *
 * Usage:
 *   node tools/skill-card-validate.js                  # audit .agents/skills
 *   node tools/skill-card-validate.js --json
 *   node tools/skill-card-validate.js --dir path
 *   node tools/skill-card-validate.js --strict          # exit 1 on any fail
 *   node tools/skill-card-validate.js --tier1           # run Tier 1 security checks only
 *   node tools/skill-card-validate.js --quality         # print quality scores
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_SECTIONS = ['Description', 'Owner', 'License'];

function parseArgs(args) {
  const out = { json: false, strict: false, dir: null, tier2: false, quality: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') out.json = true;
    else if (args[i] === '--strict') out.strict = true;
    else if (args[i] === '--tier2') out.tier2 = true;
    else if (args[i] === '--quality') out.quality = true;
    else if (args[i] === '--dir' && args[i + 1]) out.dir = args[++i];
  }
  return out;
}

function listSkillDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name))
    .filter((d) => fs.existsSync(path.join(d, 'SKILL.md')));
}

function extractSection(body, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const m = body.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = body.slice(start);
  const next = rest.search(/^##\s+/m);
  const chunk = (next === -1 ? rest : rest.slice(0, next)).trim();
  return chunk || null;
}

function validateCard(cardPath) {
  const errors = [];
  if (!fs.existsSync(cardPath)) {
    return { ok: false, errors: ['missing skill-card.md'], sections: {} };
  }
  const raw = fs.readFileSync(cardPath, 'utf8');
  const sections = {};
  for (const h of REQUIRED_SECTIONS) {
    const body = extractSection(raw, h);
    sections[h] = body;
    if (!body) errors.push(`missing or empty section: ## ${h}`);
  }
  if (sections.License && !/\b(MIT|Apache-2\.0|proprietary|UNLICENSED|SPDX)\b/i.test(sections.License)
    && sections.License.length < 3) {
    errors.push('License section too thin');
  }
  return { ok: errors.length === 0, errors, sections };
}

// --- Tier 1: PII / Secret Detection ---

const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b(?!\d)/g,
  creditCard: /\b(?:\d[ -]*?){13,16}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  apiKey: /\b(sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36}|AIza[0-9A-Za-z_-]{35})\b/g,
};

// Known test fixtures allowed to contain placeholder PII
const PII_ALLOWLIST = new Set([
  'tests/fixtures/',
]);

/**
 * Scan a file's contents for PII and secrets.
 * Returns array of {type, match, line} findings.
 */
function detectPII(content, filePath = '') {
  const findings = [];

  // Skip if file is in allowlisted test fixtures
  if ([...PII_ALLOWLIST].includes(filePath) || [...PII_ALLOWLIST].some((p) => filePath.includes(p))) {
    return findings;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const [name, pattern] of Object.entries(PII_PATTERNS)) {
      const matches = line.match(pattern);
      if (matches) {
        // Filter out obvious placeholders
        const filtered = matches.filter((m) => {
          const lower = m.toLowerCase();
          return !lower.includes('example')
            && !lower.includes('placeholder')
            && !lower.includes('your-')
            && !lower.includes('your_')
            && !lower.includes('test_')
            && !lower.includes('fake')
            && !lower.includes('dummy')
            && !/^(EXAMPLE|YOUR_|FAKE|X+)/i.test(m);
        });
        for (const match of filtered) {
          findings.push({ type: name, match, line: i + 1, file: filePath });
        }
      }
    }
  }
  return findings;
}

/**
 * Scan all files in a skill directory for PII/secret leaks.
 */
function detectPIISkillDir(dir) {
  const findings = [];
  const walk = (p) => {
    if (!fs.existsSync(p)) return;
    const entries = fs.readdirSync(p, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(p, entry.name);
      // Skip binary files, symlinks, node_modules
      if (entry.name.includes('node_modules')) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.js', '.ts', '.tsx', '.py', '.sh', '.md', '.json', '.yaml', '.yml'].includes(ext)) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            const results = detectPII(content, full);
            findings.push(...results);
          } catch {
            // Skip binary/unreadable files
          }
        }
      }
    }
  };
  walk(dir);
  return findings;
}

// --- Tier 1: Quality Scoring ---

/**
 * Score a skill directory's quality based on completeness metrics.
 * Returns { score: 0-100, checks: [{name, passed, detail}] }
 */
function scoreSkillQuality(dir) {
  const name = path.basename(dir);
  const checks = [];

  // Check 1: SKILL.md exists
  const skillMdPath = path.join(dir, 'SKILL.md');
  const hasSkillMd = fs.existsSync(skillMdPath);
  checks.push({ name: 'has_SKILL.md', passed: hasSkillMd, detail: hasSkillMd ? 'present' : 'missing' });

  // Check 2: SKILL.md has name frontmatter
  let hasNameFrontmatter = false;
  if (hasSkillMd) {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    hasNameFrontmatter = /^---[\s\S]*?name:\s*\S+/m.test(content);
  }
  checks.push({ name: 'has_name_frontmatter', passed: hasNameFrontmatter, detail: hasNameFrontmatter ? 'present' : 'missing' });

  // Check 3: SKILL.md has description frontmatter
  let hasDescFrontmatter = false;
  if (hasSkillMd) {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    hasDescFrontmatter = /^---[\s\S]*?description:/m.test(content);
  }
  checks.push({ name: 'has_description_frontmatter', passed: hasDescFrontmatter, detail: hasDescFrontmatter ? 'present' : 'missing' });

  // Check 4: skill-card.md exists
  const cardPath = path.join(dir, 'skill-card.md');
  const hasCard = fs.existsSync(cardPath);
  checks.push({ name: 'has_skill-card.md', passed: hasCard, detail: hasCard ? 'present' : 'missing' });

  // Check 5: skill-card.md has required sections
  let hasRequiredSections = false;
  if (hasCard) {
    const cardResult = validateCard(cardPath);
    hasRequiredSections = cardResult.ok;
  }
  checks.push({ name: 'has_required_sections', passed: hasRequiredSections, detail: hasRequiredSections ? 'all present' : 'missing sections' });

  // Check 6: SKILL.md length (quality indicator)
  let goodLength = false;
  let lineCount = 0;
  if (hasSkillMd) {
    lineCount = fs.readFileSync(skillMdPath, 'utf8').split('\n').length;
    goodLength = lineCount >= 20 && lineCount <= 500;
  }
  checks.push({ name: 'good_length', passed: goodLength, detail: `${lineCount} lines` });

  // Check 7: No PII/secret leaks
  const piiFindings = hasSkillMd || hasCard
    ? detectPIISkillDir(dir)
    : [];
  checks.push({ name: 'no_pii_leaks', passed: piiFindings.length === 0, detail: `${piiFindings.length} findings` });

  // Check 8: Has reference/test files (robustness indicator)
  const testFiles = fs.readdirSync(dir).filter((f) => f.includes('test') || f.includes('spec'));
  checks.push({ name: 'has_tests', passed: testFiles.length > 0, detail: `${testFiles.length} test files` });

  const passed = checks.filter((c) => c.passed).length;
  const score = Math.round((passed / checks.length) * 100);

  return { score, checks, name, path: dir };
}

// --- Tier 1: Script Linting ---

const SCRIPT_LINT_PATTERNS = [
  { id: 'no_shell_true', pattern: /(exec|execSync|spawn)\s*\([^)]*shell:\s*true/g, severity: 'error' },
  { id: 'no_execSync_template', pattern: /execSync\(`[^`]*\$\{/g, severity: 'error' },
  { id: 'no_eval', pattern: /\beval\s*\(/g, severity: 'error' },
  { id: 'no_any_type', pattern: /:\s*any\b/g, severity: 'error' },
  { id: 'no_hardcoded_api_key', pattern: /([A-Za-z_]*(?:API_KEY|api_key|TOKEN|token|SECRET|secret)[A-Za-z_]*)\s*[:=]\s*['"][^'"]{8,}['"]/g, severity: 'error' },
  { id: 'no_child_url_from_string', pattern: /new\s+URL\s*\(\s*process\.env\./g, severity: 'warn' },
];

/**
 * Lint scripts in a skill directory for dangerous patterns.
 * Returns array of {file, line, id, severity, match} findings.
 */
function lintSkillScripts(dir) {
  const findings = [];
  const walk = (p) => {
    if (!fs.existsSync(p)) return;
    const entries = fs.readdirSync(p, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(p, entry.name);
      if (entry.name.includes('node_modules')) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.js', '.ts', '.tsx', '.py', '.sh'].includes(ext)) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              for (const rule of SCRIPT_LINT_PATTERNS) {
                const matches = lines[i].match(rule.pattern);
                if (matches) {
                  // Skip allowlisted patterns
                  if (full.includes('fixtures') && lines[i].includes('PLACEHOLDER')) continue;
                  for (const m of matches) {
                    findings.push({
                      file: full,
                      line: i + 1,
                      id: rule.id,
                      severity: rule.severity,
                      match: m.slice(0, 80),
                    });
                  }
                }
              }
            }
          } catch {
            // Skip binary/unreadable files
          }
        }
      }
    }
  };
  walk(dir);
  return findings;
}

// --- Tier 1: Prompt Injection Scanning ---

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+|previous\s+|prior\s+|any\s+)?(?:all\s+|previous\s+|prior\s+)?instructions?/i,
  /system prompt/i,
  /overwrite.*system.*prompt/i,
  /bypass.*(?:safety|security)/i,
  /pretend.*you.*are.*(?:developer|admin|root)/i,
  /[\[\]].*jailbreak/i,
  /disregard.*instructions?/i,
  /new.*system.*role/i,
  /you are now.*(?:developer|admin|root|unlocked)/i,
  /forget.*your.*(guidelines|instructions|safety)/i,
];

/**
 * Scan skill descriptions and prompts for potential prompt injection patterns.
 */
function detectPromptInjection(dir) {
  const findings = [];
  const skillMd = path.join(dir, 'SKILL.md');
  if (fs.existsSync(skillMd)) {
    const content = fs.readFileSync(skillMd, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of PROMPT_INJECTION_PATTERNS) {
        const match = lines[i].match(pattern);
        if (match) {
          findings.push({
            file: skillMd,
            line: i + 1,
            pattern: pattern.toString(),
            match: match[0],
          });
        }
      }
    }
  }
  return findings;
}

// --- Tier 2: Distinctiveness ---

/**
 * Simple overlap detection between skills using shared keyword trigrams.
 * Returns pairs of skills that share >70% of description keywords.
 */
function checkDistinctiveness(skillsDir) {
  const dirs = listSkillDirs(skillsDir);
  const descriptors = [];

  for (const dir of dirs) {
    const name = path.basename(dir);
    const skillMd = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    const content = fs.readFileSync(skillMd, 'utf8');
    // Extract description-like text (lines with tool/skill/capability keywords)
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4);
    descriptors.push({ name, words: new Set(words) });
  }

  const overlaps = [];
  for (let i = 0; i < descriptors.length; i++) {
    for (let j = i + 1; j < descriptors.length; j++) {
      const a = descriptors[i];
      const b = descriptors[j];
      const shared = [...a.words].filter((w) => b.words.has(w));
      const ratio = shared.length / Math.max(a.words.size, b.words.size);
      if (ratio > 0.7) {
        overlaps.push({
          skillA: a.name,
          skillB: b.name,
          overlap: Math.round(ratio * 100),
          sharedCount: shared.length,
        });
      }
    }
  }
  return overlaps;
}

// --- Enhanced validation ---

function validateSkillDir(dir) {
  const name = path.basename(dir);
  const skillMdPath = path.join(dir, 'SKILL.md');
  const cardPath = path.join(dir, 'skill-card.md');
  const skillErrors = [];

  if (!fs.existsSync(skillMdPath)) skillErrors.push('missing SKILL.md');
  else {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    if (!/^---[\s\S]*?name:\s*\S+/m.test(content)) skillErrors.push('SKILL.md missing name frontmatter');
    if (!/^---[\s\S]*?description:/m.test(content)) skillErrors.push('SKILL.md missing description frontmatter');
    const lines = content.split('\n').length;
    if (lines > 500) skillErrors.push(`SKILL.md body too long (${lines} > 500); move detail to references/`);
  }

  const cardResult = validateCard(cardPath);

  // Tier 1: PII detection
  const piiFindings = detectPIISkillDir(dir);
  const piiErrors = piiFindings.map((f) => `PII/secret leak: ${f.type} in ${path.basename(f.file)}:${f.line}`);

  // Tier 1: Script linting
  const lintFindings = lintSkillScripts(dir).filter((f) => f.severity === 'error');
  const lintErrors = lintFindings.map((f) => `security lint: ${f.id} in ${path.relative(dir, f.file)}:${f.line}`);

  const cardErrors = cardResult.errors;
  const errors = [...skillErrors, ...cardErrors, ...piiErrors, ...lintErrors];

  return {
    name,
    path: dir,
    ok: errors.length === 0,
    errors,
    hasCard: fs.existsSync(cardPath),
    hasSkillMd: fs.existsSync(skillMdPath),
    piiFindings,
    lintFindings,
    quality: scoreSkillQuality(dir),
  };
}

function audit(rootDir, options = {}) {
  const dirs = listSkillDirs(rootDir);
  const skills = dirs.map((d) => validateSkillDir(d));
  const failed = skills.filter((s) => !s.ok);

  // Tier 2: distinctiveness (only when --tier2 flag)
  let overlaps = [];
  if (options.tier2) {
    overlaps = checkDistinctiveness(rootDir);
  }

  return {
    root: rootDir,
    total: skills.length,
    passed: skills.length - failed.length,
    failed: failed.length,
    ok: failed.length === 0 && overlaps.length === 0,
    skills,
    overlaps: options.tier2 ? overlaps : undefined,
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = path.resolve(args.dir || path.join(process.cwd(), '.agents', 'skills'));
  const result = audit(root, { tier2: args.tier2 });

  // Inject quality info into skills list
  if (args.quality) {
    for (const s of result.skills) {
      s.qualityScore = s.quality.score;
    }
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`skill-card-validate: ${result.passed}/${result.total} ok under ${root}`);
    for (const s of result.skills) {
      const mark = s.ok ? 'PASS' : 'FAIL';
      const piiCount = s.piiFindings?.length || 0;
      const lintCount = s.lintFindings?.filter((f) => f.severity === 'error').length || 0;
      const qScore = s.quality?.score ?? 0;
      const extra = [];
      if (piiCount > 0) extra.push(`PII:${piiCount}`);
      if (lintCount > 0) extra.push(`lint:${lintCount}`);
      if (args.quality) extra.push(`Q:${qScore}`);
      console.log(`  [${mark}] ${s.name} [${extra.join(' ')}]${s.errors.length ? ` — ${s.errors.join('; ')}` : ''}`);
    }
    if (result.overlaps && result.overlaps.length > 0) {
      console.log(`\n  Distinctiveness warnings (${result.overlaps.length}):`);
      for (const o of result.overlaps) {
        console.log(`    ${o.skillA} ↔ ${o.skillB}: ${o.overlap}% overlap`);
      }
    }
  }

  if (args.strict && !result.ok) return 1;
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  REQUIRED_SECTIONS,
  PII_PATTERNS,
  SCRIPT_LINT_PATTERNS,
  PROMPT_INJECTION_PATTERNS,
  extractSection,
  validateCard,
  validateSkillDir,
  listSkillDirs,
  detectPII,
  detectPIISkillDir,
  scoreSkillQuality,
  lintSkillScripts,
  detectPromptInjection,
  checkDistinctiveness,
  audit,
  main,
};
