#!/usr/bin/env node
'use strict';

/**
 * context-compiler.js — 3-Pass Context Compiler for Monorepo Coding Agents
 *
 * Implements the architecture from:
 * "Coding Agents Don’t Need Bigger Context Windows — They Need a Context Compiler"
 * (Towards Data Science, Aug 2026)
 *
 * Pass 1: Symbol Reachability Analysis (Imports BFS up to maxHops)
 * Pass 2: Skeletonization / Interface Extraction (Tier 2 dependencies)
 * Pass 3: Tiered Assembly & Token Budgeting (Tier 1 Full, Tier 2 Stub, Tier 3 Excluded)
 *
 * Usage:
 *   node tools/context-compiler.js --target hermes-mobile/src/utils/chatMachineHeader.ts
 *   node tools/context-compiler.js --target hermes-mobile/src/services/gatewayProfiles.ts --json
 *   node tools/context-compiler.js --help
 */

const fs = require('fs');
const path = require('path');
const { skeletonizeTypeScript, skeletonizePython } = require('./lib/ast-skeletonizer');

const REPO = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  let targetFile = '';
  let maxHops = 2;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) {
      targetFile = args[i + 1];
      i++;
    } else if (args[i] === '--hops' && args[i + 1]) {
      maxHops = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--json') {
      jsonOutput = true;
    } else if (args[i] === '--help') {
      console.log(`
Context Compiler CLI
====================
  --target <file>   Target file to edit (Tier 1)
  --hops <number>   Max BFS dependency hops (default: 2)
  --json            Output JSON analysis
      `);
      process.exit(0);
    }
  }

  return { targetFile, maxHops, jsonOutput };
}

function resolveImports(filePath, code) {
  const dir = path.dirname(filePath);
  const imports = [];
  const importRegex = /(?:import\s+[\s\S]*?from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1] || match[2];
    if (!importPath || importPath.startsWith('.')) {
      // Relative import
      const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
      for (const ext of exts) {
        const fullCandidate = path.resolve(dir, importPath + ext);
        if (fs.existsSync(fullCandidate) && fs.statSync(fullCandidate).isFile()) {
          imports.push(fullCandidate);
          break;
        }
      }
    }
  }

  return imports;
}

function compileContext(targetPathRelative, maxHops = 2) {
  const startTime = Date.now();
  const absoluteTarget = path.resolve(REPO, targetPathRelative);

  if (!fs.existsSync(absoluteTarget)) {
    throw new Error(`Target file not found: ${targetPathRelative}`);
  }

  const visited = new Set();
  const tier1Files = [absoluteTarget];
  const tier2Files = [];
  const queue = [{ file: absoluteTarget, hop: 0 }];
  visited.add(absoluteTarget);

  // Pass 1: Reachability BFS
  while (queue.length > 0) {
    const { file, hop } = queue.shift();
    if (hop >= maxHops) continue;

    try {
      const code = fs.readFileSync(file, 'utf8');
      const deps = resolveImports(file, code);

      for (const dep of deps) {
        if (!visited.has(dep)) {
          visited.add(dep);
          tier2Files.push(dep);
          queue.push({ file: dep, hop: hop + 1 });
        }
      }
    } catch {
      // Ignore unreadable files
    }
  }

  // Calculate naive raw size
  let naiveChars = 0;
  let compiledChars = 0;

  const targetCode = fs.readFileSync(absoluteTarget, 'utf8');
  naiveChars += targetCode.length;
  compiledChars += targetCode.length; // Tier 1: Full source

  // Pass 2 & Pass 3: Skeletonization + Tier Assembly
  const skeletonizedDeps = [];

  for (const dep of tier2Files) {
    const raw = fs.readFileSync(dep, 'utf8');
    naiveChars += raw.length;

    let skeleton = raw;
    if (dep.endsWith('.ts') || dep.endsWith('.tsx') || dep.endsWith('.js')) {
      skeleton = skeletonizeTypeScript(raw);
    } else if (dep.endsWith('.py')) {
      skeleton = skeletonizePython(raw);
    }

    compiledChars += skeleton.length;
    skeletonizedDeps.push({
      file: path.relative(REPO, dep),
      rawBytes: raw.length,
      skeletonBytes: skeleton.length,
      savingsPct: Math.round((1 - skeleton.length / raw.length) * 100),
    });
  }

  const buildTimeMs = Date.now() - startTime;
  const naiveTokens = Math.round(naiveChars / 4);
  const compiledTokens = Math.round(compiledChars / 4);
  const reductionPct = Math.round((1 - compiledChars / naiveChars) * 100);

  return {
    targetFile: targetPathRelative,
    maxHops,
    buildTimeMs,
    tier1: [targetPathRelative],
    tier2Count: tier2Files.length,
    tier2Details: skeletonizedDeps,
    naiveTokens,
    compiledTokens,
    reductionPct,
  };
}

function main() {
  const { targetFile, maxHops, jsonOutput } = parseArgs();

  if (!targetFile) {
    console.error('Error: --target <file> is required.');
    process.exit(1);
  }

  try {
    const result = compileContext(targetFile, maxHops);
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n=== Context Compiler Build Summary ===');
      console.log(`Target (Tier 1 Full Source): ${result.targetFile}`);
      console.log(`Reachable Dependencies (Tier 2 Skeletonized): ${result.tier2Count} files`);
      console.log(`Max Hop Depth: ${result.maxHops}`);
      console.log(`Build Time: ${result.buildTimeMs} ms`);
      console.log(`Naive Context Estimate: ~${result.naiveTokens} tokens`);
      console.log(`Compiled Context Estimate: ~${result.compiledTokens} tokens`);
      console.log(`Token Reduction: ${result.reductionPct}%`);
      console.log('=====================================\n');
    }
  } catch (err) {
    console.error(`Compilation failed: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { compileContext };
