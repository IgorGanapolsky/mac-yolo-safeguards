---
name: igorganapolsky-brand-sync
description: Personal Brand & Venture Portfolio Synchronization Engine for Igor Ganapolsky (igorganapolsky.com / IgorGanapolsky.github.io). Automates showcase updates, venture links (ThumbGate, HVAC AI, Hermes Mobile, B2B AI Operations), and GitHub Pages deployment.
---

# Igor Ganapolsky Personal Brand & Venture Portfolio Engine

## Overview
This skill provides automated management, validation, and deployment for Igor Ganapolsky's canonical personal website and venture showcase at **[igorganapolsky.com](https://igorganapolsky.com)** (`IgorGanapolsky.github.io`).

## Core Invariants
1. **Primary Identity**: Igor Ganapolsky — AI Systems Architect, Founder & Engineer.
2. **Featured Ventures**:
   - 🛡️ **ThumbGate.app** (Pre-action governance & cloud sandbox mesh)
   - ❄️ **HVAC AI Automation & Voice Dispatch** (Autonomous missed-call triage & emergency contractor dispatch)
   - 📱 **Hermes Mobile & 24/7 Cloud Agent** (Autonomous AI engineering control plane)
   - 📈 **B2B AI Operations Agency** (Turnkey AI Employee retainers @ $297–$997/mo)
3. **Canonical Channels**:
   - Primary Email: `igor@igorganapolsky.com`
   - GitHub: `https://github.com/IgorGanapolsky`
   - LinkedIn: `https://linkedin.com/in/igorganapolsky`

## Usage

```javascript
const { BrandSyncEngine } = require('tools/igorganapolsky_brand_sync');

const engine = new BrandSyncEngine();
const validation = engine.validatePortfolio();
if (validation.ok) {
  engine.syncAndPublish('feat(brand): update portfolio showcase');
}
```
