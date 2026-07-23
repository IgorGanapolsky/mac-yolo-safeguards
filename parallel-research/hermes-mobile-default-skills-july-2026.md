
# Hermes Mobile (Hermes Agent) Default Skills Allowlist — July 2026

## TL;DR — The Essential Allowlist

Hermes Agent (the product behind "Hermes Mobile", Nous Research's mobile/Telegram/Discord-reachable assistant) ships with a **bundled skills catalog** that is **active by default** and an **optional skills catalog** that is **opt-in only**. There is no "Mobile SKU" with a separate allowlist; mobile reachability is a deployment surface, not a permission boundary.

**Bundled (active on first install, copied to `~/.hermes/skills/`):**

| Category | Skills seeded by default |
|---|---|
| Shell & orchestration | `computer-use` (background desktop control — see security note), shell helpers |
| Productivity | Obsidian-vault (`obsidian`), calendar/notes utilities |
| Email | `himalaya` CLI bridge (IMAP/SMTP) |
| GitHub | `codebase-inspection`, `github-auth`, `github-code-review`, `github-issues`, `github-pr-workflow`, `github-repo-management` |
| Hermes ecosystem | `hermes-sandbox`, `hermes-desktop-plugins`, `hermes-agent` (self-config) |
| Media | `gif-search`, `heartmula` song-gen, `songsee` audio analysis, `youtube-content` |
| ML ops | `huggingface-hub`, `llama-cpp`, `vllm`, `audiocraft`, `segment-anything-model`, `lm-evaluation-harness`, `weights-and-biases` |

**Optional (NOT active — install explicitly via `hermes skills install official/<cat>/<skill>`):**

- `apple/apple-notes`, `apple/apple-reminders`, `apple/findmy`, `apple/imessage`
- `autonomous-ai-agents/{antigravity-cli,blackbox,grok,openhands}` — coding-agent delegation
- `communication/{discord,slack,telegram}` — chat-platform reachability
- `smart-home/home-assistant` — home automation
- `music/spotify` — playback
- `email/agentmail`, `finance/{…}` and the full `finance` model set, etc.

Sources: [16] and [30].

The v0.16 (June 5, 2026) release explicitly notes that "Heavier or niche skills moved from bundled to optional" ([37]). Net effect for the essentials/demote question: the bundled set is now leaner, and Spotify, Discord, and Home Assistant are all *demoted* — you must opt in.

## Essentials vs. Demote — Where Spotify, Discord, Home Assistant Land

| Integration | Status mid-2026 | Default OAuth risk |
|---|---|---|
| **Spotify** | `optional-skills/communication/spotify` — OFF by default | Loopback OAuth at `127.0.0.1:43827`; auto-picks port per remote MCP server ([7]). |
| **Discord** | `optional-skills/communication/discord` — OFF by default; Hermes Mobile reachability uses the bundled messaging plane, not the Discord skill | Standard Discord OAuth2 bot token; community skill. |
| **Home Assistant** | `optional-skills/smart-home/home-assistant` — OFF by default | **Long-lived access token** (not OAuth), stored in `~/.hermes/.env` as `HASS_TOKEN`; bearer-equivalent, no rotation, no scope limitation beyond user account rights ([22]). |
| **Telegram / Slack** | Optional — OFF by default | Bot tokens via env. |

**Demote verdict:** all three hobby integrations are explicitly optional, not in the default allowlist. The Home Assistant token model is the most concerning because it is a *static bearer* (effectively a long-lived password), whereas Spotify's loopback OAuth is request-scoped and Discord's is permission-scoped via OAuth2 scopes.

## Competitor Defaults — What "Default" Means Elsewhere

**OpenClaw** (open-source coding assistant, AgentSkills-compatible). Its config semantics are the cleanest reference:
- `agents.defaults.skills` — inherited when an agent has no explicit list.
- A per-agent `skills: []` (empty array) means **no skills** — explicit empty overrides inheritance.
- A per-agent `skills: [a, b]` **replaces** defaults rather than merging ([20], [18]).

This is a stricter "explicit allowlist" default than Hermes, which seeds bundled skills silently and lets `optional-skills/` sit dormant.

**Hermex** (`hermex.dev`) is positioned as an "AI Software Factory" orchestrating Cursor/Claude Code/Codex; it is not a direct competitor in the agent-runtime sense and does not publish a comparable default-skills allowlist.

**HermesPilot** — no verifiable public product, documentation, or GitHub presence was found at the time of writing. Treat as unverifiable until a canonical source appears.

## Security of Default-Enabling OAuth for Strangers

Hermes Agent's documented posture is **allow-by-default**. The independent security audit filed as [15] (April 11, 2026) on the hermes-agent repo rates the default configuration 4 Critical and 9 High, with these directly relevant to OAuth/skills:

- **C1 — Unrestricted shell execution.** The terminal tool passes arbitrary commands to `bash -c` via `subprocess.Popen` when `env_type="local"` (the default). The dangerous-command detector is regex-based and bypassable.
- **C2 — Filesystem read with no deny list.** `read_file` reads any path; SSH keys, `.env`, `/etc/passwd` are reachable. `redact_sensitive_text` is output-only, not access control.
- **C4 — Persistent skill creation.** The agent can write new skills into `~/.hermes/skills/` that load in future sessions — a self-perpetuating prompt-injection surface, made worse because the skills guard is regex-only and agent-created skills are downgraded to "ask" instead of "block."
- **H1 — `HERMES_YOLO_MODE=1` disables every approval gate.**
- **H2 — Smart-approval uses an LLM to "auto-approve" commands**; trivially prompt-injectable.
- **H3 — Write-deny list is bypassable via the terminal tool** (`echo evil > ~/.ssh/authorized_keys`).
- **H8 — Skills guard is regex-only static analysis** and fundamentally bypassable.
- **H3-adjacent — `anthropic_adapter` reads `~/.claude/.credentials.json`** (Claude Code OAuth tokens).

For OAuth specifically, the loopback flow documented for Spotify and remote MCP servers ([7]) requires either local-machine co-residency or an SSH `-L` tunnel. There is **no granular scope-down at install time**: when you `hermes skills install` an integration, you authorize whatever scopes that provider returns. Combined with the C4 finding, a malicious skill (or a prompt-injected existing skill) can spawn persistent code that re-uses any captured bearer on subsequent sessions.

**Net risk profile for a stranger-shared Hermes Mobile instance:**
1. Default-bundled skills include a desktop-control primitive (`computer-use`) that can drive the host GUI.
2. Optional OAuth skills (Spotify, Discord, Home Assistant) require explicit install but once authorized carry broad provider scopes.
3. There is no per-skill scope pinning; the provider's grant screen is the only friction.
4. Containerized backends skip approval entirely (C3).

## The Official Hermes-Agent Toolset Model (Mid-2026)

Hermes Agent v0.16 ships a leaner bundled set than prior majors; the tool registry is a single namespace under `~/.hermes/skills/` with optional catalogs under `optional-skills/<category>/<skill>/SKILL.md`. Install mechanics:

- `hermes skills install official/<category>/<skill>` (e.g. `official/communication/discord`).
- `hermes skills opt-out [--remove]` for a profile-wide opt-out marker (`.no-bundled-skills`); never deletes user-modified files.
- External skill directories can be added via config; precedence is local > hub > bundled ([30]).

Default model providers documented in [3]: Nous Portal (recommended), Anthropic, OpenAI, GitHub Copilot, plus local Ollama-compatible endpoints. The "Hermes Mobile" mobile client is a thin client over these backends — it does not introduce a separate allowlist.

## Decision Framework for Hobby Integrations

For a hobby user who wants Spotify, Discord, and Home Assistant reachable from Hermes Mobile, the safe path in mid-2026 is:

1. Keep the default `~/.hermes/skills/` lean by running `hermes skills opt-out` once, then re-adding only the skills you actively use.
2. Install each OAuth skill with the most-restrictive provider-side scopes you can stand (Spotify: read-only-playback + user-modify-playbackstate, not the full user-library-read; Discord: only `bot` scope with channel allowlist; Home Assistant: prefer a per-device token over a long-lived user token).
3. Run Hermes in Docker/Modal/SSH (not the local backend) to keep the C1 shell primitive out of the host session.
4. Never enable `HERMES_YOLO_MODE=1` and never set `env_type=local` on shared hardware.
5. Treat the Spotify `127.0.0.1:43827` listener as short-lived: it is bound only for the OAuth callback window.

## Bottom Line

- **Essential allowlist (bundled, always on):** the categories in the table above — shell/creative/GitHub/Media/MLOps/productivity/note-taking. Computer-use, full filesystem read, and outbound network are present at install.
- **Demote to opt-in:** Spotify, Discord, Home Assistant, Apple ecosystem skills, all `autonomous-ai-agents/*` delegations, and the heavier `finance/*` model set.
- **Competitor posture:** OpenClaw's defaults are the most conservative (explicit empty list = none); Hermes' are the most permissive (silent bundled seeding); Hermex and HermesPilot are not credible comparisons in this category as of July 2026.
- **OAuth-for-strangers:** safe to leave off; never authorize without a per-skill scope audit; prefer containerized backends to neutralize C1/C3 from the audit.

---

**Primary sources cited**
- Hermes Agent Skills System — https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
- Optional Skills Catalog — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/optional-skills-catalog.md
- OAuth over SSH / Loopback Redirect — https://hermes-agent.nousresearch.com/docs/guides/oauth-over-ssh
- Hermes Integrations overview — https://hermes-agent.nousresearch.com/docs/integrations
- Home Assistant integration — https://hermes-agent.ai/integrations/home-assistant
- Security Audit issue #7826 — https://github.com/NousResearch/hermes-agent/issues/7826
- Feature #492 (Autonomous Skill Templates / Tool Allowlists) — https://github.com/NousResearch/hermes-agent/issues/492
- Hermes v0.16 release notes summary — https://blakecrosley.com/guides/hermes
- OpenClaw Skills config — https://docs.openclaw.ai/tools/skills and https://docs.openclaw.kr/tools/skills-config
- Hermex (AI Software Factory) — https://hermex.dev/

## References

1. *Skills Hub | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/skills
2. *hermes-agent/website/docs/integrations/providers.md ...*. https://github.com/NousResearch/hermes-agent/blob/main/website/docs/integrations/providers.md
3. *Integrations | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/integrations
4. *hermes-community-hub/skills/api-integration/discord ... - GitHub*. https://github.com/nous-hermeshub/hermes-community-hub/blob/main/skills/api-integration/discord-automation/SKILL.md
5. *Hermes Agent × Discord Setup Method | Complete Guide*. https://note.com/takuma_hayakawa/n/n5bfda4759477?hl=en-US
6. *hermes-agent/website/docs/guides/oauth-over-ssh.md at main ...*. https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/oauth-over-ssh.md
7. *OAuth over SSH / Remote Hosts | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/guides/oauth-over-ssh
8. *OAuth & Token Lifecycle | nousresearch-hermes-agent/hermes ...*. https://deepwiki.com/nousresearch-hermes-agent/hermes-agent/3.2-oauth-and-token-lifecycle
9. *Security Audit: 4 Critical, 9 High severity findings in default configuration · Issue #7826 · NousResearch/hermes-agent · GitHub*. http://github.com/NousResearch/hermes-agent/issues/7826
10. *Installation — Hermes Agent Docs*. https://www.hermes-ai.net/docs/installation
11. *Tool Allowlists, Requirement Declarations, Scheduled Execution ...*. https://github.com/NousResearch/hermes-agent/issues/492
12. *hermes-agent/website/docs/reference/optional-skills-catalog.md at main · NousResearch/hermes-agent · GitHub*. http://github.com/nousresearch/hermes-agent/blob/main/website/docs/reference/optional-skills-catalog.md
13. *hermes-agent/website/docs/user-guide/features/skills.md at ...*. https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md
14. *hermes-agent Agent Skill | SkillsMP*. https://skillsmp.com/creators/nousresearch/hermes-agent/skills-autonomous-ai-agents-hermes-agent
15. *Security Audit: 4 Critical, 9 High severity findings in default configuration · Issue #7826 · NousResearch/hermes-agent · GitHub*. https://github.com/NousResearch/hermes-agent/issues/7826
16. *hermes-agent/website/docs/reference/optional-skills-catalog.md at main · NousResearch/hermes-agent · GitHub*. https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/optional-skills-catalog.md
17. *Configuration — agents | OpenClaw Docs*. https://openclaw.cc/en/gateway/config-agents.html
18. *Skills Config - OpenClaw*. https://docs.openclaw.kr/tools/skills-config
19. *Skills – OpenClaw - Open Source AI Coding Assistant*. https://openclawlab.com/en/docs/tools/skills
20. *Skills - OpenClaw Docs*. https://docs.openclaw.ai/tools/skills
21. *openclaw/docs/tools/skills.md at main · openclaw/openclaw*. https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md
22. *Hermes Agent + Home Assistant — Smart Home Tools*. https://hermes-agent.ai/integrations/home-assistant
23. *Optional Skills Catalog | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog
24. *Hermes Agent Skill 完整目录*. https://codesstar.github.io/hermes-skill-atlas/article/hermes-skill-catalog.html
25. *home-assistant Hermes AI Agent Skill | LLMBase*. https://llmbase.ai/skills/sundial-org/home-assistant
26. *Skills — Hermes Agent | Discover, Install, and Reuse Agent Skills*. https://www.hermes-ai.net/skills
27. *Bundled Skills Catalog | Hermes Agent*. http://hermes-agent.nousresearch.com/docs/reference/skills-catalog
28. *Bundled Skills Catalog - Hermes Agent CN*. https://hermesagent.org.cn/en/docs/reference/skills-catalog
29. *description: hermes-agent - The agent that grows with you title: hermes-agent image: https://upd.dev/NousResearch/hermes-agent/-/summary-card*. http://upd.dev/NousResearch/hermes-agent/releases
30. *Skills System | Hermes Agent - nous research*. https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
31. *Releases · NousResearch/hermes-agent - GitHub*. https://github.com/NousResearch/hermes-agent/releases
32. *Bundled Skills Catalog - Hermes Agent*. https://hermes-agent.nousresearch.com/docs/reference/skills-catalog
33. *Working with Skills | Hermes Agent - nous research*. https://hermes-agent.nousresearch.com/docs/guides/work-with-skills
34. *Hermes Agent — Open-Source AI Agent with Persistent Memory*. https://hermes-agent.org/
35. *Hermes Agent — The Agent That Grows With You | Nous Research*. https://hermes-agent.nousresearch.com/
36. *Hermes Desktop | Nous Research*. https://hermes-agent.nousresearch.com/desktop
37. *Hermes Agent v0.16 Reference: Surface Release + Desktop App ...*. https://blakecrosley.com/guides/hermes
38. *Hermes Agent*. https://docs.openwebui.com/getting-started/quick-start/connect-an-agent/hermes-agent
39. *Skills | OpenClaw Docs*. https://openclaw-ai.com/en/docs/tools/skills
40. *Default AGENTS.md - OpenClaw*. https://docs.openclaw.ai/reference/AGENTS.default
41. *docs.openclaw.ai*. https://docs.openclaw.ai/tools/skills.md
42. *AI Agent Tools: Tutorial & Example*. https://fme.safe.com/guides/ai-agent-architecture/ai-agent-tools
43. *Hermes One - Your AI Agent, Always Improving*. https://hermesagents.cc/
44. *GitHub - NousResearch/hermes-agent: The agent that grows with ...*. https://github.com/nousresearch/hermes-agent
45. *Hermex — AI Software Factory*. https://hermex.dev/
