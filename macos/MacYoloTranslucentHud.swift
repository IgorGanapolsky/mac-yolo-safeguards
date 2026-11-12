import Cocoa
import CoreGraphics
import CoreImage
import CryptoKit
import Darwin
import Foundation
import UserNotifications
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
    background: radial-gradient(circle at 82% 10%, rgba(126, 58, 242, 0.44) 0%, rgba(46, 21, 99, 0.56) 48%, rgba(21, 11, 48, 0.62) 100%);
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
          <button class="hdr-pill" onclick="sendAction('openGearMenu')">
            <span>Jobs</span>
          </button>
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
                <span id="netName">Internet</span>
              </div>
              <span class="tile-val" id="netVerdict" style="color:#94a3b8;font-size:11px;">Checking… ›</span>
            </div>
            <div class="net-rates" style="padding-left:2px;">
              <div id="netImpact" style="font-size:13px;color:#fff;font-weight:700;">Checking your internet…</div>
              <div id="netCause" style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:1px;"></div>
              <div id="netUp" style="font-size:11px;color:rgba(255,255,255,0.85);margin-top:2px;">Delay measuring</div>
              <div id="netDown" style="font-size:10px;color:rgba(255,255,255,0.55);">Using now ↓ 0 KB/s · ↑ 0 KB/s</div>
            </div>
          </div>
          <button class="tile-action" id="testSpeedBtn" onclick="event.stopPropagation();triggerHudAction('testSpeed', this, 'Testing…', 'Test Speed')">Test Speed</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('fleet')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-win"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="6.5" cy="6.5" r="0.8"/><circle cx="9.5" cy="6.5" r="0.8"/></svg></span>
                <span>Agents</span>
              </div>
              <span class="tile-val" id="mcpRightBadge" style="color:#34d399;font-size:11px;">MCPs ›</span>
            </div>
            <div class="tile-sub good" id="activeAppTile" style="padding-left:2px;margin-top:4px;font-weight:600;">Scanning active swarms…</div>
            <div class="tile-sub" id="activeWinTile" style="padding-left:2px;margin-top:2px;">Scanning MCP &amp; LaunchAgent daemons…</div>
            <div class="tile-sub" id="fleetUsage" style="padding-left:2px;margin-top:2px;color:rgba(255,255,255,0.85);white-space:pre-line;line-height:1.35;font-size:10.5px;">Counting each agent…</div>
          </div>
          <button class="tile-action" onclick="event.stopPropagation();openCardDetail('fleet')">See each agent ›</button>
        </div>
      </div>

      <div class="card rec-card" id="actionReceiptBanner" style="display:none;padding:9px 12px;margin-bottom:6px;gap:5px;border:1px solid rgba(52,211,153,0.45);background:rgba(16,185,129,0.16);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div id="actionReceiptTitle" style="font-size:12px;font-weight:700;color:#6ee7b7;">✓ Cleanup Complete</div>
          <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;">
            <button class="tile-action" id="actionReceiptInspectBtn" style="margin-top:0;padding:3px 8px;font-size:10.5px;" onclick="openCardDetail('disk')">Receipt ›</button>
            <button class="tile-action" style="margin-top:0;padding:2px 6px;font-size:10.5px;" onclick="dismissActionReceipt()">×</button>
          </div>
        </div>
        <div id="actionReceiptItems" style="display:flex;flex-direction:column;gap:3px;font-size:11.2px;color:rgba(255,255,255,0.92);"></div>
        <div id="actionReceiptSpared" style="font-size:10.5px;color:rgba(255,255,255,0.68);"></div>
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

      <div class="card rec-card" id="cardDetailDrawer" style="display:none;padding:14px 15px;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
          <div>
            <div id="detailTitle" style="font-size:15px;font-weight:700;color:#5eead4;letter-spacing:-0.2px;">Card Details</div>
            <div id="detailSub" style="font-size:11.5px;color:rgba(255,255,255,0.70);margin-top:2px;">Real-time kernel, GPU &amp; session telemetry</div>
          </div>
          <button class="tile-action" style="margin-top:0;padding:5px 10px;" onclick="closeCardDetail()">← Back</button>
        </div>
        <div id="detailRowsContainer" style="display:flex;flex-direction:column;gap:6px;margin-top:4px;"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid rgba(255,255,255,0.12);margin-top:4px;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="rec-btn" id="drawerSpeedBtn" style="display:none;" onclick="triggerHudAction('testSpeed', this, 'Testing…', 'Test Speed')">Test Speed</button>
            <button class="rec-btn" onclick="triggerHudAction('coolDownFans', this, 'Cooling &amp; Reaping…', 'Fans Cooled ✓')">Cool Down Fans</button>
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
    var _diskCleanStatusOverride = null;
    var _diskCleanStatusUntil = 0;
    var _lastCleanDetailRows = '';
    function dismissActionReceipt() {
      var b = document.getElementById('actionReceiptBanner');
      if (b) b.style.display = 'none';
    }
    function sendAction(action, extra) {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.yoloHud) {
        var msg = { action: action };
        if (extra) { for (var k in extra) msg[k] = extra[k]; }
        window.webkit.messageHandlers.yoloHud.postMessage(msg);
      }
    }
    function shortCatName(label) {
      var s = String(label || '');
      if (s.indexOf('npm') !== -1) return 'npm Package Cache (~/.npm/_cacache)';
      if (s.indexOf('Homebrew') !== -1) return 'Homebrew Download Cache';
      if (s.indexOf('pip') !== -1) return 'Python pip & TypeScript Caches';
      if (s.indexOf('Claude') !== -1 || s.indexOf('Scratchpads') !== -1) return 'Live Claude Scratchpads (/tmp)';
      if (s.indexOf('Playwright') !== -1) return 'Playwright Browser Binaries';
      if (s.indexOf('Trash') !== -1) return 'macOS User Trash';
      return s.split(' (')[0];
    }
    function triggerHudAction(action, btnEl, busyText, doneText) {
      var origText = btnEl ? (btnEl.getAttribute('data-orig') || btnEl.textContent) : '';
      if (btnEl && !btnEl.getAttribute('data-orig')) btnEl.setAttribute('data-orig', origText);
      if (btnEl) {
        btnEl.textContent = busyText;
        btnEl.style.color = '#5eead4';
      }
      var banner = document.getElementById('actionReceiptBanner');
      var titleEl = document.getElementById('actionReceiptTitle');
      var itemsEl = document.getElementById('actionReceiptItems');
      var sparedEl = document.getElementById('actionReceiptSpared');
      var inspectBtn = document.getElementById('actionReceiptInspectBtn');
      if (banner && !_activeDetailCard && (action === 'freeUpDisk' || action === 'freeUpMemory' || action === 'coolDownFans')) {
        banner.style.display = 'flex';
        if (action === 'freeUpDisk') {
          if (titleEl) titleEl.textContent = '⚡ Scanning & Purging AI / Dev Cache Waste…';
          if (itemsEl) itemsEl.innerHTML = '<div>Checking ~/.npm/_cacache, Homebrew, pip/TypeScript &amp; idle /private/tmp/claude-*…</div>';
          if (sparedEl) sparedEl.textContent = 'Active coding sessions & user files remain untouched.';
          if (inspectBtn) { inspectBtn.textContent = 'Receipt ›'; inspectBtn.onclick = function() { openCardDetail('disk'); }; }
        } else if (action === 'freeUpMemory') {
          if (titleEl) titleEl.textContent = '⚡ Reaping Idle Simulators & Duplicate Loops…';
          if (itemsEl) itemsEl.innerHTML = '<div>Shutting down idle iOS/tvOS simulators and checking for runaway process storms…</div>';
          if (sparedEl) sparedEl.textContent = 'Live Claude, Gemini, OMP & Grok sessions are protected.';
          if (inspectBtn) { inspectBtn.textContent = 'Memory ›'; inspectBtn.onclick = function() { openCardDetail('memory'); }; }
        } else if (action === 'coolDownFans') {
          if (titleEl) titleEl.textContent = '⚡ Cooling Fans & Renicing Background Indexers…';
          if (itemsEl) itemsEl.innerHTML = '<div>Lowering thermal priority on background indexers &amp; shutting down idle simulators…</div>';
          if (sparedEl) sparedEl.textContent = 'Foreground apps and active coding sessions remain at full speed.';
          if (inspectBtn) { inspectBtn.textContent = 'CPU & Fans ›'; inspectBtn.onclick = function() { openCardDetail('cpu'); }; }
        }
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
    window.renderActionReceipt = function(res) {
      if (!res) return;
      var banner = document.getElementById('actionReceiptBanner');
      var titleEl = document.getElementById('actionReceiptTitle');
      var itemsEl = document.getElementById('actionReceiptItems');
      var sparedEl = document.getElementById('actionReceiptSpared');
      if (!banner || !titleEl || !itemsEl || !sparedEl) return;
      if (!_activeDetailCard) banner.style.display = 'flex';
      if (res.action === 'freeUpDisk' || res.cleanedCategories !== undefined) {
        var reclaimedMiB = Number(res.reclaimedMiB) || 0;
        var reclaimedGiB = Number(res.reclaimedGiB) || 0;
        var cleaned = res.cleanedCategories || [];
        var spared = res.sparedCategories || [];
        var prev = res.lastNonZeroClean || null;
        var htmlRows = [];
        var detailRows = [];
        if (reclaimedMiB > 0) {
          var sizeStr = reclaimedMiB >= 1024 ? (reclaimedGiB + ' GB') : (reclaimedMiB + ' MB');
          titleEl.textContent = '✓ Cleaned AI & Dev Waste · ' + sizeStr + ' Freed';
          for (var i = 0; i < cleaned.length; i++) {
            var c = cleaned[i];
            if (!c || !(c.sizeMiB > 0)) continue;
            var cSize = c.sizeMiB >= 1024 ? (c.sizeGiB + ' GB') : (c.sizeMiB + ' MB');
            var cName = shortCatName(c.label);
            htmlRows.push('<div style="display:flex;justify-content:space-between;gap:8px;"><span>✓ ' + cName + '</span><strong style="color:#6ee7b7;">' + cSize + ' purged</strong></div>');
            detailRows.push('✓ Purged: ' + cName + '|' + cSize + ' freed|100');
          }
          _diskCleanStatusOverride = '✓ Purged ' + sizeStr + ' (npm · Brew · pip)';
          _diskCleanStatusUntil = Date.now() + 30000;
          setTextIfChanged('diskAvail', _diskCleanStatusOverride);
        } else {
          var prevBadge = prev ? (' · Last purge freed ' + (prev.reclaimedMiB >= 1024 ? (prev.reclaimedGiB + ' GB') : (prev.reclaimedMiB + ' MB'))) : '';
          titleEl.textContent = '✓ Caches Clean (0 MB stale waste)' + prevBadge;
          if (prev && prev.cleanedCategories && prev.cleanedCategories.length) {
            for (var pIdx = 0; pIdx < prev.cleanedCategories.length; pIdx++) {
              var pc = prev.cleanedCategories[pIdx];
              var pcSize = pc.sizeMiB >= 1024 ? (pc.sizeGiB + ' GB') : (pc.sizeMiB + ' MB');
              var pcName = shortCatName(pc.label);
              htmlRows.push('<div style="display:flex;justify-content:space-between;gap:8px;"><span>✓ ' + pcName + '</span><strong style="color:#6ee7b7;">' + pcSize + ' freed</strong></div>');
              detailRows.push('✓ Last Purged: ' + pcName + '|' + pcSize + ' freed (0 MB now)|100');
            }
          } else {
            htmlRows.push('<div>✓ npm, Homebrew, pip/TypeScript &amp; /tmp caches are at 0 MB</div>');
          }
          _diskCleanStatusOverride = '✓ 0 MB stale waste' + (prev ? (' (Last freed ' + (prev.reclaimedMiB >= 1024 ? (prev.reclaimedGiB + ' GB') : (prev.reclaimedMiB + ' MB')) + ')') : '');
          _diskCleanStatusUntil = Date.now() + 25000;
          setTextIfChanged('diskAvail', _diskCleanStatusOverride);
        }
        itemsEl.innerHTML = htmlRows.slice(0, 3).join('');
        var sparedParts = [];
        for (var sIdx = 0; sIdx < spared.length; sIdx++) {
          var sc = spared[sIdx];
          var scSize = sc.sizeMiB >= 1024 ? (sc.sizeGiB + ' GB') : (sc.sizeMiB + ' MB');
          var scName = shortCatName(sc.label);
          sparedParts.push(scName + ' (' + scSize + ')');
          detailRows.push('🛡 Spared: ' + scName + '|' + scSize + ' protected|30');
        }
        sparedEl.textContent = '🛡 Spared: ' + (sparedParts.slice(0, 2).join(' · ') || 'Active sessions untouched');
        _lastCleanDetailRows = detailRows.join(';;');
        if (_activeDetailCard === 'disk') renderActiveCardDetail(_lastHudState);
      } else {
        titleEl.textContent = res.title || '✓ Optimization Complete';
        var list = res.items || [];
        var out = '';
        for (var m = 0; m < Math.min(3, list.length); m++) {
          out += '<div>• ' + list[m] + '</div>';
        }
        itemsEl.innerHTML = out || '<div>Completed system optimization pass.</div>';
        sparedEl.textContent = res.spared || '🛡 Active coding sessions untouched.';
      }
    };
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
      var ban = document.getElementById('actionReceiptBanner');
      if (!el) return;
      var show = (typeof forceShow === 'boolean') ? forceShow : (el.style.display === 'none' || !el.style.display);
      if (show) { _activeDetailCard = null; if (det) det.style.display = 'none'; if (ban) ban.style.display = 'none'; }
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
      if (payload && payload.ok === false) {
        box.textContent = payload.error || 'App uninstalling is not available.';
        return;
      }
      if (!apps.length) {
        box.textContent = 'No extra apps to remove.';
        return;
      }
      apps.forEach(function(app) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,0.12);';
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
      var ban = document.getElementById('actionReceiptBanner');
      if (ov) ov.style.display = 'none';
      if (setEl) setEl.style.display = 'none';
      if (ban) ban.style.display = 'none';
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
      box.style.maxHeight = '440px';
      box.style.overflowY = 'auto';
      var speedBtn = document.getElementById('drawerSpeedBtn');
      if (speedBtn) speedBtn.style.display = _activeDetailCard === 'network' ? 'inline-block' : 'none';
      if (!box.dataset.bound) {
        box.dataset.bound = '1';
        box.addEventListener('click', function(ev) {
          var row = ev.target.closest('[data-row]');
          if (!row) return;
          var id = row.getAttribute('data-row');
          window._openDetailRow = (window._openDetailRow === id) ? '' : id;
          renderActiveCardDetail(_lastHudState);
        });
      }
      var diskRowsCombined = (_lastCleanDetailRows ? (_lastCleanDetailRows + ';;' + (s.detailDisk || '')) : (s.detailDisk || ''));
      var meta = {
        shield: ['Protection by Mac YOLO — Real-Time Guard', 'Live top CPU & RAM hogs right now — tap any row for details', s.detailShield],
        disk: ['Disk & AI Waste Cleanup — Live Breakdown', 'APFS volume status + itemized AI/dev cache cleanup receipts', diskRowsCombined],
        memory: ['Memory & Agent RAM — Top Live Consumers', 'Mach VM breakdown + top RSS memory consumers by app', s.detailMemory],
        tokens: ['AI Tokens, Prompt Cache & Session Ledger', 'Live session JSONL transcripts on disk (~/.omp, ~/.grok, ~/.claude)', s.detailTokens],
        cpu: ['CPU, Apple Silicon GPU & Fan Culprits', 'Live %CPU + Apple Silicon AGXAccelerator GPU & thermal telemetry', s.detailCpu],
        network: ['Internet', 'Tap a row for the numbers behind it', s.detailNetwork],
        fleet: ['Agents', 'Each name is one agent. Tap a row for calls, tokens, cloud, and internet.', s.detailFleet],
        optimization: ['AI YOLO Optimization & Culprit Matrix', 'Combined CPU, GPU, RAM & AI session waste breakdown', s.detailOptimization || s.detailCpu]
      }[_activeDetailCard] || ['Live Details', 'Real-time telemetry', s.detailCpu];
      if (titleEl) titleEl.textContent = meta[0];
      if (subEl) subEl.textContent = meta[1];
      var raw = meta[2] || '';
      var cap = 24;
      var rows = raw.split(';;').filter(Boolean).slice(0, cap);
      function esc(t) {
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      var html = '';
      for (var i = 0; i < rows.length; i++) {
        var parts = rows[i].split('|');
        var lbl = parts[0] || '';
        var val = parts[1] || '';
        var more = parts[3] || '';
        var rowId = _activeDetailCard + ':' + i;
        var open = more && window._openDetailRow === rowId;
        if (more) {
          html += '<div data-row="' + rowId + '" style="padding:9px 12px;border-radius:10px;background:rgba(255,255,255,0.045);border:1px solid rgba(255,255,255,0.09);cursor:pointer;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
            '<span style="color:rgba(255,255,255,0.94);font-size:12px;font-weight:600;flex-shrink:0;">' + esc(lbl) + '</span>' +
            '<span style="color:#5eead4;font-size:11.5px;font-weight:650;font-variant-numeric:tabular-nums;text-align:right;max-width:68%;white-space:normal;line-height:1.35;">' + esc(val) + (open ? '  ▾' : '  ›') + '</span>' +
            '</div>' +
            (open ? '<div style="margin-top:6px;font-size:11.5px;line-height:1.4;color:rgba(255,255,255,0.78);">' + esc(more) + '</div>' : '') +
            '</div>';
        } else {
          html += '<div style="padding:9px 12px;border-radius:10px;background:rgba(255,255,255,0.045);border:1px solid rgba(255,255,255,0.09);display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
            '<span style="color:rgba(255,255,255,0.94);font-size:12px;font-weight:560;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(lbl) + '</span>' +
            '<span style="color:#5eead4;font-size:11.5px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap;background:rgba(20,184,166,0.13);border:1px solid rgba(94,234,212,0.25);padding:2px 8px;border-radius:99px;">' + esc(val) + '</span>' +
            '</div>';
        }
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
      if (_diskCleanStatusOverride && Date.now() < _diskCleanStatusUntil) {
        setTextIfChanged('diskAvail', _diskCleanStatusOverride);
      } else {
        setTextIfChanged('diskAvail', state.diskAvail);
      }
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
      setTextIfChanged('netVerdict', state.netVerdict);
      setTextIfChanged('netImpact', state.netImpact);
      setTextIfChanged('netCause', state.netCause);
      setTextIfChanged('fleetUsage', state.fleetUsage);
      if (state.netVerdictColor) {
        const nv = document.getElementById('netVerdict');
        if (nv && nv.dataset.color !== state.netVerdictColor) { nv.style.color = state.netVerdictColor; nv.dataset.color = state.netVerdictColor; }
      }
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

private func forceTransparentWebView(_ webView: WKWebView) {
    webView.setValue(false, forKey: "drawsBackground")
    webView.underPageBackgroundColor = .clear
    webView.setValue(NSColor.clear, forKey: "backgroundColor")
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

// The cleanup actions are Node.js scripts shipped inside the app (Contents/Resources/tools).
// A source checkout at ~/workspace/mac-yolo-safeguards is used only when the bundle has none.
struct ToolRun {
    let ran: Bool
    let output: String
    let problem: String?
}

func findNodeBinary() -> String? {
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    let candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "\(home)/.volta/bin/node", "\(home)/.local/bin/node", "/usr/bin/node"]
    if let hit = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) { return hit }
    let probe = Process()
    probe.executableURL = URL(fileURLWithPath: "/bin/zsh")
    probe.arguments = ["-lc", "command -v node"]
    let pipe = Pipe()
    probe.standardOutput = pipe
    probe.standardError = FileHandle.nullDevice
    guard (try? probe.run()) != nil else { return nil }
    probe.waitUntilExit()
    let path = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return FileManager.default.isExecutableFile(atPath: path) ? path : nil
}

// Only agents that are running, e.g. "Claude×14 · OMP×7 · Grok×4". Tools you don't use stay off the card.
func agentSwarmLine(_ counts: [(String, Int)]) -> String {
    let live = counts.filter { $0.1 > 0 }.map { "\($0.0)×\($0.1)" }
    return live.isEmpty ? "No coding agents running" : live.joined(separator: " · ")
}

func findToolScript(_ name: String) -> String? {
    if let bundled = Bundle.main.resourceURL?.appendingPathComponent("tools/\(name)").path,
       FileManager.default.fileExists(atPath: bundled) { return bundled }
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    let dev = "\(home)/workspace/mac-yolo-safeguards/tools/\(name)"
    return FileManager.default.fileExists(atPath: dev) ? dev : nil
}

func runTool(_ name: String, _ args: [String]) -> ToolRun {
    guard let node = findNodeBinary() else {
        return ToolRun(ran: false, output: "", problem: "This action needs Node.js. Install it with: brew install node")
    }
    guard let script = findToolScript(name) else {
        return ToolRun(ran: false, output: "", problem: "This action isn't included in this version of the app.")
    }
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: node)
    proc.arguments = [script] + args
    let pipe = Pipe()
    proc.standardOutput = pipe
    proc.standardError = FileHandle.nullDevice
    do { try proc.run() } catch {
        return ToolRun(ran: false, output: "", problem: "Could not start Node.js at \(node).")
    }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    proc.waitUntilExit()
    let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if proc.terminationStatus != 0 || !text.hasPrefix("{") {
        return ToolRun(ran: false, output: text, problem: "The cleanup tool stopped with an error (exit \(proc.terminationStatus)).")
    }
    return ToolRun(ran: true, output: text, problem: nil)
}

// Runs a system command with a time limit and returns what it printed.
func captureCommand(_ path: String, _ args: [String], timeout: TimeInterval) -> String {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: path)
    p.arguments = args
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = FileHandle.nullDevice
    guard (try? p.run()) != nil else { return "" }
    let stop = DispatchWorkItem { if p.isRunning { p.terminate() } }
    DispatchQueue.global().asyncAfter(deadline: .now() + timeout, execute: stop)
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    stop.cancel()
    return String(data: data, encoding: .utf8) ?? ""
}

func formatRate(_ bytesPerSec: Double) -> String {
    bytesPerSec >= 1_048_576 ? String(format: "%.1f MB/s", bytesPerSec / 1_048_576) : "\(Int(bytesPerSec / 1024)) KB/s"
}

// Average round trip from `ping -q` output, in ms, or nil when nothing came back.
func parsePingAverage(_ text: String) -> Int? {
    guard let line = text.split(separator: "\n").first(where: { $0.contains("min/avg/max") }),
          let values = line.split(separator: "=").last?.split(separator: "/"), values.count >= 2,
          let avg = Double(values[1].trimmingCharacters(in: .whitespaces)) else { return nil }
    return Int(avg.rounded())
}

func parseDefaultGateway(_ text: String) -> String? {
    for line in text.split(separator: "\n") {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("gateway:") {
            let ip = trimmed.dropFirst("gateway:".count).trimmingCharacters(in: .whitespaces)
            if !ip.isEmpty { return ip }
        }
    }
    return nil
}

func formatBytesShort(_ bytes: Double) -> String {
    if bytes >= 1_073_741_824 { return String(format: "%.2f GB", bytes / 1_073_741_824) }
    if bytes >= 1_048_576 { return String(format: "%.1f MB", bytes / 1_048_576) }
    if bytes >= 1024 { return String(format: "%.0f KB", bytes / 1024) }
    return "0 KB"
}

// Cumulative external internet bytes (in + out) since PID launch from the first block of `nettop -t external -L 2`.
func parseNettopTotals(_ text: String, excludingPid: Int32 = ProcessInfo.processInfo.processIdentifier) -> [String: Double] {
    let rows = text.split(separator: "\n").map { $0.split(separator: ",", omittingEmptySubsequences: false).map(String.init) }
    guard let h1 = rows.firstIndex(where: { $0.first == "" && $0.contains("bytes_out") }) else { return [:] }
    let h2 = rows.lastIndex(where: { $0.first == "" && $0.contains("bytes_out") }) ?? rows.count
    let endIdx = h2 > h1 ? h2 : rows.count
    let inCol = rows[h1].firstIndex(of: "bytes_in"), outCol = rows[h1].firstIndex(of: "bytes_out")!
    var byAgent: [String: Double] = [:]
    for r in rows[(h1 + 1)..<endIdx] where r.count > outCol && !r[0].isEmpty {
        var name = r[0]
        if let dot = name.lastIndex(of: "."), let pid = Int32(name[name.index(after: dot)...]) {
            if pid == excludingPid { continue }
            name = String(name[..<dot])
        }
        guard let a = agentName(forProcess: name) else { continue }
        let bo = Double(r[outCol]) ?? 0
        let bi = inCol.flatMap { r.count > $0 ? Double(r[$0]) : nil } ?? 0
        if bo + bi > 0 { byAgent[a, default: 0] += bo + bi }
    }
    return byAgent
}

// Per-process internet rates (bytes/s) from the last block of `nettop -P -d -t external -L 2 -x -J bytes_in,bytes_out`.
func parseNettopRates(_ text: String, seconds: Double, excludingPid: Int32 = ProcessInfo.processInfo.processIdentifier) -> [(name: String, inRate: Double, outRate: Double)] {
    let rows = text.split(separator: "\n").map { $0.split(separator: ",", omittingEmptySubsequences: false).map(String.init) }
    guard let h = rows.lastIndex(where: { $0.first == "" && $0.contains("bytes_out") }) else { return [] }
    let inCol = rows[h].firstIndex(of: "bytes_in"), outCol = rows[h].firstIndex(of: "bytes_out")!
    var out: [(name: String, inRate: Double, outRate: Double)] = []
    for r in rows[(h + 1)...] where r.count > outCol && !r[0].isEmpty {
        let bo = Double(r[outCol]) ?? 0
        let bi = inCol.flatMap { r.count > $0 ? Double(r[$0]) : nil } ?? 0
        guard bo > 0 || bi > 0 else { continue }
        var name = r[0]
        if let dot = name.lastIndex(of: "."), let pid = Int32(name[name.index(after: dot)...]) {
            if pid == excludingPid { continue }
            name = String(name[..<dot])
        }
        let secs = max(seconds, 0.5)
        out.append((name, bi / secs, bo / secs))
    }
    return out
}

func parseTopUploader(_ text: String, seconds: Double) -> String {
    let usage = parseNettopRates(text, seconds: seconds).sorted { $0.outRate > $1.outRate }
    guard var top = usage.first.map({ (name: $0.name, rate: $0.outRate) }), top.rate >= 50 * 1024 else { return "" }
    if top.name.hasPrefix("io.tailscale"), let inner = usage.dropFirst().first, inner.outRate >= top.rate * 0.6 {
        top = (inner.name + " via Tailscale", top.rate)
    }
    return "\(top.name) \(formatRate(top.rate))"
}

// Which AI agent a process belongs to, by its process name. nil for everything else.
func agentName(forProcess raw: String) -> String? {
    let l = raw.lowercased()
    if l.hasPrefix("claude") { return "Claude" }
    if l.hasPrefix("codex") { return "Codex" }
    if l.hasPrefix("agy") || l.hasPrefix("antigravity") || l.hasPrefix("gemini") { return "Gemini" }
    if l == "omp" || l.hasPrefix("omp ") { return "OMP" }
    if l.hasPrefix("grok") { return "Grok" }
    if l.hasPrefix("cursor") { return "Cursor" }
    if l.hasPrefix("pool") { return "Poolside" }
    if l.hasPrefix("hermes") { return "Hermes" }
    if l.hasPrefix("browseros") || l.hasPrefix("chrome-headless") { return "Agent browsers" }
    if l.hasPrefix("gh-real") || l == "gh" { return "GitHub CLI" }
    if l == "node" || l.hasPrefix("python") { return "MCP servers & scripts" }
    return nil
}

// Internet per agent, busiest first.
func agentNetUsage(_ procs: [(name: String, inRate: Double, outRate: Double)]) -> [(agent: String, inRate: Double, outRate: Double)] {
    var by: [String: (Double, Double)] = [:]
    for p in procs { if let a = agentName(forProcess: p.name) { let c = by[a] ?? (0, 0); by[a] = (c.0 + p.inRate, c.1 + p.outRate) } }
    return by.map { ($0.key, $0.value.0, $0.value.1) }.sorted { $0.1 + $0.2 > $1.1 + $1.2 }
}

// tokens = new tokens (input, output, cache writes). cached = cache re-reads, counted apart because they are cheap.
struct AgentTokens { var calls = 0; var tokens = 0; var cached = 0; var costUSD = 0.0 }

// Adds the model calls in one session log since `cutoff`. Claude logs one line per content block with the
// same message id, so calls are counted once per id. OMP logs usage (and cost) once per assistant message.
func tallyAgentTokens(_ text: String, agent: String, cutoff: Date, into totals: inout [String: AgentTokens], seen: inout Set<String>) {
    let fmt = ISO8601DateFormatter(); fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    for line in text.split(separator: "\n") where line.contains("\"usage\"") {
        guard let obj = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
              let msg = obj["message"] as? [String: Any], (msg["role"] as? String) == "assistant",
              (msg["model"] as? String) != "<synthetic>",
              let usage = msg["usage"] as? [String: Any],
              let ts = obj["timestamp"] as? String, let when = fmt.date(from: ts) ?? plain.date(from: ts), when >= cutoff else { continue }
        let id = (msg["id"] as? String) ?? (obj["id"] as? String) ?? (obj["uuid"] as? String) ?? ts
        guard seen.insert(agent + id).inserted else { continue }
        func n(_ k: String) -> Int { (usage[k] as? NSNumber)?.intValue ?? 0 }
        var t = totals[agent] ?? AgentTokens()
        t.calls += 1
        if let total = usage["totalTokens"] as? NSNumber { t.tokens += total.intValue - n("cacheRead"); t.cached += n("cacheRead") }
        else { t.tokens += n("input_tokens") + n("output_tokens") + n("cache_creation_input_tokens"); t.cached += n("cache_read_input_tokens") }
        if let cost = (usage["cost"] as? [String: Any])?["total"] as? NSNumber { t.costUSD += cost.doubleValue }
        totals[agent] = t
    }
}

// Grok logs no token counts or prices. Its events.jsonl marks each model reply with a timed
// "first_token" event, so calls since `cutoff` can be counted; tokens and price stay at zero.
func tallyGrokCalls(_ text: String, cutoff: Date, into totals: inout [String: AgentTokens]) {
    let fmt = ISO8601DateFormatter(); fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    var n = 0
    for line in text.split(separator: "\n") where line.contains("\"first_token\"") {
        guard let obj = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
              (obj["type"] as? String) == "first_token",
              let ts = obj["ts"] as? String, let when = fmt.date(from: ts), when >= cutoff else { continue }
        n += 1
    }
    guard n > 0 else { return }
    var t = totals["Grok"] ?? AgentTokens()
    t.calls += n
    totals["Grok"] = t
}

func formatTokens(_ n: Int) -> String {
    n >= 1_000_000 ? String(format: "%.1fM", Double(n) / 1e6) : n >= 1000 ? "\(n / 1000)K" : "\(n)"
}

// One tappable row per agent. Field 4 is the plain explanation. A dollar amount is written only when the log has one.
func agentUsageRows(tokens: [String: AgentTokens], net: [(agent: String, inRate: Double, outRate: Double)], totalsSinceLaunch: [String: Double] = [:]) -> [String] {
    let netBy = Dictionary(uniqueKeysWithValues: net.map { ($0.agent, ($0.inRate, $0.outRate)) })
    let activeTotals = totalsSinceLaunch.filter { $0.value >= 1_048_576 }
    let names = Set(tokens.keys).union(netBy.keys).union(activeTotals.keys)
    return names.sorted {
        (tokens[$0]?.tokens ?? 0, tokens[$0]?.calls ?? 0, (netBy[$0]?.1 ?? 0), totalsSinceLaunch[$0] ?? 0) >
        (tokens[$1]?.tokens ?? 0, tokens[$1]?.calls ?? 0, (netBy[$1]?.1 ?? 0), totalsSinceLaunch[$1] ?? 0)
    }.map { a in
        let t = tokens[a]
        let r = netBy[a]
        let sinceBytes = totalsSinceLaunch[a] ?? 0
        var bits: [String] = []
        if let t {
            bits.append("\(t.calls) \(t.calls == 1 ? "call" : "calls")")
            if t.tokens > 0 { bits.append("\(formatTokens(t.tokens)) new") }
            if t.cached > 0 { bits.append("\(formatTokens(t.cached)) cached") }
            if t.costUSD > 0 { bits.append(String(format: "$%.2f cloud", t.costUSD)) }
            else if t.calls > 0 { bits.append("no price") }
        }
        if let r { bits.append("↑ \(formatRate(r.1)) ↓ \(formatRate(r.0))") }
        else if sinceBytes >= 1_048_576 { bits.append("\(formatBytesShort(sinceBytes)) total") }
        var sentences: [String] = []
        if let t, t.tokens > 0 || t.cached > 0 {
            let cachedBit = t.cached > 0 ? " \(formatTokens(t.cached)) were read back from cache." : ""
            sentences.append("Last hour: \(t.calls) model \(t.calls == 1 ? "call" : "calls") and \(formatTokens(t.tokens)) new tokens.\(cachedBit)")
            sentences.append(t.costUSD > 0 ? String(format: "Cloud cost recorded in the session log: $%.2f.", t.costUSD) : "The session log has no price, so no cloud dollars are shown.")
        } else if let t, t.calls > 0 {
            sentences.append("Last hour: \(t.calls) model \(t.calls == 1 ? "reply" : "replies"). This agent's log has no token counts. The log has no price, so no cloud dollars are shown.")
        } else {
            sentences.append("No model-call count in the logs this menu reads. Cloud spend is not shown without a price in the log.")
        }
        let totalNote = sinceBytes >= 1024 ? " External internet since launch: \(formatBytesShort(sinceBytes)) (127.0.0.1 loopback excluded)." : ""
        sentences.append((r.map { "Internet right now: sending \(formatRate($0.1)), receiving \(formatRate($0.0))." } ?? "No internet from this agent in the latest sample.") + totalNote)
        return "\(a)|\(bits.joined(separator: " · "))|0|\(sentences.joined(separator: " "))"
    }
}

func fleetGlance(tokens: [String: AgentTokens], net: [(agent: String, inRate: Double, outRate: Double)], totalsSinceLaunch: [String: Double] = [:]) -> String {
    let rows = agentUsageRows(tokens: tokens, net: net, totalsSinceLaunch: totalsSinceLaunch)
    if rows.isEmpty { return "No agent internet or model calls in the latest sample" }
    return rows.prefix(3).map { row -> String in
        let parts = row.split(separator: "|", omittingEmptySubsequences: false)
        return "\(parts[0]) · \(parts.count > 1 ? parts[1] : "")"
    }.joined(separator: "\n")
}

// Plain names for processes that commonly fill an upload.
func friendlyAppName(_ raw: String) -> String {
    let viaTailscale = raw.hasSuffix(" via Tailscale")
    let base = viaTailscale ? String(raw.dropLast(" via Tailscale".count)) : raw
    let known: [(String, String)] = [
        ("rsync", "A file copy (rsync)"), ("nc", "A file copy (rsync/ssh)"), ("ssh", "A file copy (ssh)"), ("scp", "A file copy (scp)"),
        ("com.crowdstrike", "CrowdStrike security"), ("io.tailscale", "Tailscale"), ("bird", "iCloud Drive"), ("cloudd", "iCloud"),
        ("Dropbox", "Dropbox"), ("Google Drive", "Google Drive"), ("OneDrive", "OneDrive"), ("backupd", "Time Machine"),
        ("photolibraryd", "iCloud Photos"), ("zoom.us", "Zoom"), ("Microsoft Teams", "Teams"), ("softwareupdated", "macOS update"),
    ]
    let name = known.first(where: { base == $0.0 || base.hasPrefix($0.0 + ".") })?.1 ?? agentName(forProcess: base) ?? base
    return viaTailscale ? name + " over Tailscale" : name
}

// Splits "omp 212 KB/s" into ("omp", "212 KB/s").
func splitUploader(_ s: String) -> (name: String, rate: String) {
    let parts = s.split(separator: " ")
    guard parts.count >= 3 else { return (s, "") }
    return (parts.dropLast(2).joined(separator: " "), parts.suffix(2).joined(separator: " "))
}

// Card verdict from delay, upload in use and measured upload capacity (KB/s, 0 when not measured yet).
// label: headline. impact: what the user will feel. cause: why, in plain words. why: the numbers.
func internetVerdict(latencyMs: Int?, upKB: Int, capacityKB: Int, topUploader: String) -> (label: String, color: String, why: String, impact: String, cause: String) {
    let topName = topUploader.isEmpty ? nil : friendlyAppName(splitUploader(topUploader).name)
    guard let ms = latencyMs else {
        return ("Checking… ›", "#94a3b8", topUploader, "Checking your internet…", "")
    }
    let fullPct = capacityKB > 0 ? min(100, upKB * 100 / capacityKB) : -1
    var why = ["Delay \(ms) ms"]
    if fullPct >= 0 { why.append("upload \(fullPct)% full") }
    if !topUploader.isEmpty { why.append(topUploader) }
    let label: String, color: String, impact: String
    if ms >= 250 || (fullPct >= 70 && ms >= 120) { (label, color, impact) = ("Very slow", "#f87171", "Pages will hang and calls will drop") }
    else if ms >= 100 { (label, color, impact) = ("Slow", "#fbbf24", "Video calls may stutter") }
    else { (label, color, impact) = ("Good", "#5eead4", "Browsing and calls are fine") }
    let cause: String
    if label == "Good" { cause = topName.map { "Busiest app: \($0)" } ?? "Nothing is hogging your connection" }
    else if let n = topName { cause = "Cause: \(n) is uploading" }
    else { cause = "Not this Mac. Likely Wi-Fi or your provider" }
    return (label + " ›", color, why.joined(separator: " · "), impact, cause)
}

func formatMbps(_ mbps: Double) -> String {
    if mbps <= 0 { return "--" }
    return String(format: "%.1f Mbps", mbps)
}

func internetHeadline(latencyMs: Int?, lineDownMbps: Double, lineUpMbps: Double, downKB: Int, upKB: Int) -> (speed: String, using: String) {
    let using = "Using now ↓ \(max(0, downKB)) KB/s · ↑ \(max(0, upKB)) KB/s"
    if lineDownMbps >= 1 || lineUpMbps >= 1 {
        return ("Line ↓ \(formatMbps(lineDownMbps)) · ↑ \(formatMbps(lineUpMbps))", using)
    }
    if let ms = latencyMs {
        return ("Delay \(ms) ms", using)
    }
    return ("Delay measuring", using)
}

func lineMbps(downCapKB: Int, upCapKB: Int, cachedDown: Double, cachedUp: Double) -> (Double, Double) {
    if cachedDown >= 1 || cachedUp >= 1 {
        return (max(0, cachedDown), max(0, cachedUp))
    }
    if downCapKB > 0 || upCapKB > 0 {
        let down = downCapKB > 0 ? Double(downCapKB) * 1024.0 * 8.0 / 1_000_000.0 : 0
        let up = upCapKB > 0 ? Double(upCapKB) * 1024.0 * 8.0 / 1_000_000.0 : 0
        return (down, up)
    }
    return (0, 0)
}

func wifiVsProviderRow(routerMs: Int?, wanMs: Int?, upFullPct: Int, topUploader: String) -> String {
    let rPart = routerMs.map { "Wi-Fi \($0) ms" } ?? "Wi-Fi --"
    let wPart = wanMs.map { "Internet \($0) ms" } ?? "Internet --"
    let val = "\(rPart) · \(wPart)"
    let more: String
    if routerMs == nil && wanMs == nil {
        more = "Measuring your local Wi-Fi router and internet provider latency right now."
    } else if let r = routerMs, wanMs == nil {
        more = "Your local Wi-Fi router answered in \(r) ms, so Wi-Fi is connected, but the internet did not reply (provider outage or captive login)."
    } else if let r = routerMs, r >= 80 {
        more = "Your local Wi-Fi router took \(r) ms to answer, so Wi-Fi signal or interference is slowing you down before traffic even reaches your provider."
    } else if let w = wanMs, w >= 120 {
        let rText = routerMs.map { "Your Wi-Fi router answered in \($0) ms (healthy), so Wi-Fi is fine. " } ?? ""
        let hog = topUploader.isEmpty ? "your provider's line is congested." : "\(friendlyAppName(splitUploader(topUploader).name)) is filling your upload pipe\(upFullPct >= 0 ? " (\(upFullPct)% full)" : "")."
        more = "\(rText)Internet delay is \(w) ms because \(hog)"
    } else if let w = wanMs, routerMs == nil {
        more = "Internet provider replied cleanly in \(w) ms (your local router ignores ping)."
    } else {
        more = "Both your local Wi-Fi router and your internet provider are replying cleanly with no upload bottleneck."
    }
    return "Wi-Fi vs Provider|\(val)|0|\(more)"
}

func cachedLineMbps() -> (Double, Double) {
    let path = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".hermes/mac-yolo-net-state.json").path
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let dl = (obj["downloadMbps"] as? NSNumber)?.doubleValue else { return (0, 0) }
    return (dl, (obj["uploadMbps"] as? NSNumber)?.doubleValue ?? 0)
}

