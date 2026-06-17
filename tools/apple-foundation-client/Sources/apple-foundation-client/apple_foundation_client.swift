import Foundation

#if canImport(ClaudeForFoundationModels)
import FoundationModels
import ClaudeForFoundationModels
#endif

@main
struct apple_foundation_client {
    static func main() async {
        let args = ProcessInfo.processInfo.arguments
        var stderrStream = StderrStream()
        
        var prompt: String?
        var modelNameStr = "sonnet4_6"
        var apiKey: String? = ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"]
        var stream = true
        
        var i = 1
        while i < args.count {
            switch args[i] {
            case "--prompt", "-p":
                if i + 1 < args.count {
                    prompt = args[i + 1]
                    i += 2
                } else {
                    print("Error: Missing value for --prompt", to: &stderrStream)
                    exit(1)
                }
            case "--model", "-m":
                if i + 1 < args.count {
                    modelNameStr = args[i + 1]
                    i += 2
                } else {
                    print("Error: Missing value for --model", to: &stderrStream)
                    exit(1)
                }
            case "--api-key", "-k":
                if i + 1 < args.count {
                    apiKey = args[i + 1]
                    i += 2
                } else {
                    print("Error: Missing value for --api-key", to: &stderrStream)
                    exit(1)
                }
            case "--no-stream":
                stream = false
                i += 1
            default:
                if prompt == nil && !args[i].hasPrefix("-") {
                    prompt = args[i]
                    i += 1
                } else {
                    print("Unknown or invalid argument: \(args[i])", to: &stderrStream)
                    printUsage()
                    exit(1)
                }
            }
        }
        
        guard let promptText = prompt, !promptText.isEmpty else {
            print("Error: Prompt is required.", to: &stderrStream)
            printUsage()
            exit(1)
        }
        
        guard let key = apiKey, !key.isEmpty else {
            print("Error: API Key is required. Set ANTHROPIC_API_KEY environment variable or pass --api-key.", to: &stderrStream)
            exit(1)
        }
        
        #if canImport(ClaudeForFoundationModels)
        // Native Apple Foundation Models Framework implementation (macOS 27+)
        let modelType: ClaudeModel
        switch modelNameStr.lowercased() {
        case "sonnet4_6", "claude-3-5-sonnet":
            modelType = .sonnet4_6
        case "opus4_8", "claude-3-opus":
            modelType = .opus4_8
        default:
            modelType = ClaudeModel(id: modelNameStr, capabilities: .init())
        }
        
        let model = ClaudeLanguageModel(
            name: modelType,
            auth: .apiKey(key)
        )
        
        let session = LanguageModelSession(model: model)
        
        do {
            if stream {
                let textStream = session.streamResponse(to: promptText)
                var lastLength = 0
                for try await partial in textStream {
                    let content = partial.content
                    if content.count > lastLength {
                        let startIndex = content.index(content.startIndex, offsetBy: lastLength)
                        let newChunk = content[startIndex...]
                        print(newChunk, terminator: "")
                        fflush(stdout)
                        lastLength = content.count
                    }
                }
                print()
            } else {
                let response = try await session.respond(to: promptText)
                print(response.content)
            }
        } catch {
            print("Error during inference: \(error)", to: &stderrStream)
            exit(1)
        }
        #else
        // Fallback HTTP REST API implementation (macOS 26 / SDK < 27)
        let apiModelID: String
        switch modelNameStr.lowercased() {
        case "sonnet4_6", "claude-3-5-sonnet":
            apiModelID = "claude-3-5-sonnet-20241022"
        case "opus4_8", "claude-3-opus":
            apiModelID = "claude-3-opus-20240229" // gitleaks:allow
        default:
            apiModelID = modelNameStr
        }
        
        guard let url = URL(string: "https://api.anthropic.com/v1/messages") else {
            print("Error: Invalid endpoint URL", to: &stderrStream)
            exit(1)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(key, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        
        let bodyJson: [String: Any] = [
            "model": apiModelID,
            "max_tokens": 1024,
            "messages": [
                ["role": "user", "content": promptText]
            ],
            "stream": stream
        ]
        
        guard let bodyData = try? JSONSerialization.data(withJSONObject: bodyJson) else {
            print("Error: Failed to serialize request body", to: &stderrStream)
            exit(1)
        }
        request.httpBody = bodyData
        
        do {
            if stream {
                let (bytes, response) = try await URLSession.shared.bytes(for: request)
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                    print("Error: Received HTTP \(code) from API", to: &stderrStream)
                    exit(1)
                }
                for try await line in bytes.lines {
                    if line.hasPrefix("data: ") {
                        let jsonStr = line.dropFirst(6).trimmingCharacters(in: .whitespacesAndNewlines)
                        if jsonStr == "[DONE]" { break }
                        guard let data = jsonStr.data(using: .utf8),
                              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                            continue
                        }
                        if let type = json["type"] as? String, type == "content_block_delta",
                           let delta = json["delta"] as? [String: Any],
                           let text = delta["text"] as? String {
                            print(text, terminator: "")
                            fflush(stdout)
                        }
                    }
                }
                print()
            } else {
                let (data, response) = try await URLSession.shared.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                    print("Error: Received HTTP \(code) from API: \(String(data: data, encoding: .utf8) ?? "")", to: &stderrStream)
                    exit(1)
                }
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let content = json["content"] as? [[String: Any]],
                   let firstContent = content.first,
                   let text = firstContent["text"] as? String {
                    print(text)
                } else {
                    print("Failed to decode response: \(String(data: data, encoding: .utf8) ?? "")", to: &stderrStream)
                    exit(1)
                }
            }
        } catch {
            print("HTTP request error: \(error)", to: &stderrStream)
            exit(1)
        }
        #endif
    }
    
    static func printUsage() {
        var stderrStream = StderrStream()
        print("""
        Usage: apple-foundation-client [options] <prompt>
        
        Options:
          -p, --prompt <text>   Prompt to send to Claude
          -m, --model <model>   Model name (sonnet4_6, opus4_8, or raw model ID; defaults to sonnet4_6)
          -k, --api-key <key>   Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
          --no-stream           Disable streaming response
        """, to: &stderrStream)
    }
}

struct StderrStream: TextOutputStream {
    mutating func write(_ string: String) {
        fputs(string, stderr)
    }
}
