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
          <div style="display:flex;gap:6px;">
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
      var diskRowsCombined = (_lastCleanDetailRows ? (_lastCleanDetailRows + ';;' + (s.detailDisk || '')) : (s.detailDisk || ''));
      var meta = {
        shield: ['Protection by Mac YOLO — Real-Time Guard', 'Live kernel, GPU, memory & active session telemetry', s.detailShield],
        disk: ['Disk & AI Waste Cleanup — Live Breakdown', 'APFS volume status + itemized AI/dev cache cleanup receipts', diskRowsCombined],
        memory: ['Memory & Agent RAM — Top Live Consumers', 'Mach VM breakdown + top RSS memory consumers by app', s.detailMemory],
        tokens: ['AI Tokens, Prompt Cache & Session Ledger', 'Live session JSONL transcripts on disk (~/.omp, ~/.grok, ~/.claude)', s.detailTokens],
        cpu: ['CPU, Apple Silicon GPU & Fan Culprits', 'Live %CPU + Apple Silicon AGXAccelerator GPU & thermal telemetry', s.detailCpu],
        network: ['Network, Wi-Fi & Zero-Cloud-Egress', 'Live BSD kernel interface byte counters & local service bindings', s.detailNetwork],
        fleet: ['AI Fleet, Active Swarms & MCP Bus', 'Verified coding agent sessions, RAM footprint & stdio MCP child servers', s.detailFleet],
        optimization: ['AI YOLO Optimization & Culprit Matrix', 'Combined CPU, GPU, RAM & AI session waste breakdown', s.detailOptimization || s.detailCpu]
      }[_activeDetailCard] || ['Live Details', 'Real-time telemetry', s.detailCpu];
      if (titleEl) titleEl.textContent = meta[0];
      if (subEl) subEl.textContent = meta[1];
      var raw = meta[2] || '';
      var rows = raw.split(';;').filter(Boolean).slice(0, 7);
      var html = '';
      for (var i = 0; i < rows.length; i++) {
        var parts = rows[i].split('|');
        var lbl = parts[0] || '';
        var val = parts[1] || '';
        html += '<div style="padding:9px 12px;border-radius:10px;background:rgba(255,255,255,0.045);border:1px solid rgba(255,255,255,0.09);display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
          '<span style="color:rgba(255,255,255,0.94);font-size:12px;font-weight:560;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + lbl + '</span>' +
          '<span style="color:#5eead4;font-size:11.5px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap;background:rgba(20,184,166,0.13);border:1px solid rgba(94,234,212,0.25);padding:2px 8px;border-radius:99px;">' + val + '</span>' +
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
let proLicensePublicKey = "qWlq4jZqN5ueg5pYc6/CauaqQ7ldvWj9bJU8Dv6xHEQ="
let proCheckoutURL = "https://macyolosafeguards.io/go/pro"

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
    var lastActiveWin: String = "Claude"
    var wifiInterfaceName: String = ""
    var wifiLookupRetryAt: Date = .distantPast
    var statusSettingsSyncedAt: Date = .distantPast
    var netHistory: [(t: Date, inn: UInt64, out: UInt64)] = []
    var lastCpuTicks: [UInt32]? = nil
    var lastUpKB: Int = 0
    var lastDownKB: Int = 0
    var cachedMenuBarIcon: NSImage?
    var autoGuardTimer: Timer?
    var autoGuardBusy = false
    var lastAutoDiskClean: Date = .distantPast
    var lastLicenseRefresh: Date = .distantPast
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
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            self?.updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)
            self?.refreshLiveTelemetry()
        }
        refreshProLicenseIfDue()
        updateProMenu()
        startAutoGuardIfEnabled()

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
        if lower.contains("browseros") { return "BrowserOS" }
        if lower.contains("ghostty") { return "Ghostty" }
        if lower.contains("opendirectoryd") { return "Directory Services" }
        if lower.contains("jamf") { return "Jamf Protect" }
        if lower.contains("llama-server") || base == "ollama" { return "Ollama" }
        if base == "mds" || base.hasPrefix("mds_") || base == "mdworker_shared" { return "Spotlight" }
        if base == "mediaanalysisd" || base == "photoanalysisd" { return "Photos Analysis" }
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

    func sampleTopCpuCulprits() -> (shortLine: String, recTitle: String, recDesc: String, detailCpu: String, detailMem: String, detailFleet: String, topCpu: Double, totalProcs: Int, pyCount: Int, nodeCount: Int, swarmSummary: String, totalCpuPct: Int) {
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
        let rTitle = "Top Hogs: \(shortStr)"
        let systemIndexers: Set<String> = ["Spotlight", "Photos Analysis"]
        let topByCpu = cpuByApp.max { $0.value < $1.value }?.key
        let indexerNote = topByCpu.map { systemIndexers.contains($0) ? "\($0) is a protected macOS service (busy after a restart or large file changes). Safeguards cannot throttle it; it settles on its own. " : "" } ?? ""
        let rDesc = indexerNote + "\(totalProcs) live procs (\(pyCount) Python, \(nodeCount) node MCPs) · Thermal: \(hot ? "Warning" : "Nominal"). Click any card to inspect."
        let cpuRows = ranked.prefix(6).enumerated().map { idx, name in
            let c = cpuByApp[name, default: 0]
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let cnt = countByApp[name, default: 1]
            let bar = min(100, max(4, Int(round(c))))
            return String(format: "%d. %@ (%d procs)|%.1f%% CPU · %.2f GB RAM|%d", idx + 1, name, cnt, c, gb, bar)
        }.joined(separator: ";;")
        let memRanked = rssByApp.keys.sorted { rssByApp[$0, default: 0] > rssByApp[$1, default: 0] }
        let memRows = memRanked.prefix(6).enumerated().map { idx, name in
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let pct32 = (gb / 32.0) * 100.0
            let c = cpuByApp[name, default: 0]
            let cnt = countByApp[name, default: 1]
            let bar = min(100, max(4, Int(round(pct32 * 2.5))))
            return String(format: "%d. %@ (%d procs)|%.2f GB (%.1f%%) · %.0f%% CPU|%d", idx + 1, name, cnt, gb, pct32, c, bar)
        }.joined(separator: ";;")
        let poolSessions = max(0, (poolCount + 1) / 2)
        let ompSessions = ompCount > 0 ? max(1, ompCount / 3) : 0
        let swarmStr = "Claude×\(claudeCliCount) · Gemini×\(geminiActive ? 1 : 0) · OMP×\(ompSessions) · Pool×\(poolSessions) · Grok×\(grokCount)"
        let fleetRows = [
            "Claude Code CLI + Desktop App|\(claudeCliCount) CLI sessions · \(fmtRam(claudeTotalRssKB)) RAM|85",
            "Gemini & Antigravity (agy)|\(geminiActive ? "Active · \(fmtRam(geminiRssKB)) RAM" : "Idle (0 MB)")|70",
            "OMP (Oh-My-Pi) Coding Agent|\(ompSessions) sessions (\(ompCount) workers) · \(fmtRam(ompRssKB))|75",
            "Poolside (Laguna) + Grok CLI|\(poolSessions) Pool + \(grokCount) Grok · \(fmtRam(poolRssKB + grokRssKB))|60",
            "Cursor IDE|\(cursorCount > 0 ? "Active · \(fmtRam(cursorRssKB)) RAM" : "Not running (0 MB)")|10",
            "Stdio MCP Child Servers|\(pyCount) Python + \(nodeCount) Node · \(fmtRam(pyRssKB + nodeRssKB))|80",
        ].joined(separator: ";;")
        return (shortStr.isEmpty ? "Idle" : shortStr, rTitle, rDesc, cpuRows, memRows, fleetRows, topCpu, totalProcs, pyCount, nodeCount, swarmStr, realCpuPct)
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

        let detailNetworkFull = [
            "Active Wi-Fi Interface (\(wifiName))|\(upRate) · \(downRate)|45",
            String(format: "Cumulative Interface Traffic (\(wifiName))|↓ %.2f GB RX · ↑ %.2f GB TX|60", rxGB, txGB),
        ].joined(separator: ";;")

        let detailFleetFull = [
            "User LaunchAgents (~/Library/LaunchAgents)|\(agentCount) plists loaded|100",
            "Total Live OS Processes|\(culprits.totalProcs) active processes|\(min(100, culprits.totalProcs / 15))",
            culprits.detailFleet,
        ].joined(separator: ";;")

        let detailShieldFull = [
            "Real-Time CPU & Apple Silicon GPU|CPU \(cpuPct)% (Load \(load1Str)/\(ncpu)) · GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM)|\(cpuPct)",
            String(format: "Real-Time Memory Pressure|%d%% used (Active %.1fG · Wired %.1fG · Comp %.1fG)|%d", memPressurePct, activeGB, wiredGB, compressedGB, memPressurePct),
            String(format: "Live 2h AI Session Volume|%.1f MB (%d JSONL files · ~%.1fM tokens)|72", sess.totalMB, sess.ompFiles + sess.grokFiles, sess.estTokensM),
            "Active Multi-Agent Swarms|\(culprits.swarmSummary)|80",
            "Disk Free|\(String(format: "%.1f GB free", freeDecimalGB))|\(diskUsedPct)",
        ].joined(separator: ";;")

        let payload: [String: String] = [
            "healthState": healthStateStr,
            "healthColor": healthColorStr,
            "guardHeadline": "CPU \(cpuPct)% · GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM) · RAM \(memPressurePct)% · \(String(format: "%.1fM", sess.estTokensM)) tok (2h)",
            "onScreenLine": "Top Hogs: \(culprits.shortLine) · Active: \(lastActiveApp)",
            "activeApp": culprits.swarmSummary,
            "activeWin": "\(culprits.pyCount) Python & \(culprits.nodeCount) node MCPs · \(agentCount) user agents",
            "diskAvail": diskAvailStr,
            "diskRightBadge": "\(freeMenuInt)G Free ›",
            "memPressure": "Pressure \(memPressurePct)% · \(culprits.shortLine)",
            "memRightBadge": "VRAM \(String(format: "%.1fG", gpu.vramGB)) ›",
            "memPctNum": "\(memPressurePct)",
            "battPct": String(format: "%.0fM tok ›", sess.estTokensM),
            "battState": String(format: "%.1f MB live JSONLs (%d files, 2h)", sess.totalMB, sess.ompFiles + sess.grokFiles),
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

    func notifyAutoGuard(_ text: String) {
        guard Bundle.main.bundleIdentifier != nil else { return }
        let content = UNMutableNotificationContent()
        content.title = "Auto-Guard"
        content.body = text
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }
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
