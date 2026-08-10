#!/bin/bash
# uplink-shaper.sh — cap this Mac's WAN-bound upload below the T-Mobile Home
# Internet uplink capacity so the gateway's buffer never fills (anti-bufferbloat).
#
# Why: 2026-08-10 measurements — uplink capacity 14.5 Mbps, fleet offered load
# 13.4 Mbps with massive TCP retransmit storms (codex: 12M re-tx in 10s), RTT
# 700-1100ms, networkQuality responsiveness 43 RPM ("Low"). Keeping the queue
# on OUR side (small, 50KB) instead of in the modem restores interactive
# latency and usually RAISES fleet goodput by eliminating retransmit waste.
#
# Root required (pf + dummynet). Usage:
#   sudo uplink-shaper.sh on [Mbit]   # default 10 Mbit/s (~70% of measured 14.5)
# ("No ALTQ support in kernel" on arming is a harmless macOS warning.)
#   sudo uplink-shaper.sh off         # restore /etc/pf.conf, flush pipes
#   uplink-shaper.sh status
#
# Scope: shapes OUTBOUND to public internet only. LAN (RFC1918), Tailscale
# CGNAT (100.64/10), loopback and multicast are exempt, so screen share to the
# mini and local traffic stay full speed.
# Verify after arming: networkQuality -v  (expect RPM to jump, upload ~cap).
# NOT persistent across reboot by design — re-arm after reboot if wanted.
set -u

ANCHOR="igor_uplinkshape"
PIPE=1
DEFAULT_MBIT=10
QUEUE_BYTES=50Kbytes   # bounded queue = bounded delay (~40ms @10Mbit); macOS dnctl has NO fq_codel (verified 26.5.2)

usage() { sed -n '3,20p' "$0"; exit 1; }

status() {
  echo "== dummynet pipes =="; dnctl list 2>/dev/null || echo "(none / need root)"
  echo "== pf anchor rules =="; pfctl -a "$ANCHOR" -s rules 2>/dev/null || echo "(none / need root)"
  echo "== pf enabled? =="; pfctl -s info 2>/dev/null | head -1
}

case "${1:-}" in
  on)
    [[ $EUID -eq 0 ]] || { echo "need root: sudo $0 on [Mbit]"; exit 1; }
    mbit="${2:-$DEFAULT_MBIT}"
    dnctl pipe $PIPE config bw "${mbit}Mbit/s" queue $QUEUE_BYTES
    # main ruleset: keep /etc/pf.conf and add our dummynet anchor hooks
    pfconf=$(mktemp)
    cat /etc/pf.conf > "$pfconf"
    printf 'dummynet-anchor "%s"\nanchor "%s"\n' "$ANCHOR" "$ANCHOR" >> "$pfconf"
    pfctl -q -f "$pfconf"
    rm -f "$pfconf"
    # anchor rules: shape only WAN-bound outbound; exempt private + tailnet
    pfctl -q -a "$ANCHOR" -f - <<RULES
no dummynet quick on lo0 all
no dummynet out quick inet from any to 10.0.0.0/8
no dummynet out quick inet from any to 172.16.0.0/12
no dummynet out quick inet from any to 192.168.0.0/16
no dummynet out quick inet from any to 100.64.0.0/10
no dummynet out quick inet from any to 224.0.0.0/4
dummynet out on en0 inet proto { tcp udp } from any to any pipe $PIPE
RULES
    pfctl -q -E 2>/dev/null
    echo "shaper ON: upload capped at ${mbit} Mbit/s (queue ${QUEUE_BYTES}), LAN/Tailscale exempt"
    echo "verify: networkQuality -v   (expect responsiveness >> 43 RPM)"
    ;;
  off)
    [[ $EUID -eq 0 ]] || { echo "need root: sudo $0 off"; exit 1; }
    pfctl -q -a "$ANCHOR" -F all 2>/dev/null
    pfctl -q -f /etc/pf.conf
    dnctl -q flush
    echo "shaper OFF: /etc/pf.conf restored, pipes flushed"
    ;;
  status) status ;;
  *) usage ;;
esac
