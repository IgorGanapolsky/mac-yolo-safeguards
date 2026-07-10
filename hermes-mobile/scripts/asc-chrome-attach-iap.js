#!/usr/bin/env node
/** Drive ASC Chrome tab: remove from review, attach IAP, fill notes, resubmit. */
const { execFileSync } = require('child_process');
const { join } = require('path');
const { ASC_SAFE_REVIEW_NOTES } = require('./asc-review-notes-safe');

const TARGET = 'distribution/ios/version/inflight';
const PROOF_DIR = join(__dirname, '../docs/proofs/asc-setup-20260709');

function chromeJs(js) {
  const appleScript = `tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${TARGET}" then
        set index of w to 1
        return execute t javascript ${JSON.stringify(js)}
      end if
    end repeat
  end repeat
  return "TAB_NOT_FOUND"
end tell`;
  return execFileSync('osascript', ['-e', appleScript], { encoding: 'utf8' }).trim();
}

function screenshot(name) {
  const out = join(PROOF_DIR, `${name}.png`);
  execFileSync('screencapture', ['-x', out]);
  return out;
}

function sleep(ms) {
  execFileSync('sleep', [String(Math.ceil(ms / 1000))]);
}

function pageInfo() {
  return JSON.parse(
    chromeJs(`(() => JSON.stringify({
      url: location.href,
      title: document.title,
      versionState: (document.body.innerText.match(/iOS App\\s*Version 1\\.0[\\s\\S]{0,40}/) || [])[0],
      hasIAPSection: /In-App Purchases and Subscriptions/i.test(document.body.innerText),
      waitingForReview: /Waiting for Review/i.test(document.body.innerText),
      prepareForSubmission: /Prepare for Submission/i.test(document.body.innerText),
      notesLen: (Array.from(document.querySelectorAll('textarea')).find(t => /notes/i.test(t.getAttribute('aria-label')||t.name||''))||{}).value?.length || 0
    }))();`),
  );
}

function clickRemoveFromReview() {
  return JSON.parse(
    chromeJs(`(() => {
  const link = Array.from(document.querySelectorAll('a')).find(a => /remove this version from review/i.test(a.innerText||''));
  if (!link) return JSON.stringify({ok:false, err:'no remove link'});
  link.click();
  return JSON.stringify({ok:true, clicked:'remove link'});
})();`),
  );
}

function confirmDialog() {
  return JSON.parse(
    chromeJs(`(() => {
  const buttons = Array.from(document.querySelectorAll('button, [role=button]'));
  const confirm = buttons.find(b => /remove from review/i.test((b.innerText||b.textContent||'').trim()));
  if (confirm) { confirm.click(); return JSON.stringify({ok:true, text:confirm.innerText.trim()}); }
  return JSON.stringify({ok:false, buttons: buttons.map(b=>(b.innerText||'').trim()).filter(Boolean).slice(0,25)});
})();`),
  );
}

function attachIAP() {
  return JSON.parse(
    chromeJs(`(() => {
  const text = document.body.innerText;
  if (!/In-App Purchases and Subscriptions/i.test(text)) {
    return JSON.stringify({ok:false, err:'no IAP section'});
  }
  const plus = Array.from(document.querySelectorAll('button, a, [role=button]')).find(el => {
    const t = (el.innerText||'').trim();
    const near = el.closest('section, div')?.innerText || '';
    return /In-App Purchases and Subscriptions/i.test(near) && (t === '+' || /add/i.test(t));
  });
  if (plus) plus.click();
  const checkboxes = Array.from(document.querySelectorAll('input[type=checkbox], [role=checkbox]'));
  const leash = Array.from(document.querySelectorAll('label, tr, li, div')).find(el => /thumbgate_leash_monthly|Leash Pro|Hermes Pro Monthly/i.test(el.innerText||''));
  if (leash) {
    const cb = leash.querySelector('input[type=checkbox], [role=checkbox]') || leash.closest('tr')?.querySelector('input[type=checkbox], [role=checkbox]');
    if (cb && !cb.checked) cb.click();
    const done = Array.from(document.querySelectorAll('button')).find(b => /done|add|save/i.test((b.innerText||'').trim()));
    if (done) done.click();
    return JSON.stringify({ok:true, attached:true, product: leash.innerText.slice(0,120)});
  }
  return JSON.stringify({ok:false, err:'leash not found in picker', body: text.match(/In-App Purchases and Subscriptions[\\s\\S]{0,800}/)?.[0]});
})();`),
  );
}

