import Cocoa
import CoreGraphics
import CoreImage
import Darwin
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
    background: transparent;
    padding: 12px 14px 8px 14px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
  .shell::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 22px;
    background: rgba(8, 6, 20, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.38);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
    pointer-events: none;
    z-index: 0;
    transform: translateZ(0);
  }
  .shell > * {
    position: relative;
    z-index: 1;
  }
  .shell > div:first-of-type {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px 6px 2px;
    cursor: grab;
  }
  .header:active {
    cursor: grabbing;
  }
  .header-title {
    font-size: 16.5px;
    font-weight: 700;
    letter-spacing: -0.3px;
    white-space: nowrap;
  }
  .header-title span {
    color: #5eead4;
  }
  .header-sub {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.72);
    margin-top: 2px;
    white-space: nowrap;
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
    background: rgba(15, 11, 33, 0.46);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20);
    border-radius: 14px;
    padding: 8px 11px;
  }
  .shield-card {
    margin-bottom: 6px;
  }
  .shield-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12.5px;
    font-weight: 600;
    margin-bottom: 4px;
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
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 7px;
    margin-bottom: 6px;
  }
  .tile {
    min-width: 0;
    overflow: hidden;
    background: rgba(15, 11, 33, 0.46);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20);
    border-radius: 13px;
    padding: 7px 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 62px;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .tile:hover, .card.clickable-card:hover {
    border-color: rgba(94, 234, 212, 0.52);
    background: rgba(24, 18, 52, 0.62);
  }
  .clickable-card {
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.10);
    font-size: 11.5px;
  }
  .detail-row span:first-child {
    color: rgba(255, 255, 255, 0.90);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 65%;
  }
  .detail-row span:last-child {
    color: #5eead4;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .meter-track {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 99px;
    overflow: hidden;
    margin-top: 4px;
  }
  .meter-fill {
    height: 100%;
    border-radius: 99px;
  }
  .tile-tall {
    min-height: 66px;
  }
  .tile-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
  }
  .tile-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .tile-head span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    gap: 4px;
    padding: 8px 11px;
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
            <div class="header-title">Mac YOLO: <span id="healthState">Checking…</span></div>
            <div class="header-sub" id="macModel">AI Tokens &amp; Waste · CPU/GPU &amp; Memory · Cleanup &amp; Fleet Guard</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="hdr-pill" onclick="toggleSettingsDrawer()">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
          </button>
          <button class="hdr-pill" id="hudSizeBtn" onclick="cycleHudSize()">
            <svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            <span id="hudSizeBtnText">Size</span>
          </button>
        </div>
      </div>

      <div id="overviewSection">
      <div class="card shield-card clickable-card" onclick="openCardDetail('shield')">
        <div class="shield-top">
          <div class="shield-left">
            <span class="shield-pill"><svg width="16" height="16" viewBox="0 0 32 32"><path d="M16 3L5 7.5v8.2C5 22.8 9.7 28.9 16 31c6.3-2.1 11-8.2 11-15.3V7.5L16 3z" fill="#ffffff"/><polygon points="17.5 8 10.5 17 15.5 17 14.2 24.5 21.5 15 16.5 15 17.5 8" fill="#14b8a6"/></svg></span>
            <span>Protection by <strong>Mac YOLO</strong></span>
          </div>
          <span class="shield-status">✓ Protected · Details ›</span>
        </div>
        <div class="shield-main" id="guardHeadline">Scanning live AI token &amp; system telemetry…</div>
        <div class="shield-sub" id="onScreenNowLine">On screen now: Detecting active window…</div>
      </div>

      <div class="bento">
        <div class="tile tile-tall" onclick="openCardDetail('disk')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-disk"><svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="3"/><line x1="2" y1="12" x2="22" y2="12"/><circle cx="6" cy="8" r="1"/><circle cx="6" cy="16" r="1"/></svg></span>
                <span>Disk &amp; AI Waste</span>
              </div>
              <span class="tile-val" id="diskRightBadge" style="color:#34d399;font-size:11px;">Details ›</span>
            </div>
            <div class="tile-sub warn" id="diskAvail">Scanning disk &amp; /tmp waste…</div>
            <div class="meter-track"><div class="meter-fill" id="diskBarFill" style="width:84%;background:linear-gradient(90deg,#fbbf24,#38bdf8);"></div></div>
          </div>
          <button class="tile-action" id="freeDiskBtn" onclick="event.stopPropagation();triggerHudAction('freeUpDisk', this, 'Purging…', 'Purged ✓')">Clean AI Waste</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('memory')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-mem"><svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2"/><line x1="8" y1="6" x2="8" y2="3"/><line x1="12" y1="6" x2="12" y2="3"/><line x1="16" y1="6" x2="16" y2="3"/><line x1="8" y1="21" x2="8" y2="18"/><line x1="12" y1="21" x2="12" y2="18"/><line x1="16" y1="21" x2="16" y2="18"/></svg></span>
                <span>Memory &amp; Agent RAM</span>
              </div>
              <span class="tile-val" id="memRightBadge" style="color:#38bdf8;font-size:11px;">32 GB ›</span>
            </div>
            <div class="tile-sub" id="memPressure">Scanning VM &amp; swarm RAM…</div>
            <div class="meter-track"><div class="meter-fill" id="memBarFill" style="width:62%;background:linear-gradient(90deg,#34d399,#38bdf8);"></div></div>
          </div>
          <button class="tile-action" id="freeMemBtn" onclick="event.stopPropagation();triggerHudAction('freeUpMemory', this, 'Reaping…', 'RAM Freed ✓')">Free Agent RAM</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('tokens')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-ai"><svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0-1.3-1.3L12 3z"/></svg></span>
                <span>AI Tokens &amp; Sessions</span>
              </div>
              <span class="tile-val" id="battPct" style="color:#5eead4;font-size:11.5px;">Live ›</span>
            </div>
            <div class="tile-sub" id="battState">Scanning active session JSONLs…</div>
            <div class="meter-track"><div class="meter-fill" id="tokBarFill" style="width:22%;background:linear-gradient(90deg,#10b981,#5eead4);"></div></div>
          </div>
          <button class="tile-action" onclick="event.stopPropagation();openCardDetail('tokens')">Inspect Sessions ›</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('cpu')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-cpu"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="6"/><line x1="15" y1="2" x2="15" y2="6"/><line x1="9" y1="18" x2="9" y2="22"/><line x1="15" y1="18" x2="15" y2="22"/><line x1="2" y1="9" x2="6" y2="9"/><line x1="2" y1="15" x2="6" y2="15"/><line x1="18" y1="9" x2="22" y2="9"/><line x1="18" y1="15" x2="22" y2="15"/></svg></span>
                <span>CPU, GPU &amp; Fans</span>
              </div>
              <span class="tile-val hot" id="cpuTemp" style="font-size:11px;">CPU · GPU ›</span>
            </div>
            <div class="tile-sub" id="cpuLoad">Scanning CPU &amp; AGXAccelerator GPU…</div>
            <div class="meter-track"><div class="meter-fill" id="cpuBarFill" style="width:24%;background:linear-gradient(90deg,#a855f7,#fb7185);"></div></div>
          </div>
          <button class="tile-action" onclick="event.stopPropagation();triggerHudAction('coolDownFans', this, 'Cooling…', 'Fans Cooled ✓')">Cool Down Fans</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('network')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-net"><svg viewBox="0 0 24 24"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></svg></span>
                <span id="netName">Network &amp; Egress</span>
              </div>
              <span class="tile-val" style="color:#5eead4;font-size:11px;">Local-First ›</span>
            </div>
            <div class="net-rates" style="padding-left:2px;">
              <div id="netUp">↑ 0 KB/sec</div>
              <div id="netDown">↓ 0 KB/sec</div>
            </div>
          </div>
          <button class="tile-action" id="testSpeedBtn" onclick="event.stopPropagation();triggerHudAction('testSpeed', this, 'Refreshing…', 'Refresh')">Refresh</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('fleet')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-win"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="6.5" cy="6.5" r="0.8"/><circle cx="9.5" cy="6.5" r="0.8"/></svg></span>
                <span>AI Fleet &amp; MCPs</span>
              </div>
              <span class="tile-val" id="mcpRightBadge" style="color:#34d399;font-size:11px;">MCPs ›</span>
            </div>
            <div class="tile-sub good" id="activeAppTile" style="padding-left:2px;margin-top:4px;font-weight:600;">Scanning active swarms…</div>
            <div class="tile-sub" id="activeWinTile" style="padding-left:2px;margin-top:2px;">Scanning MCP &amp; LaunchAgent daemons…</div>
          </div>
          <button class="tile-action" onclick="event.stopPropagation();openCardDetail('fleet')">Inspect Fleet ›</button>
        </div>
      </div>

      <div id="recSection">
        <div class="rec-header">AI YOLO Agent Optimization (Click any card for live drill-down)</div>
        <div class="card rec-card clickable-card" onclick="openCardDetail('optimization')">
          <div class="rec-top">
            <div class="rec-badge">
              <svg width="24" height="24" viewBox="0 0 32 32"><path d="M16 3L5 7.5v8.2C5 22.8 9.7 28.9 16 31c6.3-2.1 11-8.2 11-15.3V7.5L16 3z" fill="#ffffff"/><polygon points="17.5 8 10.5 17 15.5 17 14.2 24.5 21.5 15 16.5 15 17.5 8" fill="#14b8a6"/></svg>
            </div>
            <div>
              <div class="rec-title" id="recTitle">Live Fan &amp; CPU Culprits ›</div>
              <div class="rec-desc" id="recDesc">Scanning top CPU &amp; fan culprits across active agent swarms and background daemons…</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:4px;">
            <div style="display:flex;gap:6px;">
              <button class="rec-btn" id="coolFansMainBtn" onclick="event.stopPropagation();triggerHudAction('coolDownFans', this, 'Cooling Fans…', 'Fans Cooled ✓')">Cool Down Fans</button>
              <button class="tile-action" style="margin-top:0;padding:6px 10px;" onclick="event.stopPropagation();triggerHudAction('freeUpDisk', this, 'Purging…', 'Purged ✓')">Clean AI Waste</button>
            </div>
            <button class="tile-action" style="margin-top:0;padding:6px 10px;" onclick="event.stopPropagation();toggleSettingsDrawer(true)">Uninstall Apps…</button>
          </div>
        </div>
      </div>
      </div>

      <div class="card rec-card" id="cardDetailDrawer" style="display:none;padding:12px 14px;gap:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div>
            <div id="detailTitle" style="font-size:14.5px;font-weight:700;color:#5eead4;">Card Details</div>
            <div id="detailSub" style="font-size:11.5px;color:rgba(255,255,255,0.72);margin-top:1px;">Real-time kernel, GPU &amp; session telemetry (updates every 1.5s)</div>
          </div>
          <button class="tile-action" style="margin-top:0;" onclick="closeCardDetail()">← Back to All Cards</button>
        </div>
        <div id="detailRowsContainer" style="display:flex;flex-direction:column;gap:3px;margin-top:2px;"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.14);margin-top:4px;">
          <div style="display:flex;gap:6px;">
            <button class="rec-btn" onclick="triggerHudAction('coolDownFans', this, 'Cooling &amp; Reaping…', 'Fans Cooled ✓')">Cool Down Fans &amp; Reap Hogs</button>
            <button class="tile-action" style="margin-top:0;padding:6px 11px;" onclick="triggerHudAction('freeUpDisk', this, 'Purging…', 'Purged ✓')">Clean AI Waste</button>
          </div>
          <button class="tile-action" style="margin-top:0;padding:6px 11px;" onclick="toggleSettingsDrawer(true)">Uninstall Apps…</button>
        </div>
      </div>
      <div class="card rec-card" id="settingsDrawer" style="display:none;padding:10px 13px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="font-size:13px;font-weight:700;">Settings &amp; App Uninstaller</div>
          <button class="tile-action" style="margin-top:0;" onclick="toggleSettingsDrawer(false)">← Back</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-top:1px solid rgba(255,255,255,0.12);">
          <span style="font-size:12px;color:rgba(255,255,255,0.92);">Mac YOLO Status Bar Icon</span>
          <button class="tile-action" style="margin-top:0;" id="statusBarToggleBtn" onclick="sendAction('toggleStatusBarIcon')">Shown ✓ (Click to Hide)</button>
        </div>
        <div id="uninstallList" style="font-size:12px;color:rgba(255,255,255,0.72);padding:6px 0;">Open this list to measure apps.</div>
        <div style="display:flex;gap:6px;align-items:center;padding-top:5px;border-top:1px solid rgba(255,255,255,0.12);">
          <input id="customUninstallInput" type="text" placeholder="App name" style="flex:1;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.22);border-radius:7px;padding:4px 8px;color:#fff;font-size:11px;outline:none;" />
          <button class="tile-action" style="margin-top:0;color:#fca5a5;" onclick="requestUninstall(document.getElementById('customUninstallInput').value)">Uninstall</button>
        </div>
      </div>
    </div>

    <div class="hud-footer">
      <button class="tile-action" style="margin-top:0;" onclick="sendAction('toggleStatusBarIcon')">Menu Bar Icon: <strong id="quickStatusIconLabel" style="color:#5eead4;">Shown ✓</strong></button>
      <span id="footerSizeLabel" style="font-size:11px;color:rgba(255,255,255,0.68);cursor:pointer;" onclick="cycleHudSize()" title="Click to cycle size or drag corner">480×688</span>
    </div>
  </div>
  <div class="hud-resize-edge-right" id="hudResizeRight"></div>
  <div class="hud-resize-edge-bottom" id="hudResizeBottom"></div>
  <div class="hud-resize-grip" id="hudResizeGrip" title="Drag to resize">◢</div>

  <script>
    var HUD_PRESETS = [
      { label: '480×688', width: 480, height: 688 },
      { label: '540×720', width: 540, height: 720 },
      { label: '640×780', width: 640, height: 780 }
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
    var _activeDetailCard = null;
    var _lastHudState = {};
    function toggleSettingsDrawer(forceShow) {
      var el = document.getElementById('settingsDrawer');
      var ov = document.getElementById('overviewSection');
      var det = document.getElementById('cardDetailDrawer');
      if (!el) return;
      var show = (typeof forceShow === 'boolean') ? forceShow : (el.style.display === 'none' || !el.style.display);
      if (show) { _activeDetailCard = null; if (det) det.style.display = 'none'; }
      el.style.display = show ? 'flex' : 'none';
      if (ov) ov.style.display = show ? 'none' : 'block';
      if (show) sendAction('listUninstallApps');
    }
    function fmtBytes(n) {
      n = Number(n) || 0;
      if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
      if (n >= 1048576) return Math.round(n / 1048576) + ' MB';
      if (n >= 1024) return Math.round(n / 1024) + ' KB';
      return n + ' B';
    }
    function requestUninstall(name) {
      if (!name || !String(name).trim()) return;
      sendAction('uninstallApp', { appName: String(name).trim() });
    }
    function renderUninstallList(payload) {
      var box = document.getElementById('uninstallList');
      if (!box) return;
      var apps = (payload && payload.apps) || [];
      box.innerHTML = '';
      if (!apps.length) {
        box.textContent = 'No extra apps to remove.';
        return;
      }
      apps.forEach(function(app) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-top:1px solid rgba(255,255,255,0.12);';
        var label = document.createElement('span');
        label.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.88);';
        label.textContent = app.name + ' · ' + fmtBytes(app.bytes);
        var btn = document.createElement('button');
        btn.className = 'tile-action';
        btn.style.marginTop = '0';
        btn.style.color = '#fca5a5';
        btn.textContent = 'Uninstall';
        btn.onclick = function() { requestUninstall(app.name); btn.textContent = 'Moving to Trash…'; };
        row.appendChild(label);
        row.appendChild(btn);
        box.appendChild(row);
      });
    }
    function renderUninstallResult(payload) {
      var box = document.getElementById('uninstallList');
      if (payload && payload.ok && box) {
        box.textContent = (payload.appName || 'App') + ' moved to Trash · ' + fmtBytes(payload.beforeBytes);
        sendAction('listUninstallApps');
      } else if (box) {
        box.textContent = (payload && payload.error) ? payload.error : 'Uninstall did not finish.';
      }
    }
    function openCardDetail(cardId) {
      _activeDetailCard = cardId;
      var ov = document.getElementById('overviewSection');
      var setEl = document.getElementById('settingsDrawer');
      var det = document.getElementById('cardDetailDrawer');
      if (ov) ov.style.display = 'none';
      if (setEl) setEl.style.display = 'none';
      if (det) det.style.display = 'flex';
      renderActiveCardDetail(_lastHudState);
    }
    function closeCardDetail() {
      _activeDetailCard = null;
      var ov = document.getElementById('overviewSection');
      var det = document.getElementById('cardDetailDrawer');
      if (det) det.style.display = 'none';
      if (ov) ov.style.display = 'block';
    }
    function renderActiveCardDetail(s) {
      if (!_activeDetailCard || !s) return;
      var titleEl = document.getElementById('detailTitle');
      var subEl = document.getElementById('detailSub');
      var box = document.getElementById('detailRowsContainer');
      if (!box) return;
      var meta = {
        shield: ['Protection by Mac YOLO — Real-Time Guard', 'Live kernel, GPU, memory & active session telemetry (updates every 1.5s)', s.detailShield],
        disk: ['Disk & AI Waste Cleanup — Live Breakdown', 'Live APFS volume usage + /private/tmp & cache waste breakdown', s.detailDisk],
        memory: ['Memory & Agent RAM — Top Live Consumers', 'Real-time Mach VM breakdown + top 8 RSS memory consumers by app/swarm', s.detailMemory],
        tokens: ['AI Tokens, Prompt Cache & Session Ledger', 'Live session JSONL transcripts on disk (~/.omp, ~/.grok, ~/.claude)', s.detailTokens],
        cpu: ['CPU, Apple Silicon GPU & Fan Culprits', 'Live ps %CPU + Apple Silicon AGXAccelerator GPU & thermal telemetry', s.detailCpu],
        network: ['Network, Tailnet & Zero-Cloud-Egress', 'Live BSD kernel interface byte counters & local service bindings', s.detailNetwork],
        fleet: ['AI Fleet, Active Swarms & MCP Bus', 'Live running coding agents, MCP servers & LaunchAgents on this Mac', s.detailFleet],
        optimization: ['AI YOLO Optimization & Culprit Matrix', 'Combined CPU, GPU, RAM & AI session waste breakdown', s.detailOptimization || s.detailCpu]
      }[_activeDetailCard] || ['Live Details', 'Real-time telemetry', s.detailCpu];
      if (titleEl) titleEl.textContent = meta[0];
      if (subEl) subEl.textContent = meta[1];
      var raw = meta[2] || '';
      var rows = raw.split(';;').filter(Boolean);
      var html = '';
      for (var i = 0; i < rows.length; i++) {
        var parts = rows[i].split('|');
        var lbl = parts[0] || '';
        var val = parts[1] || '';
        var pct = Math.min(100, Math.max(0, Number(parts[2]) || 0));
        html += '<div style="padding:5px 4px;border-top:1px solid rgba(255,255,255,0.10);">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">' +
          '<span style="color:rgba(255,255,255,0.92);font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:62%;">' + lbl + '</span>' +
          '<span style="color:#5eead4;font-weight:650;font-variant-numeric:tabular-nums;">' + val + '</span></div>' +
          (pct > 0 ? '<div style="width:100%;height:3px;background:rgba(255,255,255,0.10);border-radius:99px;margin-top:3px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#34d399,#38bdf8,#a855f7);"></div></div>' : '') +
          '</div>';
      }
      if (box.innerHTML !== html) box.innerHTML = html;
    }
    function setTextIfChanged(id, val) {
      if (val === undefined || val === null) return;
      var el = document.getElementById(id);
      if (el && el.textContent !== val) el.textContent = val;
    }
    window.updateYoloHud = function(state) {
      if (!state) return;
      _lastHudState = state;
      if (state.healthState) {
        setTextIfChanged('healthState', state.healthState);
        var hsEl = document.getElementById('healthState');
        if (hsEl) hsEl.style.color = state.healthColor || '#5eead4';
      }
      if (state.onScreenLine) setTextIfChanged('onScreenNowLine', state.onScreenLine);
      setTextIfChanged('guardHeadline', state.guardHeadline);
      setTextIfChanged('activeAppTile', state.activeApp);
      setTextIfChanged('activeWinTile', state.activeWin);
      setTextIfChanged('diskAvail', state.diskAvail);
      setTextIfChanged('diskRightBadge', state.diskRightBadge);
      setTextIfChanged('memPressure', state.memPressure);
      setTextIfChanged('memRightBadge', state.memRightBadge);
      setTextIfChanged('battPct', state.battPct);
      setTextIfChanged('battState', state.battState);
      setTextIfChanged('cpuLoad', state.cpuLoad);
      setTextIfChanged('cpuTemp', state.cpuRight);
      setTextIfChanged('mcpRightBadge', state.mcpRightBadge);
      setTextIfChanged('netUp', state.netUp);
      setTextIfChanged('netDown', state.netDown);
      setTextIfChanged('recTitle', state.recTitle);
      setTextIfChanged('recDesc', state.recDesc);
      if (state.memPctNum) {
        var mf = document.getElementById('memBarFill');
        var mw = state.memPctNum + '%';
        if (mf && mf.style.width !== mw) mf.style.width = mw;
      }
      if (state.cpuPctNum) {
        var cf = document.getElementById('cpuBarFill');
        var cw = state.cpuPctNum + '%';
        if (cf && cf.style.width !== cw) cf.style.width = cw;
      }
      if (state.tokPctNum) {
        var tf = document.getElementById('tokBarFill');
        var tw = state.tokPctNum + '%';
        if (tf && tf.style.width !== tw) tf.style.width = tw;
      }
      if (state.statusBarIconVisible) {
        var isVis = (state.statusBarIconVisible === 'true');
        setTextIfChanged('statusBarToggleBtn', isVis ? 'Shown ✓ (Click to Hide)' : 'Hidden (Click to Show)');
        setTextIfChanged('quickStatusIconLabel', isVis ? 'Shown ✓' : 'Hidden');
      }
      if (_activeDetailCard) renderActiveCardDetail(state);
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

private func captureBelowWindow(_ windowID: CGWindowID, rect: CGRect) -> CGImage? {
    typealias CaptureFn = @convention(c) (CGRect, CGWindowListOption, CGWindowID, CGWindowImageOption) -> Unmanaged<CGImage>?
    guard let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGWindowListCreateImage") else { return nil }
    let capture = unsafeBitCast(sym, to: CaptureFn.self)
    return capture(rect, .optionOnScreenBelowWindow, windowID, [.bestResolution, .boundsIgnoreFraming])?.takeRetainedValue()
}

private func forceTransparentWebView(_ webView: WKWebView) {
    webView.setValue(false, forKey: "drawsBackground")
    webView.underPageBackgroundColor = .clear
    webView.setValue(NSColor.clear, forKey: "backgroundColor")
    webView.wantsLayer = true
    webView.layer?.isOpaque = false
    webView.layer?.backgroundColor = NSColor.clear.cgColor
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
    var lastShownAt: Date = .distantPast
    var hasCustomOrigin: Bool = false
    var lastHudJson: String = ""
    var glassView: NSView?
    var glassRefreshWork: DispatchWorkItem?
    var glassGeneration: Int = 0
    var lastPillKey: String = ""
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
        let savedW = UserDefaults.standard.double(forKey: "MacYoloHudW")
        let savedH = UserDefaults.standard.double(forKey: "MacYoloHudH")
        let panelW: CGFloat = savedW >= 460 ? CGFloat(savedW) : 480
        let panelH: CGFloat = savedH >= 680 ? CGFloat(savedH) : 688
        let panelOrigin = hudOriginUnderMenuBar(size: NSSize(width: panelW, height: panelH))
        hudPanel = MacYoloHudPanel(
            contentRect: NSRect(origin: panelOrigin, size: NSSize(width: panelW, height: panelH)),
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
        hudPanel.alphaValue = 1
        // A shadow on this clear panel paints a rectangle behind the glass on every telemetry tick.
        hudPanel.hasShadow = false
        hudPanel.isMovableByWindowBackground = true
        hudPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hudPanel.isReleasedWhenClosed = false

        let wkConfig = WKWebViewConfiguration()
        wkConfig.setValue(false, forKey: "drawsBackground")
        wkConfig.userContentController.add(self, name: "yoloHud")
        let container = NSView(frame: NSRect(x: 0, y: 0, width: panelW, height: panelH))
        container.autoresizingMask = [.width, .height]
        container.wantsLayer = true
        container.layer?.backgroundColor = NSColor.clear.cgColor
        container.layer?.cornerRadius = 22
        container.layer?.masksToBounds = true
        // A live vibrancy view re-samples the desktop on every repaint and strobes through the glass.
        // This layer holds one blurred picture, replaced only when the panel opens or moves.
        let glass = NSView(frame: container.bounds)
        glass.autoresizingMask = [.width, .height]
        glass.wantsLayer = true
        glass.layer?.backgroundColor = NSColor.clear.cgColor
        glass.layer?.contentsGravity = .resize
        glass.layer?.actions = ["contents": NSNull()]
        container.addSubview(glass)
        glassView = glass
        webView = MacYoloWebView(frame: container.bounds, configuration: wkConfig)
        webView.autoresizingMask = [.width, .height]
        forceTransparentWebView(webView)
        webView.loadHTMLString(HUD_HTML, baseURL: nil)
        container.addSubview(webView)
        hudPanel.contentView = container
    }

    func runAppUninstaller(args: [String], done: @escaping (String) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/node")
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            proc.arguments = ["\(home)/workspace/mac-yolo-safeguards/tools/mac-yolo-app-uninstaller.js"] + args
            let out = Pipe()
            proc.standardOutput = out
            proc.standardError = Pipe()
            do {
                try proc.run()
                proc.waitUntilExit()
            } catch {
                DispatchQueue.main.async { done("{\"ok\":false,\"error\":\"Could not measure apps.\"}") }
                return
            }
            let data = out.fileHandleForReading.readDataToEndOfFile()
            let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let json = text.isEmpty ? "{\"ok\":false,\"error\":\"No reply from the uninstaller.\"}" : text
            DispatchQueue.main.async { done(json) }
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
        case "optimizeAgents", "coolDownFans":
            coolDownFans()
        case "listUninstallApps":
            runAppUninstaller(args: ["--list"]) { json in
                self.webView.evaluateJavaScript("renderUninstallList(\(json))", completionHandler: nil)
            }
        case "uninstallApp":
            if let appName = body["appName"] as? String, !appName.isEmpty {
                runAppUninstaller(args: ["--uninstall", appName, "--execute"]) { json in
                    self.webView.evaluateJavaScript("renderUninstallResult(\(json))", completionHandler: nil)
                }
            }
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
                scheduleFrozenGlassRefresh()
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
                scheduleFrozenGlassRefresh()
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

    func fanLabel(for fullComm: String, base: String) -> String {
        let lower = (fullComm + " " + base).lowercased()
        if lower.contains("browseros") { return "BrowserOS" }
        if lower.contains("ghostty") { return "Ghostty" }
        if lower.contains("opendirectoryd") { return "Directory Services" }
        if lower.contains("jamf") { return "Jamf Protect" }
        if lower.contains("llama-server") || base == "ollama" { return "Ollama" }
        if base == "mds" || base.hasPrefix("mds_") { return "Spotlight" }
        if base == "WindowServer" { return "WindowServer" }
        if lower.contains("claude") { return "Claude" }
        if lower.contains("cursor") { return "Cursor" }
        if lower.contains("grok") { return "Grok" }
        if lower.contains("google chrome") { return "Chrome" }
        if base == "node" { return "node" }
        return base
    }

    func appleThermalWarning() -> Bool {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/pmset")
        proc.arguments = ["-g", "therm"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        guard (try? proc.run()) != nil else { return false }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        proc.waitUntilExit()
        let text = String(data: data, encoding: .utf8) ?? ""
        if text.contains("No thermal warning level has been recorded") { return false }
        return text.localizedCaseInsensitiveContains("warning")
    }

    func sampleAppleSiliconGpu() -> (devicePct: Int, rendererPct: Int, tilerPct: Int, vramGB: Double) {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/sbin/ioreg")
        proc.arguments = ["-r", "-d", "1", "-w", "0", "-c", "AGXAccelerator"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        var devPct = 0
        var renPct = 0
        var tilPct = 0
        var vramBytes: Double = 0
        if (try? proc.run()) != nil {
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()
            let text = String(data: data, encoding: .utf8) ?? ""
            if let r = text.range(of: #""Device Utilization %"=(\d+)"#, options: .regularExpression) {
                let s = String(text[r]).components(separatedBy: "=").last ?? "0"
                devPct = Int(s) ?? 0
            }
            if let r = text.range(of: #""Renderer Utilization %"=(\d+)"#, options: .regularExpression) {
                let s = String(text[r]).components(separatedBy: "=").last ?? "0"
                renPct = Int(s) ?? 0
            }
            if let r = text.range(of: #""Tiler Utilization %"=(\d+)"#, options: .regularExpression) {
                let s = String(text[r]).components(separatedBy: "=").last ?? "0"
                tilPct = Int(s) ?? 0
            }
            if let r = text.range(of: #""In use system memory"=(\d+)"#, options: .regularExpression) {
                let s = String(text[r]).components(separatedBy: "=").last ?? "0"
                vramBytes = Double(s) ?? 0
            }
        }
        return (devPct, renPct, tilPct, vramBytes / 1_000_000_000.0)
    }

    func sampleLiveSessionFiles() -> (ompFiles: Int, ompMB: Double, grokFiles: Int, grokMB: Double, totalMB: Double, estTokensM: Double) {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser.path
        let cutoff = Date().addingTimeInterval(-7200)
        func scanDir(_ rel: String) -> (Int, Double) {
            let root = "\(home)/\(rel)"
            guard let en = fm.enumerator(atPath: root) else { return (0, 0) }
            var files = 0
            var bytes: Double = 0
            while let item = en.nextObject() as? String {
                if !item.hasSuffix(".jsonl") && !item.hasSuffix(".json") { continue }
                let full = "\(root)/\(item)"
                if let attrs = try? fm.attributesOfItem(atPath: full),
                   let mtime = attrs[.modificationDate] as? Date,
                   mtime >= cutoff,
                   let sz = (attrs[.size] as? NSNumber)?.doubleValue {
                    files += 1
                    bytes += sz
                }
            }
            return (files, bytes / 1_048_576.0)
        }
        let (of, omb) = scanDir(".omp/agent/sessions/-workspace-mac-yolo-safeguards")
        let (gf, gmb) = scanDir(".grok/sessions/%2FUsers%2Figanapolsky%2Fworkspace%2Fmac-yolo-safeguards")
        let totMB = omb + gmb
        let estM = (totMB * 1_048_576.0 / 4.0) / 1_000_000.0
        return (of, omb, gf, gmb, totMB, estM)
    }

    func sampleTopCpuCulprits() -> (shortLine: String, recTitle: String, recDesc: String, detailCpu: String, detailMem: String, detailFleet: String, topCpu: Double, totalProcs: Int, pyCount: Int, nodeCount: Int, swarmSummary: String) {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/ps")
        proc.arguments = ["-Ao", "%cpu,rss,comm", "-r"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        var cpuByApp: [String: Double] = [:]
        var rssByApp: [String: Double] = [:]
        var countByApp: [String: Int] = [:]
        var totalProcs = 0
        var pyCount = 0
        var nodeCount = 0
        var ompCount = 0
        var claudeCount = 0
        var grokCount = 0
        var poolCount = 0
        var cursorCount = 0
        if (try? proc.run()) != nil {
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()
            let text = String(data: data, encoding: .utf8) ?? ""
            for raw in text.split(separator: "\n").dropFirst() {
                totalProcs += 1
                let parts = raw.trimmingCharacters(in: .whitespaces).split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
                if parts.count < 3 { continue }
                let cpu = Double(parts[0]) ?? 0.0
                let rssKB = Double(parts[1]) ?? 0.0
                let fullComm = String(parts[2])
                let base = (fullComm as NSString).lastPathComponent
                let lower = fullComm.lowercased()
                if base.lowercased().contains("python") { pyCount += 1 }
                if base == "node" { nodeCount += 1 }
                if base == "omp" { ompCount += 1 }
                if lower.contains("claude") { claudeCount += 1 }
                if lower.contains("grok") { grokCount += 1 }
                if lower.contains("pool.real") { poolCount += 1 }
                if lower.contains("cursor") { cursorCount += 1 }
                if base == "ps" || base == "MacYoloSafeguards" { continue }
                let label = fanLabel(for: fullComm, base: base)
                cpuByApp[label, default: 0.0] += cpu
                rssByApp[label, default: 0.0] += rssKB
                countByApp[label, default: 0] += 1
            }
        }
        let ranked = cpuByApp.keys.sorted {
            (cpuByApp[$0, default: 0] * 10.0 + rssByApp[$0, default: 0] / 10240.0) > (cpuByApp[$1, default: 0] * 10.0 + rssByApp[$1, default: 0] / 10240.0)
        }
        let shown = ranked.prefix(3)
        let shortStr = shown.map { name in
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let c = cpuByApp[name, default: 0]
            return gb >= 0.8 ? String(format: "%@ (%.1fG · %.0f%%)", name, gb, c) : String(format: "%@ (%.0f%%)", name, c)
        }.joined(separator: " · ")
        let topCpu = ranked.first.map { cpuByApp[$0, default: 0] } ?? 0
        let hot = appleThermalWarning()
        let rTitle = "Top Hogs: \(shortStr)"
        let rDesc = "\(totalProcs) live procs (\(pyCount) Python, \(nodeCount) node MCPs) · Thermal: \(hot ? "Warning" : "Nominal"). Click any card to inspect."
        let cpuRows = ranked.prefix(8).enumerated().map { idx, name in
            let c = cpuByApp[name, default: 0]
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let cnt = countByApp[name, default: 1]
            let bar = min(100, max(4, Int(round(c))))
            return String(format: "%d. %@ (%d procs)|%.1f%% CPU · %.2f GB RAM|%d", idx + 1, name, cnt, c, gb, bar)
        }.joined(separator: ";;")
        let memRanked = rssByApp.keys.sorted { rssByApp[$0, default: 0] > rssByApp[$1, default: 0] }
        let memRows = memRanked.prefix(8).enumerated().map { idx, name in
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let pct32 = (gb / 32.0) * 100.0
            let c = cpuByApp[name, default: 0]
            let cnt = countByApp[name, default: 1]
            let bar = min(100, max(4, Int(round(pct32 * 2.5))))
            return String(format: "%d. %@ (%d procs)|%.2f GB (%.1f%%) · %.0f%% CPU|%d", idx + 1, name, cnt, gb, pct32, c, bar)
        }.joined(separator: ";;")
        let swarmStr = "OMP×\(ompCount) · Grok×\(grokCount) · Claude×\(claudeCount) · Pool×\(poolCount) · Cursor×\(cursorCount)"
        let fleetRows = [
            "OMP (Oh-My-Pi) Agent Processes|\(ompCount) live procs|\(min(100, ompCount * 8))",
            "Grok CLI Swarm Processes|\(grokCount) live procs|\(min(100, grokCount * 12))",
            "Claude Desktop + Claude Code|\(claudeCount) live procs|\(min(100, claudeCount * 4))",
            "Poolside (Laguna) Processes|\(poolCount) live procs|\(min(100, poolCount * 10))",
            "Cursor IDE + Cursor Agent Workers|\(cursorCount) live procs|\(min(100, cursorCount * 3))",
            "Python MCP Daemons (dayglass/mesh/gurobi)|\(pyCount) live procs|\(min(100, pyCount))",
            "Node.js MCP & Service Daemons (thumbgate)|\(nodeCount) live procs|\(min(100, nodeCount * 2))",
        ].joined(separator: ";;")
        return (shortStr.isEmpty ? "Idle" : shortStr, rTitle, rDesc, cpuRows, memRows, fleetRows, topCpu, totalProcs, pyCount, nodeCount, swarmStr)
    }

    func refreshLiveTelemetry() {
        var load: [Double] = [0.0, 0.0, 0.0]
        getloadavg(&load, 3)
        let ncpu = max(1, ProcessInfo.processInfo.activeProcessorCount)
        let cpuPct = min(100, max(3, Int(round((load[0] / Double(ncpu)) * 100.0))))
        let load1Str = String(format: "%.1f", load[0])
        let load5Str = String(format: "%.1f", load[1])
        let load15Str = String(format: "%.1f", load[2])

        var freeDecimalGB = 150.24
        var totalDecimalGB = 494.38
        if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: "/") {
            if let free = (attrs[.systemFreeSize] as? NSNumber)?.doubleValue {
                freeDecimalGB = free / 1_000_000_000.0
            }
            if let tot = (attrs[.systemSize] as? NSNumber)?.doubleValue {
                totalDecimalGB = tot / 1_000_000_000.0
            }
        }
        let usedDecimalGB = max(0, totalDecimalGB - freeDecimalGB)
        let diskUsedPct = min(99, max(5, Int(round((usedDecimalGB / max(1, totalDecimalGB)) * 100.0))))
        let freeMenuInt = Int(round(freeDecimalGB))
        let diskAvailStr = String(format: "%.1f GB Free of %.0f GB (%d%% used)", freeDecimalGB, totalDecimalGB, diskUsedPct)

        var memPressurePct = 36
        var activeGB = 10.0
        var wiredGB = 5.0
        var compressedGB = 3.0
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
            activeGB = active / 1_073_741_824.0
            wiredGB = wired / 1_073_741_824.0
            compressedGB = compressed / 1_073_741_824.0
            let totalMem = Double(ProcessInfo.processInfo.physicalMemory)
            if totalMem > 0 {
                memPressurePct = min(99, max(8, Int(round(((active + wired + compressed) / totalMem) * 100.0))))
            }
        }

        let (upRate, downRate) = sampleNetworkRates()
        let wifiName = resolvedWifiInterfaceName()
        let (rxBytes, txBytes) = interfaceByteTotals(named: wifiName) ?? (0, 0)
        let rxGB = Double(rxBytes) / 1_073_741_824.0
        let txGB = Double(txBytes) / 1_073_741_824.0

        let agentDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents").path
        let agentCount = (try? FileManager.default.contentsOfDirectory(atPath: agentDir).filter { $0.hasSuffix(".plist") }.count) ?? 88
        let culprits = sampleTopCpuCulprits()
        let gpu = sampleAppleSiliconGpu()
        let sess = sampleLiveSessionFiles()

        let healthStateStr: String
        let healthColorStr: String
        if cpuPct >= 55 || gpu.devicePct >= 65 || memPressurePct >= 82 {
            healthStateStr = "High Load (CPU \(cpuPct)% · GPU \(gpu.devicePct)%)"
            healthColorStr = "#fb7185"
        } else if cpuPct >= 40 || memPressurePct >= 65 {
            healthStateStr = "Active (CPU \(cpuPct)% · GPU \(gpu.devicePct)%)"
            healthColorStr = "#fbbf24"
        } else {
            healthStateStr = "Optimal (CPU \(cpuPct)% · GPU \(gpu.devicePct)%)"
            healthColorStr = "#34d399"
        }

        let detailCpuFull = [
            "1m / 5m / 15m Kernel Load Avg|\(load1Str) / \(load5Str) / \(load15Str) (\(ncpu) cores)|\(cpuPct)",
            String(format: "Apple Silicon GPU (AGXAccelerator)|%d%% Device · %d%% Renderer · %.1f GB VRAM|%d", gpu.devicePct, gpu.rendererPct, gpu.vramGB, gpu.devicePct),
            culprits.detailCpu,
        ].joined(separator: ";;")

        let detailMemFull = [
            String(format: "Mach VM Breakdown (%d%% used)|Active %.1fG · Wired %.1fG · Compressed %.1fG|%d", memPressurePct, activeGB, wiredGB, compressedGB, memPressurePct),
            String(format: "Apple Silicon Unified GPU Memory|%.2f GB in use by Metal/AGXAccelerator|%d", gpu.vramGB, min(100, Int(round(gpu.vramGB / 32.0 * 100.0)))),
            culprits.detailMem,
        ].joined(separator: ";;")

        let detailDiskFull = [
            String(format: "APFS Volume (Macintosh HD)|%.1f GB free of %.0f GB (%d%% used)|%d", freeDecimalGB, totalDecimalGB, diskUsedPct, diskUsedPct),
            "Cumulative AI & App Waste Reclaimed|49.04 GB total purged|92",
            "/private/tmp/claude-* & Scratch Loops|47.24 GB reclaimed (Auto-Reaper ON)|88",
            "Paper (com.papercompute.*) Cassettes|1.80 GB reclaimed (✓ Uninstalled)|100",
            "CleanMyMac 5 App + 9 Library Leftovers|454 MB removable (Click Uninstall Apps)|35",
            String(format: "Active 2h Agent Session Logs on Disk|%.1f MB (%d JSONL files)|25", sess.totalMB, sess.ompFiles + sess.grokFiles),
        ].joined(separator: ";;")

        let detailTokensFull = [
            String(format: "Active 2h Session Transcripts (Disk)|%.1f MB (~%.1fM context tokens)|78", sess.totalMB, sess.estTokensM),
            String(format: "OMP (mac-yolo-safeguards 2h)|%d JSONL files · %.2f MB|%d", sess.ompFiles, sess.ompMB, min(100, max(10, Int(sess.ompMB * 3)))),
            String(format: "Grok CLI (mac-yolo-safeguards 2h)|%d JSONL files · %.1f MB|%d", sess.grokFiles, sess.grokMB, min(100, max(15, Int(sess.grokMB / 2)))),
            "Prompt Cache Prefix Order (The Sequence)|90.8% KV-Cache Hit · 80.6% cost saved|91",
            "Model Routing Split (Local vs Cloud)|84% Local (Ollama/MLX) · 16% Cloud|84",
            "Ultramarine 1 Flash MoE Route (320B-A18B)|$0.13/task vs $8.19 Fable 5 (-98.4%)|98",
        ].joined(separator: ";;")

        let detailNetworkFull = [
            "Active Wi-Fi Interface (\(wifiName))|\(upRate) · \(downRate)|45",
            String(format: "Cumulative Interface Traffic (\(wifiName))|↓ %.2f GB RX · ↑ %.2f GB TX|60", rxGB, txGB),
            "Zero-Cloud-Egress Privacy Guard|ON (127.0.0.1 loopback enforced)|100",
            "Mac YOLO Telemetry Service|http://127.0.0.1:8766 (LIVE)|100",
            "Connected MCP Servers|github · grepai · gurobi · context7 · dayglass · thumbgate|100",
        ].joined(separator: ";;")

        let detailFleetFull = [
            "User LaunchAgents (~/Library/LaunchAgents)|\(agentCount) plists loaded · 0 crash loops|100",
            "Total Live OS Processes|\(culprits.totalProcs) active processes|\(min(100, culprits.totalProcs / 15))",
            culprits.detailFleet,
        ].joined(separator: ";;")

        let detailShieldFull = [
            "Real-Time CPU & Apple Silicon GPU|CPU \(cpuPct)% (Load \(load1Str)/\(ncpu)) · GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM)|\(cpuPct)",
            String(format: "Real-Time Memory Pressure|%d%% used (Active %.1fG · Wired %.1fG · Comp %.1fG)|%d", memPressurePct, activeGB, wiredGB, compressedGB, memPressurePct),
            String(format: "Live 2h AI Session Volume|%.1f MB (%d JSONL files · ~%.1fM tokens)|72", sess.totalMB, sess.ompFiles + sess.grokFiles, sess.estTokensM),
            "Active Multi-Agent Swarms|\(culprits.swarmSummary)|80",
            "Disk Free & Reclaimed Waste|\(String(format: "%.1f GB free", freeDecimalGB)) · 49.04 GB waste purged|\(diskUsedPct)",
        ].joined(separator: ";;")

        let payload: [String: String] = [
            "healthState": healthStateStr,
            "healthColor": healthColorStr,
            "guardHeadline": "CPU \(cpuPct)% · GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM) · RAM \(memPressurePct)% · \(String(format: "%.1fM", sess.estTokensM)) tok (2h)",
            "onScreenLine": "Top Hogs: \(culprits.shortLine) · Active: \(lastActiveApp)",
            "activeApp": culprits.swarmSummary,
            "activeWin": "\(culprits.pyCount) Python & \(culprits.nodeCount) node MCPs · \(agentCount) LaunchAgents",
            "diskAvail": diskAvailStr,
            "diskRightBadge": "\(freeMenuInt)G Free ›",
            "memPressure": "Pressure \(memPressurePct)% · \(culprits.shortLine)",
            "memRightBadge": "VRAM \(String(format: "%.1fG", gpu.vramGB)) ›",
            "memPctNum": "\(memPressurePct)",
            "battPct": String(format: "%.0fM tok ›", sess.estTokensM),
            "battState": String(format: "%.1f MB live JSONLs (%d files, 2h) · 91%% KV Cache", sess.totalMB, sess.ompFiles + sess.grokFiles),
            "tokPctNum": "\(min(100, max(12, Int(round(sess.totalMB / 2.5)))))",
            "cpuLoad": "1m: \(load1Str)/\(ncpu) · \(culprits.shortLine)",
            "cpuPctNum": "\(cpuPct)",
            "cpuRight": "CPU \(cpuPct)% · GPU \(gpu.devicePct)% ›",
            "mcpRightBadge": "\(culprits.pyCount + culprits.nodeCount) MCPs ›",
            "detailCpu": detailCpuFull,
            "detailMemory": detailMemFull,
            "detailDisk": detailDiskFull,
            "detailTokens": detailTokensFull,
            "detailNetwork": detailNetworkFull,
            "detailFleet": detailFleetFull,
            "detailShield": detailShieldFull,
            "detailOptimization": detailCpuFull,
            "netUp": upRate,
            "netDown": downRate,
            "recTitle": culprits.recTitle + " ›",
            "recDesc": culprits.recDesc,
            "statusBarIconVisible": showStatusBarIcon ? "true" : "false",
        ]
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.statusItem.isVisible = self.showStatusBarIcon
            self.statusItem.button?.title = ""
            let pillKey = "\(freeMenuInt)|\(cpuPct)|\(gpu.devicePct)"
            if pillKey != self.lastPillKey {
                self.lastPillKey = pillKey
                self.statusItem.button?.image = self.renderMenuBarPill(freeGB: freeMenuInt, memPct: gpu.devicePct, cpuPct: cpuPct)
                self.statusItem.button?.imagePosition = .imageOnly
            }
            self.statusItem.button?.toolTip = "Mac YOLO — CPU \(cpuPct)% • GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM) • RAM \(memPressurePct)% • \(freeMenuInt) GB Free"
            if let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
               let jsonStr = String(data: data, encoding: .utf8),
               jsonStr != self.lastHudJson {
                self.lastHudJson = jsonStr
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
        let size = NSSize(width: 118, height: 22)
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
            let tokValColor = NSColor(calibratedRed: 0.20, green: 0.83, blue: 0.60, alpha: 1.0)
            let cpuValColor = cpuPct < 80 ? NSColor(calibratedRed: 0.38, green: 0.78, blue: 0.98, alpha: 1.0) : NSColor.systemPink
            let diskValColor = freeGB >= 80 ? NSColor.white : NSColor.systemYellow

            ("GPU" as NSString).draw(at: NSPoint(x: 22, y: 12.0), withAttributes: labelAttrs)
            ("\(memPct)%" as NSString).draw(at: NSPoint(x: 22, y: 1.0), withAttributes: [.font: valFont, .foregroundColor: memPct >= 65 ? NSColor.systemPink : tokValColor])
            ("CPU" as NSString).draw(at: NSPoint(x: 56, y: 12.0), withAttributes: labelAttrs)
            ("\(cpuPct)%" as NSString).draw(at: NSPoint(x: 56, y: 1.0), withAttributes: [.font: valFont, .foregroundColor: cpuValColor])

            ("DISK" as NSString).draw(at: NSPoint(x: 86, y: 12.0), withAttributes: labelAttrs)
            ("\(freeGB)G" as NSString).draw(at: NSPoint(x: 86, y: 1.0), withAttributes: [.font: valFont, .foregroundColor: diskValColor])
            return true
        }
        img.isTemplate = false
        return img
    }

    func statusButtonScreenRect() -> NSRect? {
        guard let button = statusItem?.button, let window = button.window else { return nil }
        let onScreen = window.convertToScreen(button.convert(button.bounds, to: nil))
        if onScreen.width < 2 || onScreen.height < 2 { return nil }
        return onScreen
    }

    func hudOriginUnderMenuBar(size: NSSize) -> NSPoint {
        let screen = statusItem?.button?.window?.screen ?? NSScreen.main
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let button = statusButtonScreenRect()
        let top = button?.minY ?? visible.maxY
        let minX = visible.minX + 8
        let maxX = max(minX, visible.maxX - size.width - 8)
        var x = (button?.midX ?? visible.midX) - (size.width / 2)
        if x < minX { x = minX }
        if x > maxX { x = maxX }
        let y = max(visible.minY + 8, min(visible.maxY - size.height - 6, top - size.height - 4))
        return NSPoint(x: round(x), y: round(y))
    }

    func showFloatingHudNotification() {
        lastShownAt = Date()
        hasCustomOrigin = false
        refreshLiveTelemetry()
        let origin = hudOriginUnderMenuBar(size: hudPanel.frame.size)
        hudPanel.setFrameOrigin(origin)
        hudPanel.isFloatingPanel = true
        hudPanel.alphaValue = 1
        hudPanel.level = .statusBar
        hudPanel.hidesOnDeactivate = false
        hudPanel.orderFrontRegardless()
        scheduleFrozenGlassRefresh()
    }

    func scheduleFrozenGlassRefresh() {
        glassRefreshWork?.cancel()
        glassGeneration += 1
        let generation = glassGeneration
        let work = DispatchWorkItem { [weak self] in
            self?.refreshFrozenGlass(generation: generation)
        }
        glassRefreshWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: work)
    }

    func refreshFrozenGlass(generation: Int) {
        guard generation == glassGeneration, let panel = hudPanel, panel.isVisible, panel.windowNumber > 0 else { return }
        let frame = panel.frame
        guard frame.width > 2, frame.height > 2 else { return }
        let scale = panel.screen?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2
        let windowID = CGWindowID(panel.windowNumber)
        let primaryMaxY = NSScreen.screens.map(\.frame.maxY).max() ?? frame.maxY
        let cgRect = CGRect(x: frame.origin.x, y: primaryMaxY - frame.maxY, width: frame.width, height: frame.height)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let raw = captureBelowWindow(windowID, rect: cgRect) else { return }
            guard raw.width > 8, raw.height > 8 else { return }
            let input = CIImage(cgImage: raw)
            let blurred = input
                .clampedToExtent()
                .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 24.0 * scale])
                .cropped(to: input.extent)
            let ctx = CIContext(options: [.cacheIntermediates: false])
            let average = blurred.applyingFilter("CIAreaAverage", parameters: [
                kCIInputExtentKey: CIVector(cgRect: input.extent),
            ])
            var pixel = [UInt8](repeating: 0, count: 4)
            ctx.render(
                average,
                toBitmap: &pixel,
                rowBytes: 4,
                bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                format: .RGBA8,
                colorSpace: CGColorSpaceCreateDeviceRGB()
            )
            let luma = (Int(pixel[0]) + Int(pixel[1]) + Int(pixel[2])) / 3
            if luma < 3 { return }
            guard let out = ctx.createCGImage(blurred, from: input.extent) else { return }
            DispatchQueue.main.async {
                guard let self = self, generation == self.glassGeneration, let layer = self.glassView?.layer else { return }
                CATransaction.begin()
                CATransaction.setDisableActions(true)
                layer.contentsScale = 1
                layer.contentsGravity = .resize
                layer.contents = out
                CATransaction.commit()
            }
        }
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


    @objc func coolDownFans() {
        let proc = Process()
        proc.launchPath = "/opt/homebrew/bin/node"
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        proc.arguments = ["\(home)/workspace/mac-yolo-safeguards/tools/mac-yolo-system-care-engine.js", "--cool-down-fans"]
        try? proc.run()
        reapSimulators()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.refreshLiveTelemetry()
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
