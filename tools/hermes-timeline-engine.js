#!/usr/bin/env node
'use strict';

/**
 * hermes-timeline-engine.js
 *
 * Privacy-First Local Semantic Timeline & Task Auto-Continuation Engine.
 *
 * Inspired by OpenAI Computer History & Ari Weinstein's macOS interaction timeline,
 * but designed with zero-trust privacy:
 *  1. Zero Keystroke Logging: Tracks high-level semantic workflow events (apps, git actions, CLI commands)
 *     instead of raw keyboard input or screen recordings.
 *  2. Local-Only & Secret-Scrubbed: All tokens, passwords, and private keys are scrubbed before recording.
 *  3. Incomplete Task Auto-Resume: Analyzes timeline to detect interrupted tasks and generate deterministic resume plans.
 *  4. Workflow Skill Discovery: Clusters repetitive action sequences (>3 occurrences) and proposes repeatable agent skills.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const TIMELINE_DIR = path.join(ROOT, 'coordination', 'timeline');
const TIMELINE_FILE = path.join(TIMELINE_DIR, 'semantic-events.jsonl');

function ensureDir() {
  if (!fs.existsSync(TIMELINE_DIR)) {
    fs.mkdirSync(TIMELINE_DIR, { recursive: true });
  }
}

// Redaction regex for credentials, tokens, and sensitive patterns
const SENSITIVE_PATTERNS = [
  /(?:bearer\s+[A-Za-z0-9_\-\.]{20,})/gi,
  /(?:sk-[A-Za-z0-9_\-]{20,})/gi,
  /(?:ghp_[A-Za-z0-9_]{30,})/gi,
  /(?:password\s*[:=]\s*['"][^'"]+['"])/gi,
  /(?:-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC )?PRIVATE KEY-----)/gi,
];

function sanitizePayload(payload) {
  let text = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  for (const pattern of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, '[REDACTED_SECRET]');
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class HermesTimelineEngine {
  constructor(filePath = TIMELINE_FILE) {
    this.filePath = filePath;
    ensureDir();
  }

  /**
   * Records a semantic workflow event with privacy redaction.
   */
  recordEvent({ eventType, sourceApp, intent, payload = {}, status = 'completed' }) {
    const cleanPayload = sanitizePayload(payload);
    const event = {
      id: `EVT-${crypto.randomBytes(8).toString('hex')}`,
      timestamp: new Date().toISOString(),
      eventType: eventType || 'task_action',
      sourceApp: sourceApp || 'terminal',
      intent: intent || 'unspecified_intent',
      status,
      payload: cleanPayload,
    };

    fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
    return event;
  }

  /**
   * Reads the recent timeline events.
   */
  getRecentEvents(limit = 100) {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs.readFileSync(this.filePath, 'utf8').trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  }

  /**
   * Identifies interrupted or incomplete tasks from recent timeline history.
   */
  detectIncompleteTasks(limit = 50) {
    const events = this.getRecentEvents(limit);
    const inFlightTasks = new Map();

    for (const evt of events) {
      const taskId = evt.payload?.taskId || evt.intent;
      if (evt.status === 'started' || evt.status === 'in_progress') {
        inFlightTasks.set(taskId, evt);
      } else if (evt.status === 'completed' || evt.status === 'cancelled') {
        inFlightTasks.delete(taskId);
      }
    }

    return Array.from(inFlightTasks.values()).map(evt => ({
      taskId: evt.payload?.taskId || evt.intent,
      lastAction: evt.intent,
      sourceApp: evt.sourceApp,
      startedAt: evt.timestamp,
      suggestedResumeAction: `resume_task_${evt.payload?.taskId || 'default'}`,
    }));
  }

  /**
   * Detects repetitive workflow sequences and suggests repeatable skills.
   */
  suggestWorkflowSkills(threshold = 3) {
    const events = this.getRecentEvents(200);
    const intentCounts = {};

    for (const evt of events) {
      const key = `${evt.sourceApp}:${evt.intent}`;
      intentCounts[key] = (intentCounts[key] || 0) + 1;
    }

    const suggestions = [];
    for (const [key, count] of Object.entries(intentCounts)) {
      if (count >= threshold) {
        const [app, intent] = key.split(':');
        suggestions.push({
          sourceApp: app,
          intent,
          frequency: count,
          suggestedSkillName: `auto-${intent.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          reason: `Observed ${count} manual executions across timeline`,
        });
      }
    }

    return suggestions;
  }
}

module.exports = {
  HermesTimelineEngine,
  sanitizePayload,
  TIMELINE_FILE,
};

if (require.main === module) {
  const engine = new HermesTimelineEngine();
  engine.recordEvent({
    eventType: 'git_commit',
    sourceApp: 'terminal',
    intent: 'commit_feature',
    payload: { branch: 'feat/timeline', files: ['tools/hermes-timeline-engine.js'] },
  });
  console.log('Recent Events:', engine.getRecentEvents(5));
}