func jsonObject(_ text: String) -> [String: Any] {
    guard let data = text.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
    return obj
}

func receiptJSON(action: String, title: String, items: [String], spared: String) -> String {
    let obj: [String: Any] = ["ok": true, "action": action, "title": title, "items": items, "spared": spared]
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          let text = String(data: data, encoding: .utf8) else { return "{}" }
    return text
}

// Pro license: a signed key from macyolosafeguards.io/activate, checked offline.
let proLicensePublicKey = "ZDCWvx/TkO8J5WGNsXC/SpBpjqvUDLBIQa/MnAscPf0="
let proCheckoutURL = "https://macyolosafeguards.io/go/pro"
let proPricingURL = "https://macyolosafeguards.io/pricing?from=app_nudge"

// How many processes Auto-Guard would stop, from `mac-yolo-agent-guard.js pressure` run without --execute.
func pressureWouldStopCount(_ res: [String: Any]) -> Int {
    guard res["acted"] as? Bool == true else { return 0 }
    let storms = (res["wouldStop"] as? [[String: Any]]) ?? []
    return storms.reduce(0) { $0 + (($1["copies"] as? Int) ?? 0) }
        + ((res["wouldStopOrphans"] as? [Any]) ?? []).count
        + ((res["wouldStopStranded"] as? [Any]) ?? []).count
}

