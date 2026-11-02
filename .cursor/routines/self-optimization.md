# Routine: Self-Optimization Loop (`/routine-self-opt`)

## Objective
Iteratively improve the conversion rate (CVR) of the revenue funnel using Bayesian feedback.

## Steps
1. **Telemetry Audit:** Read `.thumbgate/revenue-truth.json` (or equivalent telemetry).
2. **Variant Analysis:** Compare `Variant A` (e.g., "Free AirPods") vs `Variant B` (e.g., "Early Access").
3. **Significance Check:** Calculate the probability that Variant B is better than Variant A.
4. **Pivot Action:**
    - If $P(B > A) > 95\%$, update the primary CTA in `landing_page.html`.
    - If $P(B > A) < 5\%$, discard Variant B and generate a new hypothesis.
5. **Log Decision:** Append the change to `~/Documents/AI-Agent-Sync/Decisions/revenue_optimizations.tsv`.

## Schedule
- **Audit:** Every Sunday at 11:00 PM.
- **Pivot:** Monday at 08:00 AM.
