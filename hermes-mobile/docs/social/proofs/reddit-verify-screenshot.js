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

const info = chromeJs(`
  const comments = [...document.querySelectorAll('.comment')].map(c => ({
    author: (c.querySelector('.author')||{}).innerText,
    text: (c.querySelector('.md')||c).innerText.replace(/\\s+/g,' ').slice(0,160)
  }));
  return JSON.stringify({
    posted: document.body.innerText.includes('Thank you — that means a lot coming from the Nous team') || document.body.innerText.includes('Thanks — means a lot coming from the Nous team'),
    url: location.href,
    user: document.querySelector('#header-bottom-right .user')?.innerText,
    replyText: (() => {
      const c = [...document.querySelectorAll('.comment')].find(x => {
        const author = (x.querySelector('.author')||{}).innerText || '';
        const body = (x.querySelector('.md')||{}).innerText || '';
        return author.includes('eazyigz') && /Nous team/i.test(body);
      });
      return c ? (c.querySelector('.md')||c).innerText : null;
    })(),
    relevant: comments.filter(c => /Thanks|Thank you|cool project|Mean-Loquat|eazyigz123/i.test(c.author + c.text))
  }, null, 2);
`);
console.log(info);

execSync('osascript -e \'tell application "Google Chrome" to activate\'');
execSync('sleep 1');
const bounds = execSync(`osascript -e 'tell application "Google Chrome" to get bounds of front window'`, {encoding:'utf8'}).trim();
const parts = bounds.split(',').map(s => parseInt(s.trim(), 10));
const [x1, y1, x2, y2] = parts;
const proof = '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/hermes-mobile/docs/social/proofs/reddit-nous-reply-20260715-posted.png';
execSync(`screencapture -x -R${x1},${y1},${x2-x1},${y2-y1} "${proof}"`);
console.log('PROOF:', proof);