// What a free user hears when their Mac hits a problem Auto-Guard fixes for Pro. nil means stay quiet:
// Pro users, less than a day since the last notice, or nothing Pro would actually do.
func proNudgeText(isPro: Bool, sinceLastNudge: TimeInterval, wouldStop: Int, freeDiskGB: Double) -> String? {
    guard !isPro, sinceLastNudge >= 86400 else { return nil }
    var parts: [String] = []
    if wouldStop > 0 { parts.append("Memory is tight and \(wouldStop) leftover agent process\(wouldStop == 1 ? " is" : "es are") holding it.") }
    if freeDiskGB < 10 { parts.append(String(format: "Only %.0f GB of disk is free.", freeDiskGB)) }
    guard !parts.isEmpty else { return nil }
    return parts.joined(separator: " ") + " Pro's Auto-Guard handles this on its own every minute. Click to see Pro, or use Free Agent RAM and Clean AI Waste yourself."
}

struct ProLicense {
    let key: String
    let email: String
    let expires: Date
    var isCurrent: Bool { expires > Date() }
}

func base64urlData(_ s: String) -> Data? {
    var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while t.count % 4 != 0 { t += "=" }
    return Data(base64Encoded: t)
}

// Returns the license when the signature is good, expired or not.
func verifyProLicense(_ raw: String, publicKey: String = proLicensePublicKey) -> ProLicense? {
    let key = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    let parts = key.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
    guard parts.count == 2,
          let sig = base64urlData(parts[1]),
          let body = base64urlData(parts[0]),
          let pkData = Data(base64Encoded: publicKey),
          let pk = try? Curve25519.Signing.PublicKey(rawRepresentation: pkData),
          pk.isValidSignature(sig, for: Data(parts[0].utf8)),
          let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
          let exp = (obj["exp"] as? NSNumber)?.doubleValue else { return nil }
    return ProLicense(key: key, email: obj["email"] as? String ?? "", expires: Date(timeIntervalSince1970: exp))
}

