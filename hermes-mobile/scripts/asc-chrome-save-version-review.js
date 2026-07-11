#!/usr/bin/env node
/** Fill ASC version page promo + review notes, then Save once. */
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');
const { ASC_SAFE_REVIEW_NOTES } = require('./asc-review-notes-safe');

const promo = readFileSync(
  join(__dirname, '../fastlane/metadata/ios/en-US/promotional_text.txt'),
  'utf8',
)
  .trim()
  .slice(0, 170);

const notes = ASC_SAFE_REVIEW_NOTES;

const js = `(() => {
  function setTextarea(name, value) {
    const el = Array.from(document.querySelectorAll('textarea')).find((t) => t.name === name);
    if (!el) return { name, ok: false };
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { name, ok: true, len: el.value.length };
  }
  const promo = setTextarea('promotionalText', ${JSON.stringify(promo)});
  const notes = setTextarea('notes', ${JSON.stringify(notes)});
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    /^Save$/i.test((b.innerText || '').trim()),
  );
  if (btn) btn.click();
  return JSON.stringify({ promo, notes, saved: !!btn });
})();`;

const appleScript = `tell application "Google Chrome"
  activate
  return execute active tab of front window javascript ${JSON.stringify(js)}
end tell`;

console.log(execFileSync('osascript', ['-e', appleScript], { encoding: 'utf8' }).trim());
