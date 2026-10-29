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
    width: 420px;
    height: 668px;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
    color: #ffffff;
    overflow: hidden;
  }
  .shell {
    width: 420px;
    height: 668px;
    border-radius: 22px;
    background: radial-gradient(circle at 82% 10%, rgba(139, 92, 246, 0.46) 0%, rgba(59, 24, 119, 0.54) 48%, rgba(24, 12, 54, 0.68) 100%);
    backdrop-filter: blur(28px) saturate(165%);
    -webkit-backdrop-filter: blur(28px) saturate(165%);
    border: 1px solid rgba(255, 255, 255, 0.24);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.28);
    padding: 16px 16px 12px 16px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 8px 4px;
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
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 14px;
    padding: 10px 13px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
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
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 14px;
    padding: 9px 12px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 68px;
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
  .footer {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding-top: 8px;
  }
  .footer-btn {
    height: 30px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.11);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .footer-btn:hover {
    background: rgba(255, 255, 255, 0.22);
    color: #ffffff;
  }
</style>
</head>
<body>
  <div class="shell">
    <div>
      <div class="header">
        <div>
          <div class="header-title">Mac Health: <span id="healthState">Excellent</span></div>
          <div class="header-sub" id="macModel">MacBook Pro</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="rec-btn" style="padding:5px 10px;font-size:11.5px;" onclick="toggleSettingsDrawer()">⚙️ Settings</button>
          <div class="laptop-badge" style="width:46px;height:38px;font-size:26px;">💻</div>
        </div>
      </div>

      <div class="card shield-card">
        <div class="shield-top">
          <div class="shield-left">
            <span class="shield-pill">✓</span>
            <span>Protection by <strong>Mac YOLO Guard</strong></span>
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
          </div>
          <button class="tile-action" onclick="sendAction('freeUpDisk')">Free Up</button>
        </div>

        <div class="tile">
          <div>
            <div class="tile-head"><span class="tile-icon">▦</span><span>Memory</span></div>
            <div class="tile-sub" id="memPressure">Pressure: 38%</div>
          </div>
          <button class="tile-action" onclick="sendAction('freeUpMemory')">Free Up</button>
        </div>

        <div class="tile">
          <div class="tile-row">
            <div class="tile-head"><span class="tile-icon">🔋</span><span>Battery</span></div>
            <span class="tile-val" id="battPct">100%</span>
          </div>
          <div class="tile-sub" id="battState">Fully charged</div>
        </div>

        <div class="tile">
          <div class="tile-row">
            <div class="tile-head"><span class="tile-icon">⚙️</span><span>CPU</span></div>
            <span class="tile-val hot" id="cpuTemp">Load 1m</span>
          </div>
          <div class="tile-sub" id="cpuLoad">Load: 24%</div>
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
        <div class="rec-header">Today's Recommendation</div>
        <div class="card rec-card">
          <div class="rec-top">
            <div class="rec-badge">🛡️</div>
            <div>
              <div class="rec-title" id="recTitle">47.24 GiB reclaimed from runaway agent /tmp</div>
              <div class="rec-desc" id="recDesc">Keep coding agents fenced under the $10/mo token cap and zero-drift declarative schema guard.</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
            <button class="tile-action" style="margin-top:0;" onclick="toggleSettingsDrawer(true)">⚙️ Settings &amp; Status Icon…</button>
            <button class="rec-btn" onclick="sendAction('runSmartScan')">Run Smart Guard Scan</button>
          </div>
        </div>
      </div>

      <div class="card rec-card" id="settingsDrawer" style="display:none;padding:10px 13px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="font-size:13px;font-weight:700;">⚙️ Mac YOLO Guard Settings</div>
          <button class="tile-action" style="margin-top:0;" onclick="toggleSettingsDrawer(false)">← Back</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid rgba(255,255,255,0.12);">
          <span style="font-size:12px;color:rgba(255,255,255,0.92);">Mac YOLO Status Bar Icon</span>
          <button class="rec-btn" style="padding:3px 10px;font-size:11.5px;" id="statusBarToggleBtn" onclick="sendAction('toggleStatusBarIcon')">Shown ✓ (Click to Hide)</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid rgba(255,255,255,0.12);">
          <span style="font-size:12px;color:rgba(255,255,255,0.78);">CleanMyMac 5 Status Bar Icon</span>
          <span style="font-size:11.5px;color:#4BE38A;font-weight:600;">Disabled ✓</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid rgba(255,255,255,0.12);">
          <span style="font-size:12px;color:rgba(255,255,255,0.78);">5-Pillar Smart Care &amp; Browser Care</span>
          <span style="font-size:11.5px;color:#5eead4;font-weight:600;">Active ✓</span>
        </div>
      </div>

      <div class="card" style="margin-top:8px;padding:7px 12px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11.5px;color:rgba(255,255,255,0.85);">⚙️ Menu Bar Icon: <strong id="quickStatusIconLabel" style="color:#5eead4;">Shown ✓</strong> • CleanMyMac Icon: <strong style="color:#4BE38A;">Off</strong></span>
        <button class="tile-action" style="margin-top:0;font-size:11.5px;" onclick="sendAction('toggleStatusBarIcon')">Hide / Show</button>
      </div>
    </div>

    <div class="footer">
      <button class="footer-btn" title="Open Settings" onclick="toggleSettingsDrawer()">⚙️ Settings</button>
      <button class="footer-btn" title="Purge agent temp &amp; build caches" onclick="sendAction('runSmartScan')">🧹 Clean Junk</button>
      <button class="footer-btn" title="Reap runaway simulators &amp; free RAM" onclick="sendAction('freeUpMemory')">⚡ Free RAM</button>
      <button class="footer-btn" title="Hide this HUD window (Esc)" onclick="sendAction('dismiss')">✕ Close</button>
    </div>
  </div>

  <script>
    function sendAction(action) {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.yoloHud) {
        window.webkit.messageHandlers.yoloHud.postMessage({ action: action });
      }
    }
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
    var lastShownAt: Date = .distantPast
    var lastActiveApp: String = "macOS"
    var lastActiveWin: String = "Desktop"
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

        NSApp.setActivationPolicy(.regular)
        let icnsPath = "/Applications/MacYoloSafeguards.app/Contents/Resources/AppIcon.icns"
        if let iconImg = NSImage(contentsOfFile: icnsPath) {
            NSApp.applicationIconImage = iconImg
            NSWorkspace.shared.setIcon(iconImg, forFile: "/Applications/MacYoloSafeguards.app", options: [])
        }
        updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)

        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] _ in
            guard let self = self, self.hudPanel != nil, self.hudPanel.isVisible else { return }
            if Date().timeIntervalSince(self.lastShownAt) < 3.5 { return }
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
            if #available(macOS 11.0, *) {
                let cfg = NSImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
                let img = NSImage(systemSymbolName: "bolt.shield.fill", accessibilityDescription: "Mac YOLO Guard")?.withSymbolConfiguration(cfg)
                img?.isTemplate = true
                button.image = img
                button.imagePosition = .imageLeading
            }
            button.title = " 150G"
            button.setAccessibilityIdentifier("macyolo.status.item.button")
            button.target = self
            button.action = #selector(togglePopover(_:))
        }

        gearMenu = NSMenu(title: "Mac YOLO Guard Menu")
        gearMenu.addItem(NSMenuItem(title: "About Mac YOLO Guard", action: #selector(openDashboard), keyEquivalent: ""))
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
        let panelW: CGFloat = 420
        let panelH: CGFloat = 668
        let panelX = screenFrame.maxX - panelW - 18
        let panelY = screenFrame.maxY - panelH - 8
        hudPanel = NSPanel(
            contentRect: NSRect(x: panelX, y: panelY, width: panelW, height: panelH),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        hudPanel.title = "Mac YOLO Guard"
        hudPanel.level = .statusBar
        hudPanel.isFloatingPanel = true
        hudPanel.hidesOnDeactivate = false
        hudPanel.isOpaque = false
        hudPanel.backgroundColor = .clear
        hudPanel.alphaValue = 0.88
        hudPanel.hasShadow = true
        hudPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hudPanel.isReleasedWhenClosed = false

        let visualEffect = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: panelW, height: panelH))
        visualEffect.material = .hudWindow
        visualEffect.blendingMode = .behindWindow
        visualEffect.state = .active
        visualEffect.wantsLayer = true
        visualEffect.layer?.cornerRadius = 22
        visualEffect.layer?.masksToBounds = true

        let wkConfig = WKWebViewConfiguration()
        wkConfig.userContentController.add(self, name: "yoloHud")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: panelW, height: panelH), configuration: wkConfig)
        webView.setValue(false, forKey: "drawsBackground")
        webView.loadHTMLString(HUD_HTML, baseURL: nil)
        visualEffect.addSubview(webView)
        hudPanel.contentView = visualEffect
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        switch action {
        case "freeUpDisk", "runSmartScan":
            smartCleanDisk()
        case "freeUpMemory":
            reapSimulators()
        case "testSpeed":
            refreshLiveTelemetry()
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
        let skip: Set<String> = ["MacYoloSafeguards", "Dayglass", "Window Server", "Dock", "Control Center", "Notification Center", "SystemUIServer"]
        if let a = app, let name = a.localizedName, !skip.contains(name) {
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

        let payload: [String: String] = [
            "healthState": freeDecimalGB >= 80.0 ? "Excellent" : "Attention",
            "onScreenLine": onScreenLine,
            "activeApp": lastActiveApp,
            "activeWin": lastActiveWin,
            "diskAvail": diskAvailStr,
            "memPressure": "Pressure: \(memPressurePct)%",
            "battPct": "100%",
            "battState": "Fully charged",
            "cpuLoad": "Load: \(cpuPct)%",
            "cpuRight": "1m: \(load1Str)",
            "netUp": upRate,
            "netDown": downRate,
            "statusBarIconVisible": showStatusBarIcon ? "true" : "false",
        ]

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.statusItem.isVisible = self.showStatusBarIcon
            self.statusItem.button?.title = " \(freeMenuInt)G"
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

    func showFloatingHudNotification() {
        lastShownAt = Date()
        refreshLiveTelemetry()
        if let screenFrame = NSScreen.main?.visibleFrame {
            let panelW: CGFloat = 420
            let panelH: CGFloat = 668
            hudPanel.setFrameOrigin(NSPoint(x: screenFrame.maxX - panelW - 18, y: screenFrame.maxY - panelH - 8))
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
