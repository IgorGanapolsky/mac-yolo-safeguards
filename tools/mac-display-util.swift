import CoreGraphics
import Foundation

// Struct representing a display mode for reporting
struct DisplayModeInfo {
    let width: Int
    let height: Int
    let pixelWidth: Int
    let pixelHeight: Int
    let refreshRate: Double
    let isCurrent: Bool
}

// Print usage information
func printUsage() {
    print("""
    mac-display-util — Native macOS Display Mode CLI Utility
    
    Usage:
      swift tools/mac-display-util.swift list
      swift tools/mac-display-util.swift set <display_id> <width> <height>
      
    Example:
      swift tools/mac-display-util.swift set 1 1920 1080
    """)
}

// List all active displays and their modes
func listDisplays() {
    let maxDisplays: UInt32 = 16
    var activeDisplays = [CGDirectDisplayID](repeating: 0, count: Int(maxDisplays))
    var displayCount: UInt32 = 0
    
    let err = CGGetActiveDisplayList(maxDisplays, &activeDisplays, &displayCount)
    if err != .success {
        print("Error: Failed to get active display list (Error code: \(err.rawValue))")
        exit(1)
    }
    
    print("Found \(displayCount) active display(s):\n")
    
    for i in 0..<Int(displayCount) {
        let displayID = activeDisplays[i]
        let isMain = CGDisplayIsMain(displayID) != 0
        let currentMode = CGDisplayCopyDisplayMode(displayID)
        
        print("Display #\(i + 1) (ID: \(displayID))\(isMain ? " [MAIN]" : ""):")
        
        if let current = currentMode {
            let currentWidth = current.width
            let currentHeight = current.height
            let currentPixelWidth = current.pixelWidth
            let currentPixelHeight = current.pixelHeight
            let currentRefresh = current.refreshRate
            print("  Current Mode: \(currentWidth)x\(currentHeight) points (\(currentPixelWidth)x\(currentPixelHeight) physical pixels) @ \(String(format: "%.1f", currentRefresh))Hz")
        } else {
            print("  Current Mode: Unknown")
        }
        
        // Fetch all supported modes
        guard let modes = CGDisplayCopyAllDisplayModes(displayID, nil) as? [CGDisplayMode] else {
            print("  Error: Could not copy display modes")
            continue
        }
        print("  Supported Modes:")
        
        var modeInfos: [DisplayModeInfo] = []
        for mode in modes {
            
            let isCurrent = currentMode != nil &&
                            mode.width == currentMode!.width &&
                            mode.height == currentMode!.height &&
                            mode.pixelWidth == currentMode!.pixelWidth &&
                            mode.pixelHeight == currentMode!.pixelHeight &&
                            abs(mode.refreshRate - currentMode!.refreshRate) < 0.01
            
            let info = DisplayModeInfo(
                width: mode.width,
                height: mode.height,
                pixelWidth: mode.pixelWidth,
                pixelHeight: mode.pixelHeight,
                refreshRate: mode.refreshRate,
                isCurrent: isCurrent
            )
            
            // Deduplicate modes by points, pixel dimensions, and refresh rate to keep listing clean
            if !modeInfos.contains(where: { 
                $0.width == info.width && 
                $0.height == info.height && 
                $0.pixelWidth == info.pixelWidth && 
                $0.pixelHeight == info.pixelHeight && 
                abs($0.refreshRate - info.refreshRate) < 0.01 
            }) {
                modeInfos.append(info)
            }
        }
        
        // Sort modes by width then height
        modeInfos.sort { 
            if $0.width != $1.width {
                return $0.width < $1.width
            }
            return $0.height < $1.height
        }
        
        for info in modeInfos {
            let currentMarker = info.isCurrent ? " *CURRENT*" : ""
            print("    - \(info.width)x\(info.height) points (\(info.pixelWidth)x\(info.pixelHeight) physical pixels) @ \(String(format: "%.1f", info.refreshRate))Hz\(currentMarker)")
        }
        print("")
    }
}

