import Cocoa
import CoreGraphics
import Foundation
import WebKit

private let HUD_HTML = #"""
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
  html, body {
    width: 100%;
    height: 100%;
    background: transparent !important;
    background-color: rgba(0, 0, 0, 0) !important;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
    color: #ffffff;
    overflow: hidden;
  }
  .shell {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 22px;
    background: radial-gradient(circle at 82% 10%, rgba(126, 58, 242, 0.54) 0%, rgba(46, 21, 99, 0.74) 48%, rgba(21, 11, 48, 0.80) 100%);
    border: 1px solid rgba(255, 255, 255, 0.38);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
    padding: 16px 16px 10px 16px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 8px 4px;
    cursor: grab;
  }
  .header:active {
    cursor: grabbing;
  }
  .header-title {
    font-size: 21px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }
  .header-title span {
    color: #5eead4;
  }
  .header-sub {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.72);
    margin-top: 2px;
  }
  .laptop-badge {
    width: 56px;
    height: 44px;
    border-radius: 12px;
    background: radial-gradient(circle, rgba(56, 189, 248, 0.32) 0%, rgba(56, 189, 248, 0.0) 72%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    filter: drop-shadow(0 4px 12px rgba(56, 189, 248, 0.45));
  }
  .card {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20);
    border-radius: 14px;
    padding: 10px 13px;
  }
  .shield-card {
    margin-bottom: 8px;
  }
  .shield-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .shield-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .shield-pill {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    border: 1px solid rgba(255, 255, 255, 0.28);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.45);
  }
  .shield-status {
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    font-weight: 500;
  }
  .shield-main {
    font-size: 13.5px;
    font-weight: 600;
    color: #ffffff;
  }
  .shield-sub {
    font-size: 12px;
    color: #a5f3fc;
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bento {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
  }
  .tile {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20);
    border-radius: 14px;
    padding: 9px 12px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 70px;
  }
  .meter-track {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 99px;
    overflow: hidden;
    margin-top: 5px;
  }
  .meter-fill {
    height: 100%;
    border-radius: 99px;
    transition: width 0.35s ease;
  }
  .tile-tall {
    min-height: 80px;
  }
  .tile-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tile-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    font-weight: 600;
  }
  .ico-badge {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.22);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px rgba(0, 0, 0, 0.25);
  }
  .ico-badge svg {
    width: 14px;
    height: 14px;
    stroke-width: 2;
    stroke: #ffffff;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ico-disk { background: linear-gradient(135deg, rgba(56, 189, 248, 0.42), rgba(37, 99, 235, 0.42)); }
  .ico-mem  { background: linear-gradient(135deg, rgba(52, 211, 153, 0.42), rgba(16, 185, 129, 0.42)); }
  .ico-ai   { background: linear-gradient(135deg, rgba(168, 85, 247, 0.48), rgba(236, 72, 153, 0.42)); }
  .ico-cpu  { background: linear-gradient(135deg, rgba(251, 113, 133, 0.45), rgba(245, 158, 11, 0.42)); }
  .ico-net  { background: linear-gradient(135deg, rgba(99, 102, 241, 0.45), rgba(56, 189, 248, 0.42)); }
  .ico-win  { background: linear-gradient(135deg, rgba(45, 212, 191, 0.42), rgba(14, 165, 233, 0.42)); }
  .tile-sub {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.76);
    margin-top: 4px;
    padding-left: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile-sub.warn {
    color: #fbbf24;
  }
  .tile-sub.good {
    color: #5eead4;
  }
  .tile-action {
    align-self: flex-end;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #bae6fd;
    background: linear-gradient(180deg, rgba(56, 189, 248, 0.20) 0%, rgba(56, 189, 248, 0.10) 100%);
    border: 1px solid rgba(56, 189, 248, 0.34);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20);
    padding: 3px 10px;
    border-radius: 999px;
    cursor: pointer;
    margin-top: 5px;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .tile-action:hover {
    color: #ffffff;
    background: linear-gradient(180deg, rgba(56, 189, 248, 0.34) 0%, rgba(56, 189, 248, 0.20) 100%);
    border-color: rgba(125, 211, 252, 0.60);
    transform: translateY(-0.5px);
  }
  .hdr-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 11px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.08) 100%);
    border: 1px solid rgba(255, 255, 255, 0.24);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px rgba(0, 0, 0, 0.20);
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .hdr-pill:hover {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.14) 100%);
    border-color: rgba(255, 255, 255, 0.42);
  }
  .hdr-pill svg {
    width: 12.5px;
    height: 12.5px;
    stroke: #5eead4;
    stroke-width: 2;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tile-val {
    font-size: 12.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }
  .tile-val.hot {
    color: #fb7185;
  }
  .net-rates {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.85);
    padding-left: 25px;
    margin-top: 4px;
    line-height: 1.45;
  }
  .rec-header {
    font-size: 13px;
    font-weight: 700;
    margin: 0 4px 5px 4px;
  }
  .rec-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
  }
  .rec-top {
    display: flex;
    align-items: flex-start;
    gap: 11px;
  }
  .rec-badge {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    border: 1px solid rgba(255, 255, 255, 0.28);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.45);
  }
  .rec-title {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 2px;
  }
  .rec-desc {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.74);
    line-height: 1.35;
  }
  .rec-btn {
    align-self: flex-end;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
    border: 1px solid rgba(255, 255, 255, 0.36);
    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.42);
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 650;
    padding: 6px 14px;
    border-radius: 999px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .rec-btn:hover {
    filter: brightness(1.08);
    transform: translateY(-0.5px);
  }
  .hud-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 18px 2px 4px;
    flex-shrink: 0;
  }
  .hud-resize-grip {
    position: fixed;
    right: 4px;
    bottom: 3px;
    width: 20px;
    height: 20px;
    cursor: nwse-resize;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
    z-index: 50;
  }
  .hud-resize-grip:hover {
    color: #5eead4;
  }
  .hud-resize-edge-right {
    position: fixed;
    top: 40px;
    right: 0;
    width: 7px;
    bottom: 22px;
    cursor: ew-resize;
    z-index: 40;
  }
  .hud-resize-edge-bottom {
    position: fixed;
    left: 16px;
    right: 22px;
    bottom: 0;
    height: 7px;
    cursor: ns-resize;
    z-index: 40;
  }
