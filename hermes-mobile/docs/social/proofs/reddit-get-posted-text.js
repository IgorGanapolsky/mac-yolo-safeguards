#!/usr/bin/env node
const { execSync } = require('child_process');
function chromeJs(code) {
  const wrapped = `(() => { ${code} })()`;
  const escaped = wrapped.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `tell application "Google Chrome" to tell front window's active tab to execute javascript "${escaped}"`;
  return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}
const text = chromeJs(`
  const all = document.body.innerText;
  const marker = all.includes('Thank you — that means a lot') ? 'Thank you — that means a lot' : (all.includes('Thanks — means a lot') ? 'Thanks — means a lot' : null);
  if (!marker) return 'NOT FOUND in body';
  const start = all.indexOf(marker);
  return all.slice(start, start + 900);
`);
console.log(text);
