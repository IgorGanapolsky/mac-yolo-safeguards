const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildVaultProjectCatalog,
  parseProjectsReadmeTable,
} = require('../hermes-mobile/scripts/vault-project-catalog.cjs');
const { collectCatalog } = require('../tools/hermes-vault-projects-sync');

const SAMPLE_README = `# Projects

## Project Homes

| Project | Start Here | Source Repo | Current Role |
| --- | --- | --- | --- |
| mac-yolo-safeguards | \`Projects/mac-yolo-safeguards/Start Here.md\` | \`/Users/igor/workspace/git/igor/mac-yolo-safeguards\` | Hermes/mobile/platform coordination |
| ThumbGate | \`Projects/ThumbGate/Start Here.md\` | \`/Users/igor/workspace/git/igor/ThumbGate/repo\` | Funnel/revenue product context |
`;

const SAMPLE_HANDOFF = `---
type: handoff
project: mac-yolo-safeguards
date: 2026-07-05
---

# mac-yolo-safeguards — Coordination Handoff

**For:** Cursor and Hermes agents working on mobile UX.
`;

function testParseProjectsReadmeTable() {
  const projects = parseProjectsReadmeTable(SAMPLE_README);
  assert.strictEqual(projects.length, 2);
  assert.strictEqual(projects[0].slug, 'mac-yolo-safeguards');
  assert.strictEqual(projects[1].name, 'ThumbGate');
}

function testBuildCatalogAttachesHandoff() {
  const catalog = buildVaultProjectCatalog({
    vaultPath: '/tmp/vault',
    readmeText: SAMPLE_README,
    handoffFiles: [{ path: 'Handoffs/2026-07-05-mac-yolo-safeguards-coordination.md', text: SAMPLE_HANDOFF }],
  });
  assert.strictEqual(catalog.schema, 'hermes-vault-projects/v1');
  assert.strictEqual(catalog.projects.length, 2);
  assert.match(catalog.projects[0].handoffSummary || '', /mobile UX/i);
}

function testCollectCatalogFromFixtureVault() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-projects-'));
  fs.mkdirSync(path.join(vault, 'Projects'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'Handoffs'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'Projects', 'README.md'), SAMPLE_README);
  fs.writeFileSync(
    path.join(vault, 'Handoffs', '2026-07-05-mac-yolo-safeguards-coordination.md'),
    SAMPLE_HANDOFF,
  );
  const catalog = collectCatalog(vault);
  assert.strictEqual(catalog.projects.length, 2);
  assert.ok(catalog.generatedAt);
}

function main() {
  testParseProjectsReadmeTable();
  testBuildCatalogAttachesHandoff();
  testCollectCatalogFromFixtureVault();
  console.log('test-hermes-vault-projects-sync: 3 passed');
}

main();
