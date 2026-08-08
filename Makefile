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

.PHONY: ci ci-fast ci-check ci-mobile help

help:
	@echo "Available targets:"
	@echo "  ci          - Run full CI locally with act (slow, needs Docker)"
	@echo "  ci-fast     - Run fast CI checks only (no E2E/simulator)"
	@echo "  ci-check    - Run scripts/ci-verify.sh without Docker"
	@echo "  ci-mobile   - Run hermes-mobile typecheck + unit tests"

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
