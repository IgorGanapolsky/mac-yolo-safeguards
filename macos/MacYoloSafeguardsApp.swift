import Cocoa
import CoreGraphics
import Foundation
import WebKit

private let menuPanelWidth: CGFloat = 328
private let menuPanelHeight: CGFloat = 456

private let HUD_HTML = #"""
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
  html, body {
    width: 328px;
    height: 456px;
    background: #1c1c1e;
    color: #f5f5f7;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    overflow: hidden;
  }
  .shell {
    width: 328px;
    height: 456px;
    padding: 14px 16px 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #1c1c1e;
  }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .title { font-size: 13px; font-weight: 650; letter-spacing: -0.15px; }
  .icon-btn {
    width: 26px; height: 26px; border-radius: 7px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06);
    color: #f5f5f7; font-size: 13px; cursor: pointer;
  }
  .free {
    font-size: 40px; font-weight: 680; letter-spacing: -1.2px; line-height: 0.95;
    font-variant-numeric: tabular-nums;
  }
  .unit { font-size: 13px; font-weight: 600; color: #98989d; margin-top: -2px; }
  .sub { font-size: 12px; color: #98989d; min-height: 16px; }
  .track { height: 6px; background: #3a3a3c; border-radius: 3px; overflow: hidden; }
  .meter { height: 6px; width: 0%; background: #30d158; border-radius: 3px; }
  .rows { display: flex; flex-direction: column; margin-top: 2px; }
  .row {
    display: flex; align-items: center; justify-content: space-between;
    height: 30px; border-top: 1px solid rgba(255,255,255,0.08);
    font-size: 13px;
  }
  .row span:last-child { font-variant-numeric: tabular-nums; color: #d1d1d6; }
  .primary {
    height: 36px; border: none; border-radius: 8px;
    background: #0a84ff; color: #ffffff;
    font-size: 14px; font-weight: 650; cursor: pointer;
  }
  .primary:disabled { opacity: 0.55; cursor: default; }
  .note, .quiet { font-size: 11px; color: #98989d; line-height: 1.3; }
  .foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
  .link {
    background: none; border: none; color: #d1d1d6;
    font-size: 12px; font-weight: 600; cursor: pointer; padding: 0;
  }
</style>
</head>
<body>
  <div class="shell">
    <div class="top">
      <div class="title">Mac YOLO Safeguards</div>
      <button class="icon-btn" title="Menu" onclick="sendAction('openGearMenu')">⚙</button>
    </div>
    <div class="free" id="freeNum">—</div>
    <div class="unit">GiB free</div>
    <div class="sub" id="subLine">Reading the startup disk…</div>
    <div class="track"><div class="meter" id="meter"></div></div>
    <div class="rows" id="rows">
      <div class="row"><span>Agent temp</span><span>—</span></div>
      <div class="row"><span>Swift cache</span><span>—</span></div>
      <div class="row"><span>Node cache</span><span>—</span></div>
      <div class="row"><span>Playwright</span><span>—</span></div>
      <div class="row"><span>Trash</span><span>—</span></div>
    </div>
    <button class="primary" id="primary" onclick="sendAction('scan')">Scan</button>
    <div class="note" id="note">Sizes appear after Scan.</div>
    <div class="quiet" id="onScreen">On screen · …</div>
    <div class="foot">
      <span class="quiet">Settings</span>
      <button class="link" id="iconState" onclick="sendAction('toggleStatusBarIcon')">Status bar icon on</button>
      <button class="link" onclick="sendAction('dismiss')">Close</button>
    </div>
  </div>
  <script>
    function sendAction(action) {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.yoloHud) {
        window.webkit.messageHandlers.yoloHud.postMessage({ action: action });
      }
    }
    window.updateMenu = function(state) {
      if (!state) return;
      var free = document.getElementById('freeNum');
      if (free) {
        free.textContent = state.freeText || '—';
        if (state.numberColor) free.style.color = state.numberColor;
      }
      var sub = document.getElementById('subLine');
      if (sub) sub.textContent = state.subLine || '';
      var meter = document.getElementById('meter');
      if (meter) {
        var pct = Number(state.usedPct || 0);
        if (pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        meter.style.width = pct + '%';
        if (state.barColor) meter.style.background = state.barColor;
      }
      var rows = document.getElementById('rows');
      if (rows && state.rows) {
        rows.textContent = '';
        state.rows.forEach(function(row) {
          var line = document.createElement('div');
          line.className = 'row';
          var name = document.createElement('span');
          name.textContent = row.label || '';
          var size = document.createElement('span');
          size.textContent = row.size || '—';
          line.appendChild(name);
          line.appendChild(size);
          rows.appendChild(line);
        });
      }
      var btn = document.getElementById('primary');
      if (btn) {
        btn.textContent = state.buttonLabel || 'Scan';
        btn.disabled = !!state.busy;
        btn.onclick = function() { sendAction(state.buttonAction || 'scan'); };
      }

      var note = document.getElementById('note');
      if (note) note.textContent = state.note || '';
      var onScreen = document.getElementById('onScreen');
      if (onScreen) onScreen.textContent = state.onScreen || '';
      var icon = document.getElementById('iconState');
      if (icon) icon.textContent = state.iconState || 'Status bar icon on';
    };
  </script>
</body>
</html>
"""#

struct RootDisk {

    var totalGiB: Double = 0
    var freeGiB: Double = 0
    var usedPct: Double = 0
    var ok: Bool = false
}

struct MenuRow {

    var label: String
    var safe: Bool
    var bytes: Int64
}

enum MenuBusy {

    case idle, scanning, cleaning
}

private func runTool(_ path: String, _ args: [String], timeout: TimeInterval) -> String? {
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: path)
    proc.arguments = args
    let pipe = Pipe()
    proc.standardOutput = pipe
    proc.standardError = FileHandle.nullDevice
    do {
        try proc.run()
    } catch {
        return nil
    }
    let deadline = Date().addingTimeInterval(timeout)
    while proc.isRunning && Date() < deadline {
        Thread.sleep(forTimeInterval: 0.05)
    }
    if proc.isRunning {
        proc.terminate()
        return nil
    }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    guard proc.terminationStatus == 0 else { return nil }
    return String(data: data, encoding: .utf8)
}

private func readRootDisk() -> RootDisk {
    guard let out = runTool("/bin/df", ["-k", "/"], timeout: 2) else { return RootDisk() }
    guard let last = out.split(separator: "\n").last else { return RootDisk() }
    let parts = last.split(whereSeparator: { $0 == " " || $0 == "\t" })
    guard parts.count >= 4,
          let totalKb = Double(parts[1]),
          let availKb = Double(parts[3]),
          totalKb > 0 else { return RootDisk() }
    let usedKb = max(0, totalKb - availKb)
    return RootDisk(
        totalGiB: totalKb / 1_048_576,
        freeGiB: availKb / 1_048_576,
        usedPct: (usedKb / totalKb) * 100,
        ok: true
    )
}

private func duBytes(_ path: String) -> Int64 {
    guard FileManager.default.fileExists(atPath: path) else { return 0 }
    guard let out = runTool("/usr/bin/du", ["-sk", path], timeout: 3),
          let kb = Int64(out.split(whereSeparator: { $0 == " " || $0 == "\t" }).first ?? "0") else {
        return -1
    }
    return kb * 1024
}

private func formatBytes(_ bytes: Int64) -> String {
    if bytes < 0 { return "—" }
    if bytes == 0 { return "0 B" }
    let gib = Double(bytes) / 1_073_741_824
    if gib >= 1 { return String(format: "%.2f GiB", gib) }
    let mib = Double(bytes) / 1_048_576
    if mib >= 1 { return String(format: "%.0f MiB", mib) }
    let kib = Double(bytes) / 1024
    if kib >= 1 { return String(format: "%.0f KiB", kib) }
    return "\(bytes) B"
}

private func isClaudeTmp(_ name: String) -> Bool {
    let prefix = "claude-"
    guard name.hasPrefix(prefix) else { return false }
    let rest = name.dropFirst(prefix.count)
    return !rest.isEmpty && rest.allSatisfy(\.isNumber)
}

// A nonactivating panel does not resign when another app is clicked, and a
// global mouse monitor is absent without assistive access. This window sits
// under the menu and takes that click.
final class MacYoloClickAwayPanel: NSPanel {
    weak var appDelegate: MacYoloAppDelegate?

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    override func sendEvent(_ event: NSEvent) {
        switch event.type {
        case .leftMouseDown, .rightMouseDown, .otherMouseDown:
            let screenPt = convertPoint(toScreen: event.locationInWindow)
            appDelegate?.handleOutsideMouseDown(at: screenPt)
        default:
            super.sendEvent(event)
        }
    }
}

final class MacYoloClickAwayView: NSView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override var mouseDownCanMoveWindow: Bool { false }
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
    var localMouseMonitor: Any?
    var localKeyMonitor: Any?
    var clickAwayShield: MacYoloClickAwayPanel?
    var lastShownAt: Date = .distantPast
    var lastActiveApp: String = "macOS"
    var lastActiveWin: String = "Desktop"
    var rootDisk = RootDisk()
    var menuBusy: MenuBusy = .idle
    var didScan = false
    var menuRows: [MenuRow] = [
        MenuRow(label: "Agent temp", safe: true, bytes: -1),
        MenuRow(label: "Swift cache", safe: true, bytes: -1),
        MenuRow(label: "Node cache", safe: true, bytes: -1),
        MenuRow(label: "Playwright", safe: false, bytes: -1),
        MenuRow(label: "Trash", safe: false, bytes: -1),
    ]

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
            guard statusItem != nil, hudPanel != nil, webView != nil, gearMenu != nil else {
                fputs("MAC_YOLO_NATIVE_APP_SELF_TEST_FAILED\n", stderr)
                exit(1)
            }
            print("MAC_YOLO_NATIVE_APP_SELF_TEST_OK")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--status-icon-self-test") {
            runStatusIconSelfTestAndExit()
        }

        NSApp.setActivationPolicy(.accessory)
        DispatchQueue.main.async { [weak self] in

            self?.updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)
            self?.refreshLiveTelemetry()
        }



        let icnsPath = "/Applications/MacYoloSafeguards.app/Contents/Resources/AppIcon.icns"
        if let iconImg = NSImage(contentsOfFile: icnsPath) {
            NSApp.applicationIconImage = iconImg
        }
        updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)

        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] _ in
            self?.handleOutsideMouseDown(at: NSEvent.mouseLocation)
        }
        localMouseMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] event in
            guard let self = self else { return event }
            let before = self.hudPanel?.isVisible ?? false
            self.handleOutsideMouseDown(at: NSEvent.mouseLocation)
            if before && self.hudPanel?.isVisible == false { return nil }
            return event
        }
        localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 {
                self?.dismissHudNotification()
                return nil
            }
            return event
        }

        if CommandLine.arguments.contains("--click-away-self-test") {
            runClickAwaySelfTestAndExit()
        }
        if CommandLine.arguments.contains("--scan-self-test") {
            let rows = measureCategories()
            let disk = readRootDisk()
            for row in rows {
                print("SCAN \(row.label) safe=\(row.safe) bytes=\(row.bytes)")
            }
            print(String(format: "SCAN disk free=%.2f used=%.1f ok=%@", disk.freeGiB, disk.usedPct, disk.ok ? "yes" : "no"))
            print("MAC_YOLO_SCAN_OK")
            fflush(stdout)
            exit(0)
        }


        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            self?.updateActiveWindowFromWorkspace(app)
            self?.refreshLiveTelemetry()
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
                let img = NSImage(systemSymbolName: "bolt.shield.fill", accessibilityDescription: "Mac YOLO Safeguards")?.withSymbolConfiguration(cfg)
                img?.isTemplate = true
                button.image = img
                button.imagePosition = .imageLeading
            }
            button.title = " …"
            button.setAccessibilityIdentifier("macyolo.status.item.button")
            button.target = self
            button.action = #selector(togglePopover(_:))
        }

        gearMenu = NSMenu(title: "Mac YOLO Safeguards Menu")
        addGearItem("About Mac YOLO Safeguards", #selector(openDashboard))
        addGearItem("Provide Feedback…", #selector(openFeedback))
        gearMenu.addItem(NSMenuItem.separator())
        let settingsLabel = NSMenuItem(title: "Settings", action: nil, keyEquivalent: "")
        settingsLabel.isEnabled = false
        gearMenu.addItem(settingsLabel)
        statusBarMenuItem = NSMenuItem(title: "Show Status Bar Icon", action: #selector(toggleStatusBarIcon(_:)), keyEquivalent: "")
        statusBarMenuItem.target = self
        statusBarMenuItem.state = showStatusBarIcon ? .on : .off
        gearMenu.addItem(statusBarMenuItem)
        addGearItem("Shut Down Simulators", #selector(reapSimulators))
        gearMenu.addItem(NSMenuItem.separator())
        gearMenu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        hudPanel = NSPanel(
            contentRect: NSRect(x: screenFrame.maxX - menuPanelWidth - 12, y: screenFrame.maxY - menuPanelHeight - 8, width: menuPanelWidth, height: menuPanelHeight),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        hudPanel.title = "Mac YOLO Safeguards"
        hudPanel.isFloatingPanel = true
        // isFloatingPanel resets the level to .floating. Keep the menu above the shield.
        hudPanel.level = .statusBar
        hudPanel.hidesOnDeactivate = false
        hudPanel.isOpaque = true
        hudPanel.backgroundColor = NSColor(srgbRed: 0.110, green: 0.110, blue: 0.118, alpha: 1)
        hudPanel.hasShadow = true
        hudPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hudPanel.isReleasedWhenClosed = false
        hudPanel.setAccessibilityIdentifier("macyolo.hud.menu")

        let wkConfig = WKWebViewConfiguration()
        wkConfig.userContentController.add(self, name: "yoloHud")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: menuPanelWidth, height: menuPanelHeight), configuration: wkConfig)
        webView.setValue(false, forKey: "drawsBackground")
        webView.loadHTMLString(HUD_HTML, baseURL: nil)
        hudPanel.contentView = webView
        hudPanel.delegate = self
    }

    func addGearItem(_ title: String, _ action: Selector) {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        gearMenu.addItem(item)
    }

    func allScreensFrame() -> NSRect {
        NSScreen.screens.reduce(NSRect.null) { partial, screen in
            partial.union(screen.frame)
        }
    }

    func ensureClickAwayShield() {
        let frame = allScreensFrame()
        if let existing = clickAwayShield {
            existing.setFrame(frame, display: false)
            return
        }
        let shield = MacYoloClickAwayPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        shield.appDelegate = self
        shield.title = ""
        shield.isOpaque = false
        shield.hasShadow = false
        shield.ignoresMouseEvents = false
        shield.backgroundColor = .clear
        shield.hidesOnDeactivate = false
        shield.isReleasedWhenClosed = false
        shield.isExcludedFromWindowsMenu = true
        shield.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        shield.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue - 1)
        let content = MacYoloClickAwayView(frame: NSRect(origin: .zero, size: frame.size))
        content.wantsLayer = true
        shield.contentView = content
        shield.setAccessibilityIdentifier("macyolo.hud.clickaway")
        clickAwayShield = shield
    }

    func handleOutsideMouseDown(at mouseLoc: NSPoint) {
        guard hudPanel != nil, hudPanel.isVisible else { return }
        if Date().timeIntervalSince(lastShownAt) < 0.35 { return }
        if hudPanel.frame.contains(mouseLoc) { return }
        if let btnWin = statusItem?.button?.window, btnWin.frame.contains(mouseLoc) { return }
        dismissHudNotification()
    }

    func runClickAwaySelfTestAndExit() {
        showFloatingHudNotification()
        CFRunLoopRunInMode(.defaultMode, 0.3, false)
        let vf = NSScreen.main?.visibleFrame ?? hudPanel.frame
        let outside = NSPoint(x: vf.minX + 36, y: vf.midY)
        let inside = NSPoint(x: hudPanel.frame.midX, y: hudPanel.frame.midY)
        let shieldNum = clickAwayShield?.windowNumber ?? -1
        let hudNum = hudPanel.windowNumber
        let hitOut = NSWindow.windowNumber(at: outside, belowWindowWithWindowNumber: 0)
        var hitIn = NSWindow.windowNumber(at: inside, belowWindowWithWindowNumber: 0)
        let paintDeadline = Date().addingTimeInterval(2.5)
        while hitIn != hudNum && Date() < paintDeadline {
            CFRunLoopRunInMode(.defaultMode, 0.1, false)
            hitIn = NSWindow.windowNumber(at: inside, belowWindowWithWindowNumber: 0)
        }
        fputs("click-away hitOut=\(hitOut) shield=\(shieldNum) hitIn=\(hitIn) hud=\(hudNum) hudLevel=\(hudPanel.level.rawValue) shieldLevel=\(clickAwayShield?.level.rawValue ?? -1) hudFrame=\(hudPanel.frame)\n", stderr)
        if hitOut != shieldNum || hitIn != hudNum {
            fputs("MAC_YOLO_CLICK_AWAY_HIT_TEST_FAILED\n", stderr)
            exit(1)
        }
        CFRunLoopRunInMode(.defaultMode, 0.2, false)
        let winPoint = clickAwayShield?.convertPoint(fromScreen: outside) ?? .zero
        if let event = NSEvent.mouseEvent(
            with: .leftMouseDown,
            location: winPoint,
            modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime,
            windowNumber: shieldNum,
            context: nil,
            eventNumber: 1,
            clickCount: 1,
            pressure: 1
        ) {
            clickAwayShield?.sendEvent(event)
        }
        CFRunLoopRunInMode(.defaultMode, 0.15, false)
        if hudPanel.isVisible || (clickAwayShield?.isVisible ?? false) {
            fputs("MAC_YOLO_CLICK_AWAY_DISMISS_FAILED\n", stderr)
            exit(1)
        }
        let hitAfter = NSWindow.windowNumber(at: outside, belowWindowWithWindowNumber: 0)
        fputs("click-away hitAfter=\(hitAfter) shield=\(shieldNum)\n", stderr)
        if hitAfter == shieldNum {
            fputs("MAC_YOLO_CLICK_AWAY_SHIELD_STUCK\n", stderr)
            exit(1)
        }
        print("MAC_YOLO_CLICK_AWAY_OK")
        fflush(stdout)
        exit(0)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        switch action {
        case "scan", "primary":
            if menuBusy == .idle && didScan && safeBytes() > 0 {
                runSafeClean()
            } else {
                runCategoryScan()
            }
        case "clean":
            runSafeClean()

        case "openGearMenu":
            statusBarMenuItem?.state = showStatusBarIcon ? .on : .off
            if let view = hudPanel.contentView {
                let pt = NSPoint(x: view.bounds.width - 28, y: view.bounds.height - 28)
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

    @objc func toggleStatusBarIcon(_ sender: AnyObject?) {
        applyStatusBarIconVisible(!showStatusBarIcon)
        pushMenu()
    }

    func applyStatusBarIconVisible(_ visible: Bool) {
        showStatusBarIcon = visible
        statusItem.isVisible = visible
        statusBarMenuItem?.state = visible ? .on : .off
        UserDefaults.standard.set(visible, forKey: "MacYoloShowStatusBarIcon")
    }

    func runStatusIconSelfTestAndExit() {
        applyStatusBarIconVisible(true)
        let shown = statusItem.isVisible
        applyStatusBarIconVisible(false)
        let hidden = statusItem.isVisible
        let storedHidden = UserDefaults.standard.bool(forKey: "MacYoloShowStatusBarIcon")
        applyStatusBarIconVisible(true)
        let restored = statusItem.isVisible
        let storedShown = UserDefaults.standard.bool(forKey: "MacYoloShowStatusBarIcon")
        if shown && !hidden && !storedHidden && restored && storedShown {
            print("MAC_YOLO_STATUS_ICON_OK shown=1 hidden=0 restored=1")
            fflush(stdout)
            exit(0)
        }
        fputs("MAC_YOLO_STATUS_ICON_FAIL\n", stderr)
        exit(1)
    }

    func dismissHudNotification() {
        clickAwayShield?.orderOut(nil)
        hudPanel?.orderOut(nil)
    }

    func updateActiveWindowFromWorkspace(_ app: NSRunningApplication?) {
        let skip: Set<String> = [
            "MacYoloSafeguards", "Mac YOLO Safeguards", "Mac YOLO Guard",
            "Dayglass", "Window Server", "Dock", "Control Center",
            "Notification Center", "SystemUIServer",
        ]
        if let a = app, a.bundleIdentifier == "com.iganapolsky.macyolosafeguards" { return }
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

    func safeBytes() -> Int64 {
        menuRows.reduce(0) { partial, row in
            guard row.safe, row.bytes > 0 else { return partial }
            return partial + row.bytes
        }
    }

    func measureCategories() -> [MenuRow] {
        let fm = FileManager.default
        var agent: Int64 = 0
        var agentUnknown = false
        if let names = try? fm.contentsOfDirectory(atPath: "/private/tmp") {
            for name in names where isClaudeTmp(name) {
                let measured = duBytes("/private/tmp/\(name)")
                if measured < 0 { agentUnknown = true } else { agent += measured }
            }
        }
        let home = fm.homeDirectoryForCurrentUser.path
        return [
            MenuRow(label: "Agent temp", safe: true, bytes: agentUnknown ? -1 : agent),
            MenuRow(label: "Swift cache", safe: true, bytes: duBytes("/private/tmp/swift-module-cache")),
            MenuRow(label: "Node cache", safe: true, bytes: duBytes("/private/tmp/node-compile-cache")),
            MenuRow(label: "Playwright", safe: false, bytes: duBytes(home + "/Library/Caches/ms-playwright")),
            MenuRow(label: "Trash", safe: false, bytes: duBytes(home + "/.Trash")),
        ]
    }

    func deleteMeasuredSafe(_ rows: [MenuRow]) {
        let fm = FileManager.default
        if let agent = rows.first(where: { $0.label == "Agent temp" }), agent.bytes > 0,
           let names = try? fm.contentsOfDirectory(atPath: "/private/tmp") {
            for name in names where isClaudeTmp(name) {
                let path = "/private/tmp/\(name)"
                guard path.hasPrefix("/private/tmp/") else { continue }
                try? fm.removeItem(atPath: path)
            }
        }
        for label in ["Swift cache", "Node cache"] {
            guard let row = rows.first(where: { $0.label == label }), row.bytes > 0 else { continue }
            let path = label == "Swift cache" ? "/private/tmp/swift-module-cache" : "/private/tmp/node-compile-cache"
            guard path.hasPrefix("/private/tmp/") else { continue }
            try? fm.removeItem(atPath: path)
        }
    }

    func runCategoryScan() {
        guard menuBusy == .idle else { return }
        menuBusy = .scanning
        pushMenu()
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else { return }
            let rows = self.measureCategories()
            DispatchQueue.main.async {
                self.menuRows = rows
                self.didScan = true
                self.menuBusy = .idle
                self.rootDisk = readRootDisk()
                self.pushMenu()
            }
        }
    }

    func runSafeClean() {
        guard menuBusy == .idle, didScan, safeBytes() > 0 else { return }
        let snapshot = menuRows
        menuBusy = .cleaning
        pushMenu()
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else { return }
            self.deleteMeasuredSafe(snapshot)
            let rows = self.measureCategories()
            DispatchQueue.main.async {
                self.menuRows = rows
                self.didScan = true
                self.menuBusy = .idle
                self.rootDisk = readRootDisk()
                self.pushMenu()
            }
        }
    }

    func refreshLiveTelemetry() {
        let disk = readRootDisk()
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if disk.ok { self.rootDisk = disk }
            self.pushMenu()
        }
    }

    func pushMenu() {
        let disk = rootDisk
        let tone = menuTone(disk)
        let onScreenName = lastActiveWin == lastActiveApp ? lastActiveApp : "\(lastActiveApp) — \(lastActiveWin)"
        let safe = safeBytes()
        let buttonLabel: String
        let buttonAction: String
        let note: String
        switch menuBusy {
        case .scanning:
            buttonLabel = "Scanning…"
            buttonAction = "scan"
            note = "Measuring agent temp, caches, and Trash."
        case .cleaning:
            buttonLabel = "Cleaning…"
            buttonAction = "clean"
            note = "Removing measured agent temp under /private/tmp."
        case .idle:
            if didScan && safe > 0 {
                buttonLabel = "Clean \(formatBytes(safe))"
                buttonAction = "clean"
                note = "Clean removes measured agent temp only."
            } else if didScan {
                buttonLabel = "Scan"
                buttonAction = "scan"
                note = "No agent temp to remove."
            } else {
                buttonLabel = "Scan"
                buttonAction = "scan"
                note = "Sizes appear after Scan."
            }
        }
        let subLine: String
        let freeText: String
        if disk.ok {
            freeText = String(format: "%.1f", disk.freeGiB)
            subLine = String(format: "of %.0f GiB · %.0f%% · %@", disk.totalGiB, disk.usedPct.rounded(), tone.word)
        } else {
            freeText = "—"
            subLine = "Disk reading unavailable"
        }
        let rows: [[String: String]] = menuRows.map { ["label": $0.label, "size": formatBytes($0.bytes)] }
        let payload: [String: Any] = [
            "freeText": freeText,
            "subLine": subLine,
            "usedPct": Int(disk.ok ? min(100, max(0, disk.usedPct.rounded())) : 0),
            "numberColor": tone.numberHex,
            "barColor": tone.barHex,
            "rows": rows,
            "buttonLabel": buttonLabel,
            "buttonAction": buttonAction,
            "busy": menuBusy != .idle,
            "note": note,
            "onScreen": "On screen · \(onScreenName)",
            "iconState": showStatusBarIcon ? "Status bar icon on" : "Status bar icon off",
        ]
        if let button = statusItem?.button {
            statusItem.isVisible = showStatusBarIcon
            if disk.ok {
                let title = " \(Int(disk.freeGiB.rounded()))G"
                button.attributedTitle = NSAttributedString(string: title, attributes: [
                    .foregroundColor: tone.titleColor,
                    .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .semibold),
                ])
                if #available(macOS 11.0, *) {
                    button.contentTintColor = tone.tint
                }
            }
        }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("if (window.updateMenu) window.updateMenu(\(json));", completionHandler: nil)
    }

    func menuTone(_ disk: RootDisk) -> (word: String, numberHex: String, barHex: String, titleColor: NSColor, tint: NSColor?) {
        guard disk.ok else {
            return ("", "#f5f5f7", "#8e8e93", .labelColor, nil)
        }
        if disk.usedPct >= 90 || disk.freeGiB < 25 {
            return ("Low", "#ff453a", "#ff453a", .systemRed, .systemRed)
        }
        if disk.usedPct >= 80 || disk.freeGiB < 50 {
            return ("Tight", "#ffd60a", "#ffd60a", .systemYellow, .systemYellow)
        }
        return ("OK", "#f5f5f7", "#30d158", .labelColor, nil)
    }

    func placeMenuPanel() {
        let screen = statusItem.button?.window?.screen ?? NSScreen.main
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        var x = visible.maxX - menuPanelWidth - 12
        var y = visible.maxY - menuPanelHeight - 6
        if let button = statusItem.button, let window = button.window {
            let buttonFrame = window.convertToScreen(button.convert(button.bounds, to: nil))
            let inMenuBar = buttonFrame.width > 8
                && buttonFrame.height > 8
                && buttonFrame.midY >= visible.maxY - 2
            if inMenuBar {
                x = buttonFrame.midX - menuPanelWidth / 2
                y = buttonFrame.minY - menuPanelHeight - 4
            }
        }

        if x < visible.minX + 4 { x = visible.minX + 4 }
        if x + menuPanelWidth > visible.maxX - 4 { x = visible.maxX - menuPanelWidth - 4 }
        if y < visible.minY + 4 { y = visible.maxY - menuPanelHeight - 8 }
        let frame = NSRect(x: x, y: y, width: menuPanelWidth, height: menuPanelHeight)
        hudPanel.setFrame(frame, display: true)
        webView?.frame = NSRect(origin: .zero, size: frame.size)
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
        placeMenuPanel()
        ensureClickAwayShield()
        clickAwayShield?.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue - 1)
        hudPanel.level = .statusBar
        clickAwayShield?.orderFrontRegardless()
        hudPanel.orderFrontRegardless()
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.hudPanel.isVisible else { return }
            self.placeMenuPanel()
        }
    }


    @objc func reapSimulators() {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
        proc.arguments = ["simctl", "shutdown", "all"]
        try? proc.run()
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

extension MacYoloAppDelegate: NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        if (notification.object as? NSWindow) === hudPanel {
            clickAwayShield?.orderOut(nil)
        }
    }
}

let app = NSApplication.shared
let delegate = MacYoloAppDelegate()
app.delegate = delegate
app.run()
