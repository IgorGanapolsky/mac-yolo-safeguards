# GitLab Migration Research — Hermes Mobile (July 2026)

| Field | Value |
|-------|-------|
| **Parallel run ID** | `trun_5c7ef1b0f8184d71b6a7972dfc3e0451` |
| **Platform URL** | https://platform.parallel.ai/play/deep-research/trun_5c7ef1b0f8184d71b6a7972dfc3e0451 |
| **Decision date** | 2026-07-13 |
| **Scope** | `mac-yolo-safeguards/hermes-mobile` (Expo / React Native monorepo) |
| **Raw artifact** | [`parallel-research/trun_5c7ef1b0f8184d71b6a7972dfc3e0451.md`](../parallel-research/trun_5c7ef1b0f8184d71b6a7972dfc3e0451.md) |
| **Ingested** | 2026-07-14 (Parallel audit follow-up) |

## Verdict

**Stay on GitHub (Option A).** Harden orchestration now; re-evaluate in Q1 2027 after an optional GitLab Mirror Sandbox pilot.

Weighted scorecard (1–5): **GitHub 4.50** · GitLab-primary + mirror 3.40 · Full cutover 2.50.

Decisive factors for Hermes:

- EAS Workflows has first-class GitHub Actions integration; no equivalent GitLab CI integration.
- GitHub Actions macOS runners are GA (M1/Intel, 7h timeout); GitLab SaaS macOS runners remain beta-gated (3h timeout, Premium/Ultimate only).
- Agentic parity is close in mid-2026 (Copilot Coding Agent GA Feb 2026 vs Duo Agent Platform GA Jan 2026); migration cost and mobile-CI maturity dominate.

## Action checklist

### Immediate (Week 1 — aligns with PR #313 `github-week1-hardening`)

- [ ] Merge `merge_group` + Mac mini runner hardening (PR #313).
- [ ] Standardize `plan.md` + worktree conventions in repo; wire into Copilot Agent Mode / `AGENTS.md`.
- [ ] Add MCP servers for Sentry, PostHog, and Expo docs to agent context.
- [ ] Keep Dependabot, Codespaces, GitHub Actions, and EAS Workflows integration as-is.

### Optional pilot (2 weeks, zero blast radius)

- [ ] Create `hermes-mobile-sandbox` on GitLab (free namespace); enable Duo Pro trial.
- [ ] Mirror GitHub repo; author `.gitlab-ci.yml` shim calling `eas-cli`.
- [ ] Run identical task through Copilot Coding Agent (GitHub) and Duo Agent Platform (sandbox); record PR cycle time.
- [ ] Measure macOS runner queue time vs GitHub Actions M1; record build-minute cost.
- [ ] **Abort triggers** (any one): macOS queue >2× GitHub for 3 runs; EAS-on-GitLab glue >4 eng-hours per trigger pattern; Duo cycle time not within ±15% of Copilot on same task.

### Re-decision gate (Q1 2027)

- [ ] If pilot shows Duo >15% cycle-time improvement **and** EAS-on-GitLab glue is sustainable → reopen Option B (GitLab-primary + GitHub mirror).
- [ ] Otherwise: remain on GitHub; archive sandbox.

## Executive summary

Both platforms reached GA multi-agent surfaces in early 2026. For an Expo monorepo where mobile CI is the release spine, GitHub wins on EAS integration, macOS runner maturity, Dependabot UX, and OSS discoverability. GitLab wins on consolidated DevSecOps (SAST/DAST/dependency scanning on Ultimate) and merge trains, but migration cost (2–3 weeks for Actions→`.gitlab-ci.yml`, 1 week EAS glue, community/SEO loss) is not justified without pilot evidence.

**Recommendation:** Adopt Option A now; run the GitLab Mirror Sandbox in parallel if leadership wants empirical agentic comparison; re-decide Q1 2027.

## Weighted scorecard

| Criterion (weight) | A. Stay GitHub | B. GitLab + mirror | C. Full cutover |
|---|---|---|---|
| Mobile CI maturity (20%) | **5** | 2 | 2 |
| Multi-agent orchestration (15%) | 4 | **5** | 5 |
| Migration cost & risk (15%) | **5** | 3 | 1 |
| Tooling inertia (15%) | **5** | 2 | 1 |
| Security platform (10%) | 3 | 5 | **5** |
| Time-to-first-AI-PR (10%) | **5** | 4 | 3 |
| OSS discoverability (5%) | **5** | 4 | 2 |
| Self-hosted option (5%) | 2 | 4 | **5** |
| Cost per seat (5%) | 4 | 3 | 3 |
| **Weighted total** | **4.50** | **3.40** | **2.50** |

## Key platform facts (July 2026)

| Topic | GitHub | GitLab |
|---|---|---|
| Coding agent GA | Copilot Coding Agent — Feb 21, 2026 | Duo Agent Platform — GitLab 18.8, Jan 2026 |
| macOS CI | GA M1/Intel, 7h timeout, $0.062/min | Beta, 3h timeout, Premium/Ultimate only |
| EAS Workflows | First-party GitHub Actions integration | Manual `eas-cli` from `.gitlab-ci.yml` |
| Dependabot | Native | Dependency Scanning (Ultimate) or Renovate |
| Merge queue | Merge queue GA | Merge trains (Premium/Ultimate) |

## Migration cost inventory (high-risk items)

| Surface | Effort | Risk |
|---|---|---|
| Actions YAML → `.gitlab-ci.yml` | 2–3 weeks | **High** |
| EAS Workflows | 1 week + ongoing | **High** |
| Mobile CI cost delta | TBD | **High** (GitLab macOS beta, 3h cap) |
| Community / discoverability | Ongoing | **High** |

Rollback is easy at the Git level; hard-to-reverse parts are CI rewrites, third-party OAuth, and contributor momentum.

## References

Full report with 130+ citations: [`parallel-research/trun_5c7ef1b0f8184d71b6a7972dfc3e0451.md`](../parallel-research/trun_5c7ef1b0f8184d71b6a7972dfc3e0451.md).

Primary sources cited in research:

- [GitHub Copilot Coding Agent GA](https://github.blog/news-insights/product-news/github-copilot-meet-the-new-coding-agent)
- [GitLab Duo Agent Platform](https://about.gitlab.com/gitlab-duo-agent-platform)
- [GitLab hosted macOS runners (Beta)](https://docs.gitlab.com/ci/runners/hosted_runners/macos)
- [EAS Workflows + GitHub Actions](https://expo.dev/blog/how-to-integrate-eas-workflows-with-github-actions)
- [GitHub Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)
