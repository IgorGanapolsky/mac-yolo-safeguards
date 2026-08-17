/**
 * tools/ontoprank-growth-engine.js
 *
 * OnTopRank (ontoprank.com) Credit System & 14-Day Developer Testing Pack Engine:
 * 1. Credit Escrow & Settlement Lifecycle (30 credits per activity, reservation on start, transfer on verified proof).
 * 2. Google Play 14-Day 15-Tester Pack Cohort Governance (meets Google Play closed testing mandate).
 * 3. Reciprocal Install & Review Exchange Pipeline (for Hermes Mobile & LipoShield).
 * 4. Priority Boost & Visibility Pacing (optimal credit spending for rapid reviews).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CREDITS_PER_ACTIVITY = 30;
const INITIAL_APP_CREDIT_GRANT = 30;
const GOOGLE_PLAY_REQUIRED_TESTERS = 12; // 12-15 testers
const GOOGLE_PLAY_REQUIRED_DAYS = 14;

class CreditEscrowLedger {
  constructor(initialBalance = INITIAL_APP_CREDIT_GRANT) {
    this.availableBalance = initialBalance;
    this.escrowBalance = 0;
    this.transactions = [];
  }

  /**
   * Reserves credits when a tester starts an activity
   */
  reserveCredits(taskId, amount = CREDITS_PER_ACTIVITY) {
    if (this.availableBalance < amount) {
      return {
        success: false,
        reason: `INSUFFICIENT_CREDITS: Required ${amount}, available ${this.availableBalance}`,
      };
    }
    this.availableBalance -= amount;
    this.escrowBalance += amount;
    const tx = {
      txId: `tx_res_${crypto.randomUUID().slice(0, 8)}`,
      taskId,
      type: 'RESERVE',
      amount,
      timestamp: Date.now(),
      status: 'HELD_IN_ESCROW',
    };
    this.transactions.push(tx);
    return { success: true, txId: tx.txId, availableBalance: this.availableBalance, escrowBalance: this.escrowBalance };
  }

  /**
   * Releases escrow credits to tester upon AI/screenshot verification
   */
  settleCredits(taskId, testerId, proofVerified = true) {
    const holdTx = this.transactions.find((t) => t.taskId === taskId && t.type === 'RESERVE' && t.status === 'HELD_IN_ESCROW');
    if (!holdTx) {
      return { success: false, reason: 'NO_ACTIVE_ESCROW_FOR_TASK' };
    }

    if (!proofVerified) {
      // Refund escrow back to available balance
      this.escrowBalance -= holdTx.amount;
      this.availableBalance += holdTx.amount;
      holdTx.status = 'REFUNDED_TO_OWNER';
      return { success: false, action: 'REFUNDED', availableBalance: this.availableBalance };
    }

    this.escrowBalance -= holdTx.amount;
    holdTx.status = 'SETTLED_TO_TESTER';
    const settleTx = {
      txId: `tx_set_${crypto.randomUUID().slice(0, 8)}`,
      taskId,
      testerId,
      type: 'TRANSFER',
      amount: holdTx.amount,
      timestamp: Date.now(),
      status: 'COMPLETED',
    };
    this.transactions.push(settleTx);
    return { success: true, settleTxId: settleTx.txId, availableBalance: this.availableBalance, escrowBalance: this.escrowBalance };
  }

  /**
   * Adds earned credits from testing another developer's app
   */
  earnCredits(sourceAppId, amount = CREDITS_PER_ACTIVITY) {
    this.availableBalance += amount;
    const earnTx = {
      txId: `tx_earn_${crypto.randomUUID().slice(0, 8)}`,
      sourceAppId,
      type: 'EARN',
      amount,
      timestamp: Date.now(),
      status: 'AVAILABLE',
    };
    this.transactions.push(earnTx);
    return { success: true, txId: earnTx.txId, newBalance: this.availableBalance };
  }

  getBalanceSummary() {
    return {
      availableBalance: this.availableBalance,
      escrowBalance: this.escrowBalance,
      totalCapital: this.availableBalance + this.escrowBalance,
      transactionCount: this.transactions.length,
    };
  }
}

class TestingPackCohortManager {
  constructor(appId = 'com.igor.hermesmobile') {
    this.appId = appId;
    this.cohortMembers = new Map(); // testerId -> { joinDate, activeDays, verifiedSubmissions }
    this.startDate = Date.now();
  }

  enrollTester(testerId, developerName, deviceModel = 'Android Phone') {
    if (this.cohortMembers.has(testerId)) {
      return { enrolled: false, reason: 'ALREADY_ENROLLED' };
    }
    const member = {
      testerId,
      developerName,
      deviceModel,
      enrolledAt: Date.now(),
      daysActive: 1,
      verifiedSubmissions: [],
      optedInContinuously: true,
    };
    this.cohortMembers.set(testerId, member);
    return { enrolled: true, memberCount: this.cohortMembers.size };
  }

  logDailyEngagement(testerId, dayIndex, screenshotSha256) {
    const member = this.cohortMembers.get(testerId);
    if (!member) return { success: false, reason: 'TESTER_NOT_FOUND' };

    member.daysActive = Math.max(member.daysActive, dayIndex);
    member.verifiedSubmissions.push({ dayIndex, screenshotSha256, timestamp: Date.now() });
    return { success: true, testerId, currentActiveDays: member.daysActive };
  }

  evaluateGooglePlayCompliance() {
    const activeTesters = Array.from(this.cohortMembers.values()).filter((m) => m.optedInContinuously);
    const qualifyingTesters = activeTesters.filter((m) => m.daysActive >= GOOGLE_PLAY_REQUIRED_DAYS);

    const isCompliant = qualifyingTesters.length >= GOOGLE_PLAY_REQUIRED_TESTERS;
    return {
      appId: this.appId,
      isCompliant,
      totalEnrolled: this.cohortMembers.size,
      activeTestersCount: activeTesters.length,
      qualifying14DayTestersCount: qualifyingTesters.length,
      requiredTesters: GOOGLE_PLAY_REQUIRED_TESTERS,
      targetDays: GOOGLE_PLAY_REQUIRED_DAYS,
      readinessRatio: Number(((qualifyingTesters.length / GOOGLE_PLAY_REQUIRED_TESTERS) * 100).toFixed(1)),
    };
  }
}

class AppExchangeCampaignManager {
  constructor(options = {}) {
    this.apps = new Map(); // appId -> { ledger, cohortManager, boostMultiplier }
    this.registerApp('com.igor.hermesmobile', 'Hermes Mobile');
    this.registerApp('com.liposhield.app', 'LipoShield');
  }

  registerApp(appId, name) {
    this.apps.set(appId, {
      appId,
      name,
      ledger: new CreditEscrowLedger(),
      cohortManager: new TestingPackCohortManager(appId),
      boostMultiplier: 1.0,
    });
  }

  getAppStatus(appId) {
    const app = this.apps.get(appId);
    if (!app) return null;
    return {
      appId: app.appId,
      name: app.name,
      balance: app.ledger.getBalanceSummary(),
      compliance: app.cohortManager.evaluateGooglePlayCompliance(),
      boostMultiplier: app.boostMultiplier,
    };
  }

  applyBoost(appId, multiplier = 2.0) {
    const app = this.apps.get(appId);
    if (!app) return false;
    app.boostMultiplier = multiplier;
    return true;
  }
}

module.exports = {
  CREDITS_PER_ACTIVITY,
  INITIAL_APP_CREDIT_GRANT,
  CreditEscrowLedger,
  TestingPackCohortManager,
  AppExchangeCampaignManager,
};
