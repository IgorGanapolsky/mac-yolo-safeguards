# Mac Sluggishness & Simulator Runaway Rescue Playbook

---

## 🩺 Phase 1 — Diagnostic Triage

Run the following diagnostics sequentially over SSH/terminal when the Mac becomes unresponsive, sluggish, or fans are roaring:

```bash
uptime                                            # Check load average (M5 floor: >20 is high, >100 is critical)
top -l 1 -n 0 | grep -E "PhysMem|CPU usage|Load" # Check system memory / CPU usage stats
ps aux | sort -k 3 -rn | head -10                 # List top 10 CPU-consuming processes
ps aux | sort -k 4 -rn | head -10                 # List top 10 memory-consuming processes
ps aux | grep -i simruntime | grep -v grep | wc -l # Count active iOS simulator runtime threads
xcrun simctl list devices booted                  # List which simulators are booted
sysctl vm.swapusage                               # Verify active swap usage and pageouts
```

---

## 🧠 Diagnostic Heuristics

1. **Reboot Storms:** If `uptime` indicates system was booted $<10$ minutes ago AND load is $>100$, do NOT kill system/Spotlight processes. This is an auto-restore storm. Let it recover naturally, or kill only the background code indexers/scanners.
2. **Simulator Runaways (>50 simruntimes):** If simulator runtimes are high and load is critical, proceed directly to Simulator Shutdown.
3. **Background Scanners (semgrep/codeql):** Semgrep and CodeQL scanner processes can pin CPU at 100%. It is 100% safe to `kill -9` them directly.
4. **AI IDE Memory Leaks:** If Cursor/Antigravity language servers use excessive memory or CPU:
   - Identify candidate PIDs via memory ranking.
   - Ask user before killing editors with unsaved work.
5. **Orphaned Chrome CDP Processes:** Browser automation processes under `/tmp/chrome_cdp_profile_*` may get orphaned. Clean them up by running `pkill -9 -f "chrome_cdp_profile"`.

---

## 🛠️ Phase 2 — Recovery Commands

### 📱 Simulator Shutdown (Safe/Reversible)
```bash
xcrun simctl shutdown all     # Gracefully shut down all booted simulators
killall -9 Simulator 2>/dev/null # Kill the Simulator app interface
```

### 🧹 Orphaned Process Cleanup
```bash
pkill -9 -f "chrome_cdp_profile" # Kill stale CDP Chrome profiles
pkill -9 -f jest                # Kill stale Jest test runners and workers
```

---

## 🔒 Phase 3 — Prevention Checks

Verify that the LaunchAgent guard is loaded and runs every 60s:
```bash
launchctl print gui/$(id -u)/com.igor.shutdown-simulators | grep -E "state|run interval"
```
*Expected output: `state = running` and `run interval = 60 seconds`.*

Disabling auto-restore settings:
```bash
defaults write com.apple.loginwindow TALLogoutSavesState -bool false
defaults write com.apple.iphonesimulator NSQuitAlwaysKeepsWindows -bool false
```
