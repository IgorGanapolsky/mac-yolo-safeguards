#!/usr/bin/env node
'use strict';

/**
 * Revenue Ingestion Scheduler
 *
 * Merges Play Store and App Store Connect revenue data into unified daily CSV/JSONL.
 * Designed to run daily via LaunchAgent or GitHub Actions scheduled workflow.
 *
 * Output: business_os/revenue/merged/
 *   - YYYY-MM-DD.jsonl (daily line-delimited JSON)
 *   - YYYY-MM.csv (monthly aggregated CSV)
 *   - latest.json (most recent daily snapshot)
 *
 * Usage:
 *   node tools/revenue-ingestion-scheduler.js --days 1 --json
 *   node tools/revenue-ingestion-scheduler.js --month 2026-07 --csv
 *
 * Env:
 *   PLAY_DEVELOPER_ACCOUNT_ID, GOOGLE_APPLICATION_CREDENTIALS  (for Play)
 *   ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH            (for iOS)
 */

const fs = require('fs');
const path = require('path');
const { PlayDeveloperReportingClient } = require('./play-developer-reporting.js');
const { AppStoreConnectClient } = require('./app-store-connect-sales.js');

const PLAY_PACKAGE = 'com.iganapolsky.hermesmobile.paid';
const IOS_BUNDLE_ID = 'com.iganapolsky.hermesmobile.paid';
const OUTPUT_DIR = path.join(__dirname, '..', 'business_os', 'revenue', 'merged');

