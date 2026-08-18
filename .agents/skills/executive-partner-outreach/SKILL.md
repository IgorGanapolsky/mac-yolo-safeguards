---
name: executive-partner-outreach
description: Standardized Executive Partner Outreach Engine. Enforces mandatory 'igor@igorganapolsky.com' sender identity, automated proposal rendering (Markdown/HTML), direct dispatch via macOS Mail.app / Resend API, and cryptographic receipt logging.
---

# Executive Partner Outreach Engine

## Overview
This skill governs and automates outbound executive B2B proposals and consulting partnership pitches.

## Core Directives & Invariants
1. **Mandatory Sender**: ALL outreach emails must originate from `igor@igorganapolsky.com`. Never dispatch from generic or fallback addresses.
2. **Deterministic Dispatch**: Dispatches via macOS Mail.app AppleScript bridge or authenticated Resend API.
3. **Audit Provenance**: Every dispatch generates a permanent cryptographic receipt stored under `coordination/outreach/`.

## Usage

```javascript
const { ExecutiveOutreachEngine } = require('tools/executive_partner_outreach');

const engine = new ExecutiveOutreachEngine();
const message = engine.composeMessage(
  'contact@enterprise.com',
  'Partnership Proposal: ThumbGate AI Governance',
  'Proposal content...'
);
const receipt = engine.dispatchViaMailApp(message);
```
