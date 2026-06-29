# Task Plan Snapshot

*Captured: 2026-06-29*

---

## 📋 Active Tasks & Statuses

| ID | Task | Status | Owner | Files | Acceptance Check |
|---|---|---|---|---|---|
| **T-1** | Off-WiFi LAN/relay detection refactor | `in_progress` | gemini | `GatewayContext.tsx`, `gatewayEndpoint.ts`, `GatewayContext.test.tsx` | `npm test` passes 100% |
| **T-2** | Fix `onDismiss` crash on deep link | `done` | antigravity | `ConnectMacGate.tsx`, `GatewayContext.tsx` | Deep link applies gatewayUrl without ErrorBoundary crash |
| **T-3** | Make off-WiFi work via Tailscale | `done` | antigravity | docs + app onboarding copy | Phone reaches Mac via tailnet IP from app |
| **T-4** | Fix failing Maestro E2E flows | `done` | antigravity | `otelPolyfill.ts`, `.maestro/*`, `splash.png` | `latest.json` reports E2E pass |
| **T-5** | Explain Tailscale requirement in-app | `done` | antigravity | Settings/onboarding screens | User told to install Tailscale and why |
| **T-6** | Optimize app size / R8 minification | `done` | antigravity | `app.json` | Launch preflight passes, size reduced |
| **T-7** | Fix Android USB-pairing hijack bug | `done` | antigravity | `ChatScreen.tsx` | Retry retains Wi-Fi profile and doesn't hijack to USB |
| **T-8** | Zero-friction LAN discovery & validation | `done` | antigravity | `SettingsScreen.tsx`, `ChatScreen.tsx` | Auto-selects LAN profile on scan and rejects junk URLs |

---

## 🗺️ File Ownership Locks
- `GatewayContext.tsx`, `gatewayEndpoint.ts`, `GatewayContext.test.tsx` $\rightarrow$ **gemini** (T-1)
- `ConnectMacGate.tsx` $\rightarrow$ **antigravity** (T-2/T-4)
- `ChatScreen.tsx` $\rightarrow$ **antigravity** (T-4)
