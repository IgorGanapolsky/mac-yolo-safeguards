# Hermes Mobile — competitor matrix (GTM)

**Date:** 2026-07-25  
**Scope:** GenTerminal, Termius, Telegram Hermes, OpenClaw-class remotes, Hermes-named store peers  
**Job of Hermes Mobile:** Phone **control plane** for a **Hermes agent on your computer** (chat + Leash + honest connection). Not on-device LLM. Not SSH shell.  
**North-star one-liner:** *Mac AI agent from your phone — chat & approve tools. Not phone AI.*

Related: [ASC-ASO-POSITIONING-JULY-2026.md](./ASC-ASO-POSITIONING-JULY-2026.md), [ASO-POSITIONING-SOCIAL-JULY-2026.md](./ASO-POSITIONING-SOCIAL-JULY-2026.md), [ARCHITECTURE.md](../ARCHITECTURE.md) (*replaces Telegram DM; mirrors `:8642`*).

---

## 1. Map: who is what

| Player | Category | Surface | Primary job | Threat to Hermes Mobile |
|--------|----------|---------|-------------|-------------------------|
| **Hermes Mobile** (us) | Agent operator client | iOS + Android | Chat + Leash to **your** Hermes gateway | — |
| **GenTerminal** ([genterminal.ai](https://genterminal.ai/)) | Modern SSH client | Desktop + Android + iOS | Shell, vault, SFTP, host memory | **Low–medium adjacent** (phone→machine) |
| **Termius** | Modern SSH client | Desktop + mobile | SSH/SFTP, hosts, teams | **Low adjacent** |
| **Telegram + Hermes bot** | Messaging gateway | Telegram app | Text Hermes via bot | **High substitute** for chat-only users |
| **OpenClaw-class remotes** (Aight, ClawControl / ClawPilot, muxd family) | Multi-stack agent remotes | Mostly iOS / mixed | Control OpenClaw/Hermes-like agents | **Medium** ASO + category |
| **Hermex / HermesPilot** | Hermes Web / Link clients | Mobile | Self-hosted Hermes UI / relay | **High ASO** (name collision) |
| **Hermes Agent – Android** (`com.hermesagent.android`) | Phone-local agent + gateways | Android | On-device / multi-provider agent | **High SERP** (name); different architecture |

**Rule of thumb**

| If the buyer wants… | They pick… | Not Hermes |
|---------------------|------------|------------|
| Type shell commands on a server | GenTerminal / Termius | — |
| Text the agent with zero install surface | Telegram bot | Unless they want Leash + multi-Mac UX |
| Phone-local LLM agent | Hermes Agent Android / Hermex-class | Our product is **desktop gateway** |
| Approve/deny risky tools on **their Mac** while chatting | **Hermes Mobile** | — |

---

## 2. Feature / wedge matrix

| Dimension | Hermes Mobile | GenTerminal | Termius | Telegram Hermes | OpenClaw remotes (Aight et al.) | Hermex / Pilot |
|-----------|---------------|-------------|---------|-----------------|----------------------------------|----------------|
| **Product job** | Agent chat + safety leash | SSH terminal | SSH terminal | Agent over chat app | Multi-stack agent remote | Hermes client / relay |
| **Runtime lives** | User Mac/Linux/Windows (`:8642`) | Remote host shell | Remote host shell | User Mac + bot bridge | User agent stack | Web UI / Link |
| **Phone role** | Operator UI | Terminal | Terminal | Messaging client | Operator UI | Operator UI |
| **Approve risky tools** | **Leash (paid)** | No (you *are* the shell) | No | Weak / ad-hoc | Rarely framed as safety product | Session controls, not Leash |
| **Honest connection UX** | Explicit product (USB / TS / LAN) | SSH connect success/fail | Same | Telegram online ≠ Mac online | Varies | Varies |
| **Pair model** | QR / deep link / Tailscale / USB | Hosts + keys vault | Hosts + keys | Bot token / chat ID | URL / stack config | URL / Hermes Link |
| **Monetization** | Free + Leash IAP / paid SKU | Free download (site) | Freemium / teams | Free (Telegram) | Varies | Free / lifetime IAP |
| **Brand collision “Hermes”** | Own brand | None | None | Indirect | Low–medium | **Severe** |

---

## 3. Steal / ignore / differentiate

### GenTerminal (Genspark) — *SSH that remembers*

| Steal | Ignore | Differentiate |
|-------|--------|---------------|
| One-line clarity (“SSH that remembers”) | Becoming an SSH client | **Agent + Leash**, not shell |
| Desktop **and** mobile with vault/host sync narrative | SFTP, split panes, Quake hotkey war | Keys stay on **computer that runs Hermes** |
| Multi-locale marketing polish | Competing for “best terminal” keywords | Pair story: Wi‑Fi / USB / Tailscale **to your agent** |
| Free top-of-funnel + big parent brand distribution | Desktop installers as our channel | Phone is **approve/chat**, not `vim` |

**Positioning sentence if asked:**  
*GenTerminal is a great phone SSH client. Hermes Mobile is how you chat with and leash the AI agent on your Mac — different job.*

**Evidence (2026-07-24/25 scrape):** desktop macOS/Win/Linux; Android Play `ai.mainfunc.genspark.terminal_mobile` + APK; iOS App Store id `6770974459`; Play blurb = native SSH/SFTP + on-device encrypted key vault.

---

### Termius — *category king of SSH mobile*

| Steal | Ignore | Differentiate |
|-------|--------|---------------|
| “One click from any device” host memory | Enterprise team SSO arms race | Same as GenTerminal: not shell |
| Reliability bar for remotes | Snippet-heavy SSH features | Agent sessions + run status honesty |
| Cross-platform polish | Pricing tiers for teams | Self-hosted Hermes gateway, no Termius account required |

**Threat:** None product-wise; **category education risk** if users search “SSH to my Mac AI.”

---

### Telegram + Hermes bot — *default remote for Hermes operators*

| Steal | Ignore | Differentiate |
|-------|--------|---------------|
| Zero-friction “message the agent” | Staying a thin Telegram skin | **Native** chat, multi-Mac profiles, USB/TS paths |
| Notification habit | Building another bot framework | **Leash** approve/deny UX (cards, policies) |
| Always-on inbox metaphor | Competing on meme stickers | Honest **Not connected** vs Telegram “online” lie |

**Architecture truth:** [ARCHITECTURE.md](../ARCHITECTURE.md) — Hermes Mobile **replaces Telegram DM** and mirrors desktop/CLI on `:8642`.

**Threat:** **High** for users who only want text-in/text-out. Win them with multi-computer, Leash, and connection truth.

---

### OpenClaw-class remotes (Aight, ClawControl / ClawPilot, muxd)

| Steal | Ignore | Differentiate |
|-------|--------|---------------|
| “Control agents from phone” category language | Multi-stack soup that dilutes Hermes | **Hermes-first**, Cursor/Claude **operator context** not fake integrations |
| ASO around agent/remote/control | Clone every stack logo | **Leash = safety product**, not just another remote |
| Fast-follow UI patterns | Trademark stuffing in title | No competitor trademarks in metadata ([ASO rules](./ASO-POSITIONING-SOCIAL-JULY-2026.md)) |

**Threat:** **Medium** for ASO and mental shelf “agent remote.” Our wedge is **approve before execute** + **your computer**, not “supports 12 logos.”

---

### Hermex / HermesPilot / Hermes Agent Android — *name and SERP enemies*

| Steal | Ignore | Differentiate |
|-------|--------|---------------|
| Clear “Hermes client” packaging | Race to most features on-device | **Desktop gateway**, not phone-local agent |
| Lifetime IAP simplicity (Pilot) | Relay-middleman dependency | QR pair; Tailscale; USB; no “must use Link” |
| | | Title/subtitle: **Mac AI / Leash / not phone AI** |

**Threat:** **Highest for discoverability**, not for architecture. See store discoverability research addendum + ASC SERP table.

---

## 4. Buyer journeys (who we win / lose)

| Journey | Win with Hermes Mobile if… | Lose to… |
|---------|----------------------------|----------|
| “SSH into my VPS from phone” | Never our job | GenTerminal / Termius |
| “Text Hermes while on couch” | Leash + multi-Mac + better UX | Telegram (habit) |
| “Stop agent from `rm -rf` without me” | **Leash** | Nobody strong yet — **defend this** |
| “Run agent entirely on phone” | Not us | Hermes Agent Android / Hermex-class |
| “Control OpenClaw + Hermes + …” | Only if Hermes path is best-in-class | Aight-class multi-stack |
| “My agent Mac is home, I’m on 5G” | Tailscale + honest reconnect | DIY Termius + hope |

---

## 5. GTM actions (prioritized)

| Priority | Action | Why |
|----------|--------|-----|
| **P0** | Never describe Hermes Mobile as SSH/terminal | GenTerminal/Termius own that; we confuse SERP and users |
| **P0** | Lead every public surface with **chat + Leash + your Mac** | Differentiator competitors under-copy |
| **P0** | Ship **connection truth** (USB auto-heal when cabled, no false Connected) | Telegram and SSH apps don’t compete on this; we fail here → churn |
| **P1** | Content contrast posts: “SSH client vs agent leash” | Capture GenTerminal-curious AI operators without trademark abuse |
| **P1** | ASO long-tail: `approve agent`, `mac ai phone`, `tailscale agent` — not `ssh client` | Avoid terminal category |
| **P1** | Telegram migration copy: “Same Hermes, better approvals & multi-Mac” | Highest real substitute |
| **P2** | Track GenTerminal only as **distribution/UX bar**, not roadmap clone | Low product threat |
| **P2** | Watch Aight / Claw* naming on iOS SERP quarterly | Medium ASO threat |
| **P3** | Optional: comparison landing section on thumbgate / hermes funnel | Only after connection reliability is green |

### Do-not list

- Do **not** add SFTP, host vault sync, or split-pane terminal to “beat” GenTerminal.
- Do **not** put Termius/GenTerminal/OpenClaw **trademarks in App Store keywords** (policy + brand risk).
- Do **not** claim Hermes Mobile replaces SSH; claim it **replaces Telegram DM for Hermes** (true per architecture).

---

## 6. Messaging cheatsheet

| Audience | Line |
|----------|------|
| **General** | Hermes Mobile: chat with the AI agent on **your** computer and approve risky tools. Not phone AI. |
| **vs GenTerminal/Termius** | Those are excellent SSH clients. We don’t replace your shell — we operate **Hermes** and **Leash** safety. |
| **vs Telegram** | Same agent, native multi-Mac pairing, honest connection state, and Leash approvals that aren’t a chat salad. |
| **vs Hermex / name clones** | We pair to the Hermes **gateway on your machine** (Wi‑Fi, USB, Tailscale) — control plane, not another phone LLM. |
| **vs OpenClaw remotes** | Built for Hermes operators who also live in Cursor/Claude Code — approve blocked tools before they run. |

---

## 7. Evidence log (light)

| Source | Fact used |
|--------|-----------|
| genterminal.ai (2026-07-24) | SSH client; vault; desktop + mobile; Genspark; free offer schema |
| Play `ai.mainfunc.genspark.terminal_mobile` | “Genterminal — SSH Client”; SSH & SFTP; encrypted key vault |
| termius.com | “Modern SSH client… any device” |
| hermes-mobile ARCHITECTURE.md | Replaces Telegram DM; mirrors `:8642` |
| ASC-ASO-POSITIONING-JULY-2026.md | Hermex, HermesPilot, Aight SERP map |
| Store discoverability addendum (July 2026) | Hermes Agent Android; Claw* cluster; Leash under-copied |

---

## 8. One-page verdict

```
DIRECT COMPETITORS (same job)     ADJACENT (same "phone→machine")     SERP/NAME NOISE
-----------------------------     --------------------------------     ----------------
Telegram Hermes bot               GenTerminal, Termius                 Hermex, HermesPilot,
OpenClaw remotes (partial)        Tailscale + SSH DIY                  Hermes Agent Android
Hermes gateway Web UIs                                                 Unrelated "Hermes" apps

DEFEND: Leash + multi-Mac + connection honesty
IGNORE: SSH feature parity
ATTACK: "Approve before execute on YOUR computer"
```

**Bottom line:** GenTerminal is a **distribution-quality adjacent product**, not a reason to pivot Hermes Mobile. **Telegram** and **Hermes-named clients** are the threats that matter for revenue and store rank. Win by being the best **agent leash + chat** to a **real computer**, not a better terminal.
