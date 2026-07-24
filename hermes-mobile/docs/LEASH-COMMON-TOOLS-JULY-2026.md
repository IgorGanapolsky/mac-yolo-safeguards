# Leash common tools — honesty contract (July 2026)

## What this feature actually is

`THUMBGATE LEASH` → **Common tools** lets a user mark a builtin tool (Shell,
Git, Browser use, …) or a free-text custom tool as **"Requires approve/deny
on Leash."** It is a **client-side relabeling filter**, nothing more.

## What it is NOT

It is **not** a security allowlist, a firewall rule, or a policy that syncs
to your Mac. The Mac's own gateway (`~/.hermes/hermes-agent`, a separate
repo) is the only thing that ever decides whether an action requires
approval at all — it emits a `GATE.BLOCKED` websocket event when it wants a
human decision. Nothing on the phone can create, widen, or narrow that
decision.

## What actually happens when you toggle a row off / add a custom tool

1. The phone stores the row id in `settings.leashApprovalRequiredToolIds`
   (builtin) or `settings.leashCustomTools` (free text) — locally, in
   AsyncStorage. No network call, no sync to the Mac.
2. The **next time** (not retroactively) the Mac sends a `GATE.BLOCKED`
   event, `toolAttemptRequiresLeashApproval()` checks whether the event's
   `toolName`/`command` text contains the row's id/label. Custom rows only
   ever do a literal substring match — there is no fuzzy matching, no real
   tool-id catalog behind free text.
3. If it matches, the approval card's reason gets prefixed with
   `Disabled on Leash · <label> — `. The card was **already going to
   appear** either way; this only changes its wording.

## Why "Add your own tool: stripe" looked useless

- The real Hermes gateway has no tool literally named `stripe`. Unless the
  agent's shell command text contains the substring `stripe` (e.g.
  `stripe balance retrieve` via the `terminal` tool), the custom row can
  never match anything — by design, not by bug.
- The row starts "Allowed without prompt" (i.e. *not* in the required-approval
  list) by default, matching "all tools start allowed" — but that phrase
  reads like an enforcement claim when there is nothing to enforce yet for
  a brand-new custom tool with no real match target.
- The screen showed **"Can't reach"** at the same time — since no
  `GATE.BLOCKED` events can ever arrive while disconnected, the whole
  section was inert with no in-app explanation of why.

## The fix (2026-07-24)

- Restored the wiring (it existed once in `d4e052eb`/`3f2de707` but was
  dropped from `ApprovalsScreen.tsx`/`GatewayContext.tsx` during a
  multi-agent cherry-pick and never made it back to `main`).
- Added an explicit mechanism explanation at the top of the section
  (`LEASH_COMMON_TOOLS_MECHANISM_HINT`).
- Added a disconnected-state notice (`leash-common-tools-disconnected`)
  explaining that rules have nothing to apply to while the Mac is
  unreachable.
- Added an in-app confirmation after adding a custom tool
  (`buildLeashCustomToolAddedMessage`) that states the exact matching
  behavior instead of implying real-time enforcement.
- Hardened duplicate detection (case-insensitive, normalized id compare)
  so re-adding "stripe" / "Stripe CLI" doesn't silently create two rows.

## Files

- `hermes-mobile/src/utils/leashCommonTools.ts` — catalog + matching logic
- `hermes-mobile/src/components/LeashCommonToolsSection.tsx` — UI
- `hermes-mobile/src/context/GatewayContext.tsx` — `GATE.BLOCKED` annotation
- `hermes-mobile/src/screens/ApprovalsScreen.tsx` — renders the section
