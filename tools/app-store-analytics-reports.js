#!/usr/bin/env node
'use strict';

/**
 * Provision and inventory App Store Connect analytics reports.
 *
 * This tool is intentionally idempotent: --ensure creates an ONGOING request
 * only when the app does not already have an active one. It reports provider
 * resources, never inferred downloads.
 */

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HERMES_ROOT = path.join(ROOT, 'hermes-mobile');
const {
  loadEnv,
  ascGet,
  ascPost,
} = require('../hermes-mobile/scripts/asc-api');

const DECISION_GRADE_REPORTS = new Set([
  'App Downloads Standard',
  'App Store Discovery and Engagement Standard',
  'App Store Purchases Standard',
]);

function parseArgs(argv) {
  const args = { ensure: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ensure') args.ensure = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--app-id') args.appId = argv[++index];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function createOngoingRequestData(appId) {
  return {
    type: 'analyticsReportRequests',
    attributes: { accessType: 'ONGOING' },
    relationships: {
      app: {
        data: {
          type: 'apps',
          id: appId,
        },
      },
    },
  };
}

async function listReportRequests(client, appId) {
  const payload = await client.get(
    `/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests?limit=200`,
  );
  return Array.isArray(payload.data) ? payload.data : [];
}

function isActiveOngoingRequest(request) {
  return (
    request?.attributes?.accessType === 'ONGOING' &&
    request?.attributes?.stoppedDueToInactivity !== true
  );
}

async function ensureOngoingRequest(client, appId) {
  const existing = (await listReportRequests(client, appId)).find(
    isActiveOngoingRequest,
  );
  if (existing) return { created: false, request: existing };

  try {
    const response = await client.post(
      '/v1/analyticsReportRequests',
      createOngoingRequestData(appId),
    );
    return { created: true, request: response.data };
  } catch (error) {
    // Another operator may have won the same ensure race. Re-read once and
    // accept only a provider-visible active request.
    if (error?.status === 409) {
      const raced = (await listReportRequests(client, appId)).find(
        isActiveOngoingRequest,
      );
      if (raced) return { created: false, request: raced };
    }
    throw error;
  }
}

async function inventoryReports(client, requestId) {
  const payload = await client.get(
    `/v1/analyticsReportRequests/${encodeURIComponent(requestId)}/reports?limit=200`,
  );
  const reports = Array.isArray(payload.data) ? payload.data : [];
  const categories = {};
  const names = [];
  const keyReports = [];

  for (const report of reports) {
    const category = report?.attributes?.category || 'UNKNOWN';
    const name = report?.attributes?.name || '';
    categories[category] = (categories[category] || 0) + 1;
    if (name) names.push(name);
    if (DECISION_GRADE_REPORTS.has(name)) {
      const payload = await client.get(
        `/v1/analyticsReports/${encodeURIComponent(report.id)}/instances?limit=200`,
      );
      const instances = Array.isArray(payload.data) ? payload.data : [];
      const processingDates = instances
        .map((instance) => instance?.attributes?.processingDate)
        .filter(Boolean)
        .sort();
      keyReports.push({
        id: report.id,
        name,
        instanceCount: instances.length,
        latestProcessingDate: processingDates.at(-1) || null,
      });
    }
  }

  const keyReportInstanceCount = keyReports.reduce(
    (total, report) => total + report.instanceCount,
    0,
  );
  return {
    reportCount: reports.length,
    categories: Object.fromEntries(
      Object.entries(categories).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    names: [...new Set(names)].sort(),
    keyReportInstanceCount,
    dataStatus:
      keyReports.length === 0
        ? 'unavailable'
        : keyReportInstanceCount > 0
          ? 'available'
          : 'pending',
    keyReports: keyReports.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };
}

async function buildStatus(client, appId, ensured) {
  const requests = await listReportRequests(client, appId);
  const requestReceipts = [];
  for (const request of requests) {
    requestReceipts.push({
      id: request.id,
      accessType: request?.attributes?.accessType || 'UNKNOWN',
      stoppedDueToInactivity:
        request?.attributes?.stoppedDueToInactivity === true,
      reports: await inventoryReports(client, request.id),
    });
  }

  return {
    provider: 'app-store-connect',
    appId,
    ensured: ensured
      ? {
          created: ensured.created,
          requestId: ensured.request?.id || null,
        }
      : null,
    activeOngoingRequestCount: requests.filter(isActiveOngoingRequest).length,
    requestCount: requests.length,
    requests: requestReceipts,
    verifiedAt: new Date().toISOString(),
  };
}

function formatStatus(status) {
  const action = status.ensured
    ? status.ensured.created
      ? `created ${status.ensured.requestId}`
      : `reused ${status.ensured.requestId}`
    : 'read-only';
  const reports = status.requests.reduce(
    (sum, request) => sum + request.reports.reportCount,
    0,
  );
  const keyReportInstances = status.requests.reduce(
    (sum, request) => sum + request.reports.keyReportInstanceCount,
    0,
  );
  return [
    `App Store Connect analytics: ${action}`,
    `Active ongoing requests: ${status.activeOngoingRequestCount}`,
    `Generated report definitions: ${reports}`,
    `Decision-grade report instances: ${keyReportInstances}`,
    `Verified: ${status.verifiedAt}`,
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/app-store-analytics-reports.js [--ensure] [--app-id ID] [--json]

Without --ensure the command is read-only. --ensure idempotently provisions one
active ONGOING analytics request and then reads its generated report inventory.`);
    return;
  }

  loadEnv(HERMES_ROOT);
  const appId = args.appId || process.env.EXPO_ASC_APP_ID;
  if (!appId) throw new Error('Missing App Store Connect app ID');
  const client = { get: ascGet, post: ascPost };
  const ensured = args.ensure
    ? await ensureOngoingRequest(client, appId)
    : null;
  const status = await buildStatus(client, appId, ensured);
  console.log(args.json ? JSON.stringify(status, null, 2) : formatStatus(status));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
}

module.exports = {
  buildStatus,
  createOngoingRequestData,
  ensureOngoingRequest,
  inventoryReports,
  isActiveOngoingRequest,
  listReportRequests,
  main,
  parseArgs,
};
