'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const configPath = process.env.MAC_TEXT_HOTKEYS_INIT
  ? process.env.MAC_TEXT_HOTKEYS_INIT.replace(/^~(?=$|\/)/, os.homedir())
  : path.join(os.homedir(), 'Documents/mac-text-hotkeys/init.lua');

const source = fs.readFileSync(configPath, 'utf8');

function has(pattern, message) {
  assert.match(source, pattern, message);
}

function lacks(pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

console.log(`=== mac-text-hotkeys config unit test: ${configPath} ===`);

has(/\["1"\]\s*=\s*"Verify every load-bearing assumption using current external evidence\. Label unknowns explicitly\."/,
  'cmd+1 verification snippet must be present');
has(/\["2"\]\s*=\s*"Run the Revenue Operator loop now\./,
  'cmd+2 revenue-loop snippet must be present');
has(/\["3"\]\s*=\s*"You are my bounded autonomous Revenue Operator for the active campaign\./,
  'cmd+3 bounded-role snippet must be present');
has(/\["4"\]\s*=\s*"Use web research, RAG, data analysis, or ML only when it can materially change the selected action\./,
  'cmd+4 research-policy snippet must be present');
has(/\["5"\]\s*=\s*"What single authorized revenue action will you execute now to move a qualified prospect toward payment\?/,
  'cmd+5 executable-action snippet must be present');

has(/local\s+lastPasteAtByKey\s*=\s*\{\}/, 'cooldown must be per-key');
lacks(/lastPasteAtGlobal/, 'global cooldown must not come back');
lacks(/global-cooldown/, 'global cooldown log path must not come back');

has(/no-focused-role-fallback/, 'no-focused-role fallback reason must be observable');
has(/tostring\(role\)\s*\.\.\s*"-fallback"/, 'Codex/Chrome role fallback must be observable');
has(/AXWebArea\s*=\s*true/, 'Chrome web areas must be treated as paste targets');
has(/AXSharedScreen\s*=\s*true/, 'Screen Sharing role must stay detectable');
has(/local\s+remoteForwardHost\s*=/, 'remote forward host must be configurable');
has(/local\s+function\s+screenSharingTarget/, 'Screen Sharing must be detected before local paste');
has(/local\s+function\s+forwardToRemote/, 'Screen Sharing hotkeys must forward to Mac mini');
has(/igorTextHotkeys\.pasteRemote/, 'remote forward must use the remote paste API');
has(/source=hotkey action=forward-start/, 'forward-start log must make local forwarding observable');
has(/"ssh-forward"/, 'remote paste source must be observable');

has(/local\s+function\s+pasteViaClipboard/, 'clipboard paste path must be the primary insertion primitive');
has(/hs\.pasteboard\.setContents\(text\)/, 'clipboard must be populated before cmd+v');
has(/hs\.eventtap\.keyStroke\(\{"cmd"\},\s*"v"/, 'clipboard paste must send cmd+v');
has(/hs\.pasteboard\.setContents\(oldClipboard\)|hs\.pasteboard\.clearContents\(\)/, 'clipboard restore must remain present');
lacks(/AXSelectedText/, 'AXSelectedText insertion is too focus-sensitive for this shortcut');
lacks(/hs\.eventtap\.new/, 'cmd+# must not be captured by a raw event tap');
lacks(/source=eventtap/, 'eventtap logging means the swallowing path returned');

has(/hs\.hotkey\.bind\(\{"cmd"\},\s*"0"/, 'cmd+0 emergency toggle must be bound');
has(/for\s+key,\s*text\s+in\s+pairs\(snippets\)\s+do[\s\S]*hs\.hotkey\.bind\(\{"cmd"\},\s*key/, 'cmd+1..5 must use Hammerspoon hotkey bindings');
has(/deniedBundleIDs/, 'dangerous app denylist must exist');
has(/\["com\.apple\.Terminal"\]\s*=\s*true/, 'Terminal must remain denied');
has(/_G\.igorTextHotkeys/, 'runtime debug API must be exposed');
has(/hotkeys\s*=\s*#hs\.hotkey\.getHotkeys\(\)/, 'status must report registered hotkey count');

console.log('=== mac-text-hotkeys config unit test: PASS ===');
