---
name: typesafe-jev-hook-steal
description: Use for TypeSafe Jev 1.14.0 System-One decisions (Noul, Choice, Score, Box), console.typesafe.ai/hook RLCD comprehension gates, truth-table guardrails, and 2-call progressive skill routing.
---

# TypeSafe Jev `1.14.0` & `console.typesafe.ai/hook` Steal

## 1. What We Stole from `https://console.typesafe.ai/hook` + `docs.typesafe.ai`

1. **The `/hook` Onboarding Comprehension Gate (`RLCD` + Mandatory Pop Quiz)**:
   - Trained with **RLCD (Reinforcement Learning for Calibrated Decisions)** by Diogo, Erik, and Sasha ("Smart if-statements — structured decisions for code, not generative chat").
   - **3x3 Progressive-Disclosure Matrix**:
     - **Properties**: *Structured, machine-native outputs* (100% type correctness by design), *Parallel sampling for fast decisions*, *Consistent, calibrated, probabilistic results*.
     - **Limitations**: *Not good at System 2 tasks* (math/counting/indirection), *Not trained on specialized domains* (supply context in `state`), *Not a generative chat model*.
     - **Benefits**: *20–200× faster*, *40–1,000× cheaper* (`$42 / Btok` = `$0.042 / Mtok` input, `$0` output tokens), *Frontier-level intelligence for System 1 tasks*.
   - **Pop Quiz Gate**: Blocks console/API key access until `"Can you chat with Jev, TypeSafe's new model?" -> No` (`Noul: 3% true, 97% false`).

2. **All 4 Jev `1.14.0` Primitives (`Noul`, `Choice`, `Score`, `Box`) + Companion Null-Case Noul**:
   - `Noul`: Calibrated yes/no probability in `[0, 1]`.
   - `Choice`: Option winner + per-option softmax probabilities + concentration `confidence`. Always pair with a companion `Noul` ("Does any option fit?") instead of embedding `none_of_the_above`.
   - `Score`: Expected rubric rating + per-level probabilities + legend.
   - `Box`: Image bounding box `{ top, bottom, left, right } ∈ [0, 1]` (requires header `TypeSafe-Danger-Zone-Images: true` and `jev-1.14.0`).
   - Long context: `TypeSafe-Danger-Zone-Long-Context: true` raises limits from `64k per-request / 32k per-question` to `262k / 262k`.

3. **"Judgments from Jev, Decisions in Code" (Truth-Table Guardrail Battery)**:
   - Never ask a model `"Should we block this action?"`. Ask atomic observable `Noul` hazard questions + a `Score` severity rubric in one request, then apply code thresholds (`<0.30` pass, `[0.30, 0.70)` review/ask, `>=0.70` action; precedence `["support", "block", "review", "pass"]`).

4. **2-Call Progressive-Disclosure Skill Router (`cookbooks/skill_suggestion.md`)**:
   - Call 1 skims 1-line skill descriptions + 4 action `Nouls` (stops immediately if `mean(action_nouls) < 0.30 && named < 0.50`).
   - Call 2 re-reads only the top 3 skills with 700-char `SKILL.md` excerpts (`Choice` + per-candidate `fits` `Noul`).
   - Cuts wrong skill loads `15.7% -> 7.9%` and needless skill loads `14.0% -> 5.2%`.

5. **Speculative Fan-Out & 9 Jaggedness Guardrails (`model-jaggedness.md`)**:
   - Bundling shared-state questions into one `POST /v1/systemone` call is **12.2× cheaper and 10.0× faster**.
   - Static linter blocks counting/math in questions, date ordering in questions, double negatives, positional choice keys (`option_1`), embedded `none_of_the_above`, and generative text prompts.

## 2. What the signed-in console showed on 2026-11-03

Signed in on `https://console.typesafe.ai/hook`, then Enter console, then answered the pop quiz **No**. The console showed Igor Ganapolsky, org label "Igor's org", balance **$0.00**, home model label **JEV V13**.

The quiz card showed Noul **3% true / 97% false** and the line "TypeSafe only responds with structured decisions."

Their home card "Parallel questions" says batching a 13-question GDPR briefing is **11.5× cheaper and 9.6× faster**. An older docs citation in this repo says 12.2× / 10.0×. Neither number was timed on this machine.

Their published skill says confidence is how peaked a distribution is, not whether the answer is right. A Noul at or above 0.7 is yes, at or below 0.3 is no, and the middle is unsettled. A missing answer is not a no. If code can already decide, do not pretend a model call did.

This check does not install `typesafe-ai/skills` and does not POST to `api.typesafe.ai`.

## 3. Verification Commands

```bash
node tools/typesafe-jev-hook.js --self-test
node tools/typesafe-jev-hook.js --status
```
