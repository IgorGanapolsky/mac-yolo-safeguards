#!/bin/bash
set -euo pipefail

# mac-optimize-display.sh — Automated macOS display quality and Screen Sharing optimizer.
# Resolves script paths dynamically so it can be run locally or remotely over SSH.

REAL_SCRIPT_PATH=$(python3 -c "import os; print(os.path.realpath('$0'))" 2>/dev/null || readlink -f "$0" 2>/dev/null || echo "$0")
case "$REAL_SCRIPT_PATH" in
  /*) ;;
  *) REAL_SCRIPT_PATH="$(pwd)/$REAL_SCRIPT_PATH" ;;
esac
REPO=$(cd "$(dirname "$REAL_SCRIPT_PATH")/.." && pwd)
SWIFT_UTIL="$REPO/tools/mac-display-util.swift"

print_usage() {
    echo "mac-optimize-display.sh — Automated macOS Display & Screenshare Optimizer"
    echo ""
    echo "Usage:"
    echo "  $0 list                                            - List connected displays and modes"
    echo "  $0 set <display_id> <width> <height>               - Set display resolution"
    echo "  $0 accessibility                                   - Enable Reduce Motion & Reduce Transparency"
    echo "  $0 restart-screenshare                             - Kill and restart ScreensharingAgent"
    echo "  $0 optimize-all <display_id> [width] [height]      - Run all optimizations (Default 1920x1080)"
    echo ""
}

enable_accessibility() {
    echo "Optimizing accessibility settings for low bandwidth..."
    
    # 1. Reduce Motion
    echo "  Enabling Reduce Motion..."
    defaults write com.apple.universalaccess reduceMotion -bool true
    
    # 2. Reduce Transparency
    echo "  Enabling Reduce Transparency..."
    defaults write com.apple.universalaccess reduceTransparency -bool true
    
    # 3. Disable window state saving on logout (reboot storms prevention)
    echo "  Preventing state saving on logout..."
    defaults write com.apple.loginwindow TALLogoutSavesState -bool false
    defaults write com.apple.iphonesimulator NSQuitAlwaysKeepsWindows -bool false
    defaults write com.google.android.studio NSQuitAlwaysKeepsWindows -bool false
    
    echo "Accessibility and system settings updated. Note: some UI components require a logout/login to fully update."
}

restart_screenshare() {
    echo "Restarting Screen Sharing Agent..."
    local agent_pids
    agent_pids=$(pgrep -f "ScreensharingAgent.bundle/Contents/MacOS/ScreensharingAgent" || true)
    
    if [ -n "$agent_pids" ]; then
        echo "  Found active ScreensharingAgent PID(s): $agent_pids"
        for pid in $agent_pids; do
            echo "  Killing PID $pid..."
            kill -9 "$pid" 2>/dev/null || true
        done
        echo "ScreensharingAgent terminated. macOS will auto-respawn the agent on client reconnection."
    else
        echo "  No active ScreensharingAgent process found."
    fi
}

# Check argument count
if [ $# -lt 1 ]; then
    print_usage
    exit 1
fi

COMMAND=$(echo "$1" | tr '[:upper:]' '[:lower:]')

case "$COMMAND" in
    list)
        swift "$SWIFT_UTIL" list
        ;;
        
    set)
        if [ $# -lt 4 ]; then
            echo "Error: 'set' requires display_id, width, and height."
            print_usage
            exit 1
        fi
        swift "$SWIFT_UTIL" set "$2" "$3" "$4"
        ;;
        
    accessibility)
        enable_accessibility
        ;;
        
    restart-screenshare)
        restart_screenshare
        ;;
        
    optimize-all)
        if [ $# -lt 2 ]; then
            echo "Error: 'optimize-all' requires at least display_id."
            print_usage
            exit 1
        fi
        DISPLAY_ID="$2"
        TARGET_WIDTH="${3:-1920}"
        TARGET_HEIGHT="${4:-1080}"
        
        echo "=== Launching Full macOS Display & Screen Sharing Optimizations ==="
        enable_accessibility
        echo ""
        swift "$SWIFT_UTIL" set "$DISPLAY_ID" "$TARGET_WIDTH" "$TARGET_HEIGHT"
        echo ""
        restart_screenshare
        echo "=== Optimizations Completed successfully ==="
        ;;
        
    *)
        echo "Error: Unknown command '$1'"
        print_usage
        exit 1
        ;;
esac
