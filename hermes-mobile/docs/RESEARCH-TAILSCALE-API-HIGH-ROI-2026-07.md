# Tailscale API → Hermes Mobile: high-ROI decision (2026-07-21)

## Verdict

Use the Tailscale control-plane API only as an **optional computer-side discovery
source**. Do not call it from Hermes Mobile and do not put a Tailscale credential
in the Android/iOS bundle.

The concrete win is recovering a sanitized list of currently reachable Mac,
Windows, and Linux candidates before the existing Hermes `:8642/health` probes
run. This improves multi-computer discovery when LAN bootstrap and the local
Tailscale CLI do not provide enough peer seeds. It does not replace Tailscale's
data plane, repair USB, or prove that Hermes is listening on a candidate device.

## Evidence and boundary

- The stable API exposes `GET /api/v2/tailnet/{tailnet}/devices`; it returns device
  MagicDNS names, Tailscale addresses, OS, authorization, expiry, control-plane
  connectivity, and last-seen state. The API does not transport Hermes traffic.
  Source: [Tailscale API](https://tailscale.com/api).
- The narrow read-only trust scope is `devices:core:read`. The write scope can
  authorize, expire, remove, rename, and retag devices and is unnecessary here.
  Source: [Trust credentials](https://tailscale.com/docs/reference/trust-credentials).
- Personal API tokens inherit an administrator's permissions and expire in 1-90
  days. OAuth clients can mint one-hour scoped access tokens through the standard
  client-credentials flow. Source: [Tailscale API reference](https://tailscale.com/docs/reference/tailscale-api),
  [OAuth clients](https://tailscale.com/docs/features/oauth-clients).
- OAuth Apps do not solve consumer-wide discovery today: they are alpha, intended
  for internal tools, and authorization is restricted to users in the same
  tailnet as the app. Source: [OAuth apps](https://tailscale.com/docs/features/oauth-apps).

## Implemented

`tools/hermes-tailscale-api-discover.js`:

- exchanges computer-side OAuth client credentials for a short-lived token with
  only `devices:core:read`, or accepts an already short-lived access token;
- filters out mobile, unauthorized, expired, and stale/offline devices;
- emits only valid `*.ts.net` names and `100.64.0.0/10` addresses;
- never returns or logs the credential or provider token;
- exits successfully with no candidates when no API credential is configured.

`tools/agent-session-start.js` invokes that optional source before its existing
pair flow. It merges only sanitized hosts into `HERMES_TAILNET_PROBE_HOSTS`; the
normal local Tailscale discovery path remains unchanged if the API is absent or
unavailable. Queued install/pair jobs receive the sanitized host list, not the
credential.

## Explicitly not implemented

- No admin token in SecureStore, Expo config, deep links, QR codes, mobile logs,
  or the repository.
- No device write/authorization operations.
- No dependency on the alpha OAuth Apps flow.
- No claim that API inventory means the Hermes gateway is reachable; the existing
  `/health` probe remains the acceptance check.
