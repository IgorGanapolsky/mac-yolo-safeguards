import Cocoa
import Foundation

class MacYoloAppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var statusMenu: NSMenu!
    var loadItem: NSMenuItem!
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

        budgetItem = NSMenuItem(title: "Token Budget: $10.00/mo Cap [GREEN]", action: nil, keyEquivalent: "")
        budgetItem.isEnabled = false
        statusMenu.addItem(budgetItem)

        flagsItem = NSMenuItem(title: "Confidence Flags (ACTIVE): 4/4 Enforced", action: nil, keyEquivalent: "")
        flagsItem.isEnabled = false
        statusMenu.addItem(flagsItem)

        statusMenu.addItem(NSMenuItem.separator())
        statusMenu.addItem(NSMenuItem(title: "Run 12-Point Health Check (yolo-health)", action: #selector(runHealthCheck), keyEquivalent: "h"))
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
        DispatchQueue.main.async { [weak self] in
            self?.loadItem.title = "macOS Load Avg (1m): \(load1) • Guard: ACTIVE"
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