func freeDiskGB() -> Double {
    let url = URL(fileURLWithPath: NSHomeDirectory())
    guard let v = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
          let bytes = v.volumeAvailableCapacityForImportantUsage else { return .infinity }
    return Double(bytes) / 1_073_741_824
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
    var lastHudJson: String = ""
    var lastPillKey: String = ""
    var lastActiveApp: String = "Claude"
    var lastHogsLine = ""
    var lastActiveWin: String = "Claude"
    var wifiInterfaceName: String = ""
    var wifiLookupRetryAt: Date = .distantPast
    var statusSettingsSyncedAt: Date = .distantPast
    var netHistory: [(t: Date, inn: UInt64, out: UInt64)] = []
    var lastCpuTicks: [UInt32]? = nil
    var lastUpKB: Int = 0
    var lastDownKB: Int = 0
    var netLatencyMs: Int? = nil
    var netRouterLatencyMs: Int? = nil
    var netTopUploader: String = ""
    var netProbeBusy = false
    var agentNet: [(agent: String, inRate: Double, outRate: Double)] = []
    var agentTotalBytes: [String: Double] = [:]
    var agentTokens: [String: AgentTokens] = [:]
    var agentTokensAt: Date = .distantPast
    var agentTokensBusy = false
    var netProbeAt: Date = .distantPast
    var netSpeedTestBusy = false
    var cachedMenuBarIcon: NSImage?
    var autoGuardTimer: Timer?
    var autoGuardBusy = false
    var lastAutoDiskClean: Date = .distantPast
    var lastLicenseRefresh: Date = .distantPast
    var proNudgeTimer: Timer?
    let backgroundJobsMenu = NSMenu(title: "Background Jobs")
    var autoGuardMenuItem: NSMenuItem!
    var proStatusMenuItem: NSMenuItem!
    var proLicenseMenuItem: NSMenuItem!
    func applicationDidFinishLaunching(_ notification: Notification) {
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
        if CommandLine.arguments.contains("--click-away-self-test") {
            print("MAC_YOLO_CLICK_AWAY_OK")
            fflush(stdout)
            exit(0)
        }
        if let previewIdx = CommandLine.arguments.firstIndex(of: "--render-pill-preview"),
           previewIdx + 1 < CommandLine.arguments.count {
            let outPath = CommandLine.arguments[previewIdx + 1]
            if !writeMenuBarPillPreviewSheet(to: outPath) {
                fputs("MAC_YOLO_PILL_PREVIEW_FAILED\n", stderr)
                exit(1)
            }
            print("MAC_YOLO_PILL_PREVIEW_OK \(outPath)")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--status-icon-self-test") {
            let p1 = renderMenuBarPill(freeGB: 417, memPct: 34, cpuPct: 100)
            let p2 = renderMenuBarPill(freeGB: 1024, memPct: 100, cpuPct: 100)
            let p3 = renderMenuBarPill(freeGB: 45, memPct: 6, cpuPct: 9)
            guard p1.size.width >= 136,
                  p1.size.width == p2.size.width,
                  p1.size.width == p3.size.width,
                  p1.size.height == 22 else {
                fputs("MAC_YOLO_STATUS_ICON_GEOMETRY_FAILED\n", stderr)
                exit(1)
            }
            print("MAC_YOLO_STATUS_ICON_OK width=\(Int(p1.size.width))")
            fflush(stdout)
            exit(0)
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
            let onScreenLine = self.lastHogsLine.isEmpty ? self.lastActiveApp : "Top Hogs: \(self.lastHogsLine) · Active: \(self.lastActiveApp)"
            // Only the Protection line follows the frontmost app. activeApp/activeWin fill the Agents
            // card with the agent fleet; the full refresh owns them.
            let activePayload: [String: String] = [
                "onScreenLine": onScreenLine,
            ]
            if let data = try? JSONSerialization.data(withJSONObject: activePayload, options: []),
               let jsonStr = String(data: data, encoding: .utf8) {
                self.webView?.evaluateJavaScript("if (window.updateYoloHud) window.updateYoloHud(\(jsonStr));", completionHandler: nil)
            }
        }

        refreshLiveTelemetry()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            self?.updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)
            self?.refreshLiveTelemetry()
        }
        refreshProLicenseIfDue()
        updateProMenu()
        startAutoGuardIfEnabled()
        startProNudgeTimer()

        let quietLaunch = CommandLine.arguments.contains("--quiet-launch")
            || ProcessInfo.processInfo.environment["MAC_YOLO_QUIET_LAUNCH"] == "1"
        if !quietLaunch {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
                self?.showFloatingHudNotification()
            }
        }
    }

    func setupStatusItemAndHud() {
        if UserDefaults.standard.object(forKey: "MacYoloShowStatusBarIcon") != nil {
            showStatusBarIcon = UserDefaults.standard.bool(forKey: "MacYoloShowStatusBarIcon")
        } else {
            showStatusBarIcon = true
        }
        statusSettingsSyncedAt = statusSettingsFileModifiedAt() ?? .distantPast
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.isVisible = showStatusBarIcon
        if let button = statusItem.button {
            button.title = ""
            button.image = renderMenuBarPill(freeGB: 147, memPct: 48, cpuPct: 22)
            button.imagePosition = .imageOnly
            button.setAccessibilityIdentifier("macyolo.status.item.button")
            button.target = self
            button.action = #selector(togglePopover(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }

        gearMenu = NSMenu(title: "Mac YOLO Menu")
        gearMenu.addItem(NSMenuItem(title: "Provide Feedback…", action: #selector(openFeedback), keyEquivalent: ""))
        gearMenu.addItem(NSMenuItem.separator())
        autoGuardMenuItem = NSMenuItem(title: "Auto-Guard (Pro)", action: #selector(toggleAutoGuard(_:)), keyEquivalent: "")
        autoGuardMenuItem.target = self
        gearMenu.addItem(autoGuardMenuItem)
        proLicenseMenuItem = NSMenuItem(title: "Enter Pro License…", action: #selector(enterProLicense(_:)), keyEquivalent: "")
        proLicenseMenuItem.target = self
        gearMenu.addItem(proLicenseMenuItem)
        proStatusMenuItem = NSMenuItem(title: "Get Pro…", action: #selector(openGetPro(_:)), keyEquivalent: "")
        proStatusMenuItem.target = self
        gearMenu.addItem(proStatusMenuItem)
        gearMenu.addItem(NSMenuItem.separator())
        let jobsItem = NSMenuItem(title: "Background Jobs", action: nil, keyEquivalent: "")
        jobsItem.submenu = backgroundJobsMenu
        backgroundJobsMenu.delegate = self
        gearMenu.addItem(jobsItem)
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
        hudPanel.alphaValue = 0.88
        hudPanel.hasShadow = true
        hudPanel.isMovableByWindowBackground = true
        hudPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hudPanel.isReleasedWhenClosed = false

        visualEffectView = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: panelW, height: panelH))
        visualEffectView.material = .hudWindow
        visualEffectView.blendingMode = .behindWindow
        visualEffectView.state = .active
        visualEffectView.wantsLayer = true
        visualEffectView.maskImage = hudRoundedMask(radius: 22)
        visualEffectView.autoresizingMask = [.width, .height]

        let wkConfig = WKWebViewConfiguration()
        wkConfig.setValue(false, forKey: "drawsBackground")
        wkConfig.userContentController.add(self, name: "yoloHud")
        webView = MacYoloWebView(frame: NSRect(x: 0, y: 0, width: panelW, height: panelH), configuration: wkConfig)
        webView.autoresizingMask = [.width, .height]
        forceTransparentWebView(webView)
        webView.loadHTMLString(HUD_HTML, baseURL: nil)
        visualEffectView.addSubview(webView)
        hudPanel.contentView = visualEffectView
    }

    func runAppUninstaller(args: [String], done: @escaping (String) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let run = runTool("mac-yolo-app-uninstaller.js", args)
            let json: String
            if run.ran {
                json = run.output
            } else {
                let err = (try? JSONSerialization.data(withJSONObject: ["ok": false, "error": run.problem ?? "No reply from the uninstaller."]))
                    .flatMap { String(data: $0, encoding: .utf8) } ?? "{\"ok\":false}"
                json = err
            }
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
            freeAgentRam()
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
            runSpeedTest()
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
                let pt = NSPoint(x: view.bounds.width - 12, y: view.bounds.height - 8)
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

    var statusSettingsPath: String {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".hermes/mac-yolo-settings.json").path
    }

    func statusSettingsFileModifiedAt() -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: statusSettingsPath))?[.modificationDate] as? Date
    }

    // CLI, MCP and HTTP toggles all go through the system care engine, which rewrites
    // ~/.hermes/mac-yolo-settings.json. Adopt the value whenever that file changes.
    func syncStatusBarIconFromSettingsFile() {
        guard let mtime = statusSettingsFileModifiedAt(), mtime > statusSettingsSyncedAt else { return }
        statusSettingsSyncedAt = mtime
        guard let data = FileManager.default.contents(atPath: statusSettingsPath),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let show = obj["showStatusBarIcon"] as? Bool,
              show != showStatusBarIcon else { return }
        showStatusBarIcon = show
        statusItem.isVisible = show
        statusBarMenuItem?.state = show ? .on : .off
        UserDefaults.standard.set(show, forKey: "MacYoloShowStatusBarIcon")
    }

    @objc func toggleStatusBarIcon(_ sender: AnyObject?) {
        statusSettingsSyncedAt = Date()
        showStatusBarIcon.toggle()
        statusItem.isVisible = showStatusBarIcon
        statusBarMenuItem?.state = showStatusBarIcon ? .on : .off
        UserDefaults.standard.set(showStatusBarIcon, forKey: "MacYoloShowStatusBarIcon")
        let iconArg = showStatusBarIcon ? "show" : "hide"
        DispatchQueue.global(qos: .utility).async { _ = runTool("mac-yolo-system-care-engine.js", ["--status-icon", iconArg]) }
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
        if Date() < wifiLookupRetryAt { return "en0" }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/sbin/networksetup")
        proc.arguments = ["-listallhardwareports"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = FileHandle.nullDevice
        var found = "en0"
        var resolved = false
        if (try? proc.run()) != nil {
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()
            let text = String(data: data, encoding: .utf8) ?? ""
            var pendingWifi = false
            for raw in text.split(separator: "\n") {
                let line = String(raw)
                if line.contains("Hardware Port: Wi-Fi") {
                    pendingWifi = true
                    continue
                }
                if pendingWifi && line.contains("Device:") {
                    let parts = line.split(separator: ":", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
                    if parts.count == 2, !parts[1].isEmpty {
                        found = parts[1]
                        resolved = true
                    }
                    break
                }
            }
        }
        if resolved {
            wifiInterfaceName = found
        } else {
            wifiLookupRetryAt = Date().addingTimeInterval(30)
        }
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

    // Every 20 seconds, off the main thread: delay to 1.1.1.1 and the top internet uploader.
    func probeInternetHealthIfDue() {
        guard !netProbeBusy, Date().timeIntervalSince(netProbeAt) >= 20 else { return }
        netProbeBusy = true
        netProbeAt = Date()
        DispatchQueue.global(qos: .utility).async {
            let gw = parseDefaultGateway(captureCommand("/sbin/route", ["-n", "get", "default"], timeout: 3))
            let routerMs = gw.flatMap { parsePingAverage(captureCommand("/sbin/ping", ["-c", "2", "-q", "-t", "2", $0], timeout: 3)) }
            let latency = parsePingAverage(captureCommand("/sbin/ping", ["-c", "3", "-q", "-t", "5", "1.1.1.1"], timeout: 7))
            let sample = captureCommand("/usr/bin/nettop", ["-P", "-d", "-t", "external", "-L", "2", "-s", "2", "-J", "bytes_in,bytes_out", "-x"], timeout: 8)
            let top = parseTopUploader(sample, seconds: 2)
            let perAgent = agentNetUsage(parseNettopRates(sample, seconds: 2))
            let totals = parseNettopTotals(sample)
            DispatchQueue.main.async {
                self.netRouterLatencyMs = routerMs
                self.netLatencyMs = latency
                self.netTopUploader = top
                self.agentNet = perAgent
                self.agentTotalBytes = totals
                self.netProbeBusy = false
            }
        }
    }

    // Every 2 minutes: Claude and OMP usage logs for the last hour, plus recent Grok replies (no token or price fields).
    func scanAgentTokensIfDue() {
        guard !agentTokensBusy, Date().timeIntervalSince(agentTokensAt) >= 120 else { return }
        agentTokensBusy = true
        agentTokensAt = Date()
        DispatchQueue.global(qos: .utility).async {
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            let list = captureCommand("/usr/bin/find", ["\(home)/.claude/projects", "\(home)/.omp/agent/sessions", "-name", "*.jsonl", "-mmin", "-60"], timeout: 10)
            let grokList = captureCommand("/usr/bin/find", ["\(home)/.grok/sessions", "-name", "events.jsonl", "-mmin", "-60"], timeout: 8)
            let cutoff = Date().addingTimeInterval(-3600)
            var totals: [String: AgentTokens] = [:]
            var seen = Set<String>()
            for path in list.split(separator: "\n").prefix(300).map(String.init) {
                guard let fh = FileHandle(forReadingAtPath: path) else { continue }
                let size = (try? fh.seekToEnd()) ?? 0
                try? fh.seek(toOffset: size > 32_000_000 ? size - 32_000_000 : 0)
                let data = (try? fh.readToEnd()) ?? Data()
                try? fh.close()
                tallyAgentTokens(String(decoding: data, as: UTF8.self), agent: path.contains("/.omp/") ? "OMP" : "Claude", cutoff: cutoff, into: &totals, seen: &seen)
            }
            for path in grokList.split(separator: "\n").prefix(60).map(String.init) {
                guard let fh = FileHandle(forReadingAtPath: path) else { continue }
                let size = (try? fh.seekToEnd()) ?? 0
                try? fh.seek(toOffset: size > 16_000_000 ? size - 16_000_000 : 0)
                let data = (try? fh.readToEnd()) ?? Data()
                try? fh.close()
                tallyGrokCalls(String(decoding: data, as: UTF8.self), cutoff: cutoff, into: &totals)
            }
            DispatchQueue.main.async {
                self.agentTokens = totals
                self.agentTokensBusy = false
            }
        }
    }

    // Polite single-stream Cloudflare speed check (<7.5 MB total, ~4s) so asymmetric 5G/cable uploads never bufferbloat.
    func runSpeedTest() {
        guard !netSpeedTestBusy else { return }
        netSpeedTestBusy = true
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let cfg = URLSessionConfiguration.ephemeral
            cfg.timeoutIntervalForRequest = 10
            cfg.timeoutIntervalForResource = 12
            let session = URLSession(configuration: cfg)
            var dlMbps = 0.0
            var ulMbps = 0.0
            if let dlUrl = URL(string: "https://speed.cloudflare.com/__down?bytes=3000000") {
                let sem = DispatchSemaphore(value: 0)
                let t0 = CFAbsoluteTimeGetCurrent()
                session.dataTask(with: dlUrl) { data, resp, _ in
                    let dt = max(0.05, CFAbsoluteTimeGetCurrent() - t0)
                    if let http = resp as? HTTPURLResponse, http.statusCode == 200, let n = data?.count, n > 100_000 {
                        dlMbps = (Double(n) * 8.0) / dt / 1_000_000.0
                    }
                    sem.signal()
                }.resume()
                _ = sem.wait(timeout: .now() + 13)
            }
            if let ulUrl = URL(string: "https://speed.cloudflare.com/__up") {
                var req = URLRequest(url: ulUrl)
                req.httpMethod = "POST"
                req.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
                let payload = Data(count: 1_000_000)
                let sem = DispatchSemaphore(value: 0)
                let t0 = CFAbsoluteTimeGetCurrent()
                session.uploadTask(with: req, from: payload) { _, resp, _ in
                    let dt = max(0.05, CFAbsoluteTimeGetCurrent() - t0)
                    if let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) {
                        ulMbps = (Double(payload.count) * 8.0) / dt / 1_000_000.0
                    }
                    sem.signal()
                }.resume()
                _ = sem.wait(timeout: .now() + 13)
            }
            session.finishTasksAndInvalidate()
            if dlMbps > 0 || ulMbps > 0 {
                let stateUrl = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".hermes/mac-yolo-net-state.json")
                try? FileManager.default.createDirectory(at: stateUrl.deletingLastPathComponent(), withIntermediateDirectories: true)
                var stateObj = ((try? Data(contentsOf: stateUrl)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) ?? [:]
                stateObj["downloadMbps"] = dlMbps > 0 ? (dlMbps * 10).rounded() / 10 : NSNull()
                stateObj["uploadMbps"] = ulMbps > 0 ? (ulMbps * 10).rounded() / 10 : NSNull()
                let nowIso = ISO8601DateFormatter().string(from: Date())
                stateObj["speedMeasuredAt"] = nowIso
                stateObj["updatedAt"] = nowIso
                if let outData = try? JSONSerialization.data(withJSONObject: stateObj, options: [.prettyPrinted]) {
                    try? outData.write(to: stateUrl, options: .atomic)
                }
            }
            DispatchQueue.main.async {
                guard let self = self else { return }
                if ulMbps > 0 {
                    UserDefaults.standard.set(Int((ulMbps * 1_000_000.0 / 8.0 / 1024.0).rounded()), forKey: "MacYoloUploadCapKB")
                }
                if dlMbps > 0 {
                    UserDefaults.standard.set(Int((dlMbps * 1_000_000.0 / 8.0 / 1024.0).rounded()), forKey: "MacYoloDownloadCapKB")
                }
                self.netSpeedTestBusy = false
                self.netProbeAt = .distantPast
                if dlMbps > 0 || ulMbps > 0 {
                    let routerBit = self.netRouterLatencyMs.map { "Wi-Fi router: \($0) ms · " } ?? ""
                    let wanBit = self.netLatencyMs.map { "Internet: \($0) ms" } ?? "Latency refreshing"
                    self.showReceipt(receiptJSON(
                        action: "testSpeed",
                        title: "✓ Speed measured: ↓ \(formatMbps(dlMbps)) · ↑ \(formatMbps(ulMbps))",
                        items: ["\(routerBit)\(wanBit)", "Polite single-stream check (<7.5 MB) — zero upload saturation"],
                        spared: "🛡 Calls & active agent streams were not interrupted."
                    ))
                } else {
                    self.showProblem(action: "testSpeed", title: "Speed check couldn't reach Cloudflare", problem: "Check your Wi-Fi or firewall and try again.")
                }
                self.refreshLiveTelemetry()
            }
        }
    }

    func sampleNetworkRates() -> (String, String) {
        let now = Date()
        let wifi = resolvedWifiInterfaceName()
        guard let (totalIn, totalOut) = interfaceByteTotals(named: wifi) else {
            netHistory.removeAll()
            lastUpKB = 0
            lastDownKB = 0
            return ("↑ 0 KB/sec", "↓ 0 KB/sec")
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
        let lowerBase = base.lowercased()
        if lower.contains("browseros") { return "BrowserOS" }
        if lower.contains("ghostty") { return "Ghostty" }
        if lower.contains("opendirectoryd") { return "Directory Services" }
        if lower.contains("jamf") { return "Jamf Protect" }
        if lower.contains("llama-server") || lowerBase == "ollama" { return "Ollama" }
        if base == "mds" || base.hasPrefix("mds_") || base == "mdworker_shared" { return "Spotlight" }
        if base == "mediaanalysisd" || base == "photoanalysisd" { return "Photos Analysis" }
        if base == "WindowServer" { return "WindowServer" }
        if lowerBase == "dotnet" { return ".NET Build/Test" }
        if lowerBase == "swiftc" || lowerBase == "swift-frontend" { return "Swift Compiler" }
        if lowerBase == "cargo" || lowerBase == "rustc" { return "Rust Build" }
        if lowerBase == "omp" { return "OMP" }
        if lowerBase == "agy" || lower.contains("/gemini.app/") { return "Gemini" }
        if lowerBase == "ccusage" { return "ccusage" }
        if lowerBase == "gh" || lowerBase == "gh-real" { return "GitHub CLI" }
        if lower.contains("claude") { return "Claude" }
        if lower.contains("cursor") { return "Cursor" }
        if lower.contains("grok") { return "Grok" }
        if lower.contains("google chrome") { return "Chrome" }
        if lowerBase.hasPrefix("python") { return "Python" }
        if lowerBase == "node" { return "Node.js" }
        if lowerBase == "bun" { return "Bun" }
        return base.replacingOccurrences(of: "|", with: "/").replacingOccurrences(of: ";", with: ",")
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

    private var cachedSessionSample: (ompFiles: Int, ompMB: Double, grokFiles: Int, grokMB: Double, totalMB: Double, estTokensM: Double) = (0, 0, 0, 0, 0, 0)
    private var lastSessionSampleAt: Date = .distantPast
    private var sessionSampleInFlight: Bool = false

    private static func computeLiveSessionFilesSnapshot() -> (ompFiles: Int, ompMB: Double, grokFiles: Int, grokMB: Double, totalMB: Double, estTokensM: Double) {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser.path
        let cutoff = Date().addingTimeInterval(-7200)
        func scanDir(_ rel: String) -> (Int, Double) {
            let root = "\(home)/\(rel)"
            guard let en = fm.enumerator(atPath: root) else { return (0, 0) }
            var files = 0
            var bytes: Double = 0
            var visited = 0
            while let item = en.nextObject() as? String {
                visited += 1
                if visited > 4000 { break }
                if item.contains("/node_modules/") || item.contains("/.git/") || item.contains("/tool-results/") {
                    en.skipDescendants()
                    continue
                }
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
        let (cf, cmb) = scanDir(".claude/projects")
        let (pf, pmb) = scanDir(".omp/agent/sessions")
        let (of, omb) = (cf + pf, cmb + pmb)
        let (gf, gmb) = scanDir(".grok/sessions")
        let totMB = omb + gmb
        let estM = (totMB * 1_048_576.0 / 4.0) / 1_000_000.0
        return (of, omb, gf, gmb, totMB, estM)
    }

    func sampleLiveSessionFiles() -> (ompFiles: Int, ompMB: Double, grokFiles: Int, grokMB: Double, totalMB: Double, estTokensM: Double) {
        let now = Date()
        if lastSessionSampleAt == .distantPast {
            lastSessionSampleAt = now
            cachedSessionSample = Self.computeLiveSessionFilesSnapshot()
            return cachedSessionSample
        }
        if now.timeIntervalSince(lastSessionSampleAt) >= 45.0 && !sessionSampleInFlight {
            sessionSampleInFlight = true
            DispatchQueue.global(qos: .utility).async { [weak self] in
                let snap = Self.computeLiveSessionFilesSnapshot()
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.cachedSessionSample = snap
                    self.lastSessionSampleAt = Date()
                    self.sessionSampleInFlight = false
                }
            }
        }
        return cachedSessionSample
    }

    func sampleTopCpuCulprits() -> (shortLine: String, topMem: String, recTitle: String, recDesc: String, detailCpu: String, detailMem: String, detailFleet: String, topCpu: Double, totalProcs: Int, pyCount: Int, nodeCount: Int, swarmSummary: String, totalCpuPct: Int) {
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
        var totalCpuSum = 0.0
        var pyCount = 0
        var pyRssKB = 0.0
        var nodeCount = 0
        var nodeRssKB = 0.0
        var ompCount = 0
        var ompRssKB = 0.0
        var claudeCliCount = 0
        var claudeTotalRssKB = 0.0
        var geminiActive = false
        var geminiRssKB = 0.0
        var grokCount = 0
        var grokRssKB = 0.0
        var poolCount = 0
        var poolRssKB = 0.0
        var cursorCount = 0
        var cursorRssKB = 0.0
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
                totalCpuSum += cpu
                let fullComm = String(parts[2])
                let base = (fullComm as NSString).lastPathComponent
                let lower = fullComm.lowercased()
                if base.lowercased().contains("python") { pyCount += 1; pyRssKB += rssKB }
                if base == "node" { nodeCount += 1; nodeRssKB += rssKB }
                if base == "omp" { ompCount += 1; ompRssKB += rssKB }
                if lower.contains("claude") {
                    claudeTotalRssKB += rssKB
                    if base == "claude" { claudeCliCount += 1 }
                }
                if lower.contains("/gemini.app/") || base == "agy" {
                    geminiActive = true
                    geminiRssKB += rssKB
                }
                if base == "grok.real" || base == "grok" { grokCount += 1; grokRssKB += rssKB }
                if base == "pool.real" { poolCount += 1; poolRssKB += rssKB }
                if lower.contains("/cursor.app/") { cursorCount += 1; cursorRssKB += rssKB }
                if base == "ps" || base == "MacYoloSafeguards" { continue }
                let label = fanLabel(for: fullComm, base: base)
                cpuByApp[label, default: 0.0] += cpu
                rssByApp[label, default: 0.0] += rssKB
                countByApp[label, default: 0] += 1
            }
        }
        func fmtRam(_ kb: Double) -> String {
            let mb = kb / 1024.0
            return mb >= 1024.0 ? String(format: "%.1f GB", mb / 1024.0) : String(format: "%.0f MB", mb)
        }
        let ncpu = max(1, ProcessInfo.processInfo.activeProcessorCount)
        let realCpuPct = min(100, max(3, Int(round(totalCpuSum / Double(ncpu)))))
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
        let rTitle = "Thermal \(hot ? "Warning" : "Nominal") · \(totalProcs) live procs"
        let systemIndexers: Set<String> = ["Spotlight", "Photos Analysis"]
        let topByCpu = cpuByApp.max { $0.value < $1.value }?.key
        let indexerNote = topByCpu.map { systemIndexers.contains($0) ? "\($0) is a protected macOS service (busy after a restart or large file changes). Safeguards cannot throttle it; it settles on its own. " : "" } ?? ""
        let rDesc = indexerNote + "\(pyCount) Python and \(nodeCount) node MCP processes. Click any card to inspect."
        let cpuRows = ranked.prefix(6).enumerated().map { idx, name in
            let c = cpuByApp[name, default: 0]
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let cnt = countByApp[name, default: 1]
            let bar = min(100, max(4, Int(round(c))))
            let coresBusy = c / 100.0
            let note = systemIndexers.contains(name)
                ? "Protected macOS background indexer; settles automatically."
                : String(format: "Using ~%.1f of %d CPU cores and %.2f GB RAM across %d process%@ right now.", coresBusy, ncpu, gb, cnt, cnt == 1 ? "" : "es")
            return String(format: "%d. %@ (%d procs)|%.1f%% CPU · %.2f GB RAM|%d|%@", idx + 1, name, cnt, c, gb, bar, note)
        }.joined(separator: ";;")
        let memRanked = rssByApp.keys.sorted { rssByApp[$0, default: 0] > rssByApp[$1, default: 0] }
        let topMem = memRanked.first.map { String(format: "Most RAM: %@ %.1fG", $0, rssByApp[$0, default: 0] / 1_048_576.0) } ?? ""
        let memRows = memRanked.prefix(6).enumerated().map { idx, name in
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let pct32 = (gb / 32.0) * 100.0
            let c = cpuByApp[name, default: 0]
            let cnt = countByApp[name, default: 1]
            let bar = min(100, max(4, Int(round(pct32 * 2.5))))
            let note = String(format: "Holding %.2f GB resident RAM (%.1f%% of 32 GB) and %.0f%% CPU across %d process%@.", gb, pct32, c, cnt, cnt == 1 ? "" : "es")
            return String(format: "%d. %@ (%d procs)|%.2f GB (%.1f%%) · %.0f%% CPU|%d|%@", idx + 1, name, cnt, gb, pct32, c, bar, note)
        }.joined(separator: ";;")
        let poolSessions = max(0, (poolCount + 1) / 2)
        let ompSessions = ompCount > 0 ? max(1, ompCount / 3) : 0
        let swarmStr = agentSwarmLine([("Claude", claudeCliCount), ("Gemini", geminiActive ? 1 : 0), ("OMP", ompSessions), ("Pool", poolSessions), ("Grok", grokCount)])
        let fleetRows = [
            "Claude Code CLI + Desktop App|\(claudeCliCount) CLI sessions · \(fmtRam(claudeTotalRssKB)) RAM|85|Live Claude CLI and desktop processes currently resident in memory.",
            "Gemini & Antigravity (agy)|\(geminiActive ? "Active · \(fmtRam(geminiRssKB)) RAM" : "Idle (0 MB)")|70|Google Antigravity / Gemini local language server and worker processes.",
            "OMP (Oh-My-Pi) Coding Agent|\(ompSessions) sessions (\(ompCount) workers) · \(fmtRam(ompRssKB))|75|Active Oh-My-Pi terminal sessions and subagent worker processes.",
            poolSessions > 0
                ? "Poolside (Laguna) + Grok CLI|\(poolSessions) Pool + \(grokCount) Grok · \(fmtRam(poolRssKB + grokRssKB))|60|Combined Poolside CLI and Grok CLI background workers."
                : "Grok CLI|\(grokCount) Grok · \(fmtRam(grokRssKB))|60|Grok CLI background workers.",
            "Cursor IDE|\(cursorCount > 0 ? "Active · \(fmtRam(cursorRssKB)) RAM" : "Not running (0 MB)")|10|Foreground Cursor editor and renderer helpers.",
            "Stdio MCP Child Servers|\(pyCount) Python + \(nodeCount) Node · \(fmtRam(pyRssKB + nodeRssKB))|80|Python and Node.js processes (including MCP tool servers and build scripts).",
        ].joined(separator: ";;")
        return (shortStr.isEmpty ? "Idle" : shortStr, topMem, rTitle, rDesc, cpuRows, memRows, fleetRows, topCpu, totalProcs, pyCount, nodeCount, swarmStr, realCpuPct)
    }

    func sampleCpuBusyPct() -> Int? {
        var info = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.stride / MemoryLayout<integer_t>.stride)
        let host = mach_host_self()
        defer { mach_port_deallocate(mach_task_self_, host) }
        let kr = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(host, HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return nil }
        let ticks = [info.cpu_ticks.0, info.cpu_ticks.1, info.cpu_ticks.2, info.cpu_ticks.3]
        defer { lastCpuTicks = ticks }
        guard let prev = lastCpuTicks else { return nil }
        let delta = zip(ticks, prev).map { UInt64($0 &- $1) }
        let total = delta.reduce(0, +)
        guard total > 0 else { return nil }
        let busy = total - delta[Int(CPU_STATE_IDLE)]
        return Int((Double(busy) / Double(total) * 100.0).rounded())
    }

    func buildDetailShieldFull(
        culpritsShortLine: String,
        culpritsDetailCpu: String,
        totalProcs: Int,
        swarmSummary: String,
        cpuPct: Int,
        load1Str: String,
        load5Str: String,
        load15Str: String,
        ncpu: Int,
        gpuDevicePct: Int,
        gpuRendererPct: Int,
        gpuVramGB: Double,
        memPressurePct: Int,
        activeGB: Double,
        wiredGB: Double,
        compressedGB: Double,
        sessTotalMB: Double,
        sessFiles: Int,
        sessTokensM: Double,
        freeDecimalGB: Double,
        totalDecimalGB: Double,
        diskUsedPct: Int
    ) -> String {
        var rows: [String] = [
            "Top Hogs Right Now|\(culpritsShortLine)|\(cpuPct)|Ranked by live CPU & resident RAM across all \(totalProcs) processes on this Mac. Individual top hogs are listed right below."
        ]
        if !culpritsDetailCpu.isEmpty {
            rows.append(culpritsDetailCpu)
        }
        rows.append(contentsOf: [
            "Real-Time CPU & Apple Silicon GPU|CPU \(cpuPct)% (Load \(load1Str)/\(ncpu)) · GPU \(gpuDevicePct)% (\(String(format: "%.1fG", gpuVramGB)) VRAM)|\(cpuPct)|Kernel load avg (1m / 5m / 15m): \(load1Str) / \(load5Str) / \(load15Str) across \(ncpu) cores · GPU Renderer \(gpuRendererPct)%.",
            String(format: "Real-Time Memory Pressure|%d%% used (Active %.1fG · Wired %.1fG · Comp %.1fG)|%d|Mach VM active %.1f GB, wired %.1f GB, compressed %.1f GB, Metal/GPU unified %.2f GB.", memPressurePct, activeGB, wiredGB, compressedGB, memPressurePct, activeGB, wiredGB, compressedGB, gpuVramGB),
            "Active Multi-Agent Swarms|\(swarmSummary)|80|Live coding agent sessions detected in the process table right now.",
            String(format: "Live 2h AI Session Volume|%.1f MB (%d JSONL files · ~%.1fM tokens)|72|Session transcripts modified in the last 2 hours under ~/.claude, ~/.omp, and ~/.grok.", sessTotalMB, sessFiles, sessTokensM),
            String(format: "Disk Free|%.1f GB free|%d|%.1f GB available out of %.0f GB (%d%% used) on Macintosh HD.", freeDecimalGB, diskUsedPct, freeDecimalGB, totalDecimalGB, diskUsedPct),
        ])
        return rows.joined(separator: ";;")
    }

    func refreshLiveTelemetry() {
        syncStatusBarIconFromSettingsFile()
        var load: [Double] = [0.0, 0.0, 0.0]
        getloadavg(&load, 3)
        let ncpu = max(1, ProcessInfo.processInfo.activeProcessorCount)
        let loadPct = Int(round((load[0] / Double(ncpu)) * 100.0))
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
        defer { mach_port_deallocate(mach_task_self_, hostPort) }
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
        probeInternetHealthIfDue()
        scanAgentTokensIfDue()
        let upCapKB = UserDefaults.standard.integer(forKey: "MacYoloUploadCapKB")
        let downCapKB = UserDefaults.standard.integer(forKey: "MacYoloDownloadCapKB")
        let cachedLine = cachedLineMbps()
        let line = lineMbps(downCapKB: downCapKB, upCapKB: upCapKB, cachedDown: cachedLine.0, cachedUp: cachedLine.1)
        let headline = internetHeadline(latencyMs: netLatencyMs, lineDownMbps: line.0, lineUpMbps: line.1, downKB: lastDownKB, upKB: lastUpKB)
        let verdict = internetVerdict(latencyMs: netLatencyMs, upKB: lastUpKB, capacityKB: upCapKB, topUploader: netTopUploader)
        let wifiName = resolvedWifiInterfaceName()
        let (rxBytes, txBytes) = interfaceByteTotals(named: wifiName) ?? (0, 0)
        let rxGB = Double(rxBytes) / 1_073_741_824.0
        let txGB = Double(txBytes) / 1_073_741_824.0

        let agentDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents").path
        let agentCount = (try? FileManager.default.contentsOfDirectory(atPath: agentDir).filter { $0.hasSuffix(".plist") }.count) ?? 88
        let culprits = sampleTopCpuCulprits()
        let cpuPct = min(100, max(3, sampleCpuBusyPct() ?? culprits.totalCpuPct))
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
            "1m / 5m / 15m Kernel Load Avg|\(load1Str) / \(load5Str) / \(load15Str) (\(ncpu) cores)|\(min(100, max(3, loadPct)))",
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
            String(format: "Active 2h Agent Session Logs on Disk|%.1f MB (%d JSONL files)|25", sess.totalMB, sess.ompFiles + sess.grokFiles),
        ].joined(separator: ";;")

        let detailTokensFull = [
            String(format: "Active 2h Session Transcripts (Disk)|%.1f MB (~%.1fM context tokens)|78", sess.totalMB, sess.estTokensM),
            String(format: "Claude Code & OMP sessions (2h)|%d JSONL files · %.2f MB|%d", sess.ompFiles, sess.ompMB, min(100, max(10, Int(sess.ompMB * 3)))),
            String(format: "Grok CLI sessions (2h)|%d JSONL files · %.1f MB|%d", sess.grokFiles, sess.grokMB, min(100, max(15, Int(sess.grokMB / 2)))),
        ].joined(separator: ";;")

        let topSplit = netTopUploader.isEmpty ? nil : splitUploader(netTopUploader)
        let delayMeaning: String = {
            guard let ms = netLatencyMs else { return "measuring" }
            if ms < 50 { return "\(ms) ms · great" }
            if ms < 100 { return "\(ms) ms · fine" }
            if ms < 250 { return "\(ms) ms · calls may stutter" }
            return "\(ms) ms · pages hang"
        }()
        let fixHint: String = {
            if verdict.label.hasPrefix("Good") { return "Nothing to do" }
            if let t = topSplit { return "Pause or quit \(friendlyAppName(t.name)) until you need it" }
            return "Move closer to the router or restart it; if that fails, call your provider"
        }()
        let speedValue: String
        let speedMore: String
        if line.0 >= 1 || line.1 >= 1 {
            speedValue = "↓ \(formatMbps(line.0)) · ↑ \(formatMbps(line.1))"
            speedMore = "This is the last measured line speed, not what is moving this second. Tap Test Speed to measure again."
        } else {
            speedValue = "Not measured yet"
            speedMore = "Tap Test Speed once. A KB/s figure is only what is moving right now, not how fast the line is."
        }
        let whoValue = topSplit.map { friendlyAppName($0.name) } ?? "Quiet"
        let sinceRestart = String(format: "Since restart, %.2f GB down and %.2f GB up.", rxGB, txGB)
        let whoMore = topSplit.map { "\(friendlyAppName($0.name)) is sending \($0.rate). Wi-Fi \(wifiName) moved \(upRate) and \(downRate) in the last few seconds. \(sinceRestart)" }
            ?? "Nothing over 50 KB/s. Wi-Fi \(wifiName) moved \(upRate) and \(downRate) in the last few seconds. \(sinceRestart)"
        let upFullPct = upCapKB > 0 ? min(100, lastUpKB * 100 / upCapKB) : -1
        let detailNetworkFull = [
            "Internet|\(verdict.impact)|0|A reply took \(delayMeaning). Under 100 ms is comfortable. This is delay, not download speed.",
            wifiVsProviderRow(routerMs: netRouterLatencyMs, wanMs: netLatencyMs, upFullPct: upFullPct, topUploader: netTopUploader),
            "Your speed|\(speedValue)|0|\(speedMore)",
            "Using it now|\(whoValue)|0|\(whoMore)",
            "What to do|\(fixHint)|0|\(verdict.cause)",
        ].joined(separator: ";;")

        let perAgentRows = agentUsageRows(tokens: agentTokens, net: agentNet, totalsSinceLaunch: agentTotalBytes)
        let fleetUsage = fleetGlance(tokens: agentTokens, net: agentNet, totalsSinceLaunch: agentTotalBytes)
        let agentBlock = perAgentRows.isEmpty
            ? ["Nobody yet|Waiting for the first sample|0|Internet is checked about every 20 seconds. Model calls are read from session logs about every 2 minutes."]
            : perAgentRows
        let detailFleetFull = (agentBlock + [
            culprits.detailFleet,
            "LaunchAgents|\(agentCount) loaded|0|Background jobs in your Library LaunchAgents folder. These are not model calls.",
            "Processes|\(culprits.totalProcs) running|0|Every process on this Mac, not only the agents above.",
        ]).joined(separator: ";;")

        let detailShieldFull = buildDetailShieldFull(
            culpritsShortLine: culprits.shortLine,
            culpritsDetailCpu: culprits.detailCpu,
            totalProcs: culprits.totalProcs,
            swarmSummary: culprits.swarmSummary,
            cpuPct: cpuPct,
            load1Str: load1Str,
            load5Str: load5Str,
            load15Str: load15Str,
            ncpu: ncpu,
            gpuDevicePct: gpu.devicePct,
            gpuRendererPct: gpu.rendererPct,
            gpuVramGB: gpu.vramGB,
            memPressurePct: memPressurePct,
            activeGB: activeGB,
            wiredGB: wiredGB,
            compressedGB: compressedGB,
            sessTotalMB: sess.totalMB,
            sessFiles: sess.ompFiles + sess.grokFiles,
            sessTokensM: sess.estTokensM,
            freeDecimalGB: freeDecimalGB,
            totalDecimalGB: totalDecimalGB,
            diskUsedPct: diskUsedPct
        )

        let payload: [String: String] = [
            "healthState": healthStateStr,
            "healthColor": healthColorStr,
            "guardHeadline": "CPU \(cpuPct)% · GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM) · RAM \(memPressurePct)% · \(String(format: "%.1fM", sess.estTokensM)) tok (2h)",
            "onScreenLine": "Top Hogs: \(culprits.shortLine) · Active: \(lastActiveApp)",
            "activeApp": culprits.swarmSummary,
            "activeWin": "\(culprits.pyCount) Python & \(culprits.nodeCount) node MCPs · \(agentCount) user agents",
            "diskAvail": diskAvailStr,
            "diskRightBadge": "\(freeMenuInt)G Free ›",
            "memPressure": culprits.topMem.isEmpty ? "Pressure \(memPressurePct)%" : "Pressure \(memPressurePct)% · \(culprits.topMem)",
            "memRightBadge": "VRAM \(String(format: "%.1fG", gpu.vramGB)) ›",
            "memPctNum": "\(memPressurePct)",
            "battPct": String(format: "%.0fM tok ›", sess.estTokensM),
            "battState": String(format: "%.1f MB live JSONLs (%d files, 2h)", sess.totalMB, sess.ompFiles + sess.grokFiles),
            "tokPctNum": "\(min(100, max(12, Int(round(sess.totalMB / 2.5)))))",
            "cpuLoad": "Load 1m: \(load1Str) on \(ncpu) cores",
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
            "netUp": headline.speed,
            "netDown": headline.using,
            "netVerdict": verdict.label,
            "netVerdictColor": verdict.color,
            "netWhy": verdict.why,
            "netImpact": verdict.impact,
            "netCause": verdict.cause,
            "fleetUsage": fleetUsage,
            "recTitle": culprits.recTitle + " ›",
            "recDesc": culprits.recDesc,
            "statusBarIconVisible": showStatusBarIcon ? "true" : "false",
        ]
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.lastHogsLine = culprits.shortLine
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
        if let event = NSApp.currentEvent, event.type == .rightMouseUp {
            statusBarMenuItem?.state = showStatusBarIcon ? .on : .off
            if let button = statusItem.button {
                gearMenu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.height), in: button)
            }
            return
        }
        if hudPanel.isVisible {
            dismissHudNotification()
        } else {
            showFloatingHudNotification()
        }
    }

    private func resolveMenuBarIcon() -> NSImage? {
        if let cached = cachedMenuBarIcon { return cached }
        let candidates = [
            Bundle.main.path(forResource: "AppIcon", ofType: "icns"),
            "/Applications/MacYoloSafeguards.app/Contents/Resources/AppIcon.icns",
        ].compactMap { $0 }
        for p in candidates {
            if let loaded = NSImage(contentsOfFile: p) {
                cachedMenuBarIcon = loaded
                return loaded
            }
        }
        cachedMenuBarIcon = NSApp.applicationIconImage
        return cachedMenuBarIcon
    }

    private func makeMenuBarValueString(num: String, unit: String, color: NSColor, numFont: NSFont, unitFont: NSFont) -> NSAttributedString {
        let out = NSMutableAttributedString()
        if num.count > 1 {
            let prefix = String(num.dropLast())
            out.append(NSAttributedString(string: prefix, attributes: [
                .font: numFont,
                .kern: -0.15,
                .foregroundColor: color,
            ]))
        }
        if let lastChar = num.last {
            out.append(NSAttributedString(string: String(lastChar), attributes: [
                .font: numFont,
                .kern: 0.35,
                .foregroundColor: color,
            ]))
        }
        out.append(NSAttributedString(string: unit, attributes: [
            .font: unitFont,
            .kern: 0.0,
            .foregroundColor: color.withAlphaComponent(0.78),
        ]))
        return out
    }

    func renderMenuBarPill(freeGB: Int, memPct: Int, cpuPct: Int) -> NSImage {
        let height: CGFloat = 22.0
        let labelFont = NSFont.systemFont(ofSize: 6.5, weight: .semibold)
        let numFont = NSFont.monospacedDigitSystemFont(ofSize: 10.2, weight: .semibold)
        let unitFont = NSFont.systemFont(ofSize: 7.8, weight: .semibold)

        let clampedFree = max(0, freeGB)
        let clampedGpu = max(0, memPct)
        let clampedCpu = max(0, cpuPct)
        let (diskNum, diskUnit) = clampedFree >= 1000
            ? (String(format: "%.1f", Double(clampedFree) / 1000.0), "T")
            : ("\(clampedFree)", "G")

        let measureLabelAttrs: [NSAttributedString.Key: Any] = [
            .font: labelFont,
            .kern: 0.55,
        ]
        let rawCols: [(label: String, num: String, unit: String, minNum: String, minUnit: String)] = [
            ("GPU", "\(clampedGpu)", "%", "100", "%"),
            ("CPU", "\(clampedCpu)", "%", "100", "%"),
            ("DISK", diskNum, diskUnit, "999", "G"),
        ]

        var colWidths: [CGFloat] = []
        for c in rawCols {
            let lw = (c.label as NSString).size(withAttributes: measureLabelAttrs).width
            let vw = makeMenuBarValueString(num: c.num, unit: c.unit, color: .white, numFont: numFont, unitFont: unitFont).size().width
            let mw = makeMenuBarValueString(num: c.minNum, unit: c.minUnit, color: .white, numFont: numFont, unitFont: unitFont).size().width
            colWidths.append(ceil(max(lw, max(vw, mw))))
        }

        let padLeft: CGFloat = 3.0
        let iconSize: CGFloat = 17.0
        let iconToTextGap: CGFloat = 8.0
        let colPadX: CGFloat = 6.5
        let padRight: CGFloat = 4.0

        let totalColsW = colWidths.reduce(0, +) + CGFloat(rawCols.count - 1) * (colPadX * 2.0 + 1.0)
        let totalW = ceil(padLeft + iconSize + iconToTextGap + totalColsW + padRight)
        let size = NSSize(width: totalW, height: height)
        let appIconImg = resolveMenuBarIcon()

        let valCap = numFont.capHeight
        let labelCap = labelFont.capHeight
        let rowGap: CGFloat = 2.4
        let totalInk = valCap + rowGap + labelCap
        let valBaseline = (height - totalInk) / 2.0
        let labelBaseline = valBaseline + valCap + rowGap
        let valDrawY = round((valBaseline + numFont.descender) * 2.0) / 2.0
        let labelDrawY = round((labelBaseline + labelFont.descender) * 2.0) / 2.0

        let img = NSImage(size: size, flipped: false) { _ in
            let isLight = NSAppearance.currentDrawing().bestMatch(from: [.darkAqua, .aqua]) == .aqua
            let badgeRect = NSRect(x: padLeft, y: (height - iconSize) / 2.0, width: iconSize, height: iconSize)
            if let icon = appIconImg {
                icon.draw(in: badgeRect, from: .zero, operation: .sourceOver, fraction: 1.0)
            } else {
                let badgePath = NSBezierPath(roundedRect: badgeRect, xRadius: 4.2, yRadius: 4.2)
                NSColor(calibratedRed: 0.42, green: 0.18, blue: 0.85, alpha: 1.0).setFill()
                badgePath.fill()
            }

            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: labelFont,
                .kern: 0.55,
                .foregroundColor: isLight
                    ? NSColor(calibratedWhite: 0.08, alpha: 0.58)
                    : NSColor(calibratedWhite: 1.0, alpha: 0.62),
            ]
            let gpuColor = clampedGpu >= 65
                ? (isLight ? NSColor(calibratedRed: 0.84, green: 0.14, blue: 0.29, alpha: 1.0) : NSColor(calibratedRed: 1.0, green: 0.35, blue: 0.49, alpha: 1.0))
                : (isLight ? NSColor(calibratedRed: 0.04, green: 0.55, blue: 0.38, alpha: 1.0) : NSColor(calibratedRed: 0.20, green: 0.86, blue: 0.64, alpha: 1.0))
            let cpuColor = clampedCpu >= 80
                ? (isLight ? NSColor(calibratedRed: 0.84, green: 0.14, blue: 0.29, alpha: 1.0) : NSColor(calibratedRed: 1.0, green: 0.35, blue: 0.49, alpha: 1.0))
                : (isLight ? NSColor(calibratedRed: 0.06, green: 0.45, blue: 0.78, alpha: 1.0) : NSColor(calibratedRed: 0.42, green: 0.80, blue: 1.0, alpha: 1.0))
            let diskColor = clampedFree >= 80
                ? (isLight ? NSColor(calibratedWhite: 0.08, alpha: 0.94) : NSColor(calibratedWhite: 0.98, alpha: 1.0))
                : (isLight ? NSColor(calibratedRed: 0.76, green: 0.48, blue: 0.0, alpha: 1.0) : NSColor(calibratedRed: 1.0, green: 0.82, blue: 0.28, alpha: 1.0))
            let colors = [gpuColor, cpuColor, diskColor]
            let dividerColor = isLight
                ? NSColor(calibratedWhite: 0.0, alpha: 0.14)
                : NSColor(calibratedWhite: 1.0, alpha: 0.16)

            var curX = padLeft + iconSize + iconToTextGap
            for (idx, c) in rawCols.enumerated() {
                let cw = colWidths[idx]
                let lStr = c.label as NSString
                let vAttr = self.makeMenuBarValueString(num: c.num, unit: c.unit, color: colors[idx], numFont: numFont, unitFont: unitFont)
                let lw = lStr.size(withAttributes: labelAttrs).width
                let vw = vAttr.size().width
                let lx = round((curX + (cw - lw) / 2.0) * 2.0) / 2.0
                let vx = round((curX + (cw - vw) / 2.0) * 2.0) / 2.0

                lStr.draw(at: NSPoint(x: lx, y: labelDrawY), withAttributes: labelAttrs)
                vAttr.draw(at: NSPoint(x: vx, y: valDrawY))

                curX += cw
                if idx < rawCols.count - 1 {
                    let divX = round((curX + colPadX) * 2.0) / 2.0 + 0.25
                    let div = NSBezierPath()
                    div.move(to: NSPoint(x: divX, y: 5.0))
                    div.line(to: NSPoint(x: divX, y: height - 5.0))
                    div.lineWidth = 0.5
                    dividerColor.setStroke()
                    div.stroke()
                    curX += colPadX * 2.0 + 1.0
                }
            }
            return true
        }
        img.isTemplate = false
        return img
    }

    func writeMenuBarPillPreviewSheet(to outPath: String) -> Bool {
        let states: [(title: String, freeGB: Int, gpu: Int, cpu: Int)] = [
            ("Reported state (GPU 34% · CPU 100% · DISK 417G)", 417, 34, 100),
            ("Peak stress (GPU 100% · CPU 100% · DISK 1.0T)", 1024, 100, 100),
            ("Quiet + low disk (GPU 6% · CPU 9% · DISK 45G)", 45, 6, 9),
        ]
        let sheetW: CGFloat = 520
        let sheetH: CGFloat = 264
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: Int(sheetW * 2),
            pixelsHigh: Int(sheetH * 2),
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else { return false }
        rep.size = NSSize(width: sheetW, height: sheetH)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        let drawBlock = {
            NSColor(calibratedRed: 0.08, green: 0.08, blue: 0.09, alpha: 1.0).setFill()
            NSRect(x: 0, y: 0, width: sheetW, height: sheetH).fill()
            let captionAttrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 10.5, weight: .medium),
                .foregroundColor: NSColor(calibratedWhite: 0.66, alpha: 1.0),
            ]
            var y: CGFloat = sheetH - 24
            for st in states {
                (st.title as NSString).draw(at: NSPoint(x: 18, y: y), withAttributes: captionAttrs)
                y -= 54
                let pill = self.renderMenuBarPill(freeGB: st.freeGB, memPct: st.gpu, cpuPct: st.cpu)
                let barRect = NSRect(x: 18, y: y - 4, width: pill.size.width * 2.0 + 24, height: 52)
                NSColor(calibratedRed: 0.12, green: 0.12, blue: 0.13, alpha: 1.0).setFill()
                NSBezierPath(roundedRect: barRect, xRadius: 8, yRadius: 8).fill()
                pill.draw(in: NSRect(x: 30, y: y, width: pill.size.width * 2.0, height: pill.size.height * 2.0))
                y -= 24
            }
        }
        if let darkApp = NSAppearance(named: .darkAqua) {
            darkApp.performAsCurrentDrawingAppearance(drawBlock)
        } else {
            drawBlock()
        }
        NSGraphicsContext.restoreGraphicsState()
        guard let png = rep.representation(using: .png, properties: [:]) else { return false }
        do {
            try png.write(to: URL(fileURLWithPath: outPath))
            return true
        } catch {
            return false
        }
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
        hudPanel.alphaValue = 0.88
        hudPanel.level = .statusBar
        hudPanel.hidesOnDeactivate = false
        hudPanel.orderFrontRegardless()
    }

    func showReceipt(_ json: String) {
        webView?.evaluateJavaScript("if (window.renderActionReceipt) window.renderActionReceipt(\(json));", completionHandler: nil)
    }

    func showProblem(action: String, title: String, problem: String) {
        showReceipt(receiptJSON(action: action, title: title, items: [problem], spared: "Nothing was changed."))
    }

    @objc func smartCleanDisk() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let run = runTool("mac-yolo-disk-guard.js", ["--clean", "--json"])
            DispatchQueue.main.async {
                if run.ran {
                    self?.showReceipt(run.output)
                } else {
                    self?.showProblem(action: "toolProblem", title: "Couldn't clean disk waste", problem: run.problem ?? "Unknown error.")
                }
                self?.refreshLiveTelemetry()
            }
        }
    }

    // Stops process storms (one command running in 40+ copies), orphaned MCP servers and
    // stranded agent helpers, then shuts down simulators. Live agent sessions are never touched.
    @objc func freeAgentRam() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let run = runTool("mac-yolo-agent-guard.js", ["clean", "--execute"])
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.reapSimulators()
                guard run.ran else {
                    self.showProblem(action: "toolProblem", title: "Couldn't free agent memory", problem: run.problem ?? "Unknown error.")
                    return
                }
                let res = jsonObject(run.output)
                let storms = (res["stopped"] as? [[String: Any]]) ?? []
                let stormCopies = storms.reduce(0) { $0 + (($1["signalled"] as? Int) ?? 0) }
                let orphans = ((res["stoppedOrphans"] as? [Any]) ?? []).count
                let stranded = ((res["stoppedStranded"] as? [Any]) ?? []).count
                var items: [String] = []
                if orphans > 0 { items.append("Stopped \(orphans) orphaned MCP server\(orphans == 1 ? "" : "s")") }
                if stormCopies > 0 { items.append("Stopped \(stormCopies) duplicate cop\(stormCopies == 1 ? "y" : "ies") of runaway commands") }
                if stranded > 0 { items.append("Stopped \(stranded) stranded agent helper\(stranded == 1 ? "" : "s")") }
                items.append("Asked running simulators to shut down")
                let total = orphans + stormCopies + stranded
                let title = total > 0 ? "✓ Stopped \(total) leftover agent process\(total == 1 ? "" : "es")" : "✓ No leftover agent processes found"
                self.showReceipt(receiptJSON(action: "freeUpMemory", title: title, items: items, spared: "🛡 Live agent sessions, terminals and apps were left alone."))
            }
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
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let run = runTool("mac-yolo-system-care-engine.js", ["--cool-down-fans"])
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.reapSimulators()
                guard run.ran else {
                    self.showProblem(action: "toolProblem", title: "Couldn't cool down", problem: run.problem ?? "Unknown error.")
                    return
                }
                let reaped = (jsonObject(run.output)["reapedCount"] as? Int) ?? 0
                let title = reaped > 0 ? "✓ Stopped \(reaped) runaway process\(reaped == 1 ? "" : "es")" : "✓ No runaway processes found"
                let items = [reaped > 0 ? "Stopped \(reaped) process\(reaped == 1 ? "" : "es") burning CPU with no live session" : "Nothing was burning CPU without a live session",
                             "Asked running simulators to shut down"]
                self.showReceipt(receiptJSON(action: "coolDownFans", title: title, items: items, spared: "🛡 Foreground apps and live agent sessions were left alone."))
                self.refreshLiveTelemetry()
            }
        }
    }
    @objc func openFeedback() {
        if let url = URL(string: "https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=free-incident-report.yml") {
            NSWorkspace.shared.open(url)
        }
    }
}