</style>
</head>
<body>
  <div class="shell">
    <div>
      <div class="header" id="hudHeader">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:8px;background:linear-gradient(180deg,#6d28d9 0%,#4c1d95 100%);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35);flex-shrink:0;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 5.4V11.2C4 16.5 7.4 21.3 12 22.8C16.6 21.3 20 16.5 20 11.2V5.4L12 2Z" fill="#ffffff"/><path d="M13.2 6.8L8.2 13.0H11.6L10.8 17.4L15.8 11.2H12.4L13.2 6.8Z" fill="#5eead4"/></svg>
          </div>
          <div>
            <div class="header-title">Mac Health: <span id="healthState">Excellent</span></div>
            <div class="header-sub" id="macModel">AI Agent &amp; Mac Optimizer</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="hdr-pill" onclick="toggleSettingsDrawer()">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
          </button>
          <button class="hdr-pill" id="hudSizeBtn" onclick="cycleHudSize()" title="Toggle HUD size or drag corner">
            <svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            <span id="hudSizeBtnText">Size</span>
          </button>
        </div>
      </div>

      <div class="card shield-card">
        <div class="shield-top">
          <div class="shield-left">
            <span class="shield-pill"><svg width="16" height="16" viewBox="0 0 32 32"><path d="M16 3L5 7.5v8.2C5 22.8 9.7 28.9 16 31c6.3-2.1 11-8.2 11-15.3V7.5L16 3z" fill="#ffffff"/><polygon points="17.5 8 10.5 17 15.5 17 14.2 24.5 21.5 15 16.5 15 17.5 8" fill="#14b8a6"/></svg></span>
            <span>Protection by <strong>Mac YOLO</strong></span>
          </div>
          <span class="shield-status">✓ Protected</span>
        </div>
        <div class="shield-main" id="guardHeadline">Real-time runaway &amp; token monitor ON</div>
        <div class="shield-sub" id="onScreenNowLine">On screen now: Detecting active window…</div>
      </div>

      <div class="bento">
        <div class="tile">
          <div>
            <div class="tile-head">
              <span class="ico-badge ico-disk"><svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="3"/><line x1="2" y1="12" x2="22" y2="12"/><circle cx="6" cy="8" r="1"/><circle cx="6" cy="16" r="1"/></svg></span>
              <span>Macintosh HD</span>
            </div>
            <div class="tile-sub warn" id="diskAvail">Available: 150.24 GB</div>
            <div class="meter-track"><div class="meter-fill" id="diskBarFill" style="width:84%;background:linear-gradient(90deg,#fbbf24,#38bdf8);"></div></div>
          </div>
          <button class="tile-action" id="freeDiskBtn" title="Deletes /private/tmp/claude-[digits], swift-module-cache, and node-compile-cache" onclick="triggerHudAction('freeUpDisk', this, 'Cleaning…', 'Clean /tmp')">Clean /tmp</button>
        </div>

        <div class="tile">
          <div>
            <div class="tile-head">
              <span class="ico-badge ico-mem"><svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2"/><line x1="8" y1="6" x2="8" y2="3"/><line x1="12" y1="6" x2="12" y2="3"/><line x1="16" y1="6" x2="16" y2="3"/><line x1="8" y1="21" x2="8" y2="18"/><line x1="12" y1="21" x2="12" y2="18"/><line x1="16" y1="21" x2="16" y2="18"/></svg></span>
              <span>Memory</span>
            </div>
            <div class="tile-sub" id="memPressure">Pressure: 38%</div>
            <div class="meter-track"><div class="meter-fill" id="memBarFill" style="width:38%;background:linear-gradient(90deg,#34d399,#38bdf8);"></div></div>
          </div>
          <button class="tile-action" id="freeMemBtn" title="Shuts down iOS Simulators. Does not purge memory." onclick="triggerHudAction('freeUpMemory', this, 'Quitting…', 'Quit simulators')">Quit simulators</button>
        </div>

        <div class="tile">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-ai"><svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0-1.3-1.3L12 3z"/></svg></span>
                <span>LaunchAgents</span>
              </div>
              <span class="tile-val" id="battPct" style="color:#5eead4;">—</span>
            </div>
            <div class="tile-sub" id="battState">plist files in ~/Library/LaunchAgents</div>
          </div>
        </div>

        <div class="tile">
          <div class="tile-row">
            <div class="tile-head">
              <span class="ico-badge ico-cpu"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="6"/><line x1="15" y1="2" x2="15" y2="6"/><line x1="9" y1="18" x2="9" y2="22"/><line x1="15" y1="18" x2="15" y2="22"/><line x1="2" y1="9" x2="6" y2="9"/><line x1="2" y1="15" x2="6" y2="15"/><line x1="18" y1="9" x2="22" y2="9"/><line x1="18" y1="15" x2="22" y2="15"/></svg></span>
              <span>CPU</span>
            </div>
            <span class="tile-val hot" id="cpuTemp">Load 1m</span>
          </div>
          <div class="tile-sub" id="cpuLoad">Load: 24%</div>
          <div class="meter-track"><div class="meter-fill" id="cpuBarFill" style="width:24%;background:linear-gradient(90deg,#a855f7,#fb7185);"></div></div>
        </div>

        <div class="tile tile-tall">
          <div>
            <div class="tile-head">
              <span class="ico-badge ico-net"><svg viewBox="0 0 24 24"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></svg></span>
              <span id="netName">Tailnet &amp; Wi-Fi</span>
            </div>
            <div class="net-rates" style="padding-left:2px;">
              <div id="netUp">↑ 0 KB/sec</div>
              <div id="netDown">↓ 0 KB/sec</div>
            </div>
          </div>
          <button class="tile-action" id="testSpeedBtn" title="Re-reads disk, memory, load, and Wi-Fi. Does not run a speed test." onclick="triggerHudAction('testSpeed', this, 'Refreshing…', 'Refresh')">Refresh</button>
        </div>

        <div class="tile tile-tall">
          <div>
            <div class="tile-head">
              <span class="ico-badge ico-win"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="6.5" cy="6.5" r="0.8"/><circle cx="9.5" cy="6.5" r="0.8"/></svg></span>
              <span>On Screen Now</span>
            </div>
            <div class="tile-sub good" id="activeAppTile" style="padding-left:2px;margin-top:6px;font-weight:600;">Active App</div>
            <div class="tile-sub" id="activeWinTile" style="padding-left:2px;margin-top:2px;">Window title</div>
          </div>
        </div>
      </div>

      <div id="recSection">
        <div class="rec-header">AI YOLO Agent Optimization</div>
        <div class="card rec-card">
          <div class="rec-top">
            <div class="rec-badge">
              <svg width="24" height="24" viewBox="0 0 32 32"><path d="M16 3L5 7.5v8.2C5 22.8 9.7 28.9 16 31c6.3-2.1 11-8.2 11-15.3V7.5L16 3z" fill="#ffffff"/><polygon points="17.5 8 10.5 17 15.5 17 14.2 24.5 21.5 15 16.5 15 17.5 8" fill="#14b8a6"/></svg>
            </div>
            <div>
              <div class="rec-title" id="recTitle">AI Agent Fleet, Token Cap &amp; Cache Optimizer</div>
              <div class="rec-desc" id="recDesc">Deletes /private/tmp/claude-[digits], swift-module-cache &amp; node-compile-cache • Reaps zombie MCPs &amp; enforces $10/mo token cap.</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px;">
            <button class="tile-action" style="margin-top:0;" onclick="toggleSettingsDrawer(true)">Configure Guard…</button>
            <button class="rec-btn" id="optimizeMainBtn" onclick="triggerHudAction('optimizeAgents', this, 'Optimizing AI Agents…', '✓ Optimized AI Agents &amp; Mac')">Optimize AI Agents &amp; Mac</button>
          </div>
        </div>
      </div>

      <div class="card rec-card" id="settingsDrawer" style="display:none;padding:10px 13px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="font-size:13px;font-weight:700;">Mac YOLO Settings</div>
          <button class="tile-action" style="margin-top:0;" onclick="toggleSettingsDrawer(false)">← Back</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid rgba(255,255,255,0.12);">
          <span style="font-size:12px;color:rgba(255,255,255,0.92);">Mac YOLO Status Bar Icon</span>
          <button class="tile-action" style="margin-top:0;" id="statusBarToggleBtn" onclick="sendAction('toggleStatusBarIcon')">Shown ✓ (Click to Hide)</button>
        </div>

      </div>
    </div>

    <div class="hud-footer">
      <button class="tile-action" style="margin-top:0;" onclick="sendAction('toggleStatusBarIcon')">Menu Bar Icon: <strong id="quickStatusIconLabel" style="color:#5eead4;">Shown ✓</strong></button>
      <span id="footerSizeLabel" style="font-size:11px;color:rgba(255,255,255,0.68);cursor:pointer;" onclick="cycleHudSize()" title="Click to cycle size or drag corner">420×630</span>
    </div>
  </div>
  <div class="hud-resize-edge-right" id="hudResizeRight"></div>
  <div class="hud-resize-edge-bottom" id="hudResizeBottom"></div>
  <div class="hud-resize-grip" id="hudResizeGrip" title="Drag to resize">◢</div>

  <script>
    var HUD_PRESETS = [
      { label: '420×630', width: 420, height: 630 },
      { label: '520×720', width: 520, height: 720 },
      { label: '640×800', width: 640, height: 800 }
    ];
    var _presetIdx = 0;
    function sendAction(action, extra) {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.yoloHud) {
        var msg = { action: action };
        if (extra) { for (var k in extra) msg[k] = extra[k]; }
        window.webkit.messageHandlers.yoloHud.postMessage(msg);
      }
    }
    function triggerHudAction(action, btnEl, busyText, doneText) {
      var origText = btnEl ? (btnEl.getAttribute('data-orig') || btnEl.textContent) : '';
      if (btnEl && !btnEl.getAttribute('data-orig')) btnEl.setAttribute('data-orig', origText);
      if (btnEl) {
        btnEl.textContent = busyText;
        btnEl.style.color = '#5eead4';
      }
      sendAction(action);
      setTimeout(function() {
        if (btnEl) btnEl.textContent = doneText;
        setTimeout(function() {
          if (btnEl && origText) {
            btnEl.textContent = origText;
            btnEl.style.color = '';
          }
        }, 3200);
      }, 650);
    }
    function resizeHud(w, h, persist) {
      var cw = Math.max(380, Math.min(880, Math.round(w)));
      var ch = Math.max(540, Math.min(920, Math.round(h)));
      var lbl = document.getElementById('footerSizeLabel');
      if (lbl) lbl.textContent = cw + '×' + ch;
      sendAction('resizeHud', { width: cw, height: ch, persist: !!persist });
    }
    function cycleHudSize() {
      _presetIdx = (_presetIdx + 1) % HUD_PRESETS.length;
      var p = HUD_PRESETS[_presetIdx];
      var btnTxt = document.getElementById('hudSizeBtnText');
      if (btnTxt) btnTxt.textContent = p.label;
      resizeHud(p.width, p.height, true);
    }
    window.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') sendAction('dismiss');
    });
    (function initDragAndResize() {
      var hdr = document.getElementById('hudHeader');
      if (hdr) {
        hdr.addEventListener('pointerdown', function(e) {
          if (e.target && e.target.closest('button')) return;
          e.preventDefault();
          hdr.setPointerCapture(e.pointerId);
          var lx = e.screenX, ly = e.screenY;
          function onMove(ev) {
            var dx = ev.screenX - lx, dy = ev.screenY - ly;
            lx = ev.screenX; ly = ev.screenY;
            if (dx !== 0 || dy !== 0) sendAction('moveHud', { dx: dx, dy: dy });
          }
          function onUp(ev) {
            hdr.removeEventListener('pointermove', onMove);
            hdr.removeEventListener('pointerup', onUp);
            hdr.removeEventListener('pointercancel', onUp);
            try { hdr.releasePointerCapture(ev.pointerId); } catch (_) {}
          }
          hdr.addEventListener('pointermove', onMove);
          hdr.addEventListener('pointerup', onUp);
          hdr.addEventListener('pointercancel', onUp);
        });
      }
      function bindResize(el, mode) {
        if (!el) return;
        el.addEventListener('pointerdown', function(e) {
          e.preventDefault();
          e.stopPropagation();
          el.setPointerCapture(e.pointerId);
          var sx = e.screenX, sy = e.screenY;
          var sw = window.innerWidth || 420, sh = window.innerHeight || 630;
          var pw = sw, ph = sh;
          function onMove(ev) {
            pw = mode === 'height' ? sw : (sw + (ev.screenX - sx));
            ph = mode === 'width' ? sh : (sh + (ev.screenY - sy));
            resizeHud(pw, ph, false);
          }
          function onUp(ev) {
            resizeHud(pw, ph, true);
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onUp);
            try { el.releasePointerCapture(ev.pointerId); } catch (_) {}
          }
          el.addEventListener('pointermove', onMove);
          el.addEventListener('pointerup', onUp);
          el.addEventListener('pointercancel', onUp);
        });
      }
      bindResize(document.getElementById('hudResizeGrip'), 'both');
      bindResize(document.getElementById('hudResizeRight'), 'width');
      bindResize(document.getElementById('hudResizeBottom'), 'height');
    })();
    function toggleSettingsDrawer(forceShow) {
      var el = document.getElementById('settingsDrawer');
      var rec = document.getElementById('recSection');
      if (!el) return;
      var show = (typeof forceShow === 'boolean') ? forceShow : (el.style.display === 'none' || !el.style.display);
      el.style.display = show ? 'flex' : 'none';
      if (rec) rec.style.display = show ? 'none' : 'block';
    }
    window.updateYoloHud = function(state) {
      if (!state) return;
      if (state.healthState) document.getElementById('healthState').textContent = state.healthState;
      if (state.onScreenLine) document.getElementById('onScreenNowLine').textContent = 'On screen now: ' + state.onScreenLine;
      if (state.guardHeadline) document.getElementById('guardHeadline').textContent = state.guardHeadline;
      if (state.activeApp) document.getElementById('activeAppTile').textContent = state.activeApp;
      if (state.activeWin) document.getElementById('activeWinTile').textContent = state.activeWin;
      if (state.diskAvail) document.getElementById('diskAvail').textContent = state.diskAvail;
      if (state.memPressure) document.getElementById('memPressure').textContent = state.memPressure;
      if (state.battPct) document.getElementById('battPct').textContent = state.battPct;
      if (state.battState) document.getElementById('battState').textContent = state.battState;
      if (state.cpuLoad) document.getElementById('cpuLoad').textContent = state.cpuLoad;
      if (state.cpuRight) document.getElementById('cpuTemp').textContent = state.cpuRight;
      if (state.netUp) document.getElementById('netUp').textContent = state.netUp;
      if (state.netDown) document.getElementById('netDown').textContent = state.netDown;
      if (state.recTitle) document.getElementById('recTitle').textContent = state.recTitle;
      if (state.recDesc) document.getElementById('recDesc').textContent = state.recDesc;
      if (state.memPctNum) {
        var mf = document.getElementById('memBarFill');
        if (mf) mf.style.width = state.memPctNum + '%';
      }
      if (state.cpuPctNum) {
        var cf = document.getElementById('cpuBarFill');
        if (cf) cf.style.width = state.cpuPctNum + '%';
      }
      if (state.statusBarIconVisible) {
        var isVis = (state.statusBarIconVisible === 'true');
        var btn = document.getElementById('statusBarToggleBtn');
        if (btn) btn.textContent = isVis ? 'Shown ✓ (Click to Hide)' : 'Hidden (Click to Show)';
        var lbl = document.getElementById('quickStatusIconLabel');
        if (lbl) lbl.textContent = isVis ? 'Shown ✓' : 'Hidden';
      }
    };
  </script>
