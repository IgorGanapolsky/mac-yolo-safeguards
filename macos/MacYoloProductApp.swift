import AppKit

let healthURL = URL(string: "http://127.0.0.1:47831/health")!
let heroURL = URL(string: "https://thumbgate.app/")!

final class ProductDelegate: NSObject, NSApplicationDelegate {
    let status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    var timer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        status.button?.title = "Yolo down"
        let menu = NSMenu()
        let open = NSMenuItem(title: "Open ThumbGate", action: #selector(openHero), keyEquivalent: "")
        open.target = self
        menu.addItem(open)
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        status.menu = menu
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.poll()
        }
        poll()
    }

    func poll() {
        URLSession.shared.dataTask(with: healthURL) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { [weak self] in
                self?.status.button?.title = ok ? "Yolo ok" : "Yolo down"
            }
        }.resume()
    }

    @objc func openHero() {
        NSWorkspace.shared.open(heroURL)
    }
}

let app = NSApplication.shared
let delegate = ProductDelegate()
app.delegate = delegate
app.run()
