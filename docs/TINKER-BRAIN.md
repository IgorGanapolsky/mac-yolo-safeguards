# tinker-brain — the ThumbGate.app GTM revenue brain

`tinker-brain` (CLI at `~/.local/bin/tinker-brain`) is a fail-closed, card-grounded
answer system whose job is to be the resident expert on **selling ThumbGate.app**:
positioning, pricing, marketing/promotion, sales motion, and honest cash truth.
Home is `tools/tinker-brain/` in this repo (migrated from skool_top1percent on
2026-07-28; the skool pipeline is retired).

## How an answer happens

1. **Export** — every question first refreshes an atomic snapshot
   (`export_tinker_brain_snapshot.py`): live `https://thumbgate.app/api/health`
   and `/api/billing/plan` readbacks (the live price outranks any cached copy),
   optional local receipts (`~/.hermes/receipts/tinker-brain/revenue-receipt.json`
   for Stripe reconciliation, `~/.hermes/receipts/thumbgate-aeo/latest.json` for
   the AEO monitor), rendered into `~/.hermes/business-brain/data-snapshot/ANSWER_CARD.txt`.
   No revenue receipt ⇒ external cash is $0 — never invented.
2. **Route** — `tinker_brain_router.py`, rules only (no LLM). GTM questions
   (sell/market/promote/price/position or any ThumbGate mention) get the
   `thumbgate_gtm` intent; cash truth, next-money, scores, and off-scope refusal
   survive from the original design.
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

## Tests

```bash
python3 tests/test-tinker-brain.py
```
