const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readJson(file, fallback = null) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (!raw) return '';
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function liveRowsForDate(rows = [], date = '') {
  const targetDate = dateOnly(date);
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (!row || row.dryRun === true) return false;
    const outcome = text(row.outcome || row.status || row.result);
    if (!['success', 'api_success'].includes(outcome)) return false;
    if (!targetDate) return true;
    const businessDate = dateOnly(row.businessDate);
    const localDate = dateOnly(row.localDate);
    const runDate = dateOnly(row.runAt);
    return businessDate === targetDate || localDate === targetDate || runDate === targetDate;
  });
}

function groupBy(rows, keyFn) {
  const out = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(row);
  }
  return out;
}

function rowBrief(row = {}) {
  return {
    sku: text(row.sku),
    actionType: text(row.actionType),
    entityType: text(row.entityType),
    entityId: text(row.entityId),
    entityName: text(row.entityName),
    beforeValue: row.beforeValue,
    afterValue: row.afterValue,
    direction: text(row.direction || 'unknown'),
    outcome: text(row.outcome),
    sourceRunId: text(row.sourceRunId),
    runAt: text(row.runAt),
  };
}

function summarizeGroup(key, rows) {
  const directions = [...new Set(rows.map(row => text(row.direction || 'unknown')).filter(Boolean))];
  const entityIds = [...new Set(rows.map(row => text(row.entityId)).filter(Boolean))];
  const sourceRunIds = [...new Set(rows.map(row => text(row.sourceRunId)).filter(Boolean))];
  return {
    key,
    count: rows.length,
    sku: text(rows[0]?.sku),
    entityType: text(rows[0]?.entityType),
    entityName: text(rows[0]?.entityName),
    entityIds,
    directions,
    sourceRunIds,
    rows: rows.map(rowBrief),
  };
}

function auditLandedActionConflicts(options = {}) {
  const date = dateOnly(options.date || new Date());
  const adjustmentsFile = options.adjustmentsFile || path.join(ROOT, 'data', 'adjustments', `adjustments_${date}.json`);
  const adjustments = readJson(adjustmentsFile, []);
  const liveRows = liveRowsForDate(adjustments, date);

  const sameEntityGroups = [...groupBy(liveRows, row => [
    text(row.entityType),
    text(row.entityId),
  ].join('|')).entries()]
    .filter(([, rows]) => rows.length > 1);

  const sameEntityReverse = sameEntityGroups
    .filter(([, rows]) => {
      const directions = new Set(rows.map(row => text(row.direction || 'unknown')));
      return directions.has('up') && directions.has('down');
    })
    .map(([key, rows]) => summarizeGroup(key, rows));

  const sameNameReverseDifferentEntity = [...groupBy(liveRows, row => [
    text(row.sku).toUpperCase(),
    text(row.entityType),
    text(row.entityName).toLowerCase(),
  ].join('|')).entries()]
    .filter(([, rows]) => {
      if (rows.length <= 1) return false;
      const entityIds = new Set(rows.map(row => text(row.entityId)).filter(Boolean));
      const directions = new Set(rows.map(row => text(row.direction || 'unknown')));
      return entityIds.size > 1 && directions.has('up') && directions.has('down');
    })
    .map(([key, rows]) => summarizeGroup(key, rows));

  const latestRunId = liveRows
    .map(row => rowBrief(row))
    .sort((a, b) => a.runAt.localeCompare(b.runAt))
    .at(-1)?.sourceRunId || '';
  const latestRunRows = latestRunId ? liveRows.filter(row => text(row.sourceRunId) === latestRunId) : [];
  const latestRunBySku = [...groupBy(latestRunRows, row => text(row.sku).toUpperCase()).entries()]
    .map(([sku, rows]) => ({
      sku,
      count: rows.length,
      up: rows.filter(row => text(row.direction) === 'up').length,
      down: rows.filter(row => text(row.direction) === 'down').length,
      enable: rows.filter(row => text(row.actionType) === 'enable').length,
      mixedDirection: rows.some(row => text(row.direction) === 'up') && rows.some(row => text(row.direction) === 'down'),
      rows: rows.map(rowBrief),
    }))
    .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku));

  const summary = {
    liveRows: liveRows.length,
    latestRunId,
    latestRunRows: latestRunRows.length,
    sameEntityMultiCount: sameEntityGroups.length,
    sameEntityReverseCount: sameEntityReverse.length,
    sameNameReverseDifferentEntityCount: sameNameReverseDifferentEntity.length,
    latestRunMixedSkuCount: latestRunBySku.filter(item => item.mixedDirection).length,
    status: sameEntityReverse.length ? 'blocked_conflict' : (sameNameReverseDifferentEntity.length ? 'review_needed' : 'clear'),
  };

  return {
    date,
    generatedAt: new Date().toISOString(),
    adjustmentsFile,
    summary,
    sameEntityReverse,
    sameNameReverseDifferentEntity,
    latestRunBySku,
    decision: sameEntityReverse.length
      ? 'Do not continue live writes until same entity reverse actions are explained.'
      : (sameNameReverseDifferentEntity.length
          ? 'No same entity reverse conflict found; mixed same-name rows need 1d/3d effect review by entity layer.'
          : 'No landed action conflict found.'),
  };
}

