'use strict';

/**
 * The personalize page is a menu. A choice is a label. This module does not
 * start a trial, add a database, or call VeloDB.
 */

const PAGE_READ = Object.freeze({
  readOn: '2026-11-03',
  page: 'https://www.velodb.cloud/personalize',
  heading: 'Let’s personalize your experience',
  signedIn: true,
  continued: false,
  dropdownsLabeled: false,
  workloads: Object.freeze([
    Object.freeze({
      id: 'real-time-analytics',
      name: 'Real-time Analytics',
      detail: 'Track product activity and power live dashboards in real time.',
      audience: Object.freeze(['Developers', 'Product Analytics']),
    }),
    Object.freeze({
      id: 'observability',
      name: 'Observability',
      detail: 'Search and troubleshoot logs, metrics, and traces at scale.',
      audience: Object.freeze(['SREs', 'DevOps']),
    }),
    Object.freeze({
      id: 'rag-and-genai',
      name: 'RAG and GenAI',
      detail: 'Build AI search and retrieval systems with low-latency queries.',
      audience: Object.freeze(['AI engineers', 'AI Search']),
    }),
    Object.freeze({
      id: 'lakehouse',
      name: 'Lakehouse',
      detail: 'Unify streaming and warehouse data in one analytics platform.',
      audience: Object.freeze(['Data teams', 'BI analytics']),
    }),
  ]),
  newsletter: Object.freeze({
    source: 'Towards Data Science',
    readOn: '2026-11-03',
    subject: 'Build real-time analytics on AWS',
    line: 'fresh data, fast queries, and flexible search without adding more systems',
    trialStarted: false,
    measuredLocally: false,
  }),
});

function blank(effect, reason, workload) {
  return {
    effect,
    reason,
    workload: workload || null,
    provisioned: false,
    calledVelo: false,
    addedDatabase: false,
    trialStarted: false,
  };
}

function named(workload) {
  const text = String(workload || '');
  return PAGE_READ.workloads.find((row) => row.id === text || row.name === text) || null;
}

function judgePersonalize(request) {
  if (!request || typeof request !== 'object') {
    return blank('refuse', 'The personalize request is unreadable.');
  }
  if (request.relevance || request.latency || request.percent || request.compression || request.speedup || request.claim) {
    return blank('refuse', 'That figure was not measured here.');
  }
  const remote = typeof request.remote === 'string' ? request.remote : '';
  if (request.callVelo || /velodb\.(cloud|io)/i.test(remote)) {
    return blank('refuse', 'This check does not call VeloDB.');
  }
  if (request.trial || request.signup || request.continueSetup || request.contactSales || request.addDatabase) {
    return blank('refuse', 'The menu stays a label. No trial was started and no database was added.');
  }
  const row = named(request.workload);
  if (!row) return blank('refuse', 'That workload is not on the personalize menu.');
  return blank('label', 'The personalize choice is a label. No system was added.', row.id);
}

module.exports = { PAGE_READ, judgePersonalize };
