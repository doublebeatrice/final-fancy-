#!/usr/bin/env node
/* Cross-AI decision review (read-only).
 *
 * Scans recent adjustments_<date>.json files under data/adjustments/, groups by approvedBy,
 * and prints a markdown summary so Codex can review what Claude has done (or vice versa).
 *
 * Usage:
 *   node scripts/diagnostics/review_recent_decisions.js [--by codex|claude|manual|all] [--days 3]
 */

const fs = require('fs');
const path = require('path');
const { ADJUSTMENT_DIR, readAdjustmentLog } = require('../../src/adjustment_log');
const { decisionAttribution } = require('../../src/daily_learning');

function parseArgs(argv) {
  const args = argv.slice(2);
  const byIndex = args.findIndex(a => a === '--by');
  const daysIndex = args.findIndex(a => a === '--days');
  const by = byIndex >= 0 ? String(args[byIndex + 1] || 'all').toLowerCase() : 'all';
  const days = daysIndex >= 0 ? Math.max(1, parseInt(args[daysIndex + 1] || '3', 10)) : 3;
  return { by, days };
}

function listRecentBusinessDates(days) {
  if (!fs.existsSync(ADJUSTMENT_DIR)) return [];
  const files = fs.readdirSync(ADJUSTMENT_DIR)
    .filter(name => /^adjustments_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => name.match(/^adjustments_(\d{4}-\d{2}-\d{2})\.json$/)[1])
    .sort()
    .reverse();
  return files.slice(0, days);
}

function loadRecords(businessDates) {
  const records = [];
  for (const date of businessDates) {
    const items = readAdjustmentLog({ businessDate: date }) || [];
    for (const r of items) records.push({ ...r, _businessDate: date });
  }
  return records;
}

function topActionTypes(records, limit = 5) {
  const counts = {};
  for (const r of records) {
    const key = `${r.entityType || 'unknown'}:${r.actionType || 'unknown'}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, limit);
}

function recentReasons(records, limit = 5) {
  return records
    .filter(r => r.reason)
    .slice(-limit)
    .map(r => `  - [${r._businessDate} ${r.sku || '-'}] ${r.entityType || '?'}:${r.actionType || '?'} — ${r.reason.slice(0, 140)}`);
}

function uniqueSkus(records) {
  return new Set(records.map(r => r.sku).filter(Boolean)).size;
}

function main() {
  const { by, days } = parseArgs(process.argv);
  const dates = listRecentBusinessDates(days);
  if (!dates.length) {
    console.log(`# Decision Review\n\nNo adjustment logs found under ${ADJUSTMENT_DIR}.`);
    return;
  }
  const records = loadRecords(dates);
  const attribution = decisionAttribution(records);
  const validKeys = ['codex', 'claude', 'manual', 'unattributed'];
  const groups = by === 'all'
    ? validKeys.filter(k => attribution[k])
    : [by].filter(k => attribution[k]);

  let out = `# Decision Review\n\n`;
  out += `- window: last ${days} day(s) (${dates[dates.length - 1]} → ${dates[0]})\n`;
  out += `- total records: ${records.length}\n`;
  out += `- distinct SKUs: ${uniqueSkus(records)}\n`;
  out += `- filter: --by ${by}\n\n`;

  if (!groups.length) {
    out += `No records matching filter --by ${by}.\n`;
    console.log(out);
    return;
  }

  for (const group of groups) {
    const groupRecords = records.filter(r => (r.approvedBy || 'unattributed').toLowerCase() === group);
    const stats = attribution[group];
    out += `## ${group} (${stats.plannedActions} actions across ${uniqueSkus(groupRecords)} SKU(s))\n\n`;
    out += `- landed success: ${stats.landedSuccess}\n`;
    out += `- landed failed: ${stats.landedFailed}\n`;
    out += `- dry-run planned: ${stats.dryRunPlanned}\n`;
    out += `- unknown outcome: ${stats.unknown}\n\n`;
    out += `### Top action types\n`;
    for (const [key, count] of topActionTypes(groupRecords)) {
      out += `- ${key}: ${count}\n`;
    }
    out += `\n### Recent reasons\n`;
    const reasons = recentReasons(groupRecords);
    out += reasons.length ? reasons.join('\n') + '\n\n' : '  - (no reason text recorded)\n\n';
  }
  console.log(out);
}

main();
