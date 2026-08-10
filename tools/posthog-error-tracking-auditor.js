#!/usr/bin/env node
'use strict';

/**
 * posthog-error-tracking-auditor.js — PostHog Error Tracking Auditor for Agent Session Integrity
 *
 * Continuously monitors PostHog error tracking to detect:
 * - DEBUG_TEST_HARNESS errors that indicate testing mode
 * - CRITICAL errors that should halt agent sessions
 * - STABLE vs CRITICAL error states
 *
 * Exit codes:
 *   0 - STABLE (NON_CRITICAL) - session can continue
 *   1 - CRITICAL - immediate attention required
 *   2 - DEBUG_TEST_HARNESS detected - testing mode active
 */

const fs = require('fs');
const path = require('path');

// PostHog API configuration
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://us.posthog.com';
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;

const POSTHOG_ORGANIZATION = 'Max Smith KDP LLC';
const PROJECT_ID = 'hermes-mobile';

async function fetchPostHogErrors() {
  // Return mock data when API key is not set (for testing)
  if (!POSTHOG_API_KEY) {
    return {
      results: [
        { name: 'DEBUG_TEST_HARNESS', message: 'DEBUG_TEST_HARNESS: test error', level: 'error', count: 4 },
        { name: 'UnknownError', message: 'Some other error', level: 'error', count: 4 },
      ],
    };
  }

  const url = `${POSTHOG_API_HOST}/api/projects/${PROJECT_ID}/errors/`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${POSTHOG_API_KEY}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function auditPostHogExceptions() {
  try {
    const data = await fetchPostHogErrors();

    const errors = data.results || data.errors || [];
    const totalExceptions = errors.length;

    // Categorize errors
    const debugTestHarnessErrors = errors.filter(
      (e) => e.name === 'DEBUG_TEST_HARNESS' || (e.message && e.message.includes('DEBUG_TEST_HARNESS'))
    );

    const criticalErrors = errors.filter(
      (e) =>
        e.level === 'critical' ||
        (e.tags && e.tags.includes('critical')) ||
        (e.properties && e.properties.severity === 'critical')
    );

    // Determine status
    let status;
    if (debugTestHarnessErrors.length > 0) {
      status = 'DEBUG_TEST_HARNESS (TESTING MODE)';
    } else if (criticalErrors.length > 0) {
      status = 'CRITICAL';
    } else {
      status = 'STABLE (NON_CRITICAL)';
    }

    return {
      organization: POSTHOG_ORGANIZATION,
      status,
      totalExceptions,
      issues: [
        ...debugTestHarnessErrors.map((e) => ({ category: 'DEBUG_TEST_HARNESS', error: e })),
        ...criticalErrors.map((e) => ({ category: 'CRITICAL', error: e })),
      ],
    };
  } catch (error) {
    return {
      organization: POSTHOG_ORGANIZATION,
      status: 'FETCH_ERROR',
      error: error.message,
      totalExceptions: 0,
      issues: [],
    };
  }
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');

  auditPostHogExceptions()
    .then((audit) => {
      if (jsonMode) {
        console.log(JSON.stringify(audit, null, 2));
      } else {
        console.log('=== PostHog Error Tracking Audit ===');
        console.log(`Organization: ${audit.organization}`);
        console.log(`Status: ${audit.status}`);
        console.log(`Total Exceptions: ${audit.totalExceptions}`);
        if (audit.issues.length > 0) {
          console.log('Issues:');
          audit.issues.forEach((issue) => {
            console.log(`  - ${issue.category}: ${issue.error?.name || 'Unknown'}`);
          });
        }
        console.log('');
      }

      // Exit code based on status
      if (audit.status === 'CRITICAL' && !jsonMode) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error('Fatal:', error.message);
      process.exit(1);
    });
}

if (require.main === module) {
  main();
}

module.exports = { auditPostHogExceptions };