#!/usr/bin/env node
'use strict';

/**
 * App Store Connect Sales & Finance Reports API client.
 *
 * Uses JWT authentication (ES256) with a .p8 private key.
 * Downloads Sales and Trends reports (DAILY/WEEKLY/MONTHLY) and Finance reports.
 *
 * Setup:
 * 1. In App Store Connect -> Users and Access -> Keys -> Create API Key
 * 2. Assign "Sales" or "Finance" role (or Admin)
 * 3. Download .p8 file (only once!)
 * 4. Note Key ID and Issuer ID
 *
 * Env required:
 *   ASC_KEY_ID=ABC123DEF4
 *   ASC_ISSUER_ID=12345678-1234-1234-1234-123456789012
 *   ASC_PRIVATE_KEY_PATH=/path/to/AuthKey_ABC123DEF4.p8
 *   ASC_VENDOR_NUMBER=12345678  (optional, for filtering)
 *
 * Usage:
 *   node tools/app-store-connect-sales.js --bundle-id com.iganapolsky.hermesmobile.paid --frequency DAILY --days 30 --json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ASC_API_BASE = 'https://api.appstoreconnect.apple.com';

class AppStoreConnectClient {
  constructor(options = {}) {
    this.keyId = options.keyId || process.env.ASC_KEY_ID;
    this.issuerId = options.issuerId || process.env.ASC_ISSUER_ID;
    this.privateKeyPath = options.privateKeyPath || process.env.ASC_PRIVATE_KEY_PATH;
    this.vendorNumber = options.vendorNumber || process.env.ASC_VENDOR_NUMBER;

    if (!this.keyId) throw new Error('ASC_KEY_ID (Key ID from App Store Connect) is required');
    if (!this.issuerId) throw new Error('ASC_ISSUER_ID (Issuer ID from App Store Connect) is required');
    if (!this.privateKeyPath || !fs.existsSync(this.privateKeyPath)) {
      throw new Error('ASC_PRIVATE_KEY_PATH must point to a valid .p8 private key file');
    }

    this.privateKey = fs.readFileSync(this.privateKeyPath, 'utf-8');
    this.tokenCache = null;
    this.tokenExpiry = 0;
  }

  /**
   * Generate a JWT token for App Store Connect API authentication.
   * Token valid for 20 minutes (Apple max).
   */
  generateToken() {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 20 * 60; // 20 minutes

    const header = {
      alg: 'ES256',
      kid: this.keyId,
      typ: 'JWT',
    };

    const payload = {
      iss: this.issuerId,
      iat: now,
      exp,
      aud: 'appstoreconnect-v1',
      scope: ['GET /v1/salesReports', 'GET /v1/financeReports'],
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const privateKeyObj = crypto.createPrivateKey(this.privateKey);
    const signature = crypto.sign('sha256', Buffer.from(signingInput, 'utf8'), {
      key: privateKeyObj,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');

    return `${signingInput}.${signature}`;
  }

  /**
   * Get a valid access token (cached until expiry).
   */
  async getToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this.tokenCache && now < this.tokenExpiry - 60) { // refresh 1 min early
      return this.tokenCache;
    }
    this.tokenCache = this.generateToken();
    this.tokenExpiry = now + 20 * 60;
    return this.tokenCache;
  }

  /**
   * Make an authenticated request to App Store Connect API.
   */
  async request(endpoint, params = {}) {
    const token = await this.getToken();
    const url = new URL(`${ASC_API_BASE}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/a-gzip, application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`App Store Connect API error ${res.status}: ${err}`);
    }

    // Apple returns gzipped JSON for reports
    const contentEncoding = res.headers.get('content-encoding');
    if (contentEncoding === 'gzip') {
      const zlib = require('zlib');
      const buffer = await res.arrayBuffer();
      const decompressed = zlib.gunzipSync(Buffer.from(buffer));
      return JSON.parse(decompressed.toString('utf-8'));
    }

    return res.json();
  }

  /**
   * List available sales reports.
   * filter[frequency]: DAILY | WEEKLY | MONTHLY | YEARLY
   * filter[reportDate]: YYYY-MM-DD
   * filter[reportSubType]: SUMMARY | DETAILED | OPT_IN
   * filter[reportType]: SALES
   * filter[vendorNumber]: vendor number
   * filter[version]: report version (e.g., "1_0")
   */
  async listSalesReports(options = {}) {
    const {
      frequency = 'DAILY',
      reportDate,
      reportSubType = 'SUMMARY',
      version = '1_0',
    } = options;

    const params = {
      'filter[frequency]': frequency,
      'filter[reportType]': 'SALES',
      'filter[reportSubType]': reportSubType,
      'filter[version]': version,
    };

    if (reportDate) params['filter[reportDate]'] = reportDate;
    if (this.vendorNumber) params['filter[vendorNumber]'] = this.vendorNumber;

    return this.request('/v1/salesReports', params);
  }

  /**
   * Download a specific sales report by ID (from listSalesReports).
   * Returns raw CSV content (gzipped).
   */
  async downloadSalesReport(reportId) {
    const token = await this.getToken();
    const url = `${ASC_API_BASE}/v1/salesReports/${reportId}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/a-gzip',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Download sales report error ${res.status}: ${err}`);
    }

    const contentEncoding = res.headers.get('content-encoding');
    if (contentEncoding === 'gzip') {
      const zlib = require('zlib');
      const buffer = await res.arrayBuffer();
      return zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8');
    }

    return res.text();
  }

  /**
   * List available finance reports.
   * filter[reportType]: FINANCE_DETAIL
   * filter[regionCode]: region code (e.g., Z1 for worldwide, US for US)
   * filter[reportDate]: YYYY-MM
   * filter[vendorNumber]: vendor number
   */
  async listFinanceReports(options = {}) {
    const {
      regionCode = 'Z1', // Z1 = worldwide
      reportDate, // YYYY-MM format
    } = options;

    const params = {
      'filter[reportType]': 'FINANCE_DETAIL',
      'filter[regionCode]': regionCode,
    };

    if (reportDate) params['filter[reportDate]'] = reportDate;
    if (this.vendorNumber) params['filter[vendorNumber]'] = this.vendorNumber;

    return this.request('/v1/financeReports', params);
  }

  /**
   * Download a specific finance report by ID.
   */
  async downloadFinanceReport(reportId) {
    const token = await this.getToken();
    const url = `${ASC_API_BASE}/v1/financeReports/${reportId}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/a-gzip',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Download finance report error ${res.status}: ${err}`);
    }

    const contentEncoding = res.headers.get('content-encoding');
    if (contentEncoding === 'gzip') {
      const zlib = require('zlib');
      const buffer = await res.arrayBuffer();
      return zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8');
    }

    return res.text();
  }

  /**
   * Parse Sales report CSV (tab-separated).
   * SUMMARY columns: Provider, Provider Country, SKU, Developer, Title, Version, Product Type Identifier, Units, Developer Proceeds, Begin Date, End Date, Customer Currency, Country Code, Currency of Proceeds, Apple Identifier, Customer Price, Promo Code, Parent Identifier, Subscription, Period
   * DETAILED columns: more granular per-transaction
   */
  parseSalesReport(csvText, reportType = 'SUMMARY') {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split('\t'); // Apple uses tab-separated
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      if (values.length !== headers.length) continue;

      const record = {};
      headers.forEach((h, idx) => { record[h] = values[idx]; });
      records.push(record);
    }

    return records;
  }

  /**
   * Parse Finance report CSV (same tab-separated format).
   */
  parseFinanceReport(csvText) {
    return this.parseSalesReport(csvText); // Same format
  }

  /**
   * Fetch and aggregate revenue for a bundle ID over a date range.
   * Uses DAILY SUMMARY sales reports for granularity.
   */
  async getRevenueByBundleId(bundleId, options = {}) {
    const { startDate, endDate, frequency = 'DAILY' } = options;
    const start = new Date(startDate || new Date(Date.now() - 30 * 864e5));
    const end = new Date(endDate || new Date());

    const dailyRevenue = new Map();

    // Iterate each day in range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];

      try {
        const list = await this.listSalesReports({ frequency, reportDate: dateStr, reportSubType: 'SUMMARY' });

        if (!list.data || list.data.length === 0) continue;

        // Download each report (usually just one per day per frequency)
        for (const report of list.data) {
          const csvText = await this.downloadSalesReport(report.id);
          const records = this.parseSalesReport(csvText, 'SUMMARY');

          for (const r of records) {
            if (r['SKU'] !== bundleId) continue;

            const units = parseInt(r['Units'] || '0', 10);
            const proceeds = parseFloat(r['Developer Proceeds'] || '0');
            const currency = r['Currency of Proceeds'] || 'USD';
            const country = r['Country Code'] || 'Unknown';
            const productType = r['Product Type Identifier'] || 'Unknown';
            const subscription = r['Subscription'] === 'Y';

            const key = `${dateStr}|${bundleId}`;
            if (!dailyRevenue.has(key)) {
              dailyRevenue.set(key, {
                date: dateStr,
                bundleId,
                currency,
                grossRevenue: 0,
                netRevenue: 0,
                units: 0,
                transactions: 0,
                countries: new Set(),
                productTypes: new Set(),
                subscriptions: 0,
                oneTime: 0,
              });
            }

            const entry = dailyRevenue.get(key);
            entry.grossRevenue += proceeds; // Developer Proceeds is net after Apple's cut
            entry.netRevenue += proceeds;
            entry.units += units;
            entry.transactions += 1;
            entry.countries.add(country);
            entry.productTypes.add(productType);
            if (subscription) entry.subscriptions += units;
            else entry.oneTime += units;
          }
        }
      } catch (err) {
        // Some days may not have reports yet (weekends, holidays, new apps)
        console.warn(`[WARN] No sales report for ${dateStr}:`, err.message);
      }
    }

    return Array.from(dailyRevenue.values())
      .map((e) => ({
        ...e,
        countries: Array.from(e.countries),
        productTypes: Array.from(e.productTypes),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Quick summary for a bundle ID over a date range.
   */
  async getBundleRevenueSummary(bundleId, options = {}) {
    const { startDate, endDate } = options;
    const daily = await this.getRevenueByBundleId(bundleId, { startDate, endDate });

    const summary = daily.reduce(
      (acc, cur) => {
        acc.netRevenue += cur.netRevenue;
        acc.units += cur.units;
        acc.transactions += cur.transactions;
        acc.countries = new Set([...acc.countries, ...cur.countries]);
        acc.productTypes = new Set([...acc.productTypes, ...cur.productTypes]);
        acc.subscriptions += cur.subscriptions;
        acc.oneTime += cur.oneTime;
        return acc;
      },
      { netRevenue: 0, units: 0, transactions: 0, countries: new Set(), productTypes: new Set(), subscriptions: 0, oneTime: 0 }
    );

    return {
      bundleId,
      currency: daily[0]?.currency || 'USD',
      period: { start: startDate, end: endDate },
      netRevenue: summary.netRevenue,
      units: summary.units,
      transactions: summary.transactions,
      activeDays: daily.length,
      countries: Array.from(summary.countries),
      productTypes: Array.from(summary.productTypes),
      subscriptionUnits: summary.subscriptions,
      oneTimeUnits: summary.oneTime,
      dailyBreakdown: daily,
    };
  }

  /**
   * Fetch finance report (official earnings) for a month.
   * More authoritative than sales reports for accounting.
   */
  async getFinanceSummary(options = {}) {
    const { regionCode = 'Z1', reportDate } = options; // reportDate = YYYY-MM
    const list = await this.listFinanceReports({ regionCode, reportDate });

    if (!list.data || list.data.length === 0) {
      return { reports: [], totalProceeds: 0, currency: 'USD' };
    }

    let totalProceeds = 0;
    const currency = 'USD';
    const reports = [];

    for (const report of list.data) {
      const csvText = await this.downloadFinanceReport(report.id);
      const records = this.parseFinanceReport(csvText);

      for (const r of records) {
        const proceeds = parseFloat(r['Developer Proceeds'] || '0');
        totalProceeds += proceeds;
      }

      reports.push({
        id: report.id,
        regionCode: report.attributes?.regionCode,
        reportDate: report.attributes?.reportDate,
        recordCount: records.length,
      });
    }

    return { reports, totalProceeds, currency };
  }
}

/**
 * CLI entry point.
 */
async function main() {
  const args = require('minimist')(process.argv.slice(2), {
    string: ['bundle-id', 'start', 'end', 'frequency', 'subtype', 'region', 'month', 'key', 'issuer', 'private-key', 'vendor'],
    boolean: ['json', 'summary', 'finance', 'help'],
    alias: {
      b: 'bundle-id',
      s: 'start',
      e: 'end',
      f: 'frequency',
      r: 'region',
      m: 'month',
      k: 'key',
      i: 'issuer',
      p: 'private-key',
      v: 'vendor',
      j: 'json',
    },
  });

  if (args.help) {
    console.log(`
App Store Connect Sales & Finance Reports Client

Usage:
  node tools/app-store-connect-sales.js --bundle-id <bundleId> [options]

Required:
  --bundle-id, -b   Bundle ID (e.g., com.iganapolsky.hermesmobile.paid)
  --key, -k         Key ID from App Store Connect [env: ASC_KEY_ID]
  --issuer, -i      Issuer ID from App Store Connect [env: ASC_ISSUER_ID]
  --private-key, -p Path to .p8 private key file [env: ASC_PRIVATE_KEY_PATH]

Options:
  --start, -s       Start date (YYYY-MM-DD) [default: 30 days ago]
  --end, -e         End date (YYYY-MM-DD) [default: today]
  --frequency, -f   Report frequency: DAILY | WEEKLY | MONTHLY | YEARLY [default: DAILY]
  --subtype         Report subtype: SUMMARY | DETAILED | OPT_IN [default: SUMMARY]
  --region, -r      Finance region code [default: Z1 (worldwide)]
  --month, -m       Finance report month (YYYY-MM) [default: current month]
  --vendor, -v      Vendor number [env: ASC_VENDOR_NUMBER]
  --finance         Fetch finance report instead of sales report
  --json, -j        Output JSON
  --help            Show this help

Examples:
  # Last 30 days sales summary for paid app
  node tools/app-store-connect-sales.js -b com.iganapolsky.hermesmobile.paid --summary

  # Full JSON for daily sales this month
  node tools/app-store-connect-sales.js -b com.iganapolsky.hermesmobile.paid -f DAILY -s 2026-07-01 -j

  # Finance report for July 2026 (official earnings)
  node tools/app-store-connect-sales.js -b com.iganapolsky.hermesmobile.paid --finance -m 2026-07 -j
`);
    process.exit(0);
  }

  const bundleId = args['bundle-id'];
  if (!bundleId) {
    console.error('Error: --bundle-id is required');
    process.exit(1);
  }

  const startDate = args.start || new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
  const endDate = args.end || new Date().toISOString().split('T')[0];
  const frequency = args.frequency || 'DAILY';

  try {
    const client = new AppStoreConnectClient({
      keyId: args.key,
      issuerId: args.issuer,
      privateKeyPath: args['private-key'],
      vendorNumber: args.vendor,
    });

    if (args.finance) {
      const month = args.month || new Date().toISOString().slice(0, 7); // YYYY-MM
      const finance = await client.getFinanceSummary({ regionCode: args.region || 'Z1', reportDate: month });
      if (args.json) {
        console.log(JSON.stringify(finance, null, 2));
      } else {
        console.log(`\n💰 App Store Connect Finance Report for ${month}`);
        console.log(`   Total Proceeds: ${finance.totalProceeds.toFixed(2)} ${finance.currency}`);
        console.log(`   Reports: ${finance.reports.length}`);
        finance.reports.forEach((r) => console.log(`     - ${r.id}: ${r.recordCount} records (${r.regionCode}, ${r.reportDate})`));
      }
    } else if (args.summary) {
      const summary = await client.getBundleRevenueSummary(bundleId, { startDate, endDate });
      if (args.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(`\n📊 App Store Connect Revenue Summary for ${bundleId}`);
        console.log(`   Period: ${startDate} → ${endDate} (${frequency} SUMMARY)`);
        console.log(`   Currency: ${summary.currency}`);
        console.log(`   Net Revenue: ${summary.netRevenue.toFixed(2)} ${summary.currency}`);
        console.log(`   Units:       ${summary.units}`);
        console.log(`   Transactions: ${summary.transactions}`);
        console.log(`   Active Days:  ${summary.activeDays}`);
        console.log(`   Countries:    ${summary.countries.length} (${summary.countries.slice(0, 10).join(', ')}${summary.countries.length > 10 ? '...' : ''})`);
        console.log(`   Product Types: ${summary.productTypes.join(', ')}`);
        console.log(`   Subscriptions: ${summary.subscriptionUnits} units`);
        console.log(`   One-time:       ${summary.oneTimeUnits} units`);
      }
    } else {
      const breakdown = await client.getRevenueByBundleId(bundleId, { startDate, endDate, frequency });
      if (args.json) {
        console.log(JSON.stringify(breakdown, null, 2));
      } else {
        console.log(JSON.stringify(breakdown, null, 2));
      }
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();

module.exports = { AppStoreConnectClient };