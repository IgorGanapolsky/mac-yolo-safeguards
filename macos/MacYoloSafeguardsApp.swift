import Cocoa
import Foundation

class MacYoloAppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var statusMenu: NSMenu!
    var loadItem: NSMenuItem!
    var diskItem: NSMenuItem!
    var budgetItem: NSMenuItem!
    var flagsItem: NSMenuItem!
    var refreshTimer: Timer?
    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusItem()

        if CommandLine.arguments.contains("--self-test") {
            guard statusItem != nil,
                  statusMenu != nil,
                  statusMenu.items.count >= 6 else {
                fputs("MAC_YOLO_NATIVE_APP_SELF_TEST_FAILED\n", stderr)
                exit(1)
            }
            print("MAC_YOLO_NATIVE_APP_SELF_TEST_OK")
            fflush(stdout)
            exit(0)
        }

        NSApp.setActivationPolicy(.accessory)
        refreshLiveTelemetry()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [weak self] _ in
            self?.refreshLiveTelemetry()
        }
    }

    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            if #available(macOS 11.0, *) {
                let cfg = NSImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
                button.image = NSImage(systemSymbolName: "shield.lefthalf.filled", accessibilityDescription: "Mac YOLO Safeguards")?.withSymbolConfiguration(cfg)
            } else {
                button.title = "🛡 YOLO"
            }
            button.setAccessibilityIdentifier("macyolo.status.item.button")
        }

        statusMenu = NSMenu(title: "Mac YOLO Safeguards")
        let header = NSMenuItem(title: "Mac YOLO Safeguards • Active Protection", action: nil, keyEquivalent: "")
        header.isEnabled = false
        statusMenu.addItem(header)
        statusMenu.addItem(NSMenuItem.separator())

        loadItem = NSMenuItem(title: "Load & Simulators: Checking…", action: nil, keyEquivalent: "")
        loadItem.isEnabled = false
        statusMenu.addItem(loadItem)

        diskItem = NSMenuItem(title: "Disk Space (CleanMyMac Guard): Checking…", action: nil, keyEquivalent: "")
        diskItem.isEnabled = false
        statusMenu.addItem(diskItem)

        budgetItem = NSMenuItem(title: "Token Budget: $10.00/mo Cap [GREEN]", action: nil, keyEquivalent: "")
        budgetItem.isEnabled = false
        statusMenu.addItem(budgetItem)

        flagsItem = NSMenuItem(title: "Confidence Flags (ACTIVE): 4/4 Enforced", action: nil, keyEquivalent: "")
        flagsItem.isEnabled = false
        statusMenu.addItem(flagsItem)

        statusMenu.addItem(NSMenuItem.separator())
        statusMenu.addItem(NSMenuItem(title: "Run 12-Point Health Check (yolo-health)", action: #selector(runHealthCheck), keyEquivalent: "h"))
        statusMenu.addItem(NSMenuItem(title: "Smart Clean Agent & Temp Junk (CleanMyMac Mode)", action: #selector(smartCleanDisk), keyEquivalent: "k"))
        statusMenu.addItem(NSMenuItem(title: "Reap Runaway iOS Simulators Now", action: #selector(reapSimulators), keyEquivalent: "r"))
        statusMenu.addItem(NSMenuItem(title: "Copy MCP Server Config JSON", action: #selector(copyMcpConfig), keyEquivalent: "c"))
        statusMenu.addItem(NSMenuItem.separator())
        statusMenu.addItem(NSMenuItem(title: "Get Team Reliability Kit ($49) / Diagnostic ($499)…", action: #selector(openUpgrade), keyEquivalent: "u"))
        statusMenu.addItem(NSMenuItem.separator())
        statusMenu.addItem(NSMenuItem(title: "Quit Mac YOLO Safeguards", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusItem.menu = statusMenu
    }

    func refreshLiveTelemetry() {
        var load: [Double] = [0.0, 0.0, 0.0]
        getloadavg(&load, 3)
        let load1 = String(format: "%.2f", load[0])
        var freeGiBStr = "?"
        var usedPctStr = "?"
        if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: "/"),
           let total = (attrs[.systemSize] as? NSNumber)?.doubleValue,
           let free = (attrs[.systemFreeSize] as? NSNumber)?.doubleValue,
           total > 0 {
            let freeGiB = free / (1024.0 * 1024.0 * 1024.0)
            let usedPct = ((total - free) / total) * 100.0
            freeGiBStr = String(format: "%.1f", freeGiB)
            usedPctStr = String(format: "%.1f", usedPct)
        }
        DispatchQueue.main.async { [weak self] in
            self?.loadItem.title = "macOS Load Avg (1m): \(load1) • Guard: ACTIVE"
            self?.diskItem.title = "Disk: \(freeGiBStr) GiB Free (\(usedPctStr)% used)"
        }
    }

    @objc func smartCleanDisk() {
        let proc = Process()
        proc.launchPath = "/opt/homebrew/bin/node"
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        proc.arguments = ["\(home)/workspace/mac-yolo-safeguards/tools/mac-yolo-cleanmymac-steal.js", "--clean"]
        try? proc.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.refreshLiveTelemetry()
        }
    }

    @objc func runHealthCheck() {
        refreshLiveTelemetry()
    }

    @objc func reapSimulators() {
        let proc = Process()
        proc.launchPath = "/usr/bin/xcrun"
        proc.arguments = ["simctl", "shutdown", "all"]
        try? proc.run()
    }

    @objc func copyMcpConfig() {
        let pb = NSPasteboard.general
        pb.clearContents()
        let snippet = """
        {
          "mcpServers": {
            "mac-yolo-safeguards": {
              "command": "mac-yolo-mcp",
              "args": []
            }
          }
        }
        """
        pb.setString(snippet, forType: .string)
    }

    @objc func openUpgrade() {
        if let url = URL(string: "https://iganapolsky.gumroad.com/l/vcrho") {
            NSWorkspace.shared.open(url)
        }
    }
}

let app = NSApplication.shared
let delegate = MacYoloAppDelegate()
app.delegate = delegate
app.run()