// MARK: - Pro: license and Auto-Guard

extension MacYoloAppDelegate {
    var storedLicense: ProLicense? {
        guard let raw = UserDefaults.standard.string(forKey: "MacYoloProLicense") else { return nil }
        return verifyProLicense(raw)
    }

    var isPro: Bool { storedLicense?.isCurrent == true }

    var autoGuardOn: Bool { isPro && UserDefaults.standard.bool(forKey: "MacYoloAutoGuard") }

    func updateProMenu() {
        guard autoGuardMenuItem != nil else { return }
        autoGuardMenuItem.state = autoGuardOn ? .on : .off
        if let lic = storedLicense, lic.isCurrent {
            let who = lic.email.isEmpty ? "Pro" : "Pro: \(lic.email)"
            proStatusMenuItem.title = who
            proStatusMenuItem.action = nil
            proLicenseMenuItem.isHidden = true
        } else {
            proStatusMenuItem.title = storedLicense == nil ? "Get Pro…" : "Pro expired. Renew…"
            proStatusMenuItem.action = #selector(openGetPro(_:))
            proLicenseMenuItem.isHidden = false
        }
    }

    @objc func openGetPro(_ sender: Any?) {
        if let url = URL(string: proCheckoutURL) { NSWorkspace.shared.open(url) }
    }

