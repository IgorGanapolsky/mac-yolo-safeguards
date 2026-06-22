import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// On-device summarization for ThumbGate blocked-command diffs.
/// @see https://developer.apple.com/documentation/foundationmodels
enum HermesFoundationModelsBridge {
    static func summarizeApprovalDiff(_ diff: String) async throws -> String {
        let trimmed = diff.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "No diff to summarize." }

        #if canImport(FoundationModels)
        // Wire LanguageModelSession + Dynamic Profile when targeting iOS 26+ SDK.
        return "On-device summary pending LanguageModelSession integration. Diff length: \(trimmed.count) chars."
        #else
        let preview = trimmed.prefix(240)
        return "Diff preview (Foundation Models unavailable): \(preview)"
        #endif
    }
}
