---
name: office-wifi-captive-heal
description: >
  Autonomously heal Office Evolution Wi-Fi captive-portal failures after laptop
  sleep/return. Detects 172.29/medusa.local office fingerprint, soft-heals
  (DNS flush, ifconfig/networksetup bounce, Captive Network Assistant), never
  deletes preferences.plist, never auto-reboots. Trigger: Office Evolution,
  captive portal Accept, no internet at office, en0 bounce ritual. Slash:
  /office-wifi-captive-heal.
---

# Office Evolution captive-portal heal

## Symptom

Laptop returns to **Office Evolution**. Wi-Fi associates and gets a `172.29.x.x`
address, but browsers have no internet and the **Accept / terms** captive popup
never appears. Manual ritual that worked:

1. `sudo ifconfig en0 down; sleep 3; sudo ifconfig en0 up`
2. `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
3. Delete SystemConfiguration plists + reboot (unsafe — do not automate)

## Autonomous rail

| Piece | Path |
|-------|------|
| Healer | `scripts/office-wifi-captive-heal.sh` → `~/.local/bin/office-wifi-captive-heal.sh` |
| Root helper | `scripts/office-wifi-privileged-helper.sh` (sudoers NOPASSWD **only** this file) |
| LaunchAgent | `com.igor.office-wifi-captive-heal` every 60s + RunAtLoad |
| Install | `scripts/install-office-wifi-captive-heal.sh` |
| Tests | `tests/test-office-wifi-captive-heal.sh` |

## Detection (SSID may be redacted)

Office fingerprint — any of:

- IPv4 `172.29.*` on `en0`
- Gateway `172.29.0.1`
- DHCP server `10.1.200.1` / domain `medusa.local`
- Preferred network list contains `Office Evolution`

Unhealthy = office fingerprint **and** (`captive.apple.com` ≠ Success **or** HTTPS probe fails).

## Heal ladder

1. Privileged DNS flush + mDNSResponder HUP (if sudoers installed)
2. DHCP renew
3. `ifconfig` bounce (privileged) else `networksetup -setairportpower` bounce
4. Rejoin `Office Evolution`
5. Open **Captive Network Assistant** + `http://captive.apple.com/hotspot-detect.html`
6. Optional airport-prefs-only reset when `OFFICE_WIFI_ALLOW_AIRPORT_RESET=1`

## Hard refuses

- **Never** delete `/Library/Preferences/SystemConfiguration/preferences.plist`
- **Never** delete `NetworkInterfaces.plist`
- **Never** auto-reboot
- **Never** blanket NOPASSWD on `/bin/rm` or raw `ifconfig`

## Agent commands

```bash
bash tests/test-office-wifi-captive-heal.sh
~/.local/bin/office-wifi-captive-heal.sh --status
~/.local/bin/office-wifi-captive-heal.sh --check
~/.local/bin/office-wifi-captive-heal.sh --heal --dry-run
OFFICE_WIFI_INSTALL_SKIP_SUDOERS_PROMPT=0 bash scripts/install-office-wifi-captive-heal.sh
```

After install, confirm:

```bash
launchctl print gui/$(id -u)/com.igor.office-wifi-captive-heal | grep -E 'state|run interval'
tail -50 ~/Library/Logs/office-wifi-captive-heal.log
```
