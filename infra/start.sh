#!/bin/sh
# Tailscale peer-relay boot for Fly.io.
# Env: TS_AUTHKEY (required), RELAY_PORT (default 41641), TS_HOSTNAME.
set -eu

SOCK=/var/run/tailscale/tailscaled.sock
STATE_DIR=/var/lib/tailscale
PORT="${RELAY_PORT:-41641}"
HOST="${TS_HOSTNAME:-fly-peer-relay}"

mkdir -p "$STATE_DIR" /var/run/tailscale

# tailscaled in userspace-networking mode — a relay only forwards UDP between
# peers, it does not need to route the host's traffic, so no TUN device / no
# NET_ADMIN gymnastics. Listen for peer relay on the fixed UDP port.
tailscaled \
  --state="$STATE_DIR/tailscaled.state" \
  --socket="$SOCK" \
  --tun=userspace-networking \
  --port="$PORT" &
TAILSCALED_PID=$!

# wait for the daemon socket
i=0
while [ ! -S "$SOCK" ] && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done

tailscale --socket="$SOCK" up \
  --authkey="${TS_AUTHKEY}" \
  --hostname="$HOST" \
  --advertise-tags=tag:relay \
  --accept-dns=false \
  --accept-routes=false

# enable peer-relay server on the same UDP port tailscaled is bound to
tailscale --socket="$SOCK" set --relay-server-port="$PORT"

echo "[peer-relay] up as $HOST, relay-server-port=$PORT"
tailscale --socket="$SOCK" status || true

# hand PID 1 to tailscaled so Fly restarts the machine if it dies
wait "$TAILSCALED_PID"
