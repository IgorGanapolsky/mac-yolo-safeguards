---
name: netflix-oci-causal-engine
description: Netflix OCI (Observational Causal Inference) Actor-Critic Engine, Target Trial Emulation (TTE), Propensity Score Inverse Weighting, Placebo Invariant Testing & Sensitivity Analysis for AI Agents.
trigger: ["netflix oci", "causal inference", "actor critic eval", "target trial emulation", "placebo test", "propensity score", "e-value", "confounding"]
---

# netflix-oci-causal-engine

Netflix OCI (Observational Causal Inference) Actor-Critic Causal Engine and Target Trial Emulation (TTE) Framework for AI Agents.

## Capabilities
1. **Target Trial Emulation (TTE)**: Transforms observational questions (pricing changes, prompt iterations, outreach variants) into randomized trial specs.
2. **Propensity Score Inverse Probability Weighting (IPW)**: Unmasks true Average Treatment Effect (ATE) and eliminates naive confounding inflation.
3. **Critic Falsification & Placebo Invariant Checks**: Rejects spurious correlations by proving treatment has zero effect on pre-treatment baseline outcomes.
4. **VanderWeele Sensitivity Bounds (E-value)**: Calculates exact robustness thresholds against unmeasured confounding.
5. **Covariate Balance (SMD)**: Standardized Mean Difference checks ensuring balance $\le 0.10$ across all features.
6. **Actor-Critic Autonomous Refinement Loop**: 3-tier ratings (`not_satisfactory`, `satisfactory_with_caveats`, `fully_satisfactory`) with auto-executing playbooks.

## Usage & Verification
```bash
node tools/netflix-oci-causal-engine.js --json
node tools/netflix-oci-causal-engine.js
node tests/test-netflix-oci-causal-engine.js
```
