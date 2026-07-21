# Mac mini usability recovery: evidence and prevention

Date: 2026-07-21  
Deep-research interaction: `trun_e907bc512f6f4fb88a17759c6ec21c5a`

## Verified incident

The Mac mini was not merely a Screen Sharing transport failure. It was under
material unified-memory pressure while an active Hermes mobile session drove
multiple concurrent local Ollama calls:

- 23 GiB of 24 GiB used, 566 MiB unused, and 4.6 GiB compressed.
- `qwen3.5:9b-hermes-64k` occupied about 7.7 GiB.
- The gateway log showed repeated 32k-38k-token requests taking 128-142 seconds.
- The memory guardian did issue a successful Ollama unload and publish its
  recovery cooldown. The active client immediately made another local request,
  reloading the model. The gateway watchdog correctly avoided pin/pre-warm, but
  it did not stop accepted client traffic. That was the remaining control gap.

Operational recovery stopped the launchd-owned `ai.hermes.gateway`, unloaded the
model, removed five automatic login items, and moved CleanMyMac plus its updater
plist to Trash. The app removal is recoverable. Other large apps were retained
because installed size alone is not proof that an app is unnecessary or causing
the incident.

After recovery, five SSH probes completed in 0.28-0.35 seconds, memory changed
to 18 GiB used / 5.37 GiB unused, the memory-pressure free percentage was 78%,
and Ollama reported zero loaded models. A new Screen Sharing connection rendered
a current full desktop frame; the remote Apps and Desktop actions produced new
frames in 2.55 seconds and 0.89 seconds respectively. A connected VNC socket by
itself was deliberately not accepted as usability proof.

## Research-backed operating rules

1. Use macOS memory pressure, not a low free-RAM number by itself, as the action
   gate. Apple describes the Activity Monitor memory-pressure graph as the
   system-level indicator that combines available memory, swap rate, wired
   memory, and cached files: [View memory usage in Activity Monitor](https://support.apple.com/guide/activity-monitor/actmntr1004/mac).
2. Remove startup items before deleting applications. Apple recommends removing
   login items when isolating startup problems: [Remove login items to resolve
   startup problems](https://support.apple.com/guide/mac-help/remove-login-items-resolve-startup-problems-mh21210/mac).
3. Manage persistent background work through launchd rather than killing random
   leaf processes. Apple documents launchd job ownership and lifecycle:
   [Script management with launchd](https://support.apple.com/guide/terminal/script-management-with-launchd-apdc6c1077b-5d5d-4d35-9c19-60f2397b2369/mac).
4. Treat Chrome automation as a process tree with a known supervisor/profile,
   not as interchangeable `Chrome Helper` children. Chromium documents its
   browser/renderer process model: [Process Model and Site
   Isolation](https://chromium.googlesource.com/chromium/src/%2B/main/docs/process_model_and_site_isolation.md).
5. Prefer recoverable application removal. Apple's supported uninstall guidance
   uses Trash for ordinary apps: [Delete or uninstall apps on
   Mac](https://support.apple.com/en-us/102610).

The research report also proposed latency and memory targets. Those values are
engineering targets, not Apple guarantees; live before/after telemetry and
fresh-frame input proof remain authoritative.

## Prevention circuit

The coordinated guard now has one bounded ownership model:

1. At kernel WARN pressure, request `keep_alive: 0` for resident Ollama models
   and publish a ten-minute recovery deadline.
2. If a model is still resident while that deadline is active, disable and boot
   out only the exact `ai.hermes.gateway` LaunchAgent, persist a circuit marker,
   and retry the graceful Ollama unload.
3. While pressure or the deadline is active, the gateway watchdog re-enforces
   that disabled/stopped state. A KeepAlive job or another bootstrap path cannot
   reopen the circuit. Pin and warmup remain blocked as before.
4. After both pressure and the deadline clear, the watchdog re-enables the exact
   label, restores its plist through launchd, removes the marker, and avoids a
   duplicate manual process start.
5. Normal pressure, an empty Ollama worker set, dry-run mode, unrelated browsers,
   editors, Screen Sharing, and other applications are no-ops.

This is a circuit breaker for a verified reload loop, not a general-purpose app
killer. The guard continues to protect interactive UI processes and never hard
kills Ollama.

## Verification contract

Do not claim another recovery from service sockets or launchd status alone. A
valid proof must include:

- current kernel pressure, memory/compressor/swap, and loaded Ollama models;
- gateway process and recovery-deadline state;
- several SSH round trips;
- a newly connected Screen Sharing frame followed by a reversible remote action
  and a visibly changed frame;
- ten-minute follow-up telemetry showing the model/gateway did not reload during
  the recovery circuit.