class RevenueIngestionScheduler {
  constructor(options = {}) {
    this.playPackage = options.playPackage || PLAY_PACKAGE;
    this.iosBundleId = options.iosBundleId || IOS_BUNDLE_ID;
    this.outputDir = options.outputDir || OUTPUT_DIR;
    this.playClient = null;
    this.iosClient = null;

    const hasPlayCreds = Boolean(process.env.PLAY_DEVELOPER_ACCOUNT_ID && process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const hasIosCreds = Boolean(process.env.ASC_KEY_ID && process.env.ASC_ISSUER_ID && process.env.ASC_PRIVATE_KEY_PATH);

    // Initialize clients if credentials available
    if (hasPlayCreds) {
      try {
        this.playClient = new PlayDeveloperReportingClient();
      } catch (e) {
        console.warn('[WARN] Play client init failed:', e.message);
      }
    }

    if (hasIosCreds) {
      try {
        this.iosClient = new AppStoreConnectClient();
      } catch (e) {
        console.warn('[WARN] iOS client init failed:', e.message);
      }
    }

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Fetch Play revenue for a date range.
   */
  async fetchPlayRevenue(startDate, endDate, reportType = 'earnings') {
    if (!this.playClient) {
      console.log('[INFO] Play client not configured, skipping');
      return [];
    }

    try {
      console.log(`[INFO] Fetching Play ${reportType} for ${this.playPackage} (${startDate} to ${endDate})`);
      const summary = await this.playClient.getPackageRevenueSummary(this.playPackage, {
        startDate,
        endDate,
        reportType,
      });

      // Convert daily breakdown to unified format
      return summary.dailyBreakdown.map((day) => ({
        date: day.date,
        platform: 'play',
        packageId: this.playPackage,
        currency: day.currency,
        grossRevenue: day.grossRevenue,
        netRevenue: day.netRevenue,
        chargeCount: day.chargeCount,
        refundCount: day.refundCount,
        orderCount: day.orderCount,
        countries: day.countries.join(','),
        source: `play_${reportType}`,
        fetchedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('[ERROR] Play fetch failed:', err.message);
      return [];
    }
  }

  /**
   * Fetch iOS revenue for a date range.
   */
  async fetchIosRevenue(startDate, endDate) {
    if (!this.iosClient) {
      console.log('[INFO] iOS client not configured, skipping');
      return [];
    }

    try {
      console.log(`[INFO] Fetching iOS sales for ${this.iosBundleId} (${startDate} to ${endDate})`);
      const summary = await this.iosClient.getBundleRevenueSummary(this.iosBundleId, {
        startDate,
        endDate,
      });

      return summary.dailyBreakdown.map((day) => ({
        date: day.date,
        platform: 'ios',
        packageId: this.iosBundleId,
        currency: day.currency,
        grossRevenue: day.netRevenue, // Apple reports net proceeds
        netRevenue: day.netRevenue,
        chargeCount: day.transactions,
        refundCount: 0, // Not broken out in sales reports
        orderCount: day.transactions,
        countries: day.countries.join(','),
        source: 'ios_sales_summary',
        subscriptionUnits: day.subscriptions,
        oneTimeUnits: day.oneTime,
        fetchedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('[ERROR] iOS fetch failed:', err.message);
      return [];
    }
  }

  /**
   * Fetch iOS finance report (official earnings) for a month.
   */
  async fetchIosFinance(month) {
    if (!this.iosClient) return [];

    try {
      console.log(`[INFO] Fetching iOS finance for ${month}`);
      const finance = await this.iosClient.getFinanceSummary({ reportDate: month });
      return [{
        date: month,
        platform: 'ios',
        packageId: this.iosBundleId,
        currency: finance.currency,
        grossRevenue: finance.totalProceeds,
        netRevenue: finance.totalProceeds,
        chargeCount: 0,
        refundCount: 0,
        orderCount: 0,
        countries: '',
        source: 'ios_finance_detail',
        fetchedAt: new Date().toISOString(),
      }];
    } catch (err) {
      console.error('[ERROR] iOS finance fetch failed:', err.message);
      return [];
    }
  }

  /**
   * Merge and deduplicate revenue records.
   * Priority: finance > earnings > estimated_sales > sales_summary
   */
  mergeRevenue(records) {
    // Group by date + platform + packageId
    const grouped = new Map();

    for (const r of records) {
      const key = `${r.date}|${r.platform}|${r.packageId}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(r);
    }

    const merged = [];
    for (const [key, group] of grouped) {
      // Sort by source priority
      const priority = {
        'ios_finance_detail': 4,
        'play_earnings': 3,
        'ios_sales_summary': 2,
        'play_estimated_sales': 1,
      };

      group.sort((a, b) => (priority[b.source] || 0) - (priority[a.source] || 0));
      const primary = group[0];

      // If we have multiple sources, log discrepancy
      if (group.length > 1) {
        const revenues = group.map((g) => `${g.source}:${g.netRevenue.toFixed(2)}`).join(', ');
        console.log(`[INFO] Multiple sources for ${key}: ${revenues} -> using ${primary.source}`);
      }

      merged.push(primary);
    }

    return merged.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Write daily JSONL file.
   */
  writeDailyJsonl(date, records) {
    const filename = path.join(this.outputDir, `${date}.jsonl`);
    const lines = records.map((r) => JSON.stringify(r)).join('\n');
    fs.writeFileSync(filename, lines + '\n', 'utf-8');
    console.log(`[OK] Wrote ${records.length} records to ${filename}`);
  }

  /**
   * Write monthly CSV file.
   */
  writeMonthlyCsv(month, records) {
    const filename = path.join(this.outputDir, `${month}.csv`);
    const headers = [
      'date',
      'platform',
      'packageId',
      'currency',
      'grossRevenue',
      'netRevenue',
      'chargeCount',
      'refundCount',
      'orderCount',
      'countries',
      'source',
      'subscriptionUnits',
      'oneTimeUnits',
      'fetchedAt',
    ];

    const rows = records.map((r) =>
      headers.map((h) => {
        const v = r[h] ?? '';
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
      }).join(',')
    );

    fs.writeFileSync(filename, [headers.join(','), ...rows].join('\n'), 'utf-8');
    console.log(`[OK] Wrote ${records.length} records to ${filename}`);
  }

  /**
   * Write latest.json snapshot.
   */
  writeLatest(records) {
    const filename = path.join(this.outputDir, 'latest.json');
    const latest = records[records.length - 1] || {};
    const snapshot = {
      lastUpdated: new Date().toISOString(),
      lastRecordDate: latest.date,
      totalRecords: records.length,
      platforms: [...new Set(records.map((r) => r.platform))],
      dateRange: {
        start: records[0]?.date,
        end: records[records.length - 1]?.date,
      },
      totals: records.reduce(
        (acc, r) => {
          acc.grossRevenue += r.grossRevenue || 0;
          acc.netRevenue += r.netRevenue || 0;
          acc.chargeCount += r.chargeCount || 0;
          return acc;
        },
        { grossRevenue: 0, netRevenue: 0, chargeCount: 0 }
      ),
      byPlatform: records.reduce((acc, r) => {
        if (!acc[r.platform]) acc[r.platform] = { netRevenue: 0, chargeCount: 0, days: 0 };
        acc[r.platform].netRevenue += r.netRevenue || 0;
        acc[r.platform].chargeCount += r.chargeCount || 0;
        acc[r.platform].days += 1;
        return acc;
      }, {}),
    };
    fs.writeFileSync(filename, JSON.stringify(snapshot, null, 2), 'utf-8');
    console.log(`[OK] Wrote latest snapshot to ${filename}`);
  }

  /**
   * Run ingestion for a date range (daily granularity).
   */
  async runDaily(startDate, endDate) {
    console.log(`\n=== Revenue Ingestion: ${startDate} to ${endDate} ===`);

    const allRecords = [];

    // Fetch Play earnings (authoritative, monthly)
    const playEarnings = await this.fetchPlayRevenue(startDate, endDate, 'earnings');
    allRecords.push(...playEarnings);

    // Fetch Play estimated sales (daily, preliminary)
    const playEstimated = await this.fetchPlayRevenue(startDate, endDate, 'estimated_sales');
    allRecords.push(...playEstimated);

    // Fetch iOS daily sales summary
    const iosSales = await this.fetchIosRevenue(startDate, endDate);
    allRecords.push(...iosSales);

    // Fetch iOS finance for each month in range
    const months = new Set();
    for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
      months.add(d.toISOString().slice(0, 7));
    }
    for (const month of months) {
      const finance = await this.fetchIosFinance(month);
      allRecords.push(...finance);
    }

    // Merge and deduplicate
    const merged = this.mergeRevenue(allRecords);

    // Write daily files
    const byDate = new Map();
    for (const r of merged) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }

    for (const [date, records] of byDate) {
      this.writeDailyJsonl(date, records);
    }

    // Write monthly CSV
    const byMonth = new Map();
    for (const r of merged) {
      const month = r.date.slice(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(r);
    }

    for (const [month, records] of byMonth) {
      this.writeMonthlyCsv(month, records);
    }

    // Write latest
    this.writeLatest(merged);

    console.log(`\n=== Done: ${merged.length} daily records across ${byDate.size} days ===`);
    return merged;
  }

  /**
   * Run for last N days.
   */
  async runLastDays(days) {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 864e5).toISOString().split('T')[0];
    return this.runDaily(startDate, endDate);
  }

  /**
   * Run for a specific month.
   */
  async runMonth(month) {
    // month format: YYYY-MM
    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];
    return this.runDaily(startDate, endDate);
  }
}

/**
 * CLI entry point.
 */
async function main() {
  const args = require('minimist')(process.argv.slice(2), {
    string: ['days', 'month', 'start', 'end', 'play-package', 'ios-bundle', 'output', 'report-type'],
    boolean: ['json', 'csv', 'help'],
    alias: {
      d: 'days',
      m: 'month',
      s: 'start',
      e: 'end',
      p: 'play-package',
      i: 'ios-bundle',
      o: 'output',
      t: 'report-type',
      j: 'json',
    },
  });

  if (args.help) {
    console.log(`
Revenue Ingestion Scheduler

Usage:
  node tools/revenue-ingestion-scheduler.js [options]

Options:
  --days, -d        Last N days to ingest [default: 1]
  --month, -m       Specific month (YYYY-MM) to ingest
  --start, -s       Start date (YYYY-MM-DD)
  --end, -e         End date (YYYY-MM-DD)
  --play-package    Play package name [default: com.iganapolsky.hermesmobile.paid]
  --ios-bundle      iOS bundle ID [default: com.iganapolsky.hermesmobile.paid]
  --output, -o      Output directory [default: business_os/revenue/merged]
  --report-type     Play report type: earnings | estimated_sales [default: earnings]
  --json            Output JSON summary
  --csv             Also write monthly CSV
  --help            Show this help

Examples:
  # Daily cron (last 2 days to catch late reports)
  node tools/revenue-ingestion-scheduler.js -d 2

  # Monthly backfill
  node tools/revenue-ingestion-scheduler.js -m 2026-07

  # Custom range
  node tools/revenue-ingestion-scheduler.js -s 2026-07-01 -e 2026-07-31

Environment (required for each platform):
  Play:
    PLAY_DEVELOPER_ACCOUNT_ID=12345678901234567890
    GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json

  iOS:
    ASC_KEY_ID=ABC123DEF4
    ASC_ISSUER_ID=12345678-1234-1234-1234-123456789012
    ASC_PRIVATE_KEY_PATH=/path/to/AuthKey_ABC123DEF4.p8
`);
    process.exit(0);
  }

  const scheduler = new RevenueIngestionScheduler({
    playPackage: args['play-package'],
    iosBundleId: args['ios-bundle'],
    outputDir: args.output,
  });

  let result;
  if (args.month) {
    result = await scheduler.runMonth(args.month);
  } else if (args.start && args.end) {
    result = await scheduler.runDaily(args.start, args.end);
  } else {
    const days = parseInt(args.days || '1', 10);
    result = await scheduler.runLastDays(days);
  }

  if (args.json) {
    console.log(JSON.stringify({
      records: result.length,
      dateRange: result.length > 0 ? { start: result[0].date, end: result[result.length - 1].date } : null,
      byPlatform: result.reduce((acc, r) => {
        acc[r.platform] = (acc[r.platform] || 0) + (r.netRevenue || 0);
        return acc;
      }, {}),
    }, null, 2));
  }
}

main();

module.exports = { RevenueIngestionScheduler };