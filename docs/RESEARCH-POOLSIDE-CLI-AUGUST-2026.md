# RESEARCH — Poolside (`pool` CLI + Laguna models) for August 2026

**Date:** 2026-07-24 (research framed for August 2026 product state)
**Subject:** `poolside-yolo` wrapper (PR #957 + #960, merged to `main`) around the official
`pool` CLI, routed through the Hermes LiteLLM gateway via `POOLSIDE_STANDALONE_BASE_URL` /
`POOLSIDE_STANDALONE_MODEL` / `POOLSIDE_API_KEY`. Separately covers the `laguna-free`
OpenRouter route already wired into `~/workspace/git/igor/hermes-eval/litellm/config.yaml`.

## Verdict

| Question | Answer |
|----------|--------|
| Is `v1.0.14` still current? | **Yes.** `pool-latest-version.txt` on Poolside's CDN returns `v1.0.14` (last-modified 2026-07-21); local `pool --version` = `1.0.14`. GitHub's [Releases page](https://github.com/poolsideai/pool/releases) only lists up to **v1.0.13** (2026-07-20) — it lags the real shipped CDN version by one release, so don't use it as the "current version" source of truth ([releases](https://github.com/poolsideai/pool/releases), CDN check below). |
| Did the env vars I rely on change? | **No.** `POOLSIDE_STANDALONE_BASE_URL` / `POOLSIDE_API_KEY` / `POOLSIDE_STANDALONE_MODEL` are still exactly the documented "OpenAI-compatible API" mechanism, verbatim in the current `main` README ([raw README](https://github.com/poolsideai/pool/blob/main/README.md#openai-compatible-api)). |
| Did `--mode`, `--unsafe-auto-allow`, `exec`, `credentials.json`, `settings.yaml` change? | **No breaking changes found.** All match current docs/README (see §1). |
| Is Laguna S 2.1 (our `laguna-free` route) being deprecated? | **No.** Only **Laguna M.1**'s OpenRouter free tier is sunsetting ("Going away July 28, 2026"); Laguna S 2.1 has no deprecation notice ([Laguna M.1 free page](https://openrouter.ai/poolside/laguna-m.1:free), [Laguna S 2.1 free page](https://openrouter.ai/poolside/laguna-s-2.1:free)). Not used by our config anyway. |
| Is anything newer than Laguna S 2.1 (2026-07-21)? | **No.** As of 2026-07-24, Laguna S 2.1 is still Poolside's most capable/current model per `poolside.ai/models`; no August release found. |
| Config drift found? | **Yes, one — in `hermes-eval`, not `poolside-yolo`.** `laguna-free`'s `max_input_tokens: 1048576` overstates the real OpenRouter free-tier serving limit, which is **262144** tokens, not 1M (see §2). |
| Is "Poolside Platform for free" still the recommended login? | **Yes**, unchanged: `pool login` → `platform.poolside.ai` → create/copy API key → paste into terminal; Laguna XS 2.1 / S 2.1 also offered "free in Preview" directly on the marketing site. |
| Any change that should alter `poolside-yolo`'s wiring? | **No.** See action checklist — everything verified matches current wrapper code. |

## Action checklist

1. **No changes needed in `poolside-yolo` itself.** Every env var, flag, and subcommand it depends on (`POOLSIDE_STANDALONE_BASE_URL`, `POOLSIDE_STANDALONE_MODEL`, `POOLSIDE_API_KEY`, `--mode allow-all`, `exec -p ... --unsafe-auto-allow -o json`, `login`/`update`/`--version` passthrough) is confirmed current against the live `main` README and the CLI reference docs.
2. **Stop trusting GitHub Releases as the "latest pool version" source** — it is one release behind the real CDN (`v1.0.13` vs actual `v1.0.14`). If `--doctor` or a future health check needs "is a newer version available," diff `pool --version` against `curl -s https://downloads.poolside.ai/pool/pool-latest-version.txt`, not the GitHub API.
3. **File a small fix in `hermes-eval`** (separate repo/PR, not `poolside-yolo`): change `laguna-free`'s `model_info.max_input_tokens` from `1048576` to `262144` in `litellm/config.yaml` — that's the actual OpenRouter free-tier serving limit for `poolside/laguna-s-2.1:free`, confirmed live via `GET https://openrouter.ai/api/v1/models` (the paid `poolside/laguna-s-2.1` variant is the one that gets the real 1M window). Leaving it at 1M risks LiteLLM accepting a >262K-token request that OpenRouter's free endpoint will then reject.
4. **No action on Laguna M.1's July 28, 2026 free-tier sunset** — it doesn't affect us; we don't reference `laguna-m.1` anywhere. Just don't let a future "let's also wire Laguna M.1 free" idea land after 2026-07-28 without re-checking OpenRouter first.
5. **Keep `POOLSIDE_STANDALONE_MODEL=glm-coding` as-is.** No newer/better default model ID appeared in Poolside's own lineup (Laguna S 2.1 is a *model to route to*, not a CLI/auth mechanism change) — it's already available separately via `laguna-free` in the gateway's fallback chain, so there's no reason to make it `poolside-yolo`'s hardcoded default.
6. **Re-verify the benchmark numbers in the `hermes-eval` config comment** — they check out. Poolside's own blog reports Laguna S 2.1 at SWE-Bench Multilingual 78.5% and SWE-Bench Pro (public) 59.4%, exactly matching the existing comment; no edit needed there.
7. **Nothing to change re: auth.** `pool login` still opens `platform.poolside.ai` for a free API key, and gateway env vars are still correctly withheld from `login`/`update`/`--version`/`--help` in the wrapper so real Poolside auth isn't shadowed.

---

## 1. `pool` CLI version, changelog, and config/auth surface

### 1.1 Version: v1.0.14 is current; GitHub Releases lags

- Poolside's own version-resolution endpoint is authoritative for what `install.sh` and `pool update` will fetch: `curl -s https://downloads.poolside.ai/pool/pool-latest-version.txt` returned `v1.0.14`, `last-modified: Tue, 21 Jul 2026`.
- The local binary Igor installed on 2026-07-24 reports `pool --version` → `1.0.14`, i.e. it matches the CDN's "latest," confirming `poolside-yolo` is running the current build.
- **GitHub's [Releases page](https://github.com/poolsideai/pool/releases) and tag list only go up to `v1.0.13`** (published 2026-07-20) — `v1.0.14` has no GitHub release/tag at all as of 2026-07-24 (`gh api repos/poolsideai/pool/releases/tags/v1.0.14` → 404). Poolside evidently ships CDN builds slightly ahead of (or independent from) GitHub release tagging. **Do not use the GitHub Releases API as a "is there a newer pool version" check** — use the CDN `pool-latest-version.txt` (or just run `pool update`).
- Recent (tagged) changelog highlights, newest first, from the [Releases page](https://github.com/poolsideai/pool/releases):
  - **v1.0.13** (2026-07-20): reduced network requests for `session/new`, image support in the read tool, TUI effort-level selector, logs switched to JSON.
  - **v1.0.12** (2026-07-20): token counter on active thoughts; `--worktree` now `cd`s into the worktree; perf improvements.
  - **v1.0.11** (2026-07-09): skills now discovered from `~/.agents/skills`; new `/resume` command; skills invoked via `$` instead of `/`; mouse support for `/model`/`/mode`; new `/set-option`; experimental streaming-HTTP transport.
  - **v1.0.6** (2026-06-19): OpenRouter login support added (`pool login` → "Log in with OpenRouter"); `/usage` shows session cost.
  - No entry in the tagged history touches `POOLSIDE_STANDALONE_*`, `credentials.json`, or `settings.yaml`'s schema in a breaking way.

### 1.2 Auth / config env vars — unchanged, verified against current `main`

Fetched the **live, unpinned `main` branch README** (`https://raw.githubusercontent.com/poolsideai/pool/main/README.md`), which is the actual source of truth rather than a point-in-time doc snapshot:

```bash
# OpenAI-compatible API section, verbatim:
POOLSIDE_STANDALONE_BASE_URL="http://127.0.0.1:8080" POOLSIDE_API_KEY="EMPTY" pool

# with an explicit model override:
POOLSIDE_STANDALONE_BASE_URL="http://127.0.0.1:8080" POOLSIDE_API_KEY="EMPTY" \
  POOLSIDE_STANDALONE_MODEL="ggml-org/gemma-3-1b-it-GGUF" pool
```

This is exactly the mechanism `poolside-yolo` uses (`GATEWAY_URL` → `POOLSIDE_STANDALONE_BASE_URL`, `DEFAULT_MODEL` → `POOLSIDE_STANDALONE_MODEL`, a placeholder → `POOLSIDE_API_KEY`) — **no change needed.**

Note: `docs.poolside.ai/cli/cli-reference`'s auto-summarized "Authentication Environment Variables" section separately surfaces `POOLSIDE_API_URL` as an "override API URL" var. That looks like a *different*, Poolside-hosted-API override (distinct from the standalone/local-endpoint mechanism), not a rename of `POOLSIDE_STANDALONE_BASE_URL` — the current README makes no mention of `POOLSIDE_API_URL` at all, and the standalone example is unchanged and still the one documented for "any OpenAI-compatible API." Flagging as unconfirmed/worth a second look if the gateway integration ever breaks, but it does not appear to affect `poolside-yolo`'s current wiring.

Also unchanged, per the same README:

- **Config paths**: `~/.config/poolside/` holds `settings.yaml` (global CLI settings) and `credentials.json` (API token); per-project overrides live in `.poolside/settings.yaml` (checked in) or `.poolside/settings.local.yaml` (gitignored) — the more specific file wins. `pool config` prints all of these paths; `pool config settings` opens `settings.yaml` directly.
- **`POOLSIDE_API_KEY` precedence**: "For automation environments, set `POOLSIDE_API_KEY` instead of using stored credentials. `pool` checks it before reading from configuration files" — exactly the assumption `poolside-yolo` relies on for non-interactive use.
- **`--mode` values** (unchanged): `default` (ask every time), `accept-edits` (auto-approve file read/write only), `allow-all` (approve everything), `plan` (no mutation). `poolside-yolo` uses `--mode allow-all` for bare interactive/autonomous runs — still correct.
- **`exec` flags** (unchanged): `-p`/`-f` for inline/file prompt, `-o json`/`markdown` for output format, `--unsafe-auto-allow` for auto-approval, exit code `4` = "agent ran but reported it could not complete the task" (0 = success, everything else = CLI/request error). `poolside-yolo`'s `exec` path (`--unsafe-auto-allow` + `-o json` injected only if not already present) still matches.
- **`login`/`update`/`--version`/`--help` passthrough**: still real, standalone subcommands/flags with no gateway dependency — the wrapper's decision to `exec` them directly (bypassing gateway env vars and the zero-spend gate) remains correct.

Sources: [`pool` README (`main`, raw)](https://raw.githubusercontent.com/poolsideai/pool/main/README.md), [CLI reference](https://docs.poolside.ai/cli/cli-reference), [GitHub repo](https://github.com/poolsideai/pool).

---

## 2. Model roadmap — Laguna family (no Malibu family found for CLI/API use)

Poolside's current, documented model roadmap (`poolside.ai/models` + blog) as of 2026-07-24:

| Model | Released | Params | Context | Status | Notable benchmarks |
|---|---|---|---|---|---|
| Laguna XS.2 / M.1 | 2026-04-28 | not fully disclosed | 256K | superseded by XS 2.1 / S 2.1 | SWE-Bench Verified 64%/65.4% ([intro post](https://poolside.ai/blog/introducing-laguna-xs2-m1)) |
| Laguna XS 2.1 | 2026-07-02 | 33B total / 3B active | 256K | **current** | SWE-Bench Multilingual 63.1% (+5.4pp vs XS.2), Terminal-Bench 2.0 37.5% ([intro post](https://poolside.ai/blog/introducing-laguna-xs-2-1)) |
| **Laguna S 2.1** | **2026-07-21** | **118B total / 8B active** | **1M** | **current, most capable** | Terminal-Bench 2.1 70.2%, **SWE-Bench Multilingual 78.5%**, **SWE-Bench Pro (public) 59.4%**, DeepSWE 40.4%, Toolathlon Verified 49.7% ([intro post](https://poolside.ai/blog/introducing-laguna-s-2-1), corroborated by [VentureBeat](https://venturebeat.com/infrastructure/poolside-drops-laguna-s-2-1-an-open-weight-coding-model-that-beats-rivals-10x-its-size) and [MarkTechPost](https://www.marktechpost.com/2026/07/21/poolside-releases-laguna-s-2-1/)) |

- **The `hermes-eval` config comment's benchmark claim is accurate and unchanged**: "118B/8B-active, coding-specialized; SWE-Bench Multilingual 78.5%, SWE-Bench Pro public 59.4%" matches Poolside's own published numbers exactly.
- **No "Malibu" family exists for the CLI/API surface.** The only Malibu references found were in an unrelated, dated internal research doc (`docs/RESEARCH-POOLSIDE-HERMES-HARNESS-JULY-2026.md`, citing a 2025 model-factory era); current `poolside.ai/models` and blog list only the Laguna line. Treat "Malibu" as legacy/superseded, not a live roadmap track.
- **No August 2026 release found.** As of 2026-07-24, Laguna S 2.1 (2026-07-21) is still the newest/most capable model; searches for an August announcement turned up nothing beyond the July lineup.
- Weights for both current models are open (OpenMDW-1.1 license) on [Hugging Face](https://huggingface.co/poolside/Laguna-S-2.1), independent of the CLI/OpenRouter integration.

### 2.1 OpenRouter serving details (verified live via API, 2026-07-24)

Queried `GET https://openrouter.ai/api/v1/models` directly (not a scraped/summarized page):

| OpenRouter model ID | context_length | pricing (prompt/completion per token) |
|---|---|---|
| `poolside/laguna-s-2.1` (paid) | 1,048,576 | $0.0000001 / $0.0000002 |
| **`poolside/laguna-s-2.1:free`** (our `laguna-free` route) | **262,144** | $0 / $0 |
| `poolside/laguna-xs-2.1:free` | 262,144 | $0 / $0 |
| `poolside/laguna-m.1:free` | 262,144 | $0 / $0 |

**Finding**: the `laguna-free` model served on OpenRouter's free tier caps at **262,144 tokens**, not the full model's 1,048,576-token capability — only the *paid* `poolside/laguna-s-2.1` route gets the full 1M window. `hermes-eval/litellm/config.yaml` currently sets `max_input_tokens: 1048576` for `laguna-free`, which overstates the real free-tier ceiling by 4x. This is a `hermes-eval` config fix, not a `poolside-yolo` change (see Action checklist #3).

### 2.2 Free-tier deprecation: only Laguna M.1, not Laguna S 2.1

- **`poolside/laguna-m.1:free`** shows an explicit banner: **"Going away July 28, 2026"** ([OpenRouter model page](https://openrouter.ai/poolside/laguna-m.1:free)).
- **`poolside/laguna-s-2.1:free`** — the one `hermes-eval` actually wires as `laguna-free` — has **no deprecation notice** on its page ([OpenRouter model page](https://openrouter.ai/poolside/laguna-s-2.1:free)).
- Net effect: **no action needed** for us; just don't assume Laguna M.1 is safe to add later without re-checking its (already-announced) sunset.

---

## 3. Pricing / free-login path — unchanged

- **`pool login`** still "opens `platform.poolside.ai` in your browser. In the browser, create or copy an API key, then paste it into the terminal" — confirmed on [`poolside.ai/get-started`](https://poolside.ai/get-started), which also advertises "Try our latest models, Laguna XS 2.1 and Laguna S 2.1, free in Preview."
- Poolside Platform itself has **no public self-serve price list** — enterprise engagement is sales-led; the free path for individual/CLI use remains the free API key via `platform.poolside.ai` (matches what `poolside-yolo` deliberately does *not* shadow — see Action checklist #7).
- OpenRouter remains a separate, independent free channel (`:free` suffixed Laguna models), unaffected by any Poolside Platform pricing changes.

Sources: [Get Started](https://poolside.ai/get-started), [platform.poolside.ai reference via search](https://openrouter.ai/poolside), [OpenRouter poolside provider page](https://openrouter.ai/poolside).

---

## 4. What would actually justify changing `poolside-yolo` — none found

None of the following materialized, so no code changes are recommended:

- A renamed/removed `POOLSIDE_STANDALONE_*` env var — not found; verbatim-current in `main` README.
- A new default auth mechanism replacing API-key-in-terminal `pool login` — not found.
- A `--mode`/`--unsafe-auto-allow`/`exec` flag rename or removal — not found; all confirmed current in [CLI reference](https://docs.poolside.ai/cli/cli-reference) and README.
- A better default model than `glm-coding` for `POOLSIDE_STANDALONE_MODEL` — Laguna S 2.1 is Poolside's best model, but it's a *hosted/OpenRouter model*, not something to hardcode as `poolside-yolo`'s default (the fleet already reaches it via `laguna-free` in the gateway's own fallback chain); making it the CLI wrapper's hardcoded default would bypass the fleet's fallback logic for no benefit.

## Related

- `poolside-yolo` wrapper: `/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/poolside-yolo`
- `tests/test-poolside-yolo.sh`
- `docs/RESEARCH-POOLSIDE-HERMES-HARNESS-JULY-2026.md` (prior, unrelated research — model-factory/eval-discipline angle, not CLI/model currency)
- `~/workspace/git/igor/hermes-eval/litellm/config.yaml` (the separate `laguna-free` OpenRouter route — action item #3 above)
- [`pool` GitHub repo](https://github.com/poolsideai/pool) / [README](https://github.com/poolsideai/pool/blob/main/README.md) / [Releases](https://github.com/poolsideai/pool/releases)
- [docs.poolside.ai](https://docs.poolside.ai/) / [CLI reference](https://docs.poolside.ai/cli/cli-reference) / [get-started](https://poolside.ai/get-started)
- [poolside.ai/models](https://poolside.ai/models) / [poolside.ai/blog](https://poolside.ai/blog)
- [Introducing Laguna S 2.1](https://poolside.ai/blog/introducing-laguna-s-2-1) (2026-07-21)
- [OpenRouter poolside provider page](https://openrouter.ai/poolside) / [laguna-s-2.1:free](https://openrouter.ai/poolside/laguna-s-2.1:free) / [laguna-m.1:free](https://openrouter.ai/poolside/laguna-m.1:free)
