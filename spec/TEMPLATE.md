# Spec: {{TITLE}} (from {{INTENT_PATH}})

Author: {{AUTHOR}}
Date: {{DATE}}
Status: draft | approved | rejected
Intent Source: {{INTENT_PATH}}

## 1. Requirements Overview
<!-- Formalized problem and functional scope derived from intent.md -->
{{REQUIREMENTS_OVERVIEW}}

## 2. Architecture & Technical Design
<!-- Component breakdown, API contracts, data models, and sequence flows -->
{{TECHNICAL_DESIGN}}

## 3. Policy & Guardrail Matrix
<!-- Explicitly verified against repo skills, security policies, and brand/UX standards -->
| Domain | Policy / Skill Enforced | Compliance Status | Verified By |
|---|---|---|---|
| Security & Auth | Zero standing credentials, JWT validation | Compliant | secure-api-review |
| Spend / Resources | $0 unbudgeted spend, zero token leak | Compliant | spend-guard |
| Privacy & DLP | Zero PII in logs, strict payload sanitization | Compliant | island-dlp |
| UX / Layout | Responsive geometry, no collapsed scroll panes | Compliant | hermes-mobile-ux |

## 4. Flagged Areas of Concern & Tradeoffs
<!-- Contradicting policies, rate-limit bottlenecks, or migration complexities -->
- {{AREAS_OF_CONCERN}}

## 5. Acceptance Criteria & Verifiable Proof
<!-- Concrete deterministic checks required before shipping -->
- [ ] {{ACCEPTANCE_CRITERION_1}}
- [ ] {{ACCEPTANCE_CRITERION_2}}