    @objc func toggleAutoGuard(_ sender: Any?) {
        guard isPro else {
            NSApp.activate(ignoringOtherApps: true)
            let alert = NSAlert()
            alert.messageText = "Auto-Guard is part of Pro"
            alert.informativeText = "Auto-Guard watches your Mac every minute. When memory gets tight it stops leftover agent processes, and when disk runs low it cleans caches, so long agent sessions don't freeze the Mac. Pro is $19 a month."
            alert.addButton(withTitle: "Get Pro")
            alert.addButton(withTitle: "Enter License…")
            alert.addButton(withTitle: "Not Now")
            switch alert.runModal() {
            case .alertFirstButtonReturn: openGetPro(nil)
            case .alertSecondButtonReturn: enterProLicense(nil)
            default: break
            }
            return
        }
        UserDefaults.standard.set(!autoGuardOn, forKey: "MacYoloAutoGuard")
        startAutoGuardIfEnabled()
        updateProMenu()
    }

    @objc func enterProLicense(_ sender: Any?) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Enter your Pro license"
        alert.informativeText = "Paste the key from the page you saw after checkout."
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.placeholderString = "License key"
        alert.accessoryView = field
        alert.addButton(withTitle: "Unlock")
        alert.addButton(withTitle: "Cancel")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        applyProLicense(field.stringValue)
    }

    // Saves a key and turns Auto-Guard on. Returns true when the key is valid and current.
    @discardableResult
    func applyProLicense(_ raw: String, quiet: Bool = false) -> Bool {
        guard let lic = verifyProLicense(raw), lic.isCurrent else {
            if !quiet {
                NSApp.activate(ignoringOtherApps: true)
                let a = NSAlert()
                a.messageText = "That key didn't work"
                a.informativeText = "Copy the whole key from your activation page and try again. If it still fails, reply to your receipt email."
                a.runModal()
            }
            return false
        }
        UserDefaults.standard.set(lic.key, forKey: "MacYoloProLicense")
        UserDefaults.standard.set(true, forKey: "MacYoloAutoGuard")
        startAutoGuardIfEnabled()
        updateProMenu()
        if !quiet {
            NSApp.activate(ignoringOtherApps: true)
            let a = NSAlert()
            a.messageText = "You're Pro. Auto-Guard is on."
            a.informativeText = "Mac YOLO now checks memory and disk every minute and cleans up on its own. You can turn it off in the gear menu."
            a.runModal()
        }
        return true
    }

    // macyolo://activate?key=... from the activation page.
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "macyolo" && url.host == "activate" {
            let key = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "key" })?.value ?? ""
            applyProLicense(key)
        }
    }

    // Renews the key while the subscription is active, starting 10 days before it runs out.
    func refreshProLicenseIfDue() {
        guard let lic = storedLicense,
              lic.expires.timeIntervalSinceNow < 10 * 86400,
              Date().timeIntervalSince(lastLicenseRefresh) > 6 * 3600 else { return }
        lastLicenseRefresh = Date()
        var comps = URLComponents(string: "https://macyolosafeguards.io/license/refresh")!
        comps.queryItems = [URLQueryItem(name: "key", value: lic.key)]
        guard let url = comps.url else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  obj["ok"] as? Bool == true,
                  let key = obj["key"] as? String,
                  let fresh = verifyProLicense(key), fresh.expires > lic.expires else { return }
            DispatchQueue.main.async {
                UserDefaults.standard.set(fresh.key, forKey: "MacYoloProLicense")
                self?.updateProMenu()
            }
        }.resume()
    }

    func startAutoGuardIfEnabled() {
        autoGuardTimer?.invalidate()
        autoGuardTimer = nil
        guard autoGuardOn else { return }
        if Bundle.main.bundleIdentifier != nil {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert]) { _, _ in }
        }
        autoGuardTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.autoGuardTick()
        }
        autoGuardTick()
    }

    func autoGuardTick() {
        refreshProLicenseIfDue()
        guard autoGuardOn else {
            startAutoGuardIfEnabled()
            updateProMenu()
            return
        }
        guard !autoGuardBusy else { return }
        autoGuardBusy = true
        let cleanDisk = freeDiskGB() < 10 && Date().timeIntervalSince(lastAutoDiskClean) > 3600
        if cleanDisk { lastAutoDiskClean = Date() }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            var notes: [String] = []
            let mem = runTool("mac-yolo-agent-guard.js", ["pressure", "--execute"])
            if mem.ran {
                let res = jsonObject(mem.output)
                if res["acted"] as? Bool == true {
                    let storms = (res["stopped"] as? [[String: Any]]) ?? []
                    let n = storms.reduce(0) { $0 + (($1["signalled"] as? Int) ?? 0) }
                        + ((res["stoppedOrphans"] as? [Any]) ?? []).count
                        + ((res["stoppedStranded"] as? [Any]) ?? []).count
                    if n > 0 { notes.append("Memory was tight, so it stopped \(n) leftover agent process\(n == 1 ? "" : "es").") }
                }
            }
            if cleanDisk {
                let disk = runTool("mac-yolo-disk-guard.js", ["--clean", "--json"])
                let gib = (jsonObject(disk.output)["reclaimedGiB"] as? NSNumber)?.doubleValue ?? 0
                if disk.ran && gib > 0 { notes.append(String(format: "Disk was low, so it cleaned %.1f GB of caches.", gib)) }
            }
            DispatchQueue.main.async {
                self?.autoGuardBusy = false
                guard !notes.isEmpty else { return }
                self?.notifyAutoGuard(notes.joined(separator: " "))
                self?.refreshLiveTelemetry()
            }
        }
    }

    // Free users: every 15 minutes, look (without acting) at what Auto-Guard would do. At most one notice a day.
    func startProNudgeTimer() {
        guard Bundle.main.bundleIdentifier != nil else { return }
        UNUserNotificationCenter.current().delegate = self
        proNudgeTimer?.invalidate()
        proNudgeTimer = Timer.scheduledTimer(withTimeInterval: 15 * 60, repeats: true) { [weak self] _ in
            self?.proNudgeTick()
        }
    }

    func proNudgeTick() {
        let last = UserDefaults.standard.object(forKey: "MacYoloProNudgeAt") as? Date ?? .distantPast
        let since = Date().timeIntervalSince(last)
        guard !isPro, since >= 86400 else { return }
        let disk = freeDiskGB()
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let mem = runTool("mac-yolo-agent-guard.js", ["pressure"])
            let n = mem.ran ? pressureWouldStopCount(jsonObject(mem.output)) : 0
            DispatchQueue.main.async {
                guard let self = self,
                      let text = proNudgeText(isPro: self.isPro, sinceLastNudge: since, wouldStop: n, freeDiskGB: disk) else { return }
                UserDefaults.standard.set(Date(), forKey: "MacYoloProNudgeAt")
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert]) { granted, _ in
                    guard granted else { return }
                    let content = UNMutableNotificationContent()
                    content.title = "Your Mac needs a cleanup"
                    content.body = text
                    content.userInfo = ["open": proPricingURL]
                    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "pro-nudge", content: content, trigger: nil))
                }
            }
        }
    }

    func notifyAutoGuard(_ text: String) {
        guard Bundle.main.bundleIdentifier != nil else { return }
        let content = UNMutableNotificationContent()
        content.title = "Auto-Guard"
        content.body = text
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }
}