// Change resolution for a specific display
func setResolution(displayID: CGDirectDisplayID, targetWidth: Int, targetHeight: Int) {
    guard let modes = CGDisplayCopyAllDisplayModes(displayID, nil) as? [CGDisplayMode] else {
        print("Error: Could not retrieve display modes for Display ID \(displayID)")
        exit(1)
    }
    var selectedMode: CGDisplayMode? = nil
    
    // First pass: try matching by logical dimensions (points), prioritizing 60Hz
    for mode in modes {
        if mode.width == targetWidth && mode.height == targetHeight {
            if selectedMode == nil {
                selectedMode = mode
            } else if abs(mode.refreshRate - 60.0) < 0.01 {
                selectedMode = mode
            } else if abs(selectedMode!.refreshRate - 60.0) > 0.01 && mode.refreshRate < selectedMode!.refreshRate {
                selectedMode = mode
            }
        }
    }
    
    // Second pass: fallback to matching by physical dimensions (pixels), prioritizing 60Hz
    if selectedMode == nil {
        for mode in modes {
            if mode.pixelWidth == targetWidth && mode.pixelHeight == targetHeight {
                if selectedMode == nil {
                    selectedMode = mode
                } else if abs(mode.refreshRate - 60.0) < 0.01 {
                    selectedMode = mode
                } else if abs(selectedMode!.refreshRate - 60.0) > 0.01 && mode.refreshRate < selectedMode!.refreshRate {
                    selectedMode = mode
                }
            }
        }
    }
    
    guard let mode = selectedMode else {
        print("Error: Could not find mode matching \(targetWidth)x\(targetHeight) for Display ID \(displayID)")
        print("Run 'swift tools/mac-display-util.swift list' to view supported resolutions.")
        exit(1)
    }
    
    print("Configuring Display ID \(displayID) to \(mode.width)x\(mode.height) (\(mode.pixelWidth)x\(mode.pixelHeight) pixels)...")
    
    var configRef: CGDisplayConfigRef?
    var err = CGBeginDisplayConfiguration(&configRef)
    guard err == .success, let config = configRef else {
        print("Error: Failed to begin display configuration (Error: \(err.rawValue))")
        exit(1)
    }
    
    err = CGConfigureDisplayWithDisplayMode(config, displayID, mode, nil)
    if err != .success {
        print("Error: Failed to configure display mode (Error: \(err.rawValue))")
        CGCancelDisplayConfiguration(config)
        exit(1)
    }
    
    err = CGCompleteDisplayConfiguration(config, .permanently)
    if err != .success {
        print("Warning: Failed to complete display configuration permanently (Error: \(err.rawValue)). Trying for current session only...")
        
        var fallbackConfigRef: CGDisplayConfigRef?
        var fallbackErr = CGBeginDisplayConfiguration(&fallbackConfigRef)
        guard fallbackErr == .success, let fallbackConfig = fallbackConfigRef else {
            print("Error: Failed to begin fallback configuration (Error: \(fallbackErr.rawValue))")
            exit(1)
        }
        
        fallbackErr = CGConfigureDisplayWithDisplayMode(fallbackConfig, displayID, mode, nil)
        if fallbackErr != .success {
            print("Error: Failed to configure fallback mode (Error: \(fallbackErr.rawValue))")
            CGCancelDisplayConfiguration(fallbackConfig)
            exit(1)
        }
        
        fallbackErr = CGCompleteDisplayConfiguration(fallbackConfig, .forSession)
        if fallbackErr != .success {
            print("Error: Failed to complete fallback configuration (Error: \(fallbackErr.rawValue))")
            exit(1)
        }
        print("Success: Display ID \(displayID) resolution updated for current session.")
    } else {
        print("Success: Display ID \(displayID) resolution updated permanently.")
    }
}

// Parse Command Line Arguments
let arguments = CommandLine.arguments

if arguments.count < 2 {
    printUsage()
    exit(1)
}

let command = arguments[1].lowercased()

switch command {
case "list":
    listDisplays()
case "set":
    if arguments.count < 5 {
        print("Error: Missing parameters for 'set' command.")
        printUsage()
        exit(1)
    }
    
    guard let displayIDVal = UInt32(arguments[2]) else {
        print("Error: Invalid Display ID '\(arguments[2])'. Must be a number.")
        exit(1)
    }
    
    guard let widthVal = Int(arguments[3]), let heightVal = Int(arguments[4]) else {
        print("Error: Dimensions must be integers.")
        exit(1)
    }
    
    let displayID = CGDirectDisplayID(displayIDVal)
    setResolution(displayID: displayID, targetWidth: widthVal, targetHeight: heightVal)
    
default:
    print("Error: Unknown command '\(command)'")
    printUsage()
    exit(1)
}
