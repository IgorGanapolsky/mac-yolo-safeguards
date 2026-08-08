'use strict';

/**
 * Unit Tests for Skill Manifest Sync Tool (`tools/skill-manifest-sync.js`)
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, generateSkillsMd } = require('../tools/skill-manifest-sync');

describe('skill-manifest-sync', () => {
  it('parses valid YAML frontmatter header correctly', () => {
    const content = `---\nname: test-skill\ndescription: Test skill description\n---\n\n# Header\nBody`;
    const parsed = parseFrontmatter(content);
    expect(parsed).toEqual({
      name: 'test-skill',
      description: 'Test skill description'
    });
  });

  it('returns null for content lacking YAML frontmatter', () => {
    const content = `# Header\nNo frontmatter here`;
    const parsed = parseFrontmatter(content);
    expect(parsed).toBeNull();
  });

  it('generates canonical SKILLS.md markdown table', () => {
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
    expect(md).toContain('# SKILLS.md — Canonical Agent Skill Registry');
    expect(md).toContain('| [`sample-skill`](file:////tmp/sample-skill/SKILL.md) | Sample skill description | 42 | local |');
  });
});
