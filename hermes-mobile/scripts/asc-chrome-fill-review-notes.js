#!/usr/bin/env node
/** One-shot: fill ASC App Review Notes in active Chrome tab. */
const { execFileSync } = require('child_process');
const { ASC_SAFE_REVIEW_NOTES } = require('./asc-review-notes-safe');

const notes = ASC_SAFE_REVIEW_NOTES;

const js = `(() => {
  const textareas = Array.from(document.querySelectorAll('textarea'));
  const target = textareas.find((t) => /notes/i.test(t.getAttribute('aria-label') || t.name || t.id || ''));
  if (!target) return JSON.stringify({ err: 'no notes textarea', fields: textareas.map((t) => t.getAttribute('aria-label') || t.name || t.id) });
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(target, ${JSON.stringify(notes)});
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  const save = Array.from(document.querySelectorAll('button')).find((b) => /^Save$/i.test((b.innerText || '').trim()));
  if (save) save.click();
  return JSON.stringify({ ok: true, len: target.value.length, saved: !!save, field: target.getAttribute('aria-label') || target.name || target.id });
})();`;

const appleScript = `tell application "Google Chrome"
  activate
  set r to execute active tab of front window javascript ${JSON.stringify(js)}
  return r
end tell`;

const out = execFileSync('osascript', ['-e', appleScript], { encoding: 'utf8' }).trim();
console.log(out);
