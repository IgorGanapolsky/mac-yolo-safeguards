import Foundation
import Speech

/// Hands-free Leash commands — complements Siri App Intents on noisy shop floors.
/// @see https://developer.apple.com/documentation/speech
enum HermesSpeechBridge {
    static func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    static func transcribeApprovalCommand(at audioURL: URL) async throws -> String {
        let status = await requestAuthorization()
        guard status == .authorized else {
            throw NSError(
                domain: "HermesSpeech",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Speech recognition not authorized"]
            )
        }

        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            return ""
        }

        let request = SFSpeechURLRecognitionRequest(url: audioURL)
        request.shouldReportPartialResults = false

        return try await withCheckedThrowingContinuation { continuation in
            recognizer.recognitionTask(with: request) { result, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let result, result.isFinal else { return }
                continuation.resume(returning: result.bestTranscription.formattedString)
            }
        }
    }
}
