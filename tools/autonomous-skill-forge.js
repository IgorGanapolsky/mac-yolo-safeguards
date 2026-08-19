#!/usr/bin/env node
'use strict';

/**
 * autonomous-skill-forge.js
 *
 * Self-Driving Autonomous Skill Forge & Registry Manager.
 * Enables AI agents to automatically forge, validate, and register repeatable skills
 * without requiring human intervention or manual handoffs.
 *
 * Features:
 *  1. Template Synthesizer: Generates strictly valid SKILL.md with compliant YAML frontmatter.
 *  2. Registry Synchronizer: Automatically adds new skills to SKILLS.md.
 *  3. Self-Validation: Validates the generated skill immediately with validate-agent-skills.js.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, '.agents', 'skills');
const SKILLS_MD = path.join(ROOT, 'SKILLS.md');

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

class AutonomousSkillForge {
  constructor(skillsDir = SKILLS_DIR, skillsMdPath = SKILLS_MD) {
    this.skillsDir = skillsDir;
    this.skillsMdPath = skillsMdPath;
    ensureSkillsDir();
  }

  /**
   * Forges a new skill directory and SKILL.md.
   */
  forgeSkill({ name, description, triggers = [], instructions, verificationCmd = '' }) {
    if (!name || !description) {
      throw new Error('Skill name and description are mandatory');
    }

    const cleanName = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const skillPath = path.join(this.skillsDir, cleanName);
    fs.mkdirSync(skillPath, { recursive: true });

    const triggerList = triggers.length > 0
      ? `\n  trigger: [${triggers.map(t => `"${t}"`).join(', ')}]`
      : '';

    const skillContent = `---
name: ${cleanName}
description: >
  ${description.trim()}${triggerList}
---

# ${cleanName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}

## Overview

${description.trim()}

## Autonomous Execution Playbook

${instructions || 'Automated execution instructions.'}

${verificationCmd ? `## Verification Commands\n\n\`\`\`bash\n${verificationCmd}\n\`\`\`\n` : ''}`;

    const skillFile = path.join(skillPath, 'SKILL.md');
    fs.writeFileSync(skillFile, skillContent, 'utf8');

    // Register in SKILLS.md
    this.registerInSkillsMd(cleanName, description);

    return {
      success: true,
      name: cleanName,
      skillFile,
      relativeSkillMd: `.agents/skills/${cleanName}/SKILL.md`,
    };
  }

  /**
   * Registers or updates the skill in SKILLS.md.
   */
  registerInSkillsMd(name, description) {
    if (!fs.existsSync(this.skillsMdPath)) return;
    let content = fs.readFileSync(this.skillsMdPath, 'utf8');

    const cleanDesc = description.replace(/[\r\n]+/g, ' ').trim();
    const row = `| \`${name}\` | ${cleanDesc} | \`.agents/skills/${name}/SKILL.md\` | local |\n`;

    if (!content.includes(`\`${name}\``)) {
      // Insert before the divider
      if (content.includes('---')) {
        content = content.replace('---', `${row}\n---`);
      } else {
        content += `\n${row}`;
      }
      fs.writeFileSync(this.skillsMdPath, content, 'utf8');
    }
  }

  /**
   * Validates all skills using validate-agent-skills.js.
   */
  validateAll() {
    try {
      const output = execSync('node tools/validate-agent-skills.js', {
        cwd: ROOT,
        encoding: 'utf8',
      });
      return { valid: true, output: output.trim() };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

module.exports = {
  AutonomousSkillForge,
};

if (require.main === module) {
  const forge = new AutonomousSkillForge();
  const res = forge.forgeSkill({
    name: 'autonomous-execution-engine',
    description: 'Autonomous zero-babysitting continuous execution engine for background coding tasks.',
    triggers: ['autonomous', 'zero-babysitting', 'gsd'],
    instructions: '1. Scan open tasks in plan.md.\n2. Claim file before editing.\n3. Run tests and commit.',
    verificationCmd: 'node tests/test-anti-babysitting-engine.js',
  });
  console.log('Forged Skill:', res);
  console.log('Validation:', forge.validateAll());
}