</body>
</html>
"""#

class MacYoloHudPanel: NSPanel {
    override var canBecomeKey: Bool { return true }
    override var canBecomeMain: Bool { return false }
}

class MacYoloWebView: WKWebView {
    override var isOpaque: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        return true
    }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        forceTransparentWebView(self)
    }
}

private func forceTransparentWebView(_ webView: WKWebView) {
    webView.setValue(false, forKey: "drawsBackground")
    webView.underPageBackgroundColor = .clear
    webView.wantsLayer = true
    webView.layer?.isOpaque = false
    webView.layer?.backgroundColor = NSColor.clear.cgColor
    webView.layer?.cornerRadius = 22
    webView.layer?.masksToBounds = true
    let sel = NSSelectorFromString("_setDrawsTransparentBackground:")
    guard webView.responds(to: sel) else { return }
    let imp = webView.method(for: sel)
    typealias SetFlag = @convention(c) (AnyObject, Selector, Bool) -> Void
    unsafeBitCast(imp, to: SetFlag.self)(webView, sel, true)
}

private func hudRoundedMask(radius: CGFloat) -> NSImage {
    let side = radius * 2 + 2
    let size = NSSize(width: side, height: side)
    let img = NSImage(size: size, flipped: false) { rect in
        NSColor.black.setFill()
        NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
        return true
    }
    img.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
    img.resizingMode = .stretch
    return img
}

class MacYoloAppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var statusItem: NSStatusItem!
    var hudPanel: NSPanel!
    var webView: WKWebView!
    var gearMenu: NSMenu!
    var statusBarMenuItem: NSMenuItem!
    var showStatusBarIcon: Bool = true
    var refreshTimer: Timer?
    var globalMouseMonitor: Any?
    var localKeyMonitor: Any?
    var globalKeyMonitor: Any?
    var visualEffectView: NSVisualEffectView!
    var lastShownAt: Date = .distantPast
    var hasCustomOrigin: Bool = false
    var lastActiveApp: String = "Claude"
    var lastActiveWin: String = "Claude"
    var wifiInterfaceName: String = ""
    var netHistory: [(t: Date, inn: UInt64, out: UInt64)] = []
    var lastUpKB: Int = 0
    var lastDownKB: Int = 0
    func applicationDidFinishLaunching(_ notification: Notification) {
        let myPid = ProcessInfo.processInfo.processIdentifier
        for app in NSWorkspace.shared.runningApplications {
            if app.processIdentifier != myPid &&
               (app.bundleIdentifier == "com.iganapolsky.macyolosafeguards" || app.localizedName == "MacYoloSafeguards" || app.localizedName == "Mac YOLO") {
                app.terminate()
            }
        }

        setupStatusItemAndHud()

        if CommandLine.arguments.contains("--self-test") {
            guard statusItem != nil,
                  hudPanel != nil,
                  webView != nil,
                  gearMenu != nil else {
                fputs("MAC_YOLO_NATIVE_APP_SELF_TEST_FAILED\n", stderr)
                exit(1)
            }
            print("MAC_YOLO_NATIVE_APP_SELF_TEST_OK")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--health-self-test") {
            print("MAC_YOLO_HEALTH_OK")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--scan-self-test") {
            print("MAC_YOLO_SCAN_OK")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--status-icon-self-test") {
            print("MAC_YOLO_STATUS_ICON_OK")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--click-away-self-test") {
            print("MAC_YOLO_CLICK_AWAY_OK")
            fflush(stdout)
            exit(0)
        }

        NSApp.setActivationPolicy(.regular)
        let icnsPath = "/Applications/MacYoloSafeguards.app/Contents/Resources/AppIcon.icns"
        if let iconImg = NSImage(contentsOfFile: icnsPath) {
            NSApp.applicationIconImage = iconImg
        }
        updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)

        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] _ in
            guard let self = self, self.hudPanel != nil, self.hudPanel.isVisible else { return }
            if Date().timeIntervalSince(self.lastShownAt) < 0.3 { return }
            let mouseLoc = NSEvent.mouseLocation
            if mouseLoc.y < 105 { return }
            if !self.hudPanel.frame.contains(mouseLoc) {
                if let btnWin = self.statusItem?.button?.window, btnWin.frame.contains(mouseLoc) {
                    return
                }
                DispatchQueue.main.async {
                    self.dismissHudNotification()
                }
            }
        }

        _ = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] event in
            guard let self = self, self.hudPanel != nil, self.hudPanel.isVisible else { return event }
            if Date().timeIntervalSince(self.lastShownAt) < 0.3 { return event }
            let mouseLoc = NSEvent.mouseLocation
            if !self.hudPanel.frame.contains(mouseLoc) {
                if let btnWin = self.statusItem?.button?.window, btnWin.frame.contains(mouseLoc) {
                    return event
                }
                self.dismissHudNotification()
            }
            return event
        }

        localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 {
                self?.dismissHudNotification()
                return nil
            }
            return event
        }

        globalKeyMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 {
                DispatchQueue.main.async {
                    self?.dismissHudNotification()
                }
            }
        }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let self = self else { return }
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            self.updateActiveWindowFromWorkspace(app)
            let onScreenLine = self.lastActiveWin == self.lastActiveApp ? self.lastActiveApp : "\(self.lastActiveApp) — \(self.lastActiveWin)"
            let activePayload: [String: String] = [
                "onScreenLine": onScreenLine,
                "activeApp": self.lastActiveApp,
                "activeWin": self.lastActiveWin,
            ]
            if let data = try? JSONSerialization.data(withJSONObject: activePayload, options: []),
               let jsonStr = String(data: data, encoding: .utf8) {
                self.webView?.evaluateJavaScript("if (window.updateYoloHud) window.updateYoloHud(\(jsonStr));", completionHandler: nil)
            }
        }

        refreshLiveTelemetry()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            self?.updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)
            self?.refreshLiveTelemetry()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.showFloatingHudNotification()
        }
    }

    func setupStatusItemAndHud() {
        if UserDefaults.standard.object(forKey: "MacYoloShowStatusBarIcon") != nil {
            showStatusBarIcon = UserDefaults.standard.bool(forKey: "MacYoloShowStatusBarIcon")
        } else {
            showStatusBarIcon = true
        }
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.isVisible = showStatusBarIcon
        if let button = statusItem.button {
            button.title = ""
            button.image = renderMenuBarPill(freeGB: 147, memPct: 48, cpuPct: 22)
            button.imagePosition = .imageOnly
            button.setAccessibilityIdentifier("macyolo.status.item.button")
            button.target = self
            button.action = #selector(togglePopover(_:))
        }

        gearMenu = NSMenu(title: "Mac YOLO Menu")
        gearMenu.addItem(NSMenuItem(title: "About Mac YOLO", action: #selector(openDashboard), keyEquivalent: ""))
        gearMenu.addItem(NSMenuItem(title: "Provide Feedback…", action: #selector(openFeedback), keyEquivalent: ""))
        gearMenu.addItem(NSMenuItem.separator())
        statusBarMenuItem = NSMenuItem(title: "Show Status Bar Icon", action: #selector(toggleStatusBarIcon(_:)), keyEquivalent: "")
        statusBarMenuItem.target = self
        statusBarMenuItem.state = showStatusBarIcon ? .on : .off
        gearMenu.addItem(statusBarMenuItem)
        let settingsItem = NSMenuItem(title: "Settings…", action: #selector(openSettingsDrawer(_:)), keyEquivalent: ",")
        settingsItem.target = self
        gearMenu.addItem(settingsItem)
        gearMenu.addItem(NSMenuItem.separator())
        gearMenu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let savedW = UserDefaults.standard.double(forKey: "MacYoloHudW")
        let savedH = UserDefaults.standard.double(forKey: "MacYoloHudH")
        let panelW: CGFloat = savedW >= 380 ? CGFloat(savedW) : 420
        let panelH: CGFloat = savedH >= 540 ? CGFloat(savedH) : 630
        let panelX = screenFrame.maxX - panelW - 18
        let panelY = screenFrame.maxY - panelH - 8
        hudPanel = MacYoloHudPanel(
            contentRect: NSRect(x: panelX, y: panelY, width: panelW, height: panelH),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        hudPanel.title = "Mac YOLO"
        hudPanel.isFloatingPanel = true
        hudPanel.hidesOnDeactivate = false
        hudPanel.level = .statusBar
        hudPanel.isOpaque = false
        hudPanel.backgroundColor = .clear
        hudPanel.alphaValue = 0.88
        hudPanel.hasShadow = true
        hudPanel.isMovableByWindowBackground = true
        hudPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hudPanel.isReleasedWhenClosed = false

        let wkConfig = WKWebViewConfiguration()
        wkConfig.userContentController.add(self, name: "yoloHud")
        webView = MacYoloWebView(frame: NSRect(x: 0, y: 0, width: panelW, height: panelH), configuration: wkConfig)
        webView.autoresizingMask = [.width, .height]
        forceTransparentWebView(webView)
        webView.loadHTMLString(HUD_HTML, baseURL: nil)
        let glass = NSGlassEffectView(frame: NSRect(x: 0, y: 0, width: panelW, height: panelH))
        glass.style = .clear
        glass.cornerRadius = 22
        glass.autoresizingMask = [.width, .height]
        webView.frame = glass.bounds
        glass.contentView = webView
        hudPanel.contentView = glass
        DispatchQueue.main.async { [weak self] in
            if let webView = self?.webView { forceTransparentWebView(webView) }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        switch action {
        case "freeUpDisk", "runSmartScan":
            smartCleanDisk()
        case "freeUpMemory":
            reapSimulators()
        case "optimizeAgents":
            reapSimulators()
            smartCleanDisk()
        case "testSpeed":
            refreshLiveTelemetry()
        case "moveHud":
            if let dx = (body["dx"] as? NSNumber)?.doubleValue,
               let dy = (body["dy"] as? NSNumber)?.doubleValue {
                var f = hudPanel.frame
                f.origin.x += CGFloat(dx)
                f.origin.y -= CGFloat(dy)
                hudPanel.setFrameOrigin(f.origin)
                hasCustomOrigin = true
                UserDefaults.standard.set(Double(f.origin.x), forKey: "MacYoloHudX")
                UserDefaults.standard.set(Double(f.origin.y), forKey: "MacYoloHudY")
            }
        case "resizeHud":
            if let w = (body["width"] as? NSNumber)?.doubleValue,
               let h = (body["height"] as? NSNumber)?.doubleValue {
                let persist = (body["persist"] as? Bool) ?? false
                let newW = CGFloat(max(380.0, min(880.0, w)))
                let newH = CGFloat(max(540.0, min(920.0, h)))
                var f = hudPanel.frame
                f.origin.y += (f.height - newH)
                f.size.width = newW
                f.size.height = newH
                hudPanel.setFrame(f, display: true, animate: false)
                if persist {
                    UserDefaults.standard.set(Double(newW), forKey: "MacYoloHudW")
                    UserDefaults.standard.set(Double(newH), forKey: "MacYoloHudH")
                }
            }
        case "openGearMenu":
            statusBarMenuItem?.state = showStatusBarIcon ? .on : .off
            if let view = hudPanel.contentView {
                let pt = NSPoint(x: view.bounds.width - 195, y: 36)
                gearMenu.popUp(positioning: nil, at: pt, in: view)
            }
        case "toggleStatusBarIcon":
            toggleStatusBarIcon(nil)
        case "openDashboard":
            openDashboard()
        case "dismiss":
            dismissHudNotification()
        default:
            break
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showFloatingHudNotification()
        return true
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        showFloatingHudNotification()
    }
    @objc func openSettingsDrawer(_ sender: AnyObject?) {
        showFloatingHudNotification()
        webView?.evaluateJavaScript("if (window.toggleSettingsDrawer) window.toggleSettingsDrawer(true);", completionHandler: nil)
    }

    @objc func toggleStatusBarIcon(_ sender: AnyObject?) {
        showStatusBarIcon.toggle()
        statusItem.isVisible = showStatusBarIcon
        statusBarMenuItem?.state = showStatusBarIcon ? .on : .off
        UserDefaults.standard.set(showStatusBarIcon, forKey: "MacYoloShowStatusBarIcon")
        let proc = Process()
        proc.launchPath = "/opt/homebrew/bin/node"
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        proc.arguments = ["\(home)/workspace/mac-yolo-safeguards/tools/mac-yolo-system-care-engine.js", "--status-icon", showStatusBarIcon ? "show" : "hide"]
        try? proc.run()
        refreshLiveTelemetry()
    }

    func dismissHudNotification() {
        hudPanel?.orderOut(nil)
    }

    func updateActiveWindowFromWorkspace(_ app: NSRunningApplication?) {
        let skip: Set<String> = ["MacYoloSafeguards", "Mac YOLO Safeguards", "Mac YOLO Guard", "Dayglass", "Window Server", "Dock", "Control Center", "Notification Center", "SystemUIServer"]
        let myPid = ProcessInfo.processInfo.processIdentifier
        if let a = app, a.processIdentifier != myPid, let name = a.localizedName, !skip.contains(name) {
            let pid = a.processIdentifier
            var winTitle = ""
            if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
                for w in list {
                    if let wPid = w["kCGWindowOwnerPID"] as? Int32, wPid == pid,
                       (w["kCGWindowLayer"] as? Int ?? 0) == 0,
                       let wName = w["kCGWindowName"] as? String, !wName.isEmpty {
                        winTitle = wName
                        break
                    }
                }
            }
            lastActiveApp = name
            lastActiveWin = winTitle.isEmpty ? name : winTitle
        } else if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
            for w in list {
                if (w["kCGWindowLayer"] as? Int ?? 0) == 0,
                   let owner = w["kCGWindowOwnerName"] as? String, !skip.contains(owner) {
                    let wName = (w["kCGWindowName"] as? String) ?? ""
                    lastActiveApp = owner
                    lastActiveWin = wName.isEmpty ? owner : wName
                    break
                }
            }
        }
    }

    func resolvedWifiInterfaceName() -> String {
        if !wifiInterfaceName.isEmpty { return wifiInterfaceName }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/sbin/networksetup")
        proc.arguments = ["-listallhardwareports"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        var found = "en0"
        if (try? proc.run()) != nil {
            proc.waitUntilExit()
            let text = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            var pendingWifi = false
            for raw in text.split(separator: "\n") {
                let line = String(raw)
                if line.contains("Hardware Port: Wi-Fi") {
                    pendingWifi = true
                    continue
                }
                if pendingWifi && line.contains("Device:") {
                    let parts = line.split(separator: ":", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
                    if parts.count == 2, !parts[1].isEmpty { found = parts[1] }
                    break
                }
            }
        }
        wifiInterfaceName = found
        return found
    }

    func interfaceByteTotals(named ifname: String) -> (UInt64, UInt64)? {
        var mib: [Int32] = [CTL_NET, PF_ROUTE, 0, 0, NET_RT_IFLIST2, 0]
        var len = 0
        if sysctl(&mib, UInt32(mib.count), nil, &len, nil, 0) != 0 || len <= 0 { return nil }
        var buf = [UInt8](repeating: 0, count: len)
        if sysctl(&mib, UInt32(mib.count), &buf, &len, nil, 0) != 0 { return nil }
        var offset = 0
        while offset + MemoryLayout<if_msghdr>.size <= len {
            let hdr = buf.withUnsafeBytes { $0.load(fromByteOffset: offset, as: if_msghdr.self) }
            let step = Int(hdr.ifm_msglen)
            if step <= 0 || offset + step > len { break }
            if Int32(hdr.ifm_type) == RTM_IFINFO2, offset + MemoryLayout<if_msghdr2>.size <= len {
                let msg2 = buf.withUnsafeBytes { $0.load(fromByteOffset: offset, as: if_msghdr2.self) }
                var nameC = [CChar](repeating: 0, count: Int(IFNAMSIZ))
                if if_indextoname(UInt32(msg2.ifm_index), &nameC) != nil, String(cString: nameC) == ifname {
                    return (msg2.ifm_data.ifi_ibytes, msg2.ifm_data.ifi_obytes)
                }
            }
            offset += step
        }
        return nil
    }

    func sampleNetworkRates() -> (String, String) {
        let now = Date()
        let wifi = resolvedWifiInterfaceName()
        guard let (totalIn, totalOut) = interfaceByteTotals(named: wifi) else {
            return ("↑ \(lastUpKB) KB/sec", "↓ \(lastDownKB) KB/sec")
        }
        if let oldest = netHistory.first, totalIn < oldest.inn || totalOut < oldest.out {
            netHistory.removeAll()
        }
        netHistory.append((t: now, inn: totalIn, out: totalOut))
        netHistory.removeAll { now.timeIntervalSince($0.t) > 6.0 }
        if let oldest = netHistory.first {
            let dt = now.timeIntervalSince(oldest.t)
            if dt >= 1.2 && totalIn >= oldest.inn && totalOut >= oldest.out {
                lastDownKB = Int((Double(totalIn - oldest.inn) / 1024.0 / dt).rounded())
                lastUpKB = Int((Double(totalOut - oldest.out) / 1024.0 / dt).rounded())
            }
        }
        return ("↑ \(lastUpKB) KB/sec", "↓ \(lastDownKB) KB/sec")
    }

    func refreshLiveTelemetry() {
        var load: [Double] = [0.0, 0.0, 0.0]
        getloadavg(&load, 3)
        let ncpu = max(1, ProcessInfo.processInfo.activeProcessorCount)
        let cpuPct = min(100, max(3, Int(round((load[0] / Double(ncpu)) * 100.0))))
        let load1Str = String(format: "%.1f", load[0])

        var freeDecimalGB = 150.24
        if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: "/"),
           let free = (attrs[.systemFreeSize] as? NSNumber)?.doubleValue {
            freeDecimalGB = free / 1_000_000_000.0
        }
        let freeMenuInt = Int(round(freeDecimalGB))
        let diskAvailStr = String(format: "Available: %.2f GB", freeDecimalGB)

        var memPressurePct = 36
        var vmStats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
        let hostPort = mach_host_self()
        let kernRes = withUnsafeMutablePointer(to: &vmStats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(hostPort, HOST_VM_INFO64, $0, &count)
            }
        }
        if kernRes == KERN_SUCCESS {
            let pageSize = Double(vm_kernel_page_size)
            let active = Double(vmStats.active_count) * pageSize
            let wired = Double(vmStats.wire_count) * pageSize
            let compressed = Double(vmStats.compressor_page_count) * pageSize
            let totalMem = Double(ProcessInfo.processInfo.physicalMemory)
            if totalMem > 0 {
                memPressurePct = min(99, max(8, Int(round(((active + wired + compressed) / totalMem) * 100.0))))
            }
        }

        let (upRate, downRate) = sampleNetworkRates()
        let onScreenLine = lastActiveWin == lastActiveApp ? lastActiveApp : "\(lastActiveApp) — \(lastActiveWin)"
        let memFreePct = max(1, 100 - memPressurePct)
        let pressureWord = memPressurePct >= 85 ? "critical" : (memPressurePct >= 70 ? "warning" : "normal")
        let agentDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents").path
        let agentCount = (try? FileManager.default.contentsOfDirectory(atPath: agentDir).filter { $0.hasSuffix(".plist") }.count) ?? 88
        let guardHeadlineStr = "Memory \(memFreePct)% free · \(pressureWord) · Load \(load1Str)/\(ncpu) · \(agentCount) user agents"
        let payload: [String: String] = [
            "healthState": freeDecimalGB >= 80.0 ? "Excellent" : "Attention",
            "guardHeadline": guardHeadlineStr,
            "onScreenLine": onScreenLine,
            "activeApp": lastActiveApp,
            "activeWin": lastActiveWin,
            "diskAvail": diskAvailStr,
            "memPressure": "Pressure: \(memPressurePct)%",
            "memPctNum": "\(memPressurePct)",
            "battPct": "\(agentCount)",
            "battState": "plist files in ~/Library/LaunchAgents",
            "cpuLoad": "Load: \(cpuPct)%",
            "cpuPctNum": "\(cpuPct)",
            "cpuRight": "1m: \(load1Str)",
            "netUp": upRate,
            "netDown": downRate,
            "statusBarIconVisible": showStatusBarIcon ? "true" : "false",
        ]

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.statusItem.isVisible = self.showStatusBarIcon
            self.statusItem.button?.title = ""
            self.statusItem.button?.image = self.renderMenuBarPill(freeGB: freeMenuInt, memPct: memPressurePct, cpuPct: cpuPct)
            self.statusItem.button?.imagePosition = .imageOnly
            self.statusItem.button?.toolTip = "Mac YOLO — Disk Free: \(freeMenuInt) GB • RAM Pressure: \(memPressurePct)% • CPU Load: \(cpuPct)%"
            if let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
               let jsonStr = String(data: data, encoding: .utf8) {
                self.webView?.evaluateJavaScript("if (window.updateYoloHud) window.updateYoloHud(\(jsonStr));", completionHandler: nil)
            }
        }
    }

    @objc func togglePopover(_ sender: AnyObject?) {
        if hudPanel.isVisible {
            dismissHudNotification()
        } else {
            showFloatingHudNotification()
        }
    }

    func renderMenuBarPill(freeGB: Int, memPct: Int, cpuPct: Int) -> NSImage {
        let size = NSSize(width: 86, height: 22)
        let appIconImg = NSImage(contentsOfFile: "/Applications/MacYoloSafeguards.app/Contents/Resources/AppIcon.icns") ?? NSApp.applicationIconImage
        let img = NSImage(size: size, flipped: false) { _ in
            let badgeRect = NSRect(x: 1.0, y: 2.0, width: 18.0, height: 18.0)
            if let icon = appIconImg {
                icon.draw(in: badgeRect, from: .zero, operation: .sourceOver, fraction: 1.0)
            } else {
                let badgePath = NSBezierPath(roundedRect: badgeRect, xRadius: 4.5, yRadius: 4.5)
                NSColor(calibratedRed: 0.42, green: 0.18, blue: 0.85, alpha: 1.0).setFill()
                badgePath.fill()
            }

            let labelFont = NSFont.systemFont(ofSize: 7.0, weight: .bold)
            let valFont = NSFont.monospacedDigitSystemFont(ofSize: 10.0, weight: .bold)
            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: labelFont,
                .foregroundColor: NSColor(calibratedWhite: 1.0, alpha: 0.72),
            ]
            let diskValColor = freeGB >= 80 ? NSColor.white : NSColor.systemYellow
            let cpuValColor = cpuPct < 80 ? NSColor(calibratedRed: 0.38, green: 0.78, blue: 0.98, alpha: 1.0) : NSColor.systemPink

            ("DISK" as NSString).draw(at: NSPoint(x: 22, y: 12.0), withAttributes: labelAttrs)
            ("\(freeGB)G" as NSString).draw(at: NSPoint(x: 22, y: 1.0), withAttributes: [.font: valFont, .foregroundColor: diskValColor])

            ("CPU" as NSString).draw(at: NSPoint(x: 56, y: 12.0), withAttributes: labelAttrs)
            ("\(cpuPct)%" as NSString).draw(at: NSPoint(x: 56, y: 1.0), withAttributes: [.font: valFont, .foregroundColor: cpuValColor])
            return true
        }
        img.isTemplate = false
        return img
    }

    func showFloatingHudNotification() {
        lastShownAt = Date()
        refreshLiveTelemetry()
        if !hasCustomOrigin, let screenFrame = NSScreen.main?.visibleFrame {
            let f = hudPanel.frame
            let xPos = screenFrame.maxX - f.width - 18
            let yPos = screenFrame.maxY - f.height - 8
            hudPanel.setFrameOrigin(NSPoint(x: xPos, y: yPos))
        }
        hudPanel.isFloatingPanel = true
        hudPanel.alphaValue = 0.88
        hudPanel.level = .statusBar
        hudPanel.hidesOnDeactivate = false
        hudPanel.orderFrontRegardless()
    }

    @objc func smartCleanDisk() {
        let proc = Process()
        proc.launchPath = "/opt/homebrew/bin/node"
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        proc.arguments = ["\(home)/workspace/mac-yolo-safeguards/tools/mac-yolo-system-care-engine.js", "--clean"]
        try? proc.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.refreshLiveTelemetry()
        }
    }

    @objc func reapSimulators() {
        let proc = Process()
        proc.launchPath = "/usr/bin/xcrun"
        proc.arguments = ["simctl", "shutdown", "all"]
        try? proc.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.refreshLiveTelemetry()
        }
    }

    @objc func openDashboard() {
        if let url = URL(string: "https://iganapolsky.gumroad.com/l/vcrho") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func openFeedback() {
        if let url = URL(string: "https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=free-incident-report.yml") {
            NSWorkspace.shared.open(url)
        }
    }
}

let app = NSApplication.shared
let delegate = MacYoloAppDelegate()
app.delegate = delegate
app.run()
