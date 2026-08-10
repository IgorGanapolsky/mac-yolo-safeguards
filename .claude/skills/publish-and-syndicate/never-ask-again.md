# The never-ask protocol

Read this before writing any sentence that asks the operator for a credential.

Asking mid-run is almost always the wrong move: the operator is away (that is why the run is
scheduled), the answer cannot arrive in time, and the run ends with nothing shipped. Worse, the
same question next run reads as refusing to work. **Ask zero times per run. Surface a one-time
setup list once, then never again.**

## The three credential shapes, and which are usable

| Shape | Usable by an unattended run? | What to do |
|---|---|---|
| **API token** (dev.to, LinkedIn, Bluesky app password) | Yes | Read from env / GitHub Actions secret. |
| **OAuth connection** (LinkedIn, Threads, Buffer) | Yes, *after* one authorization click | Emit the `auth_url` once. Never ask again after that. |
| **Username + password** | **Never** | Cannot be used. See below. |

### A password is not a usable credential here — say so once, plainly

When an operator offers a login and password, they are being helpful and it feels like a
refusal to decline it. It is not. There is no place to put it:

- OAuth providers authenticate on **their own consent screen**. Zapier's LinkedIn connection
  has no password field that any tool here can fill.
- A scheduled cloud run has **no browser** to type it into.
- Passwords are frequently MFA-protected, so even a browser would stall.

If a password arrives in chat anyway: **tell the operator to rotate it immediately** — a chat
transcript is not a secret store — do not write it to any file, any commit, any ledger cell, or
any PR body, and do not repeat it back. Then give them the OAuth link, which is the thing that
actually works.

## Where credentials live, and why "I saved it" and "it isn't here" are both true

`tools/secret-store.js` refuses on any non-`darwin` platform and shells out to the macOS
`security` binary, which does not exist in a Linux container. So a secret saved to the secure
store is genuinely saved — **in the Mac's Keychain** — and genuinely unreachable from a
scheduled cloud run. Never tell the operator their secret is missing; it is not. Tell them
*where it is* and why this container cannot see it.

The same is true of anything pasted into a previous session's chat: the container is rebuilt
per run, so it is gone the moment that session ends. This is the whole reason a key gets asked
for repeatedly, and the reason asking again never fixes it.

## The bootstrap: one list, once

At the start of a run, resolve every channel's auth state **without asking**:

```bash
env | grep -E 'DEVTO_API_KEY|LINKEDIN_ACCESS_TOKEN|BLUESKY_HANDLE|BLUESKY_APP_PASSWORD' | sed 's/=.*/=<set>/'
```

For OAuth channels, resolve the link yourself rather than reporting "not connected":

1. `discover_zapier_actions({app})` → the exact `selected_api` (never guess it).
2. `list_zapier_connections({selected_api})` → `[]` means unconnected, which is a fact, not a blocker.
3. `manage_zapier_connections({selected_api})` → returns `auth_url`. **This is the deliverable.**
4. `enable_zapier_action({selected_api})` so the actions are live the instant the click lands.

Then publish everything that *is* reachable, and put the unresolved links in the run
notification as a single one-time setup list — never as a question, never split across runs.

Known values, so a run does not re-derive them:

- **LinkedIn** — `LinkedInCLIAPI`, already enabled, write actions `share` and
  `create_company_update`. Needs one click at
  `https://mcp.zapier.com/api/v1/connect-auth/LinkedInCLIAPI?accountId=5986707`.
- **Buffer** — the widest single unblock: covers LinkedIn, X, Bluesky and Threads at once.
  Prefer it over four separate connections if the operator is willing to authorize one thing.

## After the click

Once a connection exists it persists server-side at Zapier — it is not container state, so it
survives every future run. That is what makes this a one-time cost. Verify with
`list_zapier_connections`, set a default via `default_connection_id`, publish, and never raise
the subject again.
