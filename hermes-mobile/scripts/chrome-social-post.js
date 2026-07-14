#!/usr/bin/env node
/**
 * One-shot Chrome helper: find tab by URL substring, run JS, return result.
 * Usage:
 *   node chrome-social-post.js find <urlSubstr>
 *   node chrome-social-post.js exec <urlSubstr> <jsFile>
 *   node chrome-social-post.js goto <url>
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function osascript(lines) {
  const tmp = path.join(os.tmpdir(), `hermes-chrome-${Date.now()}.scpt.txt`);
  fs.writeFileSync(tmp, lines);
  try {
    return execFileSync('osascript', [tmp], { encoding: 'utf8' }).trim();
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
  }
}

function findTab(substr) {
  const script = `
tell application "Google Chrome"
  set wi to 0
  repeat with w in windows
    set wi to wi + 1
    set ti to 0
    repeat with t in tabs of w
      set ti to ti + 1
      set u to URL of t as text
      if u contains ${JSON.stringify(substr)} then
        return (wi as text) & "|" & (ti as text) & "|" & u
      end if
    end repeat
  end repeat
  return "NONE"
end tell`;
  return osascript(script);
}

function activateAndExec(substr, jsSource, navigateUrl) {
  const jsLiteral = JSON.stringify(jsSource);
  const navBlock = navigateUrl
    ? `
  set URL of targetT to ${JSON.stringify(navigateUrl)}
  delay 4
`
    : '';
  const script = `
tell application "Google Chrome"
  activate
  set targetW to missing value
  set targetT to missing value
  set wi to 0
  set foundWi to 0
  set foundTi to 0
  repeat with w in windows
    set wi to wi + 1
    set ti to 0
    repeat with t in tabs of w
      set ti to ti + 1
      set u to URL of t as text
      if u contains ${JSON.stringify(substr)} then
        set targetW to w
        set targetT to t
        set foundWi to wi
        set foundTi to ti
        set active tab index of w to ti
      end if
    end repeat
  end repeat
  if targetT is missing value then
    if ${navigateUrl ? 'true' : 'false'} then
      tell front window
        set targetT to make new tab with properties {URL:${JSON.stringify(navigateUrl || 'about:blank')}}
        set active tab index to (count of tabs)
        set foundWi to 1
        set foundTi to (count of tabs)
      end tell
      delay 4
    else
      return "NO_TAB|||<<<>>>{\"err\":\"no_tab\"}"
    end if
  end if
  ${navBlock}
  set r to execute targetT javascript ${jsLiteral}
  delay 1
  set u to URL of targetT as text
  return (foundWi as text) & "|" & (foundTi as text) & "|" & u & "<<<>>>" & r
end tell`;
  return osascript(script);
}

const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === 'find') {
  console.log(findTab(a));
} else if (cmd === 'exec') {
  const js = fs.readFileSync(b, 'utf8');
  console.log(activateAndExec(a, js, null));
} else if (cmd === 'goto-exec') {
  // goto-exec <urlSubstr> <navigateUrl> <jsFile>
  const js = fs.readFileSync(c, 'utf8');
  console.log(activateAndExec(a, js, b));
} else {
  console.error('Usage: find|exec|goto-exec');
  process.exit(1);
}
