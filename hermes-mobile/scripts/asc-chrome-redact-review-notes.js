#!/usr/bin/env node
/** Emergency: redact ASC inflight tab review notes (no secrets) and Save. */
const { execFileSync } = require('child_process');
const { ASC_SAFE_REVIEW_NOTES } = require('./asc-review-notes-safe');

const TARGET = 'distribution/ios/version/inflight';

function chromeJs(js) {
  const appleScript = `tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${TARGET}" then
        return execute t javascript ${JSON.stringify(js)}
      end if
    end repeat
  end repeat
  return "TAB_NOT_FOUND"
end tell`;
  return execFileSync('osascript', ['-e', appleScript], { encoding: 'utf8' }).trim();
}

const notes = ASC_SAFE_REVIEW_NOTES;

const before = JSON.parse(
  chromeJs(`(() => {
  const target = Array.from(document.querySelectorAll('textarea')).find((t) => /notes/i.test(t.getAttribute('aria-label') || t.name || t.id || ''));
  const val = target?.value || '';
  return JSON.stringify({
    url: location.href,
    waitingForReview: /Waiting for Review/i.test(document.body.innerText),
    notesLen: val.length,
    hadTailscaleHost: /ts\\.net/i.test(val),
    hadApiKeyLine: /API key/i.test(val) && /Set the API key/i.test(val),
  });
})();`),
);

const saveResult = JSON.parse(
  chromeJs(`(() => {
  const target = Array.from(document.querySelectorAll('textarea')).find((t) => /notes/i.test(t.getAttribute('aria-label') || t.name || t.id || ''));
  if (!target) return JSON.stringify({ ok: false, err: 'no notes textarea' });
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(target, ${JSON.stringify(notes)});
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  const save = Array.from(document.querySelectorAll('button')).find((b) => /^Save$/i.test((b.innerText || '').trim()));
  if (save) save.click();
  return JSON.stringify({
    ok: true,
    len: target.value.length,
    saved: !!save,
    hasDemo: /demo=1/i.test(target.value),
    hasTailscale: /ts\\.net/i.test(target.value),
  });
})();`),
);

execFileSync('sleep', ['2']);

const after = JSON.parse(
  chromeJs(`(() => {
  const target = Array.from(document.querySelectorAll('textarea')).find((t) => /notes/i.test(t.getAttribute('aria-label') || t.name || t.id || ''));
  const val = target?.value || '';
  return JSON.stringify({
    notesLen: val.length,
    hasDemo: /demo=1/i.test(val),
    hasTailscale: /ts\\.net/i.test(val),
    hasApiKeyInstruction: /Set the API key/i.test(val),
  });
})();`),
);

console.log(JSON.stringify({ before, saveResult, after }, null, 2));
