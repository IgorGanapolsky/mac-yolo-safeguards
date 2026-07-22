# Security Policy

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/IgorGanapolsky/mac-yolo-safeguards/security/advisories/new) for security issues. Do not open a public issue for an unpatched vulnerability.

Include the affected surface and version or commit, reproducible steps, expected impact, and a minimal proof that contains no live credentials or unrelated user data. We will acknowledge the report, validate it, coordinate a fix, and credit the reporter when requested.

## In scope

- Hermes Mobile pairing, deep links, USB, Wi-Fi, and Tailscale transport
- Gateway authentication, per-computer credentials, and profile switching
- Agent prompt injection, tool authorization, approvals, and host command execution
- Android automation channels, screenshots, accessibility, intents, and ADB usage
- Mobile data exposure, logs, analytics, updates, and release artifacts
- ThumbGate and Hermes control-plane authentication and tenant isolation

The latest public mobile release and the current default branch receive priority. Older releases may be fixed by requiring an upgrade instead of receiving a backport.

## Research safety

Use test accounts and data you own. Do not access unrelated data, persist on systems after testing, disrupt availability, or publish exploit details before a fix is available. Stop once impact is demonstrated and include the least-sensitive evidence needed to reproduce it.
