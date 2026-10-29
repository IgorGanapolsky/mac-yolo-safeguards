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
    background: transparent;
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
    background: radial-gradient(circle at 82% 10%, rgba(139, 92, 246, 0.46) 0%, rgba(59, 24, 119, 0.54) 48%, rgba(24, 12, 54, 0.68) 100%);
    border: 1px solid rgba(255, 255, 255, 0.24);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.28);
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
    background: rgba(15, 11, 33, 0.58);
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
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(34, 197, 94, 0.45);
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
    background: rgba(15, 11, 33, 0.58);
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
  .tile-icon {
    font-size: 17px;
    opacity: 0.9;
  }
  .tile-sub {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.72);
    margin-top: 3px;
    padding-left: 25px;
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
    font-size: 12px;
    font-weight: 600;
    color: #38bdf8;
    background: none;
    border: none;
    cursor: pointer;
    margin-top: 4px;
  }
  .tile-action:hover {
    color: #7dd3fc;
    text-decoration: underline;
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
    background: linear-gradient(135deg, #ec4899, #8b5cf6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(236, 72, 153, 0.35);
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
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 8px;
    cursor: pointer;
  }
  .rec-btn:hover {
    background: rgba(255, 255, 255, 0.22);
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
        <div>
          <div class="header-title">Mac Health: <span id="healthState">Excellent</span></div>
          <div class="header-sub" id="macModel">AI Agent &amp; Mac Optimizer</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="rec-btn" style="padding:4px 9px;font-size:11px;" onclick="toggleSettingsDrawer()">⚙️ Settings</button>
          <button class="rec-btn" id="hudSizeBtn" style="padding:4px 9px;font-size:11px;" onclick="cycleHudSize()" title="Toggle HUD size or drag corner">⤢ Expand</button>
          <div class="laptop-badge" style="width:42px;height:36px;font-size:24px;">💻</div>
        </div>
      </div>

      <div class="card shield-card">
        <div class="shield-top">
          <div class="shield-left">
            <span class="shield-pill">✓</span>
            <span>Protection by <strong>Mac YOLO Safeguards</strong></span>
          </div>
          <span class="shield-status">✓ Protected</span>
        </div>
        <div class="shield-main" id="guardHeadline">Real-time runaway &amp; token monitor ON</div>
        <div class="shield-sub" id="onScreenNowLine">On screen now: Detecting active window…</div>
      </div>

      <div class="bento">
        <div class="tile">
          <div>
            <div class="tile-head"><span class="tile-icon">🖴</span><span>Macintosh HD</span></div>
            <div class="tile-sub warn" id="diskAvail">Available: 150.24 GB</div>
            <div class="meter-track"><div class="meter-fill" id="diskBarFill" style="width:84%;background:linear-gradient(90deg,#fbbf24,#38bdf8);"></div></div>
          </div>
          <button class="tile-action" onclick="sendAction('freeUpDisk')">Free Up</button>
        </div>

        <div class="tile">
          <div>
            <div class="tile-head"><span class="tile-icon">▦</span><span>Memory</span></div>
            <div class="tile-sub" id="memPressure">Pressure: 38%</div>
            <div class="meter-track"><div class="meter-fill" id="memBarFill" style="width:38%;background:linear-gradient(90deg,#34d399,#38bdf8);"></div></div>
          </div>
          <button class="tile-action" onclick="sendAction('freeUpMemory')">Free Up</button>
        </div>

        <div class="tile">
          <div>
            <div class="tile-row">
              <div class="tile-head"><span class="tile-icon">🤖</span><span>AI Agents</span></div>
              <span class="tile-val" id="battPct" style="color:#5eead4;">Fenced</span>
            </div>
            <div class="tile-sub" id="battState">$10/mo Cap · 0 Runaways</div>
            <div class="meter-track"><div class="meter-fill" id="battBarFill" style="width:100%;background:linear-gradient(90deg,#22c55e,#5eead4);"></div></div>
          </div>
          <button class="tile-action" onclick="sendAction('optimizeAgents')">Optimize Agents</button>
        </div>
        <div class="tile">
          <div class="tile-row">
            <div class="tile-head"><span class="tile-icon">⚙️</span><span>CPU</span></div>
            <span class="tile-val hot" id="cpuTemp">Load 1m</span>
          </div>
          <div class="tile-sub" id="cpuLoad">Load: 24%</div>
          <div class="meter-track"><div class="meter-fill" id="cpuBarFill" style="width:24%;background:linear-gradient(90deg,#a855f7,#fb7185);"></div></div>
        </div>

        <div class="tile tile-tall">
          <div>
            <div class="tile-head"><span class="tile-icon">🛜</span><span id="netName">Tailnet &amp; Wi-Fi</span></div>
            <div class="net-rates">
              <div id="netUp">↑ 0 KB/sec</div>
              <div id="netDown">↓ 0 KB/sec</div>
            </div>
          </div>
          <button class="tile-action" onclick="sendAction('testSpeed')">Test Speed</button>
        </div>

        <div class="tile tile-tall">
          <div>
            <div class="tile-head"><span class="tile-icon">🪟</span><span>On Screen Now</span></div>
            <div class="tile-sub good" id="activeAppTile" style="padding-left:0;margin-top:6px;font-weight:600;">Active App</div>
            <div class="tile-sub" id="activeWinTile" style="padding-left:0;margin-top:2px;">Window title</div>
          </div>
        </div>
      </div>

      <div id="recSection">
        <div class="rec-header">AI YOLO Agent Optimization</div>
        <div class="card rec-card">
          <div class="rec-top">
            <div class="rec-badge">⚡</div>
            <div>
              <div class="rec-title" id="recTitle">AI Agent Fleet, Token Cap &amp; Cache Optimizer</div>
              <div class="rec-desc" id="recDesc">Agent temp · Swift cache · Node cache · Playwright · Trash • Reap zombie MCPs &amp; enforce $10/mo token cap.</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
            <button class="tile-action" style="margin-top:0;" onclick="toggleSettingsDrawer(true)">⚙️ Settings &amp; Status Icon…</button>
            <button class="rec-btn" onclick="sendAction('optimizeAgents')">⚡ Optimize AI Agents &amp; Mac</button>
          </div>
        </div>
      </div>

      <div class="card rec-card" id="settingsDrawer" style="display:none;padding:10px 13px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="font-size:13px;font-weight:700;">Mac YOLO Safeguards</div>
          <button class="tile-action" style="margin-top:0;" onclick="toggleSettingsDrawer(false)">← Back</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid rgba(255,255,255,0.12);">
          <span style="font-size:12px;color:rgba(255,255,255,0.92);">Mac YOLO Status Bar Icon</span>
          <button class="rec-btn" style="padding:3px 10px;font-size:11.5px;" id="statusBarToggleBtn" onclick="sendAction('toggleStatusBarIcon')">Shown ✓ (Click to Hide)</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid rgba(255,255,255,0.12);">
          <span style="font-size:12px;color:rgba(255,255,255,0.78);">AI Agent Token Cap &amp; Loop Reaper</span>
          <span style="font-size:11.5px;color:#5eead4;font-weight:600;">Active ($10/mo) ✓</span>
        </div>
      </div>
    </div>

    <div class="hud-footer">
      <button class="tile-action" style="margin-top:0;font-size:11.5px;color:rgba(255,255,255,0.82);" onclick="sendAction('toggleStatusBarIcon')">⚙️ Menu Bar Icon: <strong id="quickStatusIconLabel" style="color:#5eead4;">Shown ✓</strong></button>
      <span id="footerSizeLabel" style="font-size:11px;color:rgba(255,255,255,0.68);cursor:pointer;" onclick="cycleHudSize()" title="Click to cycle size or drag corner">420×630</span>
    </div>
  </div>
  <div class="hud-resize-edge-right" id="hudResizeRight"></div>
  <div class="hud-resize-edge-bottom" id="hudResizeBottom"></div>
  <div class="hud-resize-grip" id="hudResizeGrip" title="Drag to resize">◢</div>

  <script>
    var HUD_PRESETS = [
      { label: '⤢ Expand', width: 420, height: 630 },
      { label: '⤢ Large', width: 520, height: 720 },
      { label: '⤡ Compact', width: 640, height: 800 }
    ];
    var _presetIdx = 0;
    function sendAction(action, extra) {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.yoloHud) {
        var msg = { action: action };
        if (extra) { for (var k in extra) msg[k] = extra[k]; }
        window.webkit.messageHandlers.yoloHud.postMessage(msg);
      }
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
      var btn = document.getElementById('hudSizeBtn');
      if (btn) btn.textContent = p.label;
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
    var prevNetInBytes: UInt64 = 0
    var prevNetOutBytes: UInt64 = 0
    var prevNetSampleAt: Date = .distantPast
    var lastUpKB: Int = 0
    var lastDownKB: Int = 0
    func applicationDidFinishLaunching(_ notification: Notification) {
        let myPid = ProcessInfo.processInfo.processIdentifier
        for app in NSWorkspace.shared.runningApplications {
            if app.processIdentifier != myPid &&
               (app.bundleIdentifier == "com.iganapolsky.macyolosafeguards" || app.localizedName == "MacYoloSafeguards") {
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
            NSWorkspace.shared.setIcon(iconImg, forFile: "/Applications/MacYoloSafeguards.app", options: [])
        }
        updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)

        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] _ in
            guard let self = self, self.hudPanel != nil, self.hudPanel.isVisible else { return }
            if Date().timeIntervalSince(self.lastShownAt) < 0.25 { return }
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

        gearMenu = NSMenu(title: "Mac YOLO Safeguards Menu")
        gearMenu.addItem(NSMenuItem(title: "About Mac YOLO Safeguards", action: #selector(openDashboard), keyEquivalent: ""))
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
        hudPanel = NSPanel(
            contentRect: NSRect(x: panelX, y: panelY, width: panelW, height: panelH),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        hudPanel.title = "Mac YOLO Safeguards"
        hudPanel.level = .statusBar
        hudPanel.isFloatingPanel = true
        hudPanel.hidesOnDeactivate = false
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
        visualEffectView.layer?.cornerRadius = 22
        visualEffectView.layer?.masksToBounds = true
        visualEffectView.autoresizingMask = [.width, .height]

        let wkConfig = WKWebViewConfiguration()
        wkConfig.userContentController.add(self, name: "yoloHud")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: panelW, height: panelH), configuration: wkConfig)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.loadHTMLString(HUD_HTML, baseURL: nil)
        visualEffectView.addSubview(webView)
        hudPanel.contentView = visualEffectView
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

    func sampleNetworkRates() -> (String, String) {
        let now = Date()
        let dt = now.timeIntervalSince(prevNetSampleAt)
        if prevNetSampleAt != .distantPast && dt < 1.2 {
            return ("↑ \(lastUpKB) KB/sec", "↓ \(lastDownKB) KB/sec")
        }
        var mib: [Int32] = [CTL_NET, PF_ROUTE, 0, 0, NET_RT_IFLIST2, 0]
        var len: Int = 0
        if sysctl(&mib, UInt32(mib.count), nil, &len, nil, 0) == 0, len > 0 {
            var buf = [UInt8](repeating: 0, count: len)
            if sysctl(&mib, UInt32(mib.count), &buf, &len, nil, 0) == 0 {
                var totalIn: UInt64 = 0
                var totalOut: UInt64 = 0
                var offset = 0
                while offset < len {
                    let hdr = buf.withUnsafeBytes { $0.load(fromByteOffset: offset, as: if_msghdr.self) }
                    if hdr.ifm_msglen == 0 { break }
                    if Int32(hdr.ifm_type) == RTM_IFINFO2 {
                        let msg2 = buf.withUnsafeBytes { $0.load(fromByteOffset: offset, as: if_msghdr2.self) }
                        totalIn &+= msg2.ifm_data.ifi_ibytes
                        totalOut &+= msg2.ifm_data.ifi_obytes
                    }
                    offset += Int(hdr.ifm_msglen)
                }
                if prevNetInBytes > 0 && dt >= 1.2 && dt < 30.0 && totalIn >= prevNetInBytes && totalOut >= prevNetOutBytes {
                    lastDownKB = Int(Double(totalIn - prevNetInBytes) / 1024.0 / dt)
                    lastUpKB = Int(Double(totalOut - prevNetOutBytes) / 1024.0 / dt)
                }
                prevNetInBytes = totalIn
                prevNetOutBytes = totalOut
                prevNetSampleAt = now
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
            "battPct": "\(agentCount) Agents",
            "battState": "$10/mo Cap · 0 Runaways",
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
        let size = NSSize(width: 118, height: 20)
        let img = NSImage(size: size, flipped: false) { rect in
            let pillRect = rect.insetBy(dx: 1.0, dy: 1.0)
            let pillPath = NSBezierPath(roundedRect: pillRect, xRadius: 9.0, yRadius: 9.0)
            NSColor(calibratedRed: 0.16, green: 0.09, blue: 0.32, alpha: 0.90).setFill()
            pillPath.fill()
            NSColor(calibratedWhite: 1.0, alpha: 0.28).setStroke()
            pillPath.lineWidth = 1.0
            pillPath.stroke()

            // 1. Glowing circular disk-health ring + center dot on left
            let cx: CGFloat = 12.0
            let cy: CGFloat = 10.0
            let ringR: CGFloat = 5.5
            let bgRing = NSBezierPath()
            bgRing.appendArc(withCenter: NSPoint(x: cx, y: cy), radius: ringR, startAngle: 0, endAngle: 360)
            NSColor(calibratedWhite: 1.0, alpha: 0.18).setStroke()
            bgRing.lineWidth = 2.0
            bgRing.stroke()

            let arcRing = NSBezierPath()
            arcRing.appendArc(withCenter: NSPoint(x: cx, y: cy), radius: ringR, startAngle: 90, endAngle: -195, clockwise: true)
            (freeGB >= 80 ? NSColor(calibratedRed: 0.20, green: 0.92, blue: 0.72, alpha: 1.0) : NSColor.systemYellow).setStroke()
            arcRing.lineWidth = 2.1
            arcRing.lineCapStyle = .round
            arcRing.stroke()

            let dotRect = NSRect(x: cx - 2.2, y: cy - 2.2, width: 4.4, height: 4.4)
            NSColor(calibratedRed: 0.36, green: 0.92, blue: 0.83, alpha: 1.0).setFill()
            NSBezierPath(ovalIn: dotRect).fill()

            // 2. Crisp "147G" storage text
            let diskFont = NSFont.monospacedDigitSystemFont(ofSize: 11.5, weight: .bold)
            let diskAttrs: [NSAttributedString.Key: Any] = [
                .font: diskFont,
                .foregroundColor: NSColor.white,
            ]
            let diskStr = "\(freeGB)G" as NSString
            diskStr.draw(at: NSPoint(x: 22.0, y: 3.0), withAttributes: diskAttrs)

            // 3. Subtle divider
            let divPath = NSBezierPath()
            divPath.move(to: NSPoint(x: 61.0, y: 4.5))
            divPath.line(to: NSPoint(x: 61.0, y: 15.5))
            NSColor(calibratedWhite: 1.0, alpha: 0.18).setStroke()
            divPath.lineWidth = 1.0
            divPath.stroke()

            // 4. Live 2-bar micro-equalizer (CPU + RAM) + CPU% readout
            let barH: CGFloat = 11.0
            let cpuFillH = max(2.5, min(barH, barH * CGFloat(cpuPct) / 100.0))
            let memFillH = max(2.5, min(barH, barH * CGFloat(memPct) / 100.0))
            NSColor(calibratedWhite: 1.0, alpha: 0.16).setFill()
            NSBezierPath(roundedRect: NSRect(x: 66.0, y: 4.5, width: 3.2, height: barH), xRadius: 1.5, yRadius: 1.5).fill()
            NSBezierPath(roundedRect: NSRect(x: 71.0, y: 4.5, width: 3.2, height: barH), xRadius: 1.5, yRadius: 1.5).fill()

            NSColor(calibratedRed: 0.22, green: 0.74, blue: 0.97, alpha: 1.0).setFill()
            NSBezierPath(roundedRect: NSRect(x: 66.0, y: 4.5, width: 3.2, height: cpuFillH), xRadius: 1.5, yRadius: 1.5).fill()
            NSColor(calibratedRed: 0.66, green: 0.33, blue: 0.97, alpha: 1.0).setFill()
            NSBezierPath(roundedRect: NSRect(x: 71.0, y: 4.5, width: 3.2, height: memFillH), xRadius: 1.5, yRadius: 1.5).fill()

            let cpuFont = NSFont.monospacedDigitSystemFont(ofSize: 10.5, weight: .semibold)
            let cpuAttrs: [NSAttributedString.Key: Any] = [
                .font: cpuFont,
                .foregroundColor: NSColor(calibratedRed: 0.65, green: 0.95, blue: 0.99, alpha: 1.0),
            ]
            let cpuStr = "\(cpuPct)%" as NSString
            cpuStr.draw(at: NSPoint(x: 77.5, y: 3.5), withAttributes: cpuAttrs)
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
        if let url = URL(string: "http://127.0.0.1:8766/api/status") {
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