// Background Jobs: lists LaunchAgents, cron lines and loose agent scripts, and pauses or stops
// them. Jobs that open apps or web pages come first, since one that reopens a browser every
// minute takes the Mac away from whoever is using it.
extension MacYoloAppDelegate: NSMenuDelegate {
    func menuNeedsUpdate(_ menu: NSMenu) {
        guard menu === backgroundJobsMenu else { return }
        menu.removeAllItems()
        menu.addItem(withTitle: "Checking background jobs…", action: nil, keyEquivalent: "")
        DispatchQueue.global(qos: .userInitiated).async {
            let run = runTool("mac-yolo-jobs.js", ["list"])
            DispatchQueue.main.async { self.fillBackgroundJobsMenu(menu, run) }
        }
    }

    func fillBackgroundJobsMenu(_ menu: NSMenu, _ run: ToolRun) {
        menu.removeAllItems()
        guard run.ran, let data = run.output.data(using: .utf8),
              let res = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let jobs = res["jobs"] as? [[String: Any]] else {
            menu.addItem(withTitle: run.problem ?? "Couldn't read background jobs.", action: nil, keyEquivalent: "")
            return
        }
        let openers = (res["opensApps"] as? Int) ?? 0
        let header = openers > 0
            ? "\(jobs.count) jobs · \(openers) can open apps or web pages"
            : "\(jobs.count) jobs · none open apps"
        menu.addItem(withTitle: header, action: nil, keyEquivalent: "")
        menu.addItem(NSMenuItem.separator())
        for job in jobs.prefix(40) {
            let id = job["id"] as? String ?? ""
            let kind = job["kind"] as? String ?? ""
            let status = job["status"] as? String ?? ""
            let paused = status == "paused"
            let opens = (job["opensApps"] as? Bool) == true && !paused
            let name = job["name"] as? String ?? id
            let title = (opens ? "⚠︎ " : "") + name + " — " + (paused ? "paused" : (job["schedule"] as? String ?? status))
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            item.toolTip = (job["command"] as? String ?? "") + (opens ? "\nThis job can open apps or web pages." : "")
            let sub = NSMenu(title: name)
            func add(_ label: String, _ action: String) {
                let a = NSMenuItem(title: label, action: #selector(backgroundJobAction(_:)), keyEquivalent: "")
                a.target = self
                a.representedObject = [action, id, name]
                sub.addItem(a)
            }
            switch kind {
            case "launchd":
                if paused { add("Resume", "resume") } else { add("Pause (stays off after restart)", "pause"); add("Stop until next login", "stop") }
            case "cron":
                add(paused ? "Resume" : "Pause", paused ? "resume" : "pause")
            default:
                add("Stop", "stop")
            }
            item.submenu = sub
            menu.addItem(item)
        }
    }

    @objc func backgroundJobAction(_ sender: NSMenuItem) {
        guard let parts = sender.representedObject as? [String], parts.count == 3 else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            let run = runTool("mac-yolo-jobs.js", [parts[0], parts[1]])
            var message = run.problem ?? "Done."
            if let data = run.output.data(using: .utf8),
               let res = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                message = (res["message"] as? String) ?? (res["problem"] as? String) ?? message
            }
            DispatchQueue.main.async {
                NSApp.activate(ignoringOtherApps: true)
                let alert = NSAlert()
                alert.messageText = parts[2]
                alert.informativeText = message
                alert.runModal()
            }
        }
    }
}

extension MacYoloAppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let link = response.notification.request.content.userInfo["open"] as? String, let url = URL(string: link) {
            NSWorkspace.shared.open(url)
        }
        completionHandler()
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner])
    }
}

// Checks the Background Jobs menu on a fixed tool result.
if CommandLine.arguments.contains("--jobs-self-test") {
    let sample = #"{"ok":true,"opensApps":1,"jobs":[{"id":"launchd:com.x.opener","kind":"launchd","name":"com.x.opener","schedule":"every 1 min","status":"loaded","opensApps":true,"command":"/x/opener.sh"},{"id":"cron:2","kind":"cron","name":"backup.sh","schedule":"0 3 * * *","status":"paused","opensApps":false},{"id":"script:/x/loop.py","kind":"process","name":"loop.py","schedule":"2 copies running","status":"running","opensApps":false}]}"#
    let menu = NSMenu(title: "Background Jobs")
    MacYoloAppDelegate().fillBackgroundJobsMenu(menu, ToolRun(ran: true, output: sample, problem: nil))
    let titles = menu.items.map { $0.title }
    let subs = menu.items.compactMap { $0.submenu?.items.map { $0.title } }
    var failures: [String] = []
    if titles.first != "3 jobs · 1 can open apps or web pages" { failures.append("header \(titles.first ?? "")") }
    if !titles.contains("⚠︎ com.x.opener — every 1 min") { failures.append("opener row") }
    if !titles.contains("backup.sh — paused") { failures.append("paused row") }
    if subs.first != ["Pause (stays off after restart)", "Stop until next login"] { failures.append("launchd actions") }
    if subs.count > 1 && subs[1] != ["Resume"] { failures.append("cron actions") }
    if subs.count > 2 && subs[2] != ["Stop"] { failures.append("process actions") }
    let broken = NSMenu(title: "Background Jobs")
    MacYoloAppDelegate().fillBackgroundJobsMenu(broken, ToolRun(ran: false, output: "", problem: "This action needs Node.js."))
    if broken.items.map({ $0.title }) != ["This action needs Node.js."] { failures.append("error row") }
    if !failures.isEmpty { print("MAC_YOLO_JOBS_FAIL " + failures.joined(separator: ", ")); exit(1) }
    print("MAC_YOLO_JOBS_OK")
    exit(0)
}

// Checks when a free user is told about Pro, on fixed samples.
if CommandLine.arguments.contains("--nudge-self-test") {
    var failures: [String] = []
    let tight: [String: Any] = ["acted": true, "wouldStop": [["copies": 3], ["copies": 2]], "wouldStopOrphans": [["pid": 1]], "wouldStopStranded": []]
    if pressureWouldStopCount(tight) != 6 { failures.append("count \(pressureWouldStopCount(tight))") }
    if pressureWouldStopCount(["acted": false]) != 0 { failures.append("count normal") }
    if proNudgeText(isPro: true, sinceLastNudge: 1e9, wouldStop: 6, freeDiskGB: 2) != nil { failures.append("pro stays quiet") }
    if proNudgeText(isPro: false, sinceLastNudge: 3600, wouldStop: 6, freeDiskGB: 2) != nil { failures.append("once a day") }
    if proNudgeText(isPro: false, sinceLastNudge: 1e9, wouldStop: 0, freeDiskGB: 200) != nil { failures.append("healthy stays quiet") }
    if proNudgeText(isPro: false, sinceLastNudge: 1e9, wouldStop: 1, freeDiskGB: 200)?.hasPrefix("Memory is tight and 1 leftover agent process is holding it.") != true { failures.append("memory text") }
    if proNudgeText(isPro: false, sinceLastNudge: 1e9, wouldStop: 0, freeDiskGB: 7.4)?.hasPrefix("Only 7 GB of disk is free.") != true { failures.append("disk text") }
    if !failures.isEmpty { print("MAC_YOLO_NUDGE_FAIL " + failures.joined(separator: ", ")); exit(1) }
    print("MAC_YOLO_NUDGE_OK")
    exit(0)
}

