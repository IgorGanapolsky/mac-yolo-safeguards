# Skool Money Project: AI VoIP Restaurant Answering & Booking Engine

This engine simulates a commission-based AI answering assistant that manages restaurant incoming VoIP calls, menu queries, hours lookups, table bookings, and POS ticket reconciliations.

---

## 🏛️ System Features
1. **RAG Intent Routing:** Parses raw transcribed audio to detect HOURS, MENU, or BOOKING intents.
2. **SMS Booking Dispatch:** Automatically drafts confirmation payloads containing live web links for table management.
3. **POS seat attribution:** Reconciles check-out invoices from restaurant POS systems (like Toast) against caller reservations to calculate seat commissions ($1.50 per guest cover).

---

## 🚀 Running the Evaluator
To run the automated test suite, execute:
```bash
node tests/test-skool-restaurant-answering.js
```

---

## 📊 Sample Configuration
```javascript
const { SkoolRestaurantAnsweringEngine } = require('./tools/skool-restaurant-answering');

const engine = new SkoolRestaurantAnsweringEngine({
  commissionRatePerCover: 1.50 // Earn $1.50 per customer cover booked by AI
});

// Process a call transcription
const callResult = engine.processSpeechInput("I want a table for 4 people on Friday at 7 PM");
// Output: BOOKING_REQUEST intent, partySize: 4
```
