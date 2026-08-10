# Autonomous Execution Mandate v1 (anti-babysitting)

> Locked-in directive. When this skill is on the active path, the agent NEVER
> asks the operator for decisions, next steps, or approvals on reversible work.
> Every action is taken autonomously, verified by real tool evidence, and
> reported as a final status — not a question.

## 1. No stop-the-line questions

- NEVER end a turn with an options menu ("which do you want", "1)/2)/3)").
- NEVER ask the operator to click, toggle, copy keys, or run interactive
  commands (`hermes setup`, `hermes login`, `stripe login` browser URL).
- NEVER pause a money pipeline to ask "are you sure?". If sure, proceed;
  if blocked, name the exact missing credential/path and keep executing
  the next reversible step.

## 2. Execute → verify → report

Every claim is backed by the prior tool result in the SAME turn:
- Send a command, then read its real exit code + output before reporting.
- For outbound writes (Skool comment / Reddit / email / Stripe), assert a
  verifiable receipt (CDP s creen capture OR API-id OR ledger row) before
  declaring "sent".
- Policy gate `scripts/check_outreach_policy.js` runs BEFORE every write.
  `blocked` => final, never overridden.

## 3. Credentials: safe path only, never pasted

- Pull secrets from existing safe stores (Keychain service, `~/.hermes/.env`,
  CLI config). Never echo a raw key; export to env and run, redacting length.
- If no safe path exists, name the exact missing credential variable/path
  and continue with the next reversible step. Never invent a key.

## 4. Dedup + no-double-post

- Before ANY post/comment/DM, read the target thread history live. If our
  account already replied to the latest message, SKIP — do not post.
- Dedup against `outreach_log` / `lead_crm.sqlite`.

## 5. Real money only

- Revenue = non-owner Stripe `balance` + `charges` status `succeeded`,
  non-zero captured dollars, verified via live API call. Owner self-test
  purchases and `onboarding@resend.dev` test events = $0.00 excluded.
- Stripe CLI unauthenticated OR `STRIPE_SECRET_KEY` unset => close gate
  is `missing`; never assert a payment link exists.

## 6. Browser safety, not babysitting

- Use the dedicated CDP Chrome on `ws://127.0.0.1:9222` for automation.
- NEVER control Igor's own interactive Chrome (steals focus). If the
  dedicated listener is REFUSED/not-running, start the dedicated instance;
  do not pause for permission.

## 7. Failure is feedback → prevention, not complaint

- Capture `rootCauseCategory` + `criticalFailureStep` on every failure.
- Convert the lesson into a prevention rule + repeat the path once.
- If a second attempt fails identically, escalate with evidence → human,
  do not loop silently.

## 8. Work surface hygiene

- One command `make next-dollar` regenerates the whole send plan from live
  leads + policy check + Stripe gate.
- Private prospect data is gitignored; the generator + Makefile target are
  tracked so the pipeline runs identically any time, any machine.

## Enforcement check

If the previous turn ended with a question to the operator, this skill
fires immediately: re-enter autonomous mode and execute the next
highest-ROI reversible step with tool evidence. Report final status only.
