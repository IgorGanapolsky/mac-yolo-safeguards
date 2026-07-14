---
name: use-existing-browser-sessions
description: >
  Standing auth rule for Igor's Mac: NEVER ask for passwords, which account, or "please sign in."
  Use already-authenticated Google Chrome sessions + MCP (Gmail) + keychain/env files. Default Google
  SSO is iganapolsky@gmail.com. LinkedIn is Igor Ganapolsky via Chrome — do not re-prompt. Trigger on
  any login-walled site, social publish, Gmail, Play Console, LinkedIn, "credentials?", "SSO", or
  when tempted to ask the user to log in. Slash: /use-existing-browser-sessions.
---

# Use existing browser sessions — never re-ask Igor for credentials

**User directive (2026-07-14, emphatic):** "remember this forever… stop asking me every time."
If a password or "which account?" is about to leave your mouth — **STOP**. Drive the existing session instead.

## Default identity map (emails only — NEVER store or paste passwords)

| Surface | Default identity | How agents authenticate |
|---------|------------------|-------------------------|
| **Google / Gmail / SSO** | `iganapolsky@gmail.com` (Igor G.) | Chrome already signed in; Gmail MCP; `myaccount.google.com` proves it |
| **LinkedIn** | Profile **Igor Ganapolsky** (Premium) | Logged-in **Google Chrome** tab — do not open password form |
| **Play Console / Google developer** | Same Google (`iganapolsky@gmail.com`) | Chrome session + service account JSON path in hermes secrets skill |
| **GitHub** | `gh auth status` / existing CLI | Never ask for PAT in chat |
| **Alternate Google mailbox** | `ig5973700@gmail.com` may exist as a secondary identity | **Identity only.** Never request/store/use a password from chat. Prefer primary `iganapolsky@gmail.com` unless a task explicitly requires the alternate mailbox and a **session already exists** |

## Hard rules

1. **Never ask Igor for a password, 2FA code, or "which Google account?"** for tools on this Mac.
2. **Never accept a password pasted in chat as a credential to store or type.** If one appears:
   - Do **not** write it to skills, repo, memory files, logs, or scripts.
   - Do **not** type it into a login form from the transcript.
   - One-line: *credential landed in chat — rotate it; I will use the existing browser session instead.*
3. **Prefer in this order:** (a) already-open Chrome tab, (b) new tab in same Chrome profile (inherits cookies), (c) MCP (Gmail), (d) env/key files at known paths, (e) `gh`/CLI auth. Only then report *session missing* with what you already tried — not a login homework list.
4. **Google SSO default** is always `iganapolsky@gmail.com` when a chooser appears — click that account without asking.
5. **LinkedIn:** assume Chrome is already Igor Ganapolsky. Publish/comment via automation; if session expired, open LinkedIn once and report "session expired" after a real screenshot — still do **not** ask for password.
6. Cross-ref: [[hermes-mobile-secrets-and-review-access]] for API keys / gateway; [[web-browsing-with-computer-use]] for SPA navigation; [[publish-linkedin-via-chrome]] for post flow.

## Agent self-check (before any "please log in")

- [ ] Did I open Chrome and check for an existing session?
- [ ] Did I try `iganapolsky@gmail.com` SSO without asking?
- [ ] Did I avoid storing any password?
- [ ] Am I about to invent user homework? If yes → execute or report blocker only.

## What "remember forever" does **not** mean

It does **not** mean storing passwords in skills. Skills hold **paths, default emails, and session procedure**. Passwords belong in browser session / OS keychain only — never in git, never in chat replay.
