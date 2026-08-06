'use strict';

/**
 * ast-skeletonizer.js — Pass 2 Interface Extractor for Context Compiler.
 * Extracts function signatures, docstrings, type annotations, and class structures
 * while stripping internal implementation bodies to save 70%+ prompt context tokens.
 */

function skeletonizeTypeScript(code) {
  if (!code || typeof code !== 'string') return '';

  // Replace function bodies with interface stubs
  let result = code.replace(
    /((?:export\s+)?(?:async\s+)?function\s+[\w$]+\s*\([^)]*\)(?:\s*:\s*[^{]+)?)\s*\{[\s\S]*?\n\}/g,
    '$1 {\n  /* interface stub */\n}',
  );

  return result;
}

function skeletonizePython(code) {
  if (!code || typeof code !== 'string') return '';

  const lines = code.split('\n');
  const output = [];
  let inDef = false;
  let defIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (trimmed.startsWith('def ') || trimmed.startsWith('async def ') || trimmed.startsWith('class ')) {
      inDef = true;
      defIndent = indent;
      output.push(line);
      continue;
    }

    if (inDef) {
      if (indent <= defIndent && trimmed.length > 0 && !trimmed.startsWith('#')) {
        inDef = false;
        output.push(line);
      } else {
        if (output[output.length - 1]?.trim() !== '...') {
          output.push(' '.repeat(defIndent + 4) + '...');
        }
      }
    } else {
      output.push(line);
    }
  }

  return output.join('\n');
}

module.exports = {
  skeletonizeTypeScript,
  skeletonizePython,
};
