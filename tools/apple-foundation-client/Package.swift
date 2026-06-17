// swift-tools-version: 6.0
// The swift-tools-version declares the minimum version of Swift required to build this package.

import Foundation
import PackageDescription

func getSDKVersion() -> Double {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
    process.arguments = ["--show-sdk-version"]
    let pipe = Pipe()
    process.standardOutput = pipe
    do {
        try process.run()
        process.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        if let versionString = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
           let version = Double(versionString) {
            return version
        }
    } catch {
        // Fallback to basic safe version
    }
    return 15.0
}

let sdkVersion = getSDKVersion()

var dependencies: [Package.Dependency] = []
var targetDependencies: [Target.Dependency] = []
var platformRequirement: SupportedPlatform = .macOS(.v15)

if sdkVersion >= 27.0 {
    platformRequirement = .macOS("27.0")
    dependencies = [
        .package(url: "https://github.com/anthropics/ClaudeForFoundationModels.git", exact: "0.1.0")
    ]
    targetDependencies = [
        .product(name: "ClaudeForFoundationModels", package: "ClaudeForFoundationModels")
    ]
} else {
    platformRequirement = .macOS(.v15)
    dependencies = []
    targetDependencies = []
}

let package = Package(
    name: "apple-foundation-client",
    platforms: [
        platformRequirement
    ],
    dependencies: dependencies,
    targets: [
        .executableTarget(
            name: "apple-foundation-client",
            dependencies: targetDependencies
        ),
        .testTarget(
            name: "apple-foundation-clientTests",
            dependencies: ["apple-foundation-client"]
        ),
    ]
)
