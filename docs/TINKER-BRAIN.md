# tinker-brain — the ThumbGate.app GTM revenue brain

`tinker-brain` (CLI at `~/.local/bin/tinker-brain`) is a fail-closed, card-grounded
answer system whose job is to be the resident expert on **selling ThumbGate.app**:
positioning, pricing, marketing/promotion, sales motion, and honest cash truth.
Home is `tools/tinker-brain/` in this repo (migrated from skool_top1percent on
2026-07-28; the skool pipeline is retired).

## How an answer happens

1. **Export** — every question first refreshes an atomic snapshot
   (`export_tinker_brain_snapshot.py`): live `https://thumbgate.app/api/health`
   and `/api/billing/plan` readbacks (8s probe timeout; live price outranks any
   cached copy), best-effort Stripe reconcile via
   `reconcile_stripe_revenue_receipt.py` →
   `~/.hermes/receipts/tinker-brain/revenue-receipt.json` (when
   `STRIPE_SECRET_KEY` is available), plus AEO receipt
   `~/.hermes/receipts/thumbgate-aeo/latest.json`, rendered into
   `~/.hermes/business-brain/data-snapshot/ANSWER_CARD.txt`. The expert card copy
   is export-stamped (`AS_OF_RESEARCH` + first KNOWN_GAPS cash line) so dates do
   not rot. No verified receipt ⇒ external cash is $0 — never invented.
2. **Route** — `tinker_brain_router.py`, rules only (no LLM). **Cash diagnosis
   wins** over GTM when the question is “why no money / why not making money”
   (even if ThumbGate is named). Pure GTM questions (sell/market/promote/price/
   position) still get `thumbgate_gtm`.
3. **Answer** — `tinker_brain_answer.py` serves the matching sections of
   `config/THUMBGATE_EXPERT_CARD.txt` (the distilled July 2026 GTM research)
   plus grounded cash/receipt lines. Deterministic by default; the optional
   local-Ollama path is paraphrase-only.
4. **Validate** — `tinker_response_contract.py` rejects: invented scores or cash,
   endpoint-security miscategorization, Continuity rescue framing (PR #1075),
   reliability overclaims (seamless failover / E2EE / never stops), and
   ThumbGate.ai conflation. Violations fail closed to a minimal safe card dump.
5. **Receipts** — every answer logs economics (mode/latency) and a component
   fingerprint + the question to `~/.hermes/receipts/tinker-brain/`.

## Evals ("did the chatbot get worse?")

```bash
python3 tools/tinker-brain/tinker_brain_eval.py         # pinned fixture card — deterministic repro
python3 tools/tinker-brain/tinker_brain_eval.py --live  # live exported card — isolates data vs code
```

42 golden cases: 14 end-to-end (route + substrings + contract-clean) and 28
contract cases (exact violation lists). Receipts land in
`~/.hermes/receipts/tinker-brain/eval-latest.json` (+history).

## Regression triage

Use the `chatbot-regression-triage` skill (7 questions: model / retrieved docs /
prompts / tool APIs / user queries changed? reproducible? which component?).
Mechanical support:

```bash
python3 tools/tinker-brain/tinker_brain_fingerprint.py capture   # baseline after any change
python3 tools/tinker-brain/tinker_brain_fingerprint.py diff      # what changed between answers
```

## Updating the expertise

`config/THUMBGATE_EXPERT_CARD.txt` is the single knowledge source, distilled from
`docs/RESEARCH-THUMBGATE-*.md` (AS_OF_RESEARCH stamped in the header). When
positioning/pricing/channels shift: edit the card, re-run the eval suite, and
add an eval case for whatever changed. Prices are never trusted from the card —
answers always cite the live `/api/billing/plan` readback.

## Stripe cash receipt

```bash
# Writes ~/.hermes/receipts/tinker-brain/revenue-receipt.json when a key is present
export STRIPE_SECRET_KEY=sk_live_...   # or sk_test_...
python3 tools/tinker-brain/reconcile_stripe_revenue_receipt.py --json

# Export auto-calls reconcile (skip with --skip-stripe-reconcile or TINKER_SKIP_STRIPE_RECONCILE=1)
python3 tools/tinker-brain/export_tinker_brain_snapshot.py
```

Key resolution order: `STRIPE_SECRET_KEY` / `STRIPE_API_KEY` env →
`TINKER_STRIPE_KEY_FILE` → `~/.hermes/secrets/stripe_secret_key` →
`apps/hermes-control-plane/.dev.vars` / `.env.local`. Owner emails
(default `iganapolsky@gmail.com`, `ig5973700@gmail.com`, …) never count as
external revenue. Extend with `TINKER_OWNER_EMAILS=a@b.com,c@d.com`.

## CLI wrapper

Repo source of truth: `tools/tinker-brain/tinker-brain`. Install / refresh:

```bash
install -m 755 tools/tinker-brain/tinker-brain ~/.local/bin/tinker-brain
```

Chat mode uses a bash-3.2-safe stdin drain (no fractional `read -t`).

## Tests

```bash
python3 tests/test-tinker-brain.py
python3 tools/tinker-brain/tinker_brain_eval.py
```