function markdownReport(report = {}) {
  const lines = [
    `# Landed action conflict audit - ${report.date}`,
    '',
    `- Status: ${report.summary?.status || 'unknown'}`,
    `- Live rows: ${num(report.summary?.liveRows)}`,
    `- Latest run: ${report.summary?.latestRunId || 'none'} (${num(report.summary?.latestRunRows)} rows)`,
    `- Same entity reverse conflicts: ${num(report.summary?.sameEntityReverseCount)}`,
    `- Same-name mixed direction groups: ${num(report.summary?.sameNameReverseDifferentEntityCount)}`,
    `- Latest-run mixed SKU count: ${num(report.summary?.latestRunMixedSkuCount)}`,
    `- Decision: ${report.decision || ''}`,
    '',
  ];

  if (report.sameEntityReverse?.length) {
    lines.push('## Blocking same-entity reverse conflicts', '');
    for (const group of report.sameEntityReverse) {
      lines.push(`- ${group.sku} ${group.entityType}:${group.entityIds.join(', ')} ${group.entityName}; directions=${group.directions.join('/')}`);
    }
    lines.push('');
  }

  if (report.sameNameReverseDifferentEntity?.length) {
    lines.push('## Same-name mixed direction review', '');
    lines.push('Review key: mixed_direction_review', '');
    lines.push('| SKU | Entity type | Entity name | Entity IDs | Directions | Runs |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const group of report.sameNameReverseDifferentEntity) {
      lines.push(`| ${group.sku} | ${group.entityType} | ${group.entityName} | ${group.entityIds.join('<br>')} | ${group.directions.join('/')} | ${group.sourceRunIds.join('<br>')} |`);
    }
    lines.push('');
  }

  if (report.latestRunBySku?.length) {
    lines.push('## Latest run SKU mix', '');
    lines.push('| SKU | Rows | Up | Down | Enable | Review |');
    lines.push('| --- | ---: | ---: | ---: | ---: | --- |');
    for (const item of report.latestRunBySku) {
      lines.push(`| ${item.sku} | ${item.count} | ${item.up} | ${item.down} | ${item.enable} | ${item.mixedDirection ? 'mixed_direction_review' : 'normal'} |`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    date: get('--date') || get('--today') || process.env.AGENT_TODAY || '',
    adjustmentsFile: get('--adjustments') || '',
    outFile: get('--out') || '',
    markdownFile: get('--md') || '',
  };
}

function main() {
  const options = parseArgs(process.argv);
  const report = auditLandedActionConflicts(options);
  const outFile = options.outFile || path.join(ROOT, 'data', 'tasks', `landed_action_conflict_audit_${report.date}.json`);
  const markdownFile = options.markdownFile || path.join(ROOT, 'data', 'tasks', `landed_action_conflict_audit_${report.date}.md`);
  writeJson(outFile, report);
  writeText(markdownFile, markdownReport(report));
  console.log(JSON.stringify({ ok: true, outFile, markdownFile, summary: report.summary }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  auditLandedActionConflicts,
  markdownReport,
};
