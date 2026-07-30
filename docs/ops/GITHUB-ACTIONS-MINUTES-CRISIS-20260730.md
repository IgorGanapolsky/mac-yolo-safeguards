# GitHub Actions minutes crisis — 2026-07-30

**Email:** 100% of included Actions minutes for `IgorGanapolsky` (3,000 / 3,000).  
**Reset:** 2026-08-01 (per GitHub notice).  
**Owner action this session:** `grok` (evidence via `gh`, not billing API).

## Rule (never skip)

**Only PRIVATE repos burn the included 3,000 minutes.**  
**PUBLIC repos on GitHub-hosted runners are free** and do not consume that allowance.

| Repo | Visibility | Counts against 3k? |
|------|------------|--------------------|
| `IgorGanapolsky/mac-yolo-safeguards` | **PUBLIC** | **No** |
| `IgorGanapolsky/Resume` | private | **Yes** |
| `IgorGanapolsky/saas-growth-promo` | private | **Yes** |
| `IgorGanapolsky/ThumbGate-Core` | private | **Yes** |
| `IgorGanapolsky/AI-Agent-Sync` | private | **Yes** (push/PR only) |

Do **not** “optimize” public Hermes Mobile CI to fix this email. That was the 2026-07-28 false diagnosis class.

## Private run volume (≈14 days, measured 2026-07-30)

| Private repo | Runs | Notes |
|--------------|-----:|-------|
| Resume | 556 | Dominant |
| ThumbGate-Core | 146 | GTM/marketing crons already disabled earlier |
| AI-Agent-Sync | 123 | Vault verify on push/PR |
| saas-growth-promo | 82 | Cron every 4h |

## Actions taken this session (verify with `gh`)

```bash
# Must show disabled_manually
gh api repos/IgorGanapolsky/Resume/actions/workflows \
  --jq '.workflows[] | select(.name|test("Ralph")) | "\(.state) \(.name)"'
# Ralph Loop → disabled_manually

gh api repos/IgorGanapolsky/saas-growth-promo/actions/workflows \
  --jq '.workflows[] | "\(.state) \(.name)"'
# SaaS Growth Dispatch - Promo Campaign → disabled_manually
```

Also cancelled in-progress Resume CI thrash (Trunk Check / related) to stop immediate private burn.

## Still active (low risk)

- Private **CodeQL weekly** crons on Resume + ThumbGate-Core (`cron` once/week) — leave on unless still over-budget after reset.
- Public `mac-yolo-safeguards` CI — free; keep for product quality.

## Until Aug 1 reset

1. Prefer **public** CI only (Hermes / mac-yolo).  
2. Avoid pushing to **private** repos that fire multi-job CI (Resume PRs).  
3. Optional hard stop (user decision): GitHub → Settings → Billing → Budgets → **$0 Actions budget** (blocks overage **and** all private Actions).  
4. Do **not** re-enable Ralph Loop or saas-growth promo cron without an explicit cost budget.

## Re-enable checklist (after reset)

- [ ] Billing usage by repository confirms private spend is healthy  
- [ ] Ralph Loop cadence stays ≥6h (never `*/30`)  
- [ ] saas-growth promo cadence stays ≥4h and dry-run defaults reviewed  
- [ ] No 100%-failing scheduled workflows (failed runs still bill)

## Trust / verification

Agents can be wrong. Re-run the `gh` commands above; check  
https://github.com/settings/billing/usage (group by Repositories).  
Trust **commands and dashboards**, not completion claims.
