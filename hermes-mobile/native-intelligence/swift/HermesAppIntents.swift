import UIKit
import AppIntents
import Foundation

// MARK: - Approve / reject (ThumbGate Leash vertical slice)

struct ApproveTopPendingIntent: AppIntent {
    static var title: LocalizedStringResource = "Approve Top Pending Tool Call"
    static var description = IntentDescription("Approves the top pending ThumbGate approval in Hermes Mobile.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await UIApplication.shared.open(HermesDeepLink.approve)
        return .result(dialog: "Opening Hermes to approve the pending tool call.")
    }
}

struct RejectTopPendingIntent: AppIntent {
    static var title: LocalizedStringResource = "Reject Top Pending Tool Call"
    static var description = IntentDescription("Rejects the top pending ThumbGate approval in Hermes Mobile.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await UIApplication.shared.open(HermesDeepLink.reject)
        return .result(dialog: "Opening Hermes to reject the pending tool call.")
    }
}

struct OpenLeashIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Hermes Leash"
    static var description = IntentDescription("Opens the Leash tab for ThumbGate approvals.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await UIApplication.shared.open(HermesDeepLink.openLeash)
        return .result()
    }
}

struct CheckGatewayHealthIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Gateway Health"
    static var description = IntentDescription("Opens Hermes Leash and refreshes gateway health.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await UIApplication.shared.open(HermesDeepLink.health)
        return .result(dialog: "Checking Hermes gateway health.")
    }
}

// MARK: - Siri phrases + Shortcuts catalog

struct HermesShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        [
            AppShortcut(
                intent: ApproveTopPendingIntent(),
                phrases: [
                    "Approve with \(.applicationName)",
                    "Approve tool call in \(.applicationName)",
                    "Approve override in \(.applicationName)",
                ],
                shortTitle: "Approve",
                systemImageName: "checkmark.shield"
            ),
            AppShortcut(
                intent: RejectTopPendingIntent(),
                phrases: [
                    "Reject with \(.applicationName)",
                    "Reject tool call in \(.applicationName)",
                ],
                shortTitle: "Reject",
                systemImageName: "xmark.shield"
            ),
            AppShortcut(
                intent: OpenLeashIntent(),
                phrases: [
                    "Open Leash in \(.applicationName)",
                    "Show approvals in \(.applicationName)",
                ],
                shortTitle: "Leash",
                systemImageName: "bolt.shield"
            ),
            AppShortcut(
                intent: CheckGatewayHealthIntent(),
                phrases: [
                    "Check gateway in \(.applicationName)",
                    "Gateway health in \(.applicationName)",
                ],
                shortTitle: "Health",
                systemImageName: "heart.text.square"
            ),
        ]
    }
}