function fillReviewNotes() {
  const notes = ASC_SAFE_REVIEW_NOTES;
  return JSON.parse(
    chromeJs(`(() => {
  const textareas = Array.from(document.querySelectorAll('textarea'));
  const target = textareas.find((t) => /notes/i.test(t.getAttribute('aria-label') || t.name || t.id || ''));
  if (!target) return JSON.stringify({ok:false, err:'no notes textarea'});
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(target, ${JSON.stringify(notes)});
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  const save = Array.from(document.querySelectorAll('button')).find((b) => /^Save$/i.test((b.innerText || '').trim()));
  if (save) save.click();
  return JSON.stringify({ok:true, len: target.value.length, saved: !!save});
})();`),
  );
}

function submitForReview() {
  return JSON.parse(
    chromeJs(`(() => {
  const btn = Array.from(document.querySelectorAll('button, a, [role=button]')).find(el => /add for review|submit for review|send for review/i.test((el.innerText||'').trim()));
  if (!btn) return JSON.stringify({ok:false, err:'no submit button', buttons: Array.from(document.querySelectorAll('button')).map(b=>(b.innerText||'').trim()).filter(Boolean).slice(0,20)});
  btn.click();
  return JSON.stringify({ok:true, clicked: btn.innerText.trim()});
})();`),
  );
}

function confirmSubmit() {
  return JSON.parse(
    chromeJs(`(() => {
  const buttons = Array.from(document.querySelectorAll('button, [role=button]'));
  const confirm = buttons.find(b => /submit|confirm|add for review/i.test((b.innerText||'').trim()));
  if (confirm) { confirm.click(); return JSON.stringify({ok:true, text:confirm.innerText.trim()}); }
  return JSON.stringify({ok:false, buttons: buttons.map(b=>(b.innerText||'').trim()).filter(Boolean).slice(0,25)});
})();`),
  );
}

async function main() {
  const steps = [];
  let info = pageInfo();
  steps.push({ step: 'initial', info });
  screenshot('01-initial');

  if (info.waitingForReview) {
    const remove = clickRemoveFromReview();
    steps.push({ step: 'remove-click', remove });
    sleep(2000);
    screenshot('02-remove-dialog');
    const confirm = confirmDialog();
    steps.push({ step: 'remove-confirm', confirm });
    sleep(4000);
    info = pageInfo();
    steps.push({ step: 'after-remove', info });
    screenshot('03-after-remove');
  }

  if (!info.hasIAPSection) {
    steps.push({ step: 'iap-section-missing', info });
  } else {
    const attach = attachIAP();
    steps.push({ step: 'attach-iap', attach });
    sleep(2000);
    screenshot('04-after-attach');
  }

  const notes = fillReviewNotes();
  steps.push({ step: 'review-notes', notes: { ...notes, apiKeyRedacted: true } });
  sleep(2000);
  screenshot('05-after-notes');

  info = pageInfo();
  if (info.prepareForSubmission || !info.waitingForReview) {
    const submit = submitForReview();
    steps.push({ step: 'submit-click', submit });
    sleep(2000);
    screenshot('06-submit-dialog');
    const confirmSubmitResult = confirmSubmit();
    steps.push({ step: 'submit-confirm', confirmSubmitResult });
    sleep(4000);
    info = pageInfo();
    steps.push({ step: 'final', info });
    screenshot('07-final');
  }

  console.log(JSON.stringify({ steps }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
