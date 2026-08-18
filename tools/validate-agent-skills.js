#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function defaultRoots(cwd = process.cwd(), home = os.homedir()) {
  return [
    path.join(home, '.agents', 'skills'),
    path.join(home, '.codex', 'skills'),
    path.join(cwd, '.agents', 'skills'),
    path.join(cwd, '.codex', 'skills'),
  ];
}

function parseArgs(argv) {
  const roots = [];
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      const root = argv[index + 1];
      if (!root) throw new Error('--root requires a path');
      roots.push(path.resolve(root));
      index += 1;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      return { help: true, json, roots };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { help: false, json, roots };
}

function listSkillFiles(roots) {
  const files = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const skillDir = path.join(root, entry);
      let stat;
      try {
        stat = fs.statSync(skillDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      const manifest = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(manifest) && fs.statSync(manifest).isFile()) {
        files.add(fs.realpathSync(manifest));
      }
    }
  }
  return [...files].sort();
}

function extractFrontmatter(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') {
    throw new Error('missing opening YAML frontmatter delimiter');
  }
  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---');
  if (closingIndex < 0) {
    throw new Error('missing closing YAML frontmatter delimiter');
  }
  return lines.slice(1, closingIndex).join('\n');
}

function parseYaml(frontmatter) {
  const ruby = [
    'require "yaml"',
    'require "json"',
    'value = YAML.safe_load(STDIN.read, permitted_classes: [], permitted_symbols: [], aliases: false)',
    'abort "frontmatter must be a mapping" unless value.is_a?(Hash)',
    'puts JSON.generate(value)',
  ].join('; ');
  const result = spawnSync('ruby', ['-e', ruby], {
    encoding: 'utf8',
    input: frontmatter,
  });
  if (result.error) {
    throw new Error(`YAML parser unavailable: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'invalid YAML').trim().split('\n')[0];
    throw new Error(`invalid YAML: ${detail}`);
  }
  return JSON.parse(result.stdout);
}

function validateManifest(file) {
  try {
    const frontmatter = extractFrontmatter(file);
    const parsed = parseYaml(frontmatter);
    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
      throw new Error('missing non-empty string name');
    }
    if (typeof parsed.description !== 'string' || parsed.description.trim() === '') {
      throw new Error('missing non-empty string description');
    }
    return { file, ok: true };
  } catch (error) {
    return { file, ok: false, error: error.message };
  }
}

function scanSkills(roots) {
  const resolvedRoots = [...new Set(roots.map((root) => path.resolve(root)))];
  const results = listSkillFiles(resolvedRoots).map(validateManifest);
  return {
    schema: 'agent-skill-yaml-preflight/v1',
    roots: resolvedRoots,
    checked: results.length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}

function usage() {
  return 'Usage: validate-agent-skills [--json] [--root PATH ...]\n\nWithout --root, scans global and current-project .agents/skills and .codex/skills.';
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(64);
  }
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = scanSkills(args.roots.length > 0 ? args.roots : defaultRoots());
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.failed === 0) {
    console.log(`Validated ${report.checked} skill manifest(s) with real YAML parsing.`);
  } else {
    for (const result of report.results.filter((item) => !item.ok)) {
      console.error(`Invalid skill: ${result.file}: ${result.error}`);
    }
    console.error(`Rejected ${report.failed} of ${report.checked} skill manifest(s).`);
  }
  process.exitCode = report.failed === 0 ? 0 : 1;
}

if (require.main === module) main();

module.exports = {
  defaultRoots,
  extractFrontmatter,
  listSkillFiles,
  parseArgs,
  parseYaml,
  scanSkills,
  validateManifest,
};
