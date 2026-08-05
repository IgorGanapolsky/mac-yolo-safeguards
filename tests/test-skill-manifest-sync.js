'use strict';

/**
 * Unit Tests for Skill Manifest Sync Tool (`tools/skill-manifest-sync.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { parseFrontmatter, generateSkillsMd } = require('../tools/skill-manifest-sync');

console.log('Running test-skill-manifest-sync.js...');

// Test 1: parseFrontmatter with valid YAML
{
  const content = `---\nname: test-skill\ndescription: Test skill description\n---\n\n# Header\nBody`;
  const parsed = parseFrontmatter(content);
  assert.deepStrictEqual(parsed, {
    name: 'test-skill',
    description: 'Test skill description'
  }, 'Failed to parse valid YAML frontmatter');
}

// Test 2: parseFrontmatter without YAML
{
  const content = `# Header\nNo frontmatter here`;
  const parsed = parseFrontmatter(content);
  assert.strictEqual(parsed, null, 'Expected null for missing frontmatter');
}

// Test 3: generateSkillsMd markdown table
{
  const mockSkills = [
    {
      name: 'sample-skill',
      folder: 'sample-skill',
      description: 'Sample skill description',
      lineCount: 42,
      source: 'local',
      path: '/tmp/sample-skill/SKILL.md'
    }
  ];

  const md = generateSkillsMd(mockSkills);
  assert.ok(md.includes('# SKILLS.md — Canonical Agent Skill Registry'), 'Missing title header');
  assert.ok(md.includes('| `sample-skill` | Sample skill description |'), 'Missing skill table row');
}

console.log('ok tests/test-skill-manifest-sync.js');
