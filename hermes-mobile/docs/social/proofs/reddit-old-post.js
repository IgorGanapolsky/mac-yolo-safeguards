#!/usr/bin/env node
const { execSync } = require('child_process');

const REPLY = `Thanks — means a lot coming from the Nous team. Hermes Agent is the brain; Hermes Mobile is the phone client for the same gateway: chat, approve/deny Leash tool calls, QR pair over Tailscale or home Wi-Fi — no cloud relay, keys stay on your machine.

On Google Play + App Store if you want to try it. Would love feedback on what would make Nous + mobile smoother — especially first-run pairing.`;

const URL =
  'https://old.reddit.com/r/hermesagent/comments/1uwdf2n/show_hermes_mobile_phone_approvedeny_for_ai/';

function chromeJs(code) {
  const wrapped = `(() => { ${code} })()`;
  const escaped = wrapped.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `tell application "Google Chrome" to tell front window's active tab to execute javascript "${escaped}"`;
  return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}

function sleep(ms) {
  execSync(`sleep ${Math.ceil(ms / 1000)}`);
}

execSync(`open -a "Google Chrome" "${URL}"`);
sleep(7000);

const click = chromeJs(`
  const text = ${JSON.stringify(REPLY)};
  const comments = [...document.querySelectorAll('.comment')];
  const target = comments.find(c => (c.innerText||'').includes('Mean-Loquat-7982') && (c.innerText||'').includes('cool project'));
  if (!target) return JSON.stringify({error:'comment not found', count: comments.length});
  const reply = target.querySelector('a[data-event-action="reply"]') || [...target.querySelectorAll('a')].find(a => a.innerText.trim().toLowerCase()==='reply');
  if (!reply) return JSON.stringify({error:'reply link missing'});
  reply.click();
  return JSON.stringify({step:'clicked reply'});
`);
console.log('CLICK:', click);
sleep(2000);

const submit = chromeJs(`
  const text = ${JSON.stringify(REPLY)};
  const form = document.querySelector('.usertext-edit textarea[name=text]') || document.querySelector('form.usertext.cloneable textarea') || document.querySelector('.commentarea form.usertext textarea');
  if (!form) return JSON.stringify({error:'textarea not found', textareas: document.querySelectorAll('textarea').length});
  form.focus();
  form.value = text;
  form.dispatchEvent(new Event('input', {bubbles:true}));
  form.dispatchEvent(new Event('change', {bubbles:true}));
  const save = form.closest('form').querySelector('button[type=submit], .save, button.save');
  if (!save) return JSON.stringify({error:'save not found', preview: form.value.slice(0,80)});
  save.click();
  return JSON.stringify({step:'submitted', preview: form.value.slice(0,80)});
`);
console.log('SUBMIT:', submit);
sleep(6000);

const verify = chromeJs(`
  const posted = document.body.innerText.includes('Thanks — means a lot coming from the Nous team');
  const user = document.querySelector('#header-bottom-right .user')?.innerText || 'unknown';
  return JSON.stringify({posted, user, url: location.href});
`);
console.log('VERIFY:', verify);

execSync(
  'osascript -e \'tell application "Google Chrome" to activate\' && sleep 1 && screencapture -x "/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/hermes-mobile/docs/social/proofs/reddit-nous-reply-20260715-posted.png"'
);

console.log('REPLY_TEXT:', REPLY);
