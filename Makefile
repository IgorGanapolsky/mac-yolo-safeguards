# Makefile — local CI runner using `act` (GitHub Actions in Docker)
# Mirrors the key jobs from .github/workflows/ci.yml
# Usage:
#   make ci          # run all jobs locally with act
#   make ci-fast     # run only fast jobs (no E2E, no simulator)
#   make ci-check    # run scripts/ci-verify.sh (pure shell, no Docker)
#   make ci-mobile   # run hermes-mobile typecheck + unit tests only

ifeq ($(shell command -v act 2> /dev/null),)
  ACT := $(error act not installed. Install with: brew install act)
else
  ACT := act
endif

# Use the same runner image the workflows specify (ubuntu-latest -> ubuntu-22.04)
ACT_IMAGE := ubuntu-22.04
ACT_FLAGS := --platform linux/amd64 --reuse --cache

.PHONY: ci ci-fast ci-check ci-mobile help next-dollar sync sync-once sync-verify

help:
	@echo "Available targets:"
	@echo "  ci          - Run full CI locally with act (slow, needs Docker)"
	@echo "  ci-fast     - Run fast CI checks only (no E2E/simulator)"
	@echo "  ci-check    - Run scripts/ci-verify.sh without Docker"
	@echo "  ci-mobile   - Run hermes-mobile typecheck + unit tests"
	@echo "  next-dollar - Regenerate today's next-dollar send plan from live Skool leads"
	@echo "  sync-verify   - Dry-run the full GitHub->Linear->Obsidian sync pipeline (no writes)"
	@echo "  sync-once     - Run the full continuous sync ONCE (all 4 steps, live API)"
	@echo "  sync          - Bootstrap the 24/7 LaunchAgent daemon (300s interval, auto-runs sync)"

next-dollar:
	python3 tools/gen-next-dollar-plan.py
	node tools/send-plan.js --date $$(date -u +%F) \
		--actions data/outreach-actions-$$(date -u +%F).tsv \
		--pipeline data/pipeline-status-$$(date -u +%F).tsv \
		--stripe-offer-map data/stripe-offer-map-$$(date -u +%F).tsv \
		--stripe-status missing \
		--out docs/next-dollar-send-plan-$$(date -u +%F).md
ci:
	$(ACT) -P ubuntu-latest=$(ACT_IMAGE) $(ACT_FLAGS) -W .github/workflows/ci.yml

ci-fast:
	$(ACT) -P ubuntu-latest=$(ACT_IMAGE) $(ACT_FLAGS) \
		-W .github/workflows/ci.yml \
		-j "JavaScript syntax" -j "Shell syntax" -j "Python static checks" \
		-j "GitGuardian Security Checks" -j "conflict markers" \
		-j "Public funnel checks" -j "Detect hermes-mobile changes"

ci-check:
	bash scripts/ci-verify.sh

ci-mobile:
	cd hermes-mobile && npm ci && npm run typecheck && npm run test:ci

# 24/7 autonomous agent issue-management (GitHub <-> Linear <-> Obsidian).
# No babysitting — daemon runs via LaunchAgent every 300s; sync is idempotent.
SYNC_PLIST := com.igor.linear-obsidian-sync

sync-verify:
	@echo "Dry-run GitHub→Linear→Obsidian pipeline (no writes)..."
	node tools/github-linear-sync.js --dry-run --skip-obsidian
	node tools/herdr-linear-integration.js --dry-run --json
	@echo "sync-verify OK"

sync-once:
	@echo "Running full continuous sync ONCE (live API)..."
	bash tools/linear-obsidian-continuous-sync.sh

sync:
	@if launchctl list | grep -q '$(SYNC_PLIST)'; then \
	  echo "$(SYNC_PLIST) already loaded (24/7 active)"; \
	else \
	  launchctl bootstrap gui/$$(id -u) ~/Library/LaunchAgents/$(SYNC_PLIST).plist \
	    && echo "bootstrapped $(SYNC_PLIST) — 24/7 sync active (300s)"; \
	fi
	@$(MAKE) sync-once