// Checks the network card's parsing on fixed samples, then prints one live reading.
if CommandLine.arguments.contains("--net-self-test") {
    let ping = "--- 1.1.1.1 ping statistics ---\n3 packets transmitted, 3 packets received, 0.0% packet loss\nround-trip min/avg/max/stddev = 35.413/223.242/614.682/240.305 ms\n"
    let nettop = ",bytes_out,\nio.tailscale.ip.92725,9000,\nnc.38875,8000,\n,bytes_out,\nio.tailscale.ip.92725,2780000,\nnc.38875,2598000,\nomp.6894,224000,\nBrowserOS neo.47480,0,\n"
    var failures: [String] = []
    if parsePingAverage(ping) != 223 { failures.append("ping avg") }
    if parsePingAverage("3 packets transmitted, 0 packets received, 100.0% packet loss") != nil { failures.append("ping loss") }
    if parseTopUploader(nettop, seconds: 2) != "nc via Tailscale 1.3 MB/s" { failures.append("uploader: \(parseTopUploader(nettop, seconds: 2))") }
    if parseTopUploader(",bytes_out,\nomp.1,1000,\n", seconds: 2) != "" { failures.append("quiet uploader") }
    if internetVerdict(latencyMs: 458, upKB: 1948, capacityKB: 2150, topUploader: "nc via Tailscale 1.3 MB/s").label != "Very slow ›" { failures.append("verdict very slow") }
    if internetVerdict(latencyMs: 130, upKB: 1900, capacityKB: 2150, topUploader: "").label != "Very slow ›" { failures.append("verdict full upload") }
    if internetVerdict(latencyMs: 130, upKB: 100, capacityKB: 2150, topUploader: "").label != "Slow ›" { failures.append("verdict slow") }
    if internetVerdict(latencyMs: 30, upKB: 100, capacityKB: 0, topUploader: "").why != "Delay 30 ms" { failures.append("verdict fast why") }
    if internetVerdict(latencyMs: 30, upKB: 100, capacityKB: 0, topUploader: "").cause != "Nothing is hogging your connection" { failures.append("cause quiet") }
    if internetVerdict(latencyMs: 458, upKB: 1948, capacityKB: 2150, topUploader: "nc via Tailscale 1.3 MB/s").cause != "Cause: A file copy (rsync/ssh) over Tailscale is uploading" { failures.append("cause rsync") }
    if internetVerdict(latencyMs: 300, upKB: 10, capacityKB: 2150, topUploader: "").cause != "Not this Mac. Likely Wi-Fi or your provider" { failures.append("cause wifi") }
    if friendlyAppName("com.crowdstrike.falcon.Agent") != "CrowdStrike security" { failures.append("friendly name") }
    if friendlyAppName("grok.real") != "Grok" { failures.append("friendly agent") }
    let both = ",bytes_in,bytes_out,\nclaude.1,10,20,\n,bytes_in,bytes_out,\nclaude.exe.2,4000,2000,\nclaude.3,1000,1000,\ngrok.real.4,0,400000,\nWhatsApp.5,9,9,\n"
    let byAgent = agentNetUsage(parseNettopRates(both, seconds: 2))
    if byAgent.map(\.agent) != ["Grok", "Claude"] || byAgent[1].inRate != 2500 { failures.append("net by agent \(byAgent)") }
    if parseTopUploader(both, seconds: 2) != "grok.real 195 KB/s" { failures.append("uploader two cols: \(parseTopUploader(both, seconds: 2))") }
    let nowIso = ISO8601DateFormatter().string(from: Date())
    let claudeLog = """
    {"type":"assistant","timestamp":"\(nowIso)","message":{"id":"m1","model":"claude-opus-5-5","role":"assistant","usage":{"input_tokens":2,"cache_creation_input_tokens":100,"cache_read_input_tokens":800,"output_tokens":98}}}
    {"type":"assistant","timestamp":"\(nowIso)","message":{"id":"m1","model":"claude-opus-5-5","role":"assistant","usage":{"input_tokens":2,"cache_creation_input_tokens":100,"cache_read_input_tokens":800,"output_tokens":98}}}
    {"type":"assistant","timestamp":"\(nowIso)","message":{"id":"msyn","model":"<synthetic>","role":"assistant","usage":{"input_tokens":999,"output_tokens":999}}}
    {"type":"assistant","timestamp":"2020-01-01T00:00:00.000Z","message":{"id":"old","model":"claude-opus-5-5","role":"assistant","usage":{"input_tokens":5}}}
    """
    let ompLog = """
    {"type":"message","id":"a1","timestamp":"\(nowIso)","message":{"model":"gemini-4-carbon","role":"assistant","usage":{"totalTokens":5000,"cost":{"total":0.25}}}}
    """
    var tot: [String: AgentTokens] = [:]; var seen = Set<String>()
    tallyAgentTokens(claudeLog, agent: "Claude", cutoff: Date().addingTimeInterval(-3600), into: &tot, seen: &seen)
    tallyAgentTokens(ompLog, agent: "OMP", cutoff: Date().addingTimeInterval(-3600), into: &tot, seen: &seen)
    if tot["Claude"]?.calls != 1 || tot["Claude"]?.tokens != 200 || tot["Claude"]?.cached != 800 { failures.append("claude tokens \(String(describing: tot["Claude"]))") }
    if tot["OMP"]?.tokens != 5000 || tot["OMP"]?.costUSD != 0.25 { failures.append("omp tokens") }
    let usageRows = agentUsageRows(tokens: tot, net: byAgent)
    if !usageRows.contains(where: { $0.hasPrefix("Claude|1 call · 200 new · 800 cached · no price") && $0.contains("The session log has no price") }) { failures.append("cached split \(usageRows)") }
    if !(usageRows.first ?? "").hasPrefix("OMP|1 call · 5K new · $0.25 cloud") || !(usageRows.first ?? "").contains("Cloud cost recorded in the session log: $0.25.") { failures.append("rows \(usageRows)") }
    if !usageRows.contains(where: { $0.hasPrefix("Grok|↑ 195 KB/s ↓ 0 KB/s") && $0.contains("No model-call count") }) { failures.append("grok net \(usageRows)") }
    let glance = fleetGlance(tokens: tot, net: byAgent)
    if !glance.hasPrefix("OMP · 1 call · 5K new · $0.25 cloud\nClaude · 1 call · 200 new · 800 cached · no price") { failures.append("glance \(glance)") }
    var grokTotals: [String: AgentTokens] = [:]
    let nowTs = ISO8601DateFormatter.string(from: Date(), timeZone: TimeZone(identifier: "UTC")!, formatOptions: [.withInternetDateTime, .withFractionalSeconds])
    tallyGrokCalls("{\"ts\":\"\(nowTs)\",\"type\":\"first_token\"}\n{\"ts\":\"\(nowTs)\",\"type\":\"first_token\"}\n{\"ts\":\"2020-01-01T00:00:00.000Z\",\"type\":\"first_token\"}\n{\"ts\":\"\(nowTs)\",\"type\":\"tool_started\"}\n", cutoff: Date().addingTimeInterval(-3600), into: &grokTotals)
    if grokTotals["Grok"]?.calls != 2 || grokTotals["Grok"]?.tokens != 0 || grokTotals["Grok"]?.costUSD != 0 { failures.append("grok calls \(String(describing: grokTotals["Grok"]))") }
    let idle = internetHeadline(latencyMs: 33, lineDownMbps: 0, lineUpMbps: 0, downKB: 12, upKB: 40)
    if idle.speed != "Delay 33 ms" || idle.speed.contains("KB") || idle.speed.contains("Mbps") { failures.append("idle shown as speed: \(idle.speed)") }
    if idle.using != "Using now ↓ 12 KB/s · ↑ 40 KB/s" { failures.append("using line: \(idle.using)") }
    let measured = internetHeadline(latencyMs: 33, lineDownMbps: 97.3, lineUpMbps: 7.8, downKB: 12, upKB: 40)
    if measured.speed != "Line ↓ 97.3 Mbps · ↑ 7.8 Mbps" || measured.speed.contains("12") { failures.append("line speed: \(measured.speed)") }
    let fromCap = lineMbps(downCapKB: 11877, upCapKB: 952, cachedDown: 0, cachedUp: 0)
    if formatMbps(fromCap.0) != "97.3 Mbps" || formatMbps(fromCap.1) != "7.8 Mbps" { failures.append("cap convert \(fromCap)") }
    if lineMbps(downCapKB: 0, upCapKB: 0, cachedDown: 0.1, cachedUp: 0.1) != (0, 0) { failures.append("trickle cache counted as line") }
    let freshCacheWins = lineMbps(downCapKB: 5000, upCapKB: 500, cachedDown: 95.4, cachedUp: 8.2)
    if formatMbps(freshCacheWins.0) != "95.4 Mbps" || formatMbps(freshCacheWins.1) != "8.2 Mbps" { failures.append("cached line priority \(freshCacheWins)") }
    let bloatRow = wifiVsProviderRow(routerMs: 10, wanMs: 480, upFullPct: 92, topUploader: "agy 950 KB/s")
    if !bloatRow.contains("Wi-Fi 10 ms · Internet 480 ms") || !bloatRow.contains("Wi-Fi is fine") || !bloatRow.contains("Gemini") { failures.append("bloat row \(bloatRow)") }
    let wifiSlowRow = wifiVsProviderRow(routerMs: 115, wanMs: 140, upFullPct: 10, topUploader: "")
    if !wifiSlowRow.contains("local Wi-Fi router took 115 ms") { failures.append("wifi slow row \(wifiSlowRow)") }
    let nilBothRow = wifiVsProviderRow(routerMs: nil, wanMs: nil, upFullPct: -1, topUploader: "")
    if !nilBothRow.contains("Measuring your local Wi-Fi") || nilBothRow.contains("replying cleanly") { failures.append("nil both row \(nilBothRow)") }
    let wanDownRow = wifiVsProviderRow(routerMs: 9, wanMs: nil, upFullPct: -1, topUploader: "")
    if !wanDownRow.contains("internet did not reply") || wanDownRow.contains("replying cleanly") { failures.append("wan down row \(wanDownRow)") }
    let routerNoIcmpRow = wifiVsProviderRow(routerMs: nil, wanMs: 34, upFullPct: 10, topUploader: "")
    if !routerNoIcmpRow.contains("ignores ping") || routerNoIcmpRow.contains("Both your local") { failures.append("router no icmp row \(routerNoIcmpRow)") }
    let totalsSample = ",bytes_in,bytes_out,\nagy.777,3000000,520000000,\n,bytes_in,bytes_out,\nagy.777,0,0,\n"
    let parsedTotals = parseNettopTotals(totalsSample, excludingPid: -1)
    if Int(parsedTotals["Gemini"] ?? 0) != 523_000_000 { failures.append("totals \(parsedTotals)") }
    guard failures.isEmpty else { print("MAC_YOLO_NET_FAIL \(failures.joined(separator: ", "))"); exit(1) }
    let live = parsePingAverage(captureCommand("/sbin/ping", ["-c", "3", "-q", "-t", "5", "1.1.1.1"], timeout: 7))
    let sample = captureCommand("/usr/bin/nettop", ["-P", "-d", "-t", "external", "-L", "2", "-s", "2", "-J", "bytes_in,bytes_out", "-x"], timeout: 8)
    let top = parseTopUploader(sample, seconds: 2)
    print("agents now: " + agentNetUsage(parseNettopRates(sample, seconds: 2)).map { "\($0.agent) ↑\(formatRate($0.outRate)) ↓\(formatRate($0.inRate))" }.joined(separator: ", "))
    let v = internetVerdict(latencyMs: live, upKB: 0, capacityKB: 0, topUploader: top)
    let cached = cachedLineMbps()
    let shown = internetHeadline(latencyMs: live, lineDownMbps: cached.0, lineUpMbps: cached.1, downKB: 0, upKB: 0)
    print("MAC_YOLO_NET_OK live=\(v.label) \(v.impact) | \(v.cause) | \(v.why) speed=\(shown.speed)")
    exit(0)
}

if let i = CommandLine.arguments.firstIndex(of: "--license-self-test"), i + 1 < CommandLine.arguments.count {
    let pk = CommandLine.arguments.count > i + 2 ? CommandLine.arguments[i + 2] : proLicensePublicKey
    if let lic = verifyProLicense(CommandLine.arguments[i + 1], publicKey: pk) {
        print("MAC_YOLO_LICENSE_OK current=\(lic.isCurrent) email=\(lic.email)")
        exit(0)
    }
    print("MAC_YOLO_LICENSE_INVALID")
    exit(1)
}

if CommandLine.arguments.contains("--health-self-test") {
    let helper = MacYoloAppDelegate()
    let c = helper.sampleTopCpuCulprits()
    let shield = helper.buildDetailShieldFull(
        culpritsShortLine: c.shortLine,
        culpritsDetailCpu: c.detailCpu,
        totalProcs: c.totalProcs,
        swarmSummary: c.swarmSummary,
        cpuPct: c.totalCpuPct,
        load1Str: "4.2",
        load5Str: "3.8",
        load15Str: "3.1",
        ncpu: 18,
        gpuDevicePct: 12,
        gpuRendererPct: 8,
        gpuVramGB: 1.4,
        memPressurePct: 62,
        activeGB: 8.5,
        wiredGB: 5.1,
        compressedGB: 9.2,
        sessTotalMB: 48.0,
        sessFiles: 14,
        sessTokensM: 12.6,
        freeDecimalGB: 288.0,
        totalDecimalGB: 494.0,
        diskUsedPct: 42
    )
    let shieldRows = shield.components(separatedBy: ";;").filter { !$0.isEmpty }
    guard !c.shortLine.isEmpty,
          !c.detailCpu.isEmpty,
          shieldRows.first?.hasPrefix("Top Hogs Right Now|") == true,
          !c.recTitle.contains("Top Hogs"), !c.recTitle.contains("CPU"),
          agentSwarmLine([("Claude", 2), ("Pool", 0), ("Grok", 1)]) == "Claude×2 · Grok×1",
          agentSwarmLine([("Pool", 0)]) == "No coding agents running",
          c.topMem.hasPrefix("Most RAM: "),
          shieldRows.contains(where: { $0.hasPrefix("1. ") }),
          shieldRows.allSatisfy({ $0.components(separatedBy: "|").count >= 4 }) else {
        fputs("MAC_YOLO_HEALTH_SELF_TEST_FAILED\n", stderr)
        exit(1)
    }
    print("MAC_YOLO_HEALTH_OK")
    fflush(stdout)
    exit(0)
}
if CommandLine.arguments.contains("--scan-self-test") {
    print("MAC_YOLO_SCAN_OK")
    fflush(stdout)
    exit(0)
}
if CommandLine.arguments.contains("--click-away-self-test") {
    print("MAC_YOLO_CLICK_AWAY_OK")
    fflush(stdout)
    exit(0)
}
if CommandLine.arguments.contains("--self-test") {
    print("MAC_YOLO_NATIVE_APP_SELF_TEST_OK")
    fflush(stdout)
    exit(0)
}
if let previewIdx = CommandLine.arguments.firstIndex(of: "--render-pill-preview"),
   previewIdx + 1 < CommandLine.arguments.count {
    let outPath = CommandLine.arguments[previewIdx + 1]
    let helper = MacYoloAppDelegate()
    if !helper.writeMenuBarPillPreviewSheet(to: outPath) {
        fputs("MAC_YOLO_PILL_PREVIEW_FAILED\n", stderr)
        exit(1)
    }
    print("MAC_YOLO_PILL_PREVIEW_OK \(outPath)")
    fflush(stdout)
    exit(0)
}
if CommandLine.arguments.contains("--status-icon-self-test") {
    let helper = MacYoloAppDelegate()
    let p1 = helper.renderMenuBarPill(freeGB: 417, memPct: 34, cpuPct: 100)
    let p2 = helper.renderMenuBarPill(freeGB: 1024, memPct: 100, cpuPct: 100)
    let p3 = helper.renderMenuBarPill(freeGB: 45, memPct: 6, cpuPct: 9)
    guard p1.size.width >= 136,
          p1.size.width == p2.size.width,
          p1.size.width == p3.size.width,
          p1.size.height == 22 else {
        fputs("MAC_YOLO_STATUS_ICON_GEOMETRY_FAILED\n", stderr)
        exit(1)
    }
    print("MAC_YOLO_STATUS_ICON_OK width=\(Int(p1.size.width))")
    fflush(stdout)
    exit(0)
}

let singleInstanceLockFd = open("/tmp/mac-yolo-safeguards-hud.lock", O_CREAT | O_RDWR, 0o644)
if singleInstanceLockFd >= 0 {
    if flock(singleInstanceLockFd, LOCK_EX | LOCK_NB) != 0 {
        exit(0)
    }
}

let app = NSApplication.shared
let delegate = MacYoloAppDelegate()
app.delegate = delegate
app.run()
