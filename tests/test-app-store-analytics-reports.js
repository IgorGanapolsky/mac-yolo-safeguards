#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createOngoingRequestData,
  ensureOngoingRequest,
  inventoryReports,
} = require('../tools/app-store-analytics-reports');

test('creates the exact ongoing analytics request relationship Apple requires', () => {
  assert.deepEqual(createOngoingRequestData('6786778037'), {
    type: 'analyticsReportRequests',
    attributes: { accessType: 'ONGOING' },
    relationships: {
      app: {
        data: {
          type: 'apps',
          id: '6786778037',
        },
      },
    },
  });
});

test('ensure is idempotent when an ongoing request already exists', async () => {
  const calls = [];
  const client = {
    get: async (apiPath) => {
      calls.push(['GET', apiPath]);
      return {
        data: [
          {
            type: 'analyticsReportRequests',
            id: 'existing-request',
            attributes: { accessType: 'ONGOING', stoppedDueToInactivity: false },
          },
        ],
      };
    },
    post: async (...args) => {
      calls.push(['POST', ...args]);
      throw new Error('POST must not run for an existing ongoing request');
    },
  };

  const receipt = await ensureOngoingRequest(client, '6786778037');

  assert.equal(receipt.created, false);
  assert.equal(receipt.request.id, 'existing-request');
  assert.deepEqual(calls, [
    ['GET', '/v1/apps/6786778037/analyticsReportRequests?limit=200'],
  ]);
});

test('ensure creates one ongoing request when none exists', async () => {
  const calls = [];
  const client = {
    get: async () => ({ data: [] }),
    post: async (apiPath, data) => {
      calls.push(['POST', apiPath, data]);
      return {
        data: {
          type: 'analyticsReportRequests',
          id: 'created-request',
          attributes: { accessType: 'ONGOING' },
        },
      };
    },
  };

  const receipt = await ensureOngoingRequest(client, '6786778037');

  assert.equal(receipt.created, true);
  assert.equal(receipt.request.id, 'created-request');
  assert.deepEqual(calls, [
    [
      'POST',
      '/v1/analyticsReportRequests',
      createOngoingRequestData('6786778037'),
    ],
  ]);
});

test('inventory reports groups provider output without inventing metrics', async () => {
  const client = {
    get: async (apiPath) => {
      assert.equal(
        apiPath,
        '/v1/analyticsReportRequests/request-1/reports?limit=200',
      );
      return {
        data: [
          {
            id: 'report-a',
            attributes: {
              category: 'APP_STORE_ENGAGEMENT',
              name: 'App Store Discovery and Engagement Detailed',
            },
          },
          {
            id: 'report-b',
            attributes: {
              category: 'COMMERCE',
              name: 'App Store Commerce',
            },
          },
          {
            id: 'report-c',
            attributes: {
              category: 'APP_STORE_ENGAGEMENT',
              name: 'App Store Installation and Deletion',
            },
          },
        ],
      };
    },
  };

  const inventory = await inventoryReports(client, 'request-1');

  assert.deepEqual(inventory.categories, {
    APP_STORE_ENGAGEMENT: 2,
    COMMERCE: 1,
  });
  assert.deepEqual(inventory.names, [
    'App Store Commerce',
    'App Store Discovery and Engagement Detailed',
    'App Store Installation and Deletion',
  ]);
  assert.equal(inventory.reportCount, 3);
});
