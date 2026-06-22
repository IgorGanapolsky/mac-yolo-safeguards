import AppIntents
import Foundation

/// Pending ThumbGate approval exposed to Siri / Spotlight (entity schema).
struct HermesPendingApprovalEntity: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Pending Approval")
    static var defaultQuery = HermesPendingApprovalQuery()

    var id: String
    var toolName: String
    var reason: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(toolName)", subtitle: "\(reason)")
    }
}

struct HermesPendingApprovalQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [HermesPendingApprovalEntity] {
        identifiers.compactMap { id in
            HermesPendingApprovalEntity(id: id, toolName: "run_command", reason: "ThumbGate blocked tool")
        }
    }

    func suggestedEntities() async throws -> [HermesPendingApprovalEntity] {
        []
    }
}

enum HermesDeepLink {
    static let approve = URL(string: "hermes://leash/approve")!
    static let reject = URL(string: "hermes://leash/reject")!
    static let openLeash = URL(string: "hermes://leash")!
    static let health = URL(string: "hermes://leash/health")!
}
