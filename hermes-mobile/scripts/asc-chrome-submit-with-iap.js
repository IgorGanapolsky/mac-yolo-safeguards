#!/usr/bin/env node
/** Fill review notes + submit on ASC inflight tab (not active tab). */
const { execFileSync } = require('child_process');
const { ASC_SAFE_REVIEW_NOTES } = require('./asc-review-notes-safe');

const TAB = 'version/inflight';

function onInflightTab(js) {
  const appleScript = `tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${TAB}" then
        return execute t javascript ${JSON.stringify(js)}
      end if
    end repeat
  end repeat
  return "TAB_NOT_FOUND"
end tell`;
  return execFileSync('osascript', ['-e', appleScript], { encoding: 'utf8' }).trim();
}

const notes = ASC_SAFE_REVIEW_NOTES;

const fillResult = JSON.parse(
  onInflightTab(`(() => {
  const textareas = Array.from(document.querySelectorAll('textarea'));
  const target = textareas.find((t) => /notes/i.test(t.getAttribute('aria-label') || t.name || t.id || ''));
  if (!target) return JSON.stringify({ok:false, err:'no notes textarea', count:textareas.length});
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(target, ${JSON.stringify(notes)});
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  const save = Array.from(document.querySelectorAll('button')).find((b) => /^Save$/i.test((b.innerText || '').trim()));
  if (save) save.click();
  return JSON.stringify({ok:true, len: target.value.length, saved: !!save});
})();`),
);

console.log('notes:', fillResult);
execFileSync('sleep', ['2']);

const submitClick = JSON.parse(
  onInflightTab(`(() => {
  const btn = Array.from(document.querySelectorAll('button,a,[role=button]')).find(el => /^Add for Review$/i.test((el.innerText||'').trim()));
  if (!btn) return JSON.stringify({ok:false, err:'no Add for Review'});
  btn.click();
  return JSON.stringify({ok:true});
})();`),
);
console.log('submit click:', submitClick);
execFileSync('sleep', ['2']);

const confirm = JSON.parse(
  onInflightTab(`(() => {
  const buttons = Array.from(document.querySelectorAll('button,[role=button]'));
  const btn = buttons.find(b => /^(Add for Review|Submit|Confirm)$/i.test((b.innerText||'').trim()));
  if (btn) { btn.click(); return JSON.stringify({ok:true, text: btn.innerText.trim()}); }
  return JSON.stringify({ok:false, buttons: buttons.map(b=>(b.innerText||'').trim()).filter(Boolean).slice(0,20)});
})();`),
);
console.log('confirm:', confirm);
execFileSync('sleep', ['5']);

const final = JSON.parse(
  onInflightTab(`(() => JSON.stringify({
  hasIAP: /thumbgate_leash_monthly/i.test(document.body.innerText),
  waiting: /Waiting for Review/i.test(document.body.innerText),
  sidebar: document.body.innerText.match(/1\\.0[^\\n]*/)?.[0],
  notesLen: (Array.from(document.querySelectorAll('textarea')).find(t=>/notes/i.test(t.getAttribute('aria-label')||''))||{}).value?.length||0,
  notesHasTailscale: /ts\\.net/i.test((Array.from(document.querySelectorAll('textarea')).find(t=>/notes/i.test(t.getAttribute('aria-label')||''))||{}).value||''),
  notesHasDemo: /demo=1/i.test((Array.from(document.querySelectorAll('textarea')).find(t=>/notes/i.test(t.getAttribute('aria-label')||''))||{}).value||'')
}))();`),
);
console.log('final:', final);
