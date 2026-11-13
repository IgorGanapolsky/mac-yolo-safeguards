// The Stop Runaways button must not save its armed label ("Click again to stop") as the label to restore.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function grab(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}

for (const file of ['MacYoloSafeguardsApp.swift', 'MacYoloTranslucentHud.swift']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'macos', file), 'utf8');
  const btn = { textContent: 'Stop Runaways', style: {}, attrs: {}, getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); } };
  const saved = [];
  const ctx = {
    btn, saved, Date, setTimeout: () => 0,
    _stopArmedUntil: 0, _hudActionConfirmUntil: {},
    triggerHudAction(action, b) { saved.push(b.getAttribute('data-orig') || b.textContent); },
  };
  vm.createContext(ctx);
  vm.runInContext(`${grab(src, 'confirmStopRunaways')}\n${grab(src, 'confirmHudAction')}`, ctx);

  vm.runInContext('confirmStopRunaways(btn)', ctx);
  assert.equal(btn.textContent, 'Click again to stop', `${file}: first click arms`);
  vm.runInContext('confirmStopRunaways(btn)', ctx);
  assert.deepEqual(saved, ['Stop Runaways'], `${file}: label restored after the run must be Stop Runaways`);

  const b2 = { ...btn, textContent: 'Free Agent RAM', attrs: {} };
  ctx.b2 = b2; saved.length = 0;
  vm.runInContext("confirmHudAction('freeUpMemory', b2, 'Freeing…', 'Done', 'Free Agent RAM'); confirmHudAction('freeUpMemory', b2, 'Freeing…', 'Done', 'Free Agent RAM')", ctx);
  assert.deepEqual(saved, ['Free Agent RAM'], `${file}: confirm buttons restore their own label`);
}
console.log('ok hud stop label not stuck');
