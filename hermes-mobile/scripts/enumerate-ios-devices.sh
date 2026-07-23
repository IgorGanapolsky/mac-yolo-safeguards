#!/usr/bin/env bash
# Enumerate attached iOS devices for agents.
# IMPORTANT: Cursor/agent sandboxes break usbmuxd — always run outside the sandbox
# (required_permissions: ["all"] / no sandbox). A sandboxed `idevice_id -l` returns empty
# and looks like "no iPad attached".
set -euo pipefail

PROOF_HINT="${1:-}"

die_sandbox() {
  echo "ERROR: usbmuxd/device enum failed — likely sandboxed agent shell." >&2
  echo "Re-run with full permissions (unsandboxed). Do NOT claim iPad absent." >&2
  exit 75
}

if ! idevice_id -l >/tmp/hermes-idevice-ids.$$ 2>/tmp/hermes-idevice-err.$$; then
  if grep -qiE 'Unable to retrieve device list|MAC policy|usbmux|Connection invalid' /tmp/hermes-idevice-err.$$ 2>/dev/null; then
    cat /tmp/hermes-idevice-err.$$ >&2 || true
    rm -f /tmp/hermes-idevice-ids.$$ /tmp/hermes-idevice-err.$$
    die_sandbox
  fi
fi

echo "=== idevice_id ==="
cat /tmp/hermes-idevice-ids.$$ || true
echo "=== xcrun devicectl list devices ==="
xcrun devicectl list devices 2>&1 || true
echo "=== ios-deploy -c ==="
ios-deploy -c 2>&1 || true
echo "=== Developer Mode (per UDID) ==="
while read -r udid; do
  [[ -z "$udid" ]] && continue
  echo "-- $udid"
  ideviceinfo -u "$udid" -k DeviceName 2>/dev/null || true
  ideviceinfo -u "$udid" -k ProductType 2>/dev/null || true
  ideviceinfo -u "$udid" -k ProductVersion 2>/dev/null || true
  idevicedevmodectl list -u "$udid" 2>/dev/null || true
done < /tmp/hermes-idevice-ids.$$

# Sandbox false-negative check: empty list + known USB Apple device
if [[ ! -s /tmp/hermes-idevice-ids.$$ ]]; then
  if system_profiler SPUSBDataType 2>/dev/null | grep -qiE 'iPad|iPhone|iPod'; then
    echo "WARNING: USB shows Apple mobile device but idevice_id empty — treat as sandbox/usbmux failure, not missing hardware." >&2
    rm -f /tmp/hermes-idevice-ids.$$ /tmp/hermes-idevice-err.$$
    die_sandbox
  fi
fi

rm -f /tmp/hermes-idevice-ids.$$ /tmp/hermes-idevice-err.$$
if [[ -n "$PROOF_HINT" ]]; then
  echo "proof_hint=$PROOF_HINT"
fi
